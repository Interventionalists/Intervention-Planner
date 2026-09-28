# ------------------------------------------------------------------------------
#
# Name:        test_web_connection.py
# Purpose:     A simple test file to check the connection to the frontend server.
# Author:      Dudley D. (09/21/2026)
#
# ------------------------------------------------------------------------------

from urllib.request import urlopen
from urllib.error import URLError
from playwright.sync_api import Page, expect

import pytest

FRONTEND_URL = "http://localhost:5173/"

# Test connection to the frontend server
def test_frontend_connection():
    """Test to check if the frontend is accessible."""
    try:
        with urlopen(FRONTEND_URL, timeout=5) as response:
            page = response.read().decode('utf-8')
            content_type = response.headers.get_content_type()
            assert response.status == 200
            assert content_type == 'text/html'
            assert "<!DOCTYPE html>" in page or "<html" in page
    except URLError as e:
        pytest.fail(f"Failed to connect to the frontend: {e.reason}")

def test_login_page_content(page: Page):
    page.goto("http://127.0.0.1:5173/login")

    expect(page.get_by_role("heading", name="Welcome back")).to_be_visible()
    expect(page.get_by_label("Email address")).to_be_visible()
    expect(page.get_by_label("Password")).to_be_visible()
    expect(page.get_by_role("button", name="Sign in")).to_be_visible()


def test_login_rejects_invalid_email(page: Page):
    page.goto("http://127.0.0.1:5173/login")

    email = page.get_by_label("Email address")
    email.fill("not-an-email")
    page.get_by_label("Password").fill("example-password")

    assert email.evaluate("(element) => element.validity.typeMismatch")

    page.get_by_role("button", name="Sign in").click()
    expect(page).to_have_url("http://127.0.0.1:5173/login")