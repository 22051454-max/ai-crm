from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()

ROLES = ("admin", "manager", "sales_rep")
STAGES = ("lead", "qualified", "proposal", "negotiation", "won", "lost")
ACTIVITY_TYPES = ("call", "email", "meeting", "note")


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="sales_rep")
    team_id = db.Column(db.Integer, db.ForeignKey("team.id"))
    team = db.relationship("Team")
    password_hash = db.Column(db.String(256), nullable=False)
    active = db.Column(db.Boolean, default=True)

    def set_password(self, pw):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw):
        return check_password_hash(self.password_hash, pw)

    def to_dict(self):
        return {"id": self.id, "email": self.email, "name": self.name, "role": self.role,
                "team": self.team.name if self.team else None, "active": self.active}


class Customer(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    company = db.Column(db.String(160), nullable=False)
    contact_name = db.Column(db.String(120))
    email = db.Column(db.String(120))
    phone = db.Column(db.String(40))
    industry = db.Column(db.String(80))
    city = db.Column(db.String(80))
    status = db.Column(db.String(20), default="active")  # prospect, active, churned
    tags = db.Column(db.String(200), default="")
    owner_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    owner = db.relationship("User")
    created_at = db.Column(db.DateTime, default=now)
    deals = db.relationship("Deal", backref="customer", cascade="all, delete-orphan")
    activities = db.relationship("Activity", backref="customer", cascade="all, delete-orphan", order_by="Activity.created_at.desc()")

    def to_dict(self, deep=False):
        d = {"id": self.id, "company": self.company, "contact_name": self.contact_name, "email": self.email,
             "phone": self.phone, "industry": self.industry, "city": self.city, "status": self.status,
             "tags": [t for t in (self.tags or "").split(",") if t], "owner": self.owner.name if self.owner else None,
             "owner_id": self.owner_id, "created_at": self.created_at.isoformat(),
             "open_pipeline": sum(x.value for x in self.deals if x.stage not in ("won", "lost")),
             "won_value": sum(x.value for x in self.deals if x.stage == "won")}
        if deep:
            d["deals"] = [x.to_dict() for x in self.deals]
            d["activities"] = [a.to_dict() for a in self.activities[:50]]
        return d


class Deal(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(160), nullable=False)
    value = db.Column(db.Float, default=0)
    stage = db.Column(db.String(20), default="lead")
    expected_close = db.Column(db.Date)
    customer_id = db.Column(db.Integer, db.ForeignKey("customer.id"), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    owner = db.relationship("User")
    created_at = db.Column(db.DateTime, default=now)
    stage_changed_at = db.Column(db.DateTime, default=now)

    def to_dict(self):
        return {"id": self.id, "title": self.title, "value": self.value, "stage": self.stage,
                "expected_close": self.expected_close.isoformat() if self.expected_close else None,
                "customer_id": self.customer_id, "customer": self.customer.company if self.customer else None,
                "owner": self.owner.name if self.owner else None, "owner_id": self.owner_id,
                "created_at": self.created_at.isoformat(), "stage_changed_at": self.stage_changed_at.isoformat()}


class Activity(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    kind = db.Column(db.String(20), nullable=False)
    subject = db.Column(db.String(200), nullable=False)
    body = db.Column(db.Text, default="")
    customer_id = db.Column(db.Integer, db.ForeignKey("customer.id"), nullable=False)
    deal_id = db.Column(db.Integer, db.ForeignKey("deal.id"))
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    user = db.relationship("User")
    automated = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=now)

    def to_dict(self):
        return {"id": self.id, "kind": self.kind, "subject": self.subject, "body": self.body,
                "customer_id": self.customer_id, "deal_id": self.deal_id, "user": self.user.name if self.user else "Automation",
                "automated": self.automated, "created_at": self.created_at.isoformat()}


class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    due_date = db.Column(db.Date)
    done = db.Column(db.Boolean, default=False)
    customer_id = db.Column(db.Integer, db.ForeignKey("customer.id"))
    customer = db.relationship("Customer")
    deal_id = db.Column(db.Integer, db.ForeignKey("deal.id"))
    assignee_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    assignee = db.relationship("User")
    source = db.Column(db.String(40), default="manual")

    def to_dict(self):
        return {"id": self.id, "title": self.title, "due_date": self.due_date.isoformat() if self.due_date else None,
                "done": self.done, "customer_id": self.customer_id, "customer": self.customer.company if self.customer else None,
                "deal_id": self.deal_id, "assignee": self.assignee.name if self.assignee else None, "source": self.source}


class Workflow(db.Model):
    """Communication workflow: when a trigger fires, run an action."""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    trigger = db.Column(db.String(40), nullable=False)       # deal_stage_changed, customer_created, deal_stale
    trigger_value = db.Column(db.String(40))                  # e.g. stage name or days
    action = db.Column(db.String(40), nullable=False)         # create_task, log_email, notify_manager
    template = db.Column(db.String(400), nullable=False)      # supports {company} {deal} {value} {owner}
    due_in_days = db.Column(db.Integer, default=1)
    enabled = db.Column(db.Boolean, default=True)
    runs = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}
