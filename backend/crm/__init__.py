import os
import statistics
from datetime import date

from flask import Flask, g, jsonify, request
from flask_cors import CORS
from sqlalchemy import func

from . import ai
from .auth import auth_required, can_access, issue_token, scope
from .models import ACTIVITY_TYPES, ROLES, STAGES, Activity, Customer, Deal, Task, Team, User, Workflow, db, now
from .seed import seed
from .workflows import fire, run_stale_check


def create_app(test_config=None):
    app = Flask(__name__)
    db_url = os.environ.get("DATABASE_URL", "sqlite:///" + os.path.join(app.instance_path, "crm.db"))
    if db_url.startswith("postgres://"):  # Render/Heroku style URL
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    app.config.update(SQLALCHEMY_DATABASE_URI=db_url, JWT_SECRET=os.environ.get("JWT_SECRET", "dev-secret-change-me-" + "x" * 16),
                      SEED_DEMO=os.environ.get("SEED_DEMO", "1") == "1")
    if test_config:
        app.config.update(test_config)
    os.makedirs(app.instance_path, exist_ok=True)
    origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")]
    CORS(app, resources={r"/api/*": {"origins": origins}}, allow_headers=["Authorization", "Content-Type"])
    db.init_app(app)
    with app.app_context():
        db.create_all()
        if app.config["SEED_DEMO"]:
            seed()

    def body():
        return request.get_json(silent=True) or {}

    def err(msg, code=400):
        return jsonify(error=msg), code

    def get_or_404(model, oid):
        obj = db.session.get(model, oid)
        if obj is None or not can_access(obj):
            return None
        return obj

    @app.after_request
    def headers(resp):
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        return resp

    # ---------- auth ----------
    @app.post("/api/auth/login")
    def login():
        b = body()
        u = User.query.filter(func.lower(User.email) == (b.get("email") or "").strip().lower()).first()
        if not u or not u.active or not u.check_password(b.get("password") or ""):
            return err("Invalid email or password", 401)
        return jsonify(token=issue_token(u), user=u.to_dict())

    @app.get("/api/auth/me")
    @auth_required()
    def me():
        return jsonify(g.user.to_dict())

    @app.get("/api/meta")
    def meta():
        return jsonify(stages=STAGES, activity_types=ACTIVITY_TYPES, roles=ROLES, llm=bool(os.environ.get("OPENAI_API_KEY")))

    # ---------- dashboard ----------
    @app.get("/api/dashboard")
    @auth_required()
    def dashboard():
        deals = scope(Deal.query, Deal).all()
        customers = scope(Customer.query, Customer).all()
        median = statistics.median([d.value for d in deals]) if deals else None
        by_stage = {s: {"count": 0, "value": 0} for s in STAGES}
        for d in deals:
            by_stage[d.stage]["count"] += 1
            by_stage[d.stage]["value"] += d.value
        scored = [(d, ai.deal_score(d, median)) for d in deals if d.stage not in ("won", "lost")]
        at_risk = sorted([x for x in scored if x[1]["risk"] == "high"], key=lambda x: -x[0].value)[:5]
        health = [(c, ai.customer_health(c)) for c in customers]
        tasks = scope(Task.query.filter_by(done=False), Task).order_by(Task.due_date).limit(8).all()
        return jsonify(
            kpis={"customers": len(customers), "open_deals": len(scored), **ai.pipeline_forecast(deals),
                  "tasks_due": scope(Task.query.filter(Task.done.is_(False), Task.due_date <= date.today()), Task).count()},
            by_stage=by_stage,
            at_risk=[{**d.to_dict(), **s} for d, s in at_risk],
            unhealthy=[{"id": c.id, "company": c.company, **h} for c, h in sorted(health, key=lambda x: x[1]["score"])[:5]],
            tasks=[t.to_dict() for t in tasks],
        )

    # ---------- customers ----------
    @app.get("/api/customers")
    @auth_required()
    def list_customers():
        q = scope(Customer.query, Customer)
        if (s := request.args.get("q")):
            like = f"%{s}%"
            q = q.filter(Customer.company.ilike(like) | Customer.contact_name.ilike(like) | Customer.industry.ilike(like))
        if (st := request.args.get("status")):
            q = q.filter_by(status=st)
        out = []
        for c in q.order_by(Customer.company).all():
            d = c.to_dict()
            d["health"] = ai.customer_health(c)
            out.append(d)
        return jsonify(out)

    @app.post("/api/customers")
    @auth_required()
    def create_customer():
        b = body()
        if not (b.get("company") or "").strip():
            return err("Company is required")
        owner_id = b.get("owner_id") if g.user.role != "sales_rep" and b.get("owner_id") else g.user.id
        c = Customer(company=b["company"].strip()[:160], contact_name=b.get("contact_name"), email=b.get("email"),
                     phone=b.get("phone"), industry=b.get("industry"), city=b.get("city"),
                     status=b.get("status") or "prospect", tags=",".join(b.get("tags") or []), owner_id=owner_id)
        db.session.add(c)
        db.session.flush()
        fired = fire("customer_created", customer=c)
        db.session.commit()
        return jsonify({**c.to_dict(), "automations": fired}), 201

    @app.get("/api/customers/<int:cid>")
    @auth_required()
    def get_customer(cid):
        c = get_or_404(Customer, cid)
        if not c:
            return err("Not found", 404)
        d = c.to_dict(deep=True)
        values = [x.value for x in Deal.query.all()]
        median = statistics.median(values) if values else None
        for deal in d["deals"]:
            deal["score"] = ai.deal_score(db.session.get(Deal, deal["id"]), median)
        d["health"], d["next_actions"] = ai.customer_health(c), ai.next_actions(c)
        d["tasks"] = [t.to_dict() for t in Task.query.filter_by(customer_id=c.id).order_by(Task.done, Task.due_date).all()]
        return jsonify(d)

    @app.patch("/api/customers/<int:cid>")
    @auth_required()
    def update_customer(cid):
        c = get_or_404(Customer, cid)
        if not c:
            return err("Not found", 404)
        b = body()
        for f in ("company", "contact_name", "email", "phone", "industry", "city", "status"):
            if f in b:
                setattr(c, f, b[f])
        if "tags" in b:
            c.tags = ",".join(b["tags"])
        if "owner_id" in b and g.user.role != "sales_rep":
            c.owner_id = b["owner_id"]
        db.session.commit()
        return jsonify(c.to_dict())

    @app.delete("/api/customers/<int:cid>")
    @auth_required("admin", "manager")
    def delete_customer(cid):
        c = get_or_404(Customer, cid)
        if not c:
            return err("Not found", 404)
        Task.query.filter_by(customer_id=cid).delete()
        db.session.delete(c)
        db.session.commit()
        return jsonify(ok=True)

    @app.get("/api/customers/<int:cid>/insights")
    @auth_required()
    def insights(cid):
        c = get_or_404(Customer, cid)
        return jsonify(ai.customer_summary(c)) if c else err("Not found", 404)

    @app.post("/api/customers/<int:cid>/email-draft")
    @auth_required()
    def email_draft(cid):
        c = get_or_404(Customer, cid)
        if not c:
            return err("Not found", 404)
        purpose = (body().get("purpose") or "a follow-up on our last conversation")[:300]
        return jsonify(ai.draft_email(c, purpose, g.user.name))

    # ---------- deals ----------
    @app.get("/api/deals")
    @auth_required()
    def list_deals():
        deals = scope(Deal.query, Deal).order_by(Deal.value.desc()).all()
        median = statistics.median([d.value for d in deals]) if deals else None
        return jsonify([{**d.to_dict(), "score": ai.deal_score(d, median)} for d in deals])

    @app.post("/api/deals")
    @auth_required()
    def create_deal():
        b = body()
        c = get_or_404(Customer, int(b.get("customer_id") or 0))
        if not c or not (b.get("title") or "").strip():
            return err("Valid customer_id and title are required")
        stage = b.get("stage") or "lead"
        if stage not in STAGES:
            return err("Invalid stage")
        d = Deal(title=b["title"].strip()[:160], value=float(b.get("value") or 0), stage=stage, customer=c,
                 owner_id=c.owner_id if g.user.role != "sales_rep" else g.user.id,
                 expected_close=date.fromisoformat(b["expected_close"]) if b.get("expected_close") else None)
        db.session.add(d)
        db.session.commit()
        return jsonify(d.to_dict()), 201

    @app.patch("/api/deals/<int:did>")
    @auth_required()
    def update_deal(did):
        d = get_or_404(Deal, did)
        if not d:
            return err("Not found", 404)
        b, fired = body(), []
        if "stage" in b and b["stage"] != d.stage:
            if b["stage"] not in STAGES:
                return err("Invalid stage")
            old, d.stage, d.stage_changed_at = d.stage, b["stage"], now()
            db.session.add(Activity(kind="note", subject=f"Stage changed: {old} → {d.stage}", customer_id=d.customer_id,
                                    deal_id=d.id, user_id=g.user.id, automated=True))
            db.session.flush()
            fired = fire("deal_stage_changed", deal=d, value=d.stage)
        for f in ("title", "value"):
            if f in b:
                setattr(d, f, float(b[f]) if f == "value" else b[f])
        if "expected_close" in b:
            d.expected_close = date.fromisoformat(b["expected_close"]) if b["expected_close"] else None
        db.session.commit()
        return jsonify({**d.to_dict(), "automations": fired})

    @app.delete("/api/deals/<int:did>")
    @auth_required("admin", "manager")
    def delete_deal(did):
        d = get_or_404(Deal, did)
        if not d:
            return err("Not found", 404)
        db.session.delete(d)
        db.session.commit()
        return jsonify(ok=True)

    # ---------- activities & tasks ----------
    @app.post("/api/activities")
    @auth_required()
    def create_activity():
        b = body()
        c = get_or_404(Customer, int(b.get("customer_id") or 0))
        if not c or b.get("kind") not in ACTIVITY_TYPES or not (b.get("subject") or "").strip():
            return err("customer_id, kind and subject are required")
        a = Activity(kind=b["kind"], subject=b["subject"][:200], body=(b.get("body") or "")[:5000], customer=c,
                     deal_id=b.get("deal_id"), user_id=g.user.id)
        db.session.add(a)
        db.session.commit()
        return jsonify(a.to_dict()), 201

    @app.get("/api/tasks")
    @auth_required()
    def list_tasks():
        q = scope(Task.query, Task)
        if request.args.get("open") == "1":
            q = q.filter_by(done=False)
        return jsonify([t.to_dict() for t in q.order_by(Task.done, Task.due_date).all()])

    @app.post("/api/tasks")
    @auth_required()
    def create_task():
        b = body()
        if not (b.get("title") or "").strip():
            return err("Title required")
        t = Task(title=b["title"][:200], customer_id=b.get("customer_id"), assignee_id=g.user.id,
                 due_date=date.fromisoformat(b["due_date"]) if b.get("due_date") else None)
        db.session.add(t)
        db.session.commit()
        return jsonify(t.to_dict()), 201

    @app.patch("/api/tasks/<int:tid>")
    @auth_required()
    def update_task(tid):
        t = get_or_404(Task, tid)
        if not t:
            return err("Not found", 404)
        if "done" in body():
            t.done = bool(body()["done"])
        db.session.commit()
        return jsonify(t.to_dict())

    # ---------- workflows ----------
    @app.get("/api/workflows")
    @auth_required()
    def list_workflows():
        return jsonify([w.to_dict() for w in Workflow.query.order_by(Workflow.id).all()])

    @app.post("/api/workflows")
    @auth_required("admin", "manager")
    def create_workflow():
        b = body()
        if b.get("trigger") not in ("deal_stage_changed", "customer_created", "deal_stale") or \
                b.get("action") not in ("create_task", "log_email", "notify_manager") or not b.get("name") or not b.get("template"):
            return err("name, template, a valid trigger and action are required")
        w = Workflow(name=b["name"][:120], trigger=b["trigger"], trigger_value=b.get("trigger_value") or None,
                     action=b["action"], template=b["template"][:400], due_in_days=int(b.get("due_in_days") or 1))
        db.session.add(w)
        db.session.commit()
        return jsonify(w.to_dict()), 201

    @app.patch("/api/workflows/<int:wid>")
    @auth_required("admin", "manager")
    def update_workflow(wid):
        w = db.session.get(Workflow, wid)
        if not w:
            return err("Not found", 404)
        if "enabled" in body():
            w.enabled = bool(body()["enabled"])
        db.session.commit()
        return jsonify(w.to_dict())

    @app.post("/api/workflows/run-stale")
    @auth_required("admin", "manager")
    def stale():
        return jsonify(run_stale_check())

    # ---------- users (admin) ----------
    @app.get("/api/users")
    @auth_required("admin", "manager")
    def list_users():
        return jsonify([u.to_dict() for u in User.query.order_by(User.id).all()])

    @app.post("/api/users")
    @auth_required("admin")
    def create_user():
        b = body()
        if b.get("role") not in ROLES or not b.get("email") or len(b.get("password") or "") < 8:
            return err("email, valid role and 8+ char password required")
        if User.query.filter(func.lower(User.email) == b["email"].lower()).first():
            return err("Email already exists", 409)
        team = Team.query.filter_by(name=b.get("team")).first() if b.get("team") else None
        u = User(email=b["email"].lower(), name=b.get("name") or b["email"], role=b["role"], team=team)
        u.set_password(b["password"])
        db.session.add(u)
        db.session.commit()
        return jsonify(u.to_dict()), 201

    @app.patch("/api/users/<int:uid>")
    @auth_required("admin")
    def update_user(uid):
        u = db.session.get(User, uid)
        if not u:
            return err("Not found", 404)
        b = body()
        if "role" in b and b["role"] in ROLES and u.id != g.user.id:
            u.role = b["role"]
        if "active" in b and u.id != g.user.id:
            u.active = bool(b["active"])
        db.session.commit()
        return jsonify(u.to_dict())

    return app
