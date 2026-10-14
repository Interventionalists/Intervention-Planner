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

import pytest

# TODO: Make this an actual user
@pytest.fixture
def sample_user():
    return {"name": "Test User"}