# ------------------------------------------------------------------------------
#
# Name:        test_web_connection.py
# Purpose:     A simple test file to check the connection to the frontend server.
# Author:      Dudley D. (09/21/2026)
#
# ------------------------------------------------------------------------------

from urllib.request import urlopen
from urllib.error import URLError

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