"""Workflow engine: runs configured automations when CRM events fire."""
from datetime import date, timedelta

from .models import Activity, Deal, Task, User, Workflow, db, now


def _render(tpl, deal=None, customer=None):
    customer = customer or (deal.customer if deal else None)
    return tpl.format_map({
        "company": customer.company if customer else "", "contact": (customer.contact_name or "") if customer else "",
        "deal": deal.title if deal else "", "value": f"₹{deal.value:,.0f}" if deal else "",
        "owner": (deal.owner.name if deal and deal.owner else customer.owner.name if customer and customer.owner else ""),
        "stage": deal.stage if deal else "",
    })


def _run(wf, deal=None, customer=None):
    customer = customer or deal.customer
    text = _render(wf.template, deal, customer)
    owner_id = deal.owner_id if deal else customer.owner_id
    if wf.action == "create_task":
        db.session.add(Task(title=text, due_date=date.today() + timedelta(days=wf.due_in_days or 0), customer_id=customer.id,
                            deal_id=deal.id if deal else None, assignee_id=owner_id, source=f"workflow:{wf.id}"))
    elif wf.action == "log_email":
        db.session.add(Activity(kind="email", subject=text.split("\n")[0][:200], body=text, customer_id=customer.id,
                                deal_id=deal.id if deal else None, automated=True))
    elif wf.action == "notify_manager":
        owner = db.session.get(User, owner_id) if owner_id else None
        mgr = User.query.filter_by(team_id=owner.team_id, role="manager").first() if owner else None
        db.session.add(Task(title="[Review] " + text, due_date=date.today(), customer_id=customer.id,
                            deal_id=deal.id if deal else None, assignee_id=(mgr or owner).id if (mgr or owner) else None,
                            source=f"workflow:{wf.id}"))
    wf.runs = (wf.runs or 0) + 1
    return text


def fire(trigger, deal=None, customer=None, value=None):
    fired = []
    for wf in Workflow.query.filter_by(trigger=trigger, enabled=True).all():
        if wf.trigger_value and value is not None and wf.trigger_value != str(value):
            continue
        fired.append({"workflow": wf.name, "result": _run(wf, deal, customer)})
    return fired


def run_stale_check():
    fired = []
    for wf in Workflow.query.filter_by(trigger="deal_stale", enabled=True).all():
        days = int(wf.trigger_value or 14)
        cutoff = now() - timedelta(days=days)
        for deal in Deal.query.filter(Deal.stage.notin_(["won", "lost"]), Deal.stage_changed_at < cutoff).all():
            exists = Task.query.filter_by(deal_id=deal.id, source=f"workflow:{wf.id}", done=False).first()
            if not exists:
                fired.append({"workflow": wf.name, "deal": deal.title, "result": _run(wf, deal)})
    db.session.commit()
    return fired


DEFAULT_WORKFLOWS = [
    ("Welcome new customer", "customer_created", None, "log_email",
     "Welcome to the family, {company}!\nHi {contact}, thanks for choosing us. Your account owner is {owner}.", 0),
    ("Proposal follow-up", "deal_stage_changed", "proposal", "create_task", "Follow up on proposal for {deal} with {company}", 3),
    ("Negotiation escalation", "deal_stage_changed", "negotiation", "notify_manager", "{deal} ({value}) entered negotiation with {company}", 0),
    ("Won: kickoff", "deal_stage_changed", "won", "create_task", "Schedule onboarding kickoff for {company} ({deal})", 2),
    ("Lost: feedback", "deal_stage_changed", "lost", "create_task", "Ask {company} for loss feedback on {deal}", 5),
    ("Stale deal nudge", "deal_stale", "21", "create_task", "Deal {deal} has stalled at {stage}. Re-engage {company}", 1),
]


def seed_workflows():
    for name, trig, val, action, tpl, due in DEFAULT_WORKFLOWS:
        db.session.add(Workflow(name=name, trigger=trig, trigger_value=val, action=action, template=tpl, due_in_days=due))
