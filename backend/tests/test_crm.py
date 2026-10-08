import pytest

from crm import create_app
from crm.models import Task, db


@pytest.fixture
def app(tmp_path):
    return create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path}/t.db", "JWT_SECRET": "s" * 40})


def h(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "demo1234"})
    return {"Authorization": "Bearer " + r.get_json()["token"]}


def test_login_and_me(app):
    c = app.test_client()
    assert c.post("/api/auth/login", json={"email": "admin@demo.com", "password": "bad"}).status_code == 401
    assert c.get("/api/auth/me", headers=h(c, "admin@demo.com")).get_json()["role"] == "admin"


def test_rbac_row_level(app):
    c = app.test_client()
    admin = c.get("/api/customers", headers=h(c, "admin@demo.com")).get_json()
    mgr = c.get("/api/customers", headers=h(c, "manager@demo.com")).get_json()
    rep = c.get("/api/customers", headers=h(c, "rep@demo.com")).get_json()
    assert len(admin) > len(mgr) > len(rep) > 0
    assert all(x["owner"] == "Ravi Rep" for x in rep)
    other = next(x for x in admin if x["owner"] == "Wasim West")
    assert c.get(f"/api/customers/{other['id']}", headers=h(c, "rep@demo.com")).status_code == 404


def test_rep_cannot_delete_or_manage_users(app):
    c = app.test_client()
    hdr = h(c, "rep@demo.com")
    cid = c.get("/api/customers", headers=hdr).get_json()[0]["id"]
    assert c.delete(f"/api/customers/{cid}", headers=hdr).status_code == 403
    assert c.post("/api/users", headers=hdr, json={}).status_code == 403


def test_stage_change_fires_workflow(app):
    c = app.test_client()
    hdr = h(c, "rep@demo.com")
    cust = c.post("/api/customers", headers=hdr, json={"company": "Test Co", "contact_name": "T User"}).get_json()
    assert cust["automations"][0]["workflow"] == "Welcome new customer"
    deal = c.post("/api/deals", headers=hdr, json={"customer_id": cust["id"], "title": "Pilot", "value": 50000}).get_json()
    r = c.patch(f"/api/deals/{deal['id']}", headers=hdr, json={"stage": "proposal"}).get_json()
    assert r["automations"] and "Follow up on proposal" in r["automations"][0]["result"]
    r = c.patch(f"/api/deals/{deal['id']}", headers=hdr, json={"stage": "negotiation"}).get_json()
    with app.app_context():
        assert Task.query.filter(Task.title.like("[Review]%Pilot%")).one().assignee.role == "manager"


def test_ai_insights(app):
    c = app.test_client()
    hdr = h(c, "admin@demo.com")
    cid = c.get("/api/customers", headers=hdr).get_json()[0]["id"]
    detail = c.get(f"/api/customers/{cid}", headers=hdr).get_json()
    assert 0 <= detail["health"]["score"] <= 100 and detail["next_actions"]
    for d in detail["deals"]:
        assert 0 <= d["score"]["probability"] <= 1
    assert c.get(f"/api/customers/{cid}/insights", headers=hdr).get_json()["engine"] == "rules"
    assert "Subject:" in c.post(f"/api/customers/{cid}/email-draft", headers=hdr, json={"purpose": "renewal"}).get_json()["draft"]


def test_dashboard(app):
    c = app.test_client()
    d = c.get("/api/dashboard", headers=h(c, "manager@demo.com")).get_json()
    assert set(d["by_stage"]) == {"lead", "qualified", "proposal", "negotiation", "won", "lost"}
    assert d["kpis"]["weighted_forecast"] <= d["kpis"]["open_value"]
