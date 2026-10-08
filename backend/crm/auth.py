import datetime as dt
from functools import wraps

import jwt
from flask import current_app, g, jsonify, request

from .models import Customer, Deal, Task, User, db


def issue_token(user):
    now = dt.datetime.now(dt.timezone.utc)
    return jwt.encode({"sub": str(user.id), "role": user.role, "iat": now, "exp": now + dt.timedelta(hours=8)},
                      current_app.config["JWT_SECRET"], algorithm="HS256")


def auth_required(*roles):
    def deco(view):
        @wraps(view)
        def wrapped(*a, **kw):
            h = request.headers.get("Authorization", "")
            if not h.startswith("Bearer "):
                return jsonify(error="Authentication required"), 401
            try:
                claims = jwt.decode(h[7:], current_app.config["JWT_SECRET"], algorithms=["HS256"])
            except jwt.InvalidTokenError:
                return jsonify(error="Invalid or expired token"), 401
            user = db.session.get(User, int(claims["sub"]))
            if not user or not user.active:
                return jsonify(error="Account disabled"), 401
            if roles and user.role not in roles:
                return jsonify(error="Forbidden for role " + user.role), 403
            g.user = user
            return view(*a, **kw)
        return wrapped
    return deco


def visible_user_ids(user):
    """Row-level access: admin sees all, manager sees own team, rep sees self."""
    if user.role == "admin":
        return None
    if user.role == "manager":
        return [u.id for u in User.query.filter_by(team_id=user.team_id).all()]
    return [user.id]


def scope(query, model, user=None):
    ids = visible_user_ids(user or g.user)
    if ids is None:
        return query
    col = model.assignee_id if model is Task else model.owner_id
    return query.filter(col.in_(ids))


def can_access(obj, user=None):
    user = user or g.user
    ids = visible_user_ids(user)
    owner = getattr(obj, "owner_id", None) or getattr(obj, "assignee_id", None)
    return ids is None or owner in ids


__all__ = ["issue_token", "auth_required", "scope", "can_access", "Customer", "Deal"]
