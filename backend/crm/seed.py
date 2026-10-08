import random
from datetime import date, timedelta

from .models import Activity, Customer, Deal, Task, Team, User, db, now
from .workflows import seed_workflows

COMPANIES = [
    ("Ranchi Steel Fabricators", "Manufacturing", "Ranchi"), ("Kalinga Logistics", "Logistics", "Bhubaneswar"),
    ("Eastern Agro Foods", "FMCG", "Kolkata"), ("Jharkhand Health Network", "Healthcare", "Jamshedpur"),
    ("Nimbus EdTech", "Education", "Bengaluru"), ("Coalfield Mining Services", "Mining", "Dhanbad"),
    ("Pixel Retail Co", "Retail", "Patna"), ("Indus Fintech Labs", "Finance", "Mumbai"),
    ("Greenline Energy", "Energy", "Pune"), ("Sahyadri Hospitality", "Hospitality", "Goa"),
    ("Bokaro Auto Parts", "Automotive", "Bokaro"), ("Ganga Textiles", "Textiles", "Varanasi"),
    ("Orbit Telecom", "Telecom", "Hyderabad"), ("Lotus Pharma", "Pharma", "Ahmedabad"),
    ("Metro Realty Group", "Real Estate", "Delhi"), ("Silverline Insurance", "Insurance", "Chennai"),
]
CONTACTS = ["Amit Sharma", "Priya Nair", "Rahul Verma", "Sneha Das", "Vikram Singh", "Neha Gupta", "Arjun Mehta",
            "Kavya Iyer", "Rohit Jha", "Ananya Roy", "Sanjay Patel", "Pooja Mishra", "Kunal Bose", "Ritu Kumari",
            "Manish Tiwari", "Divya Menon"]
PRODUCTS = ["ERP rollout", "Analytics dashboard", "Mobile app", "Support contract", "Cloud migration",
            "AI document automation", "Website revamp", "Security audit"]


def seed():
    if User.query.first():
        return
    rng = random.Random(42)
    east, west = Team(name="East"), Team(name="West")
    db.session.add_all([east, west])
    users = []
    for email, name, role, team in [
        ("admin@demo.com", "Asha Admin", "admin", None), ("manager@demo.com", "Meera Manager", "manager", east),
        ("rep@demo.com", "Ravi Rep", "sales_rep", east), ("rep2@demo.com", "Sara Sales", "sales_rep", east),
        ("west.rep@demo.com", "Wasim West", "sales_rep", west),
    ]:
        u = User(email=email, name=name, role=role, team=team)
        u.set_password("demo1234")
        users.append(u)
    db.session.add_all(users)
    db.session.flush()
    reps = [u for u in users if u.role == "sales_rep"]
    seed_workflows()
    for i, (company, industry, city) in enumerate(COMPANIES):
        owner = reps[i % len(reps)]
        contact = CONTACTS[i]
        c = Customer(company=company, contact_name=contact, industry=industry, city=city, owner=owner,
                     email=contact.lower().replace(" ", ".") + "@" + company.split()[0].lower() + ".example",
                     phone=f"+91 9{rng.randint(100000000, 999999999)}",
                     status=rng.choice(["active", "active", "prospect", "churned"] if i % 5 else ["active"]),
                     tags=rng.choice(["enterprise", "smb", "enterprise,priority", "smb,referral"]),
                     created_at=now() - timedelta(days=rng.randint(30, 300)))
        db.session.add(c)
        db.session.flush()
        for _ in range(rng.randint(1, 3)):
            stage = rng.choice(["lead", "qualified", "proposal", "negotiation", "won", "lost", "proposal", "qualified"])
            d = Deal(title=f"{rng.choice(PRODUCTS)}", value=rng.choice([1.5, 2, 3.5, 5, 8, 12, 20]) * 100000,
                     stage=stage, customer=c, owner=owner,
                     expected_close=date.today() + timedelta(days=rng.randint(-20, 90)),
                     stage_changed_at=now() - timedelta(days=rng.randint(1, 45)))
            db.session.add(d)
        for _ in range(rng.randint(0, 6)):
            kind = rng.choice(["call", "email", "meeting", "note"])
            subj = {"call": "Discovery call", "email": "Shared pricing deck", "meeting": "Requirements workshop",
                    "note": "Decision maker is the CFO"}[kind]
            db.session.add(Activity(kind=kind, subject=subj, body="", customer=c, user=owner,
                                    created_at=now() - timedelta(days=rng.randint(0, 60))))
        if i % 3 == 0:
            db.session.add(Task(title=f"Send case study to {contact}", due_date=date.today() + timedelta(days=rng.randint(-2, 7)),
                                customer=c, assignee=owner))
    db.session.commit()
