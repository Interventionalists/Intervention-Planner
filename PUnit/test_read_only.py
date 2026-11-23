import pytest
from fastapi import APIRouter, Depends, FastAPI
from fastapi.testclient import TestClient

from auth import security
from auth.security import (
    READ_ONLY_DETAIL,
    block_writes_if_read_only,
    create_access_token,
    get_current_user,
)

router = APIRouter()


@router.get("/thing")
def read_thing():
    return {"ok": True}


@router.post("/thing")
def create_thing():
    return {"ok": True}


@router.put("/thing")
def replace_thing():
    return {"ok": True}


@router.patch("/thing")
def edit_thing():
    return {"ok": True}


@router.delete("/thing")
def delete_thing():
    return {"ok": True}


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(
        router,
        dependencies=[Depends(get_current_user), Depends(block_writes_if_read_only)],
    )
    with TestClient(app) as test_client:
        yield test_client


#stands in for the users table get_current_user reads on every request
ACCOUNTS = {}


@pytest.fixture(autouse=True)
def users_table(monkeypatch):
    ACCOUNTS.clear()
    monkeypatch.setattr(security, "fetch_user_auth", lambda uid: ACCOUNTS.get(uid))


def auth_header(read_only):
    user = {"public_id": "user-1", "id": 1, "role": "admin", "read_only": read_only}
    ACCOUNTS[1] = user
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def test_read_only_flag_comes_from_database_not_token(client):
    #token minted while writable; account switched to read-only afterwards
    headers = auth_header(False)
    ACCOUNTS[1] = {**ACCOUNTS[1], "read_only": True}
    assert client.post("/thing", headers=headers).status_code == 403


def test_deleted_account_token_is_rejected(client):
    headers = auth_header(False)
    ACCOUNTS.clear()
    assert client.get("/thing", headers=headers).status_code == 401


def test_read_only_account_can_read(client):
    response = client.get("/thing", headers=auth_header(True))
    assert response.status_code == 200


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_read_only_account_cannot_write(client, method):
    response = getattr(client, method)("/thing", headers=auth_header(True))
    assert response.status_code == 403
    assert response.json()["detail"] == READ_ONLY_DETAIL


@pytest.mark.parametrize("method", ["get", "post", "put", "patch", "delete"])
def test_normal_account_unaffected(client, method):
    response = getattr(client, method)("/thing", headers=auth_header(False))
    assert response.status_code == 200


def test_missing_read_only_column_defaults_to_writable(client):
    user = {"public_id": "user-1", "id": 1, "role": "admin"}
    ACCOUNTS[1] = {**user, "read_only": None}
    headers = {"Authorization": f"Bearer {create_access_token(user)}"}
    assert client.post("/thing", headers=headers).status_code == 200
