# ------------------------------------------------------------------------------
#
# Name:        test_app_wiring.py
# Purpose:     check main.py mounts auth on every router, so no endpoint can be
#              reached without a token (or without admin, for admin routes).
#
# ------------------------------------------------------------------------------

import pytest
from fastapi.testclient import TestClient

import main
from auth.security import create_access_token
from routes import (
    admins,
    assignments,
    auth,
    interventionists,
    notes,
    schools,
    students,
    system_health,
    teachers,
)

PUBLIC_PATHS = {"/login", "/change-password"}


def token_for(role):
    return create_access_token({"public_id": "pub-1", "id": 1, "role": role})


# routes are listed from each module's router (as mounted in main.py) because
# newer FastAPI versions nest included routers instead of flattening app.routes
def router_routes(*modules):
    for module in modules:
        for route in module.router.routes:
            for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
                yield method, route.path


def concrete(path):
    # fill path params with something that passes type checks
    return (
        path.replace("{student_id}", "1")
        .replace("{score_id}", "1")
        .replace("{user_id}", "1")
        .replace("{assignment_id}", "11111111-1111-1111-1111-111111111111")
        .replace("{interventionist_id}", "11111111-1111-1111-1111-111111111111")
        .replace("{requester_id}", "11111111-1111-1111-1111-111111111111")
        .replace("{public_id}", "pub-1")
        .replace("{timestamp}", "2026-01-01")
    )


ADMIN_ONLY = list(router_routes(admins, system_health))
PROTECTED = [
    r
    for r in router_routes(
        auth, students, teachers, interventionists, notes, assignments, schools,
        admins, system_health,
    )
    if r[1] not in PUBLIC_PATHS
]


@pytest.fixture(scope="module")
def client():
    return TestClient(main.app)


def test_every_route_is_listed():
    # guards the parametrized tests below against silently testing nothing
    assert len(PROTECTED) > 20
    assert ADMIN_ONLY


@pytest.mark.parametrize("method, path", PROTECTED)
def test_protected_routes_reject_missing_token(client, method, path):
    response = client.request(method, concrete(path))
    assert response.status_code == 401


@pytest.mark.parametrize("method, path", ADMIN_ONLY)
@pytest.mark.parametrize("role", ["teacher", "interventionist"])
def test_admin_routes_reject_non_admins(client, method, path, role):
    response = client.request(
        method, concrete(path), headers={"Authorization": f"Bearer {token_for(role)}"}
    )
    assert response.status_code == 403
