# ------------------------------------------------------------------------------
#
# Name:        conftest.py
# Purpose:     A file to define fixtures for pytest.
# Author:      Dudley D. (09/23/2026)
#
# ------------------------------------------------------------------------------

# Conftest is discovered automatically by pytest and 
# is used to define fixtures that can be shared across 
# multiple test files. 

# When in another file, create a test function and include 
# the fixture name as an argument. This will automatically 
# inject the fixture into the test function.

import os
import sys
from pathlib import Path

import pytest
import os

# Backend modules import each other relative to backend/ (e.g. "from routes.x"),
# so put it on the path. Fake config is set before anything imports the backend:
# load_dotenv() never overrides existing variables, so tests can't pick up a
# real backend/.env and never talk to the real database.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
os.environ["JWT_SECRET"] = "test-secret-not-for-production-use-0123456789"
os.environ["SUPABASE_URL"] = "https://example.supabase.co"
os.environ["SUPABASE_SERVICE_KEY"] = "test-service-key"

# TODO: Make this an actual user
@pytest.fixture
def sample_user():
    return {"name": "Test User"}

os.environ.setdefault("JWT_SECRET", "pytest-only-secret")
os.environ.setdefault("SUPABASE_URL", "https://pytest-only.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "pytest-only-service-key")