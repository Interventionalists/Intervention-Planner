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
