# ------------------------------------------------------------------------------
#
# Name:        test_schools.py
# Purpose:     check school lookups and the school color theme.
#
# ------------------------------------------------------------------------------

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from routes import schools


def make_client(role="teacher", user_id=5):
    app = FastAPI()
    app.include_router(schools.router)
    user = {"id": user_id, "public_id": f"pub-{user_id}", "role": role}
    app.dependency_overrides[schools.get_current_user] = lambda: user
    return TestClient(app)


@pytest.fixture
def client():
    return make_client()


############################## helpers #######################################

@pytest.mark.parametrize("color, expected", [("172c50", "#172c50"), ("#172c50", "#172c50")])
def test_format_theme_color_adds_exactly_one_hash(color, expected):
    assert schools.format_theme_color(color) == expected


def test_require_self_id_or_admin():
    schools.require_self_id_or_admin({"id": 5, "role": "teacher"}, "5")
    schools.require_self_id_or_admin({"id": 1, "role": "admin"}, "5")

    with pytest.raises(HTTPException) as exc:
        schools.require_self_id_or_admin({"id": 6, "role": "teacher"}, "5")
    assert exc.value.status_code == 403


############################## school membership ############################

def test_cannot_move_another_user_to_a_new_school(client, monkeypatch):
    monkeypatch.setattr(schools, "update_user_school", lambda *args: pytest.fail("should not save"))

    response = client.put("/schools-update", params={"user_id": "6", "new_school_id": "2"})

    assert response.status_code == 403


def test_update_own_school(client, monkeypatch):
    monkeypatch.setattr(schools, "update_user_school", lambda uid, sid: [{"id": uid, "school": sid}])

    response = client.put("/schools-update", params={"user_id": "5", "new_school_id": "2"})

    assert response.status_code == 200
    assert response.json()["user"] == {"id": "5", "school": "2"}


def test_update_school_for_missing_user_is_404(client, monkeypatch):
    monkeypatch.setattr(schools, "update_user_school", lambda uid, sid: [])

    response = client.put("/schools-update", params={"user_id": "5", "new_school_id": "2"})

    assert response.status_code == 404


def test_user_school_lookup_missing_is_404(client, monkeypatch):
    monkeypatch.setattr(schools, "fetch_user_school", lambda uid: None)

    assert client.get("/schools-user-school", params={"user_id": "5"}).status_code == 404


############################## theme #########################################

def test_school_without_theme_gets_default_colors(client, monkeypatch):
    monkeypatch.setattr(schools, "fetch_user_school", lambda uid: 3)
    monkeypatch.setattr(schools, "fetch_school_theme", lambda sid: None)

    response = client.get("/schools-theme")

    assert response.json() == {"has_theme": False, "colors": schools.DEFAULT_THEME}


def test_school_theme_colors_get_hash_prefix(client, monkeypatch):
    monkeypatch.setattr(schools, "fetch_user_school", lambda uid: 3)
    monkeypatch.setattr(
        schools,
        "fetch_school_theme",
        lambda sid: {"color_primary": "111111", "color_secondary": "#222222", "color_tertiary": "abcdef"},
    )

    response = client.get("/schools-theme")

    assert response.json() == {"has_theme": True, "colors": ["#111111", "#222222", "#abcdef"]}


def test_theme_for_user_without_school_is_400(client, monkeypatch):
    monkeypatch.setattr(schools, "fetch_user_school", lambda uid: None)

    assert client.get("/schools-theme").status_code == 400
    assert client.get("/schools-logo").status_code == 400


def admin_theme_client():
    app = FastAPI()
    app.include_router(schools.router)
    app.dependency_overrides[schools.require_admin] = lambda: {"id": 1, "public_id": "a", "role": "admin"}
    return TestClient(app)


def test_admin_saves_theme(monkeypatch):
    saved = {}
    monkeypatch.setattr(schools, "fetch_user_school", lambda uid: 3)

    def fake_save(school_id, colors):
        saved.update(school=school_id, colors=colors)
        primary, secondary, tertiary = colors
        return {"color_primary": primary, "color_secondary": secondary, "color_tertiary": tertiary}

    monkeypatch.setattr(schools, "save_school_theme", fake_save)

    response = admin_theme_client().put(
        "/schools-theme",
        json={"color_primary": "112233", "color_secondary": "AABBCC", "color_tertiary": "abcdef"},
    )

    assert response.status_code == 200
    assert saved == {"school": 3, "colors": ["112233", "AABBCC", "abcdef"]}
    assert response.json()["colors"] == ["#112233", "#AABBCC", "#abcdef"]


@pytest.mark.parametrize("color", ["#112233", "12345", "1234567", "gggggg", "red"])
def test_theme_rejects_invalid_hex(monkeypatch, color):
    monkeypatch.setattr(schools, "save_school_theme", lambda *args: pytest.fail("should not save"))

    response = admin_theme_client().put(
        "/schools-theme",
        json={"color_primary": color, "color_secondary": "000000", "color_tertiary": "000000"},
    )

    assert response.status_code == 422
