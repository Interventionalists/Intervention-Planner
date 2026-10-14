# ------------------------------------------------------------------------------
#
# Name:        generic_test_one.py
# Purpose:     A simple test file to demonstrate pytest functionality.
# Author:      Dudley D. (09/23/2026)
#
# ------------------------------------------------------------------------------

# Below is a simple test file to demonstrate pytest functionality. 
# It includes a few basic tests that always pass, as well as a parameterized 
# test that runs multiple passing checks in a row.

# When creating tests, make sure the file name is test_*.py and all functions
# that are tests start with test_*. This is how pytest discovers and runs tests.

# Look at the pytest readme for more information

import pytest

def test_always_passes():
    """A simple dummy test to confirm pytest runs successfully."""
    x = 1
    y = 1
    assert x == y


def test_basic_math():
    """Verifies that basic arithmetic operations work as expected."""
    assert 2 + 2 == 4


@pytest.mark.parametrize("input_value, expected_result", [
    (1, 2),
    (5, 10),
    (100, 200)
])


def test_generic_multiplication(input_value, expected_result):
    """A parameterized test that runs multiple passing checks in a row."""
    assert input_value * 2 == expected_result

# Using the fixture allows for the same data 
# to be reused across multiple tests, making 
# the tests cleaner and easier to maintain.
@pytest.fixture
def sample_user():
    return {
        "name": "Test User",
        "email": "test@example.com",
    }

def test_user_has_name(sample_user):
    assert sample_user["name"] == "Test User"


def test_user_has_valid_email(sample_user):
    assert "@" in sample_user["email"]

# Classes can be used to group related tests.
# CI will still run all subtests underneath the class,
# but makes it easier to organize and run the tests.
class TestUser:
    @pytest.fixture
    def user(self):
        return {
            "name": "Test User",
            "email": "test@example.com",
        }

    def test_user_has_name(self, user):
        assert user["name"] == "Test User"

    def test_user_has_email(self, user):
        assert "@" in user["email"]