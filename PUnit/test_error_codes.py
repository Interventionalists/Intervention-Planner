# ------------------------------------------------------------------------------
#
# Name:        test_error_codes.py
# Purpose:     A simple test file to check the error code definitions.
# Author:      Dudley D. (09/25/2026)
#
# ------------------------------------------------------------------------------

import pytest

# Loads the error definitions from the backend.error module to test them.
from backend.error import ValidationError, ERROR_CODES

# Generic test to make sure the ValidationError class is defined and can be instantiated.
def test_validation_error_has_expected_code_and_payload():
    err = ValidationError("Missing required field", details={"field": "name"})

    assert err.code == "VALIDATION_001"
    assert err.status_code == 400
    assert err.to_dict() == {
        "code": "VALIDATION_001",
        "message": "Missing required field",
        "details": {"field": "name"},
    }

def test_error_code_lookup_exists():
    assert "VALIDATION_001" in ERROR_CODES
    assert ERROR_CODES["VALIDATION_001"] == "Request validation failed"

def test_validation_error_can_be_raised_and_caught():
    with pytest.raises(ValidationError):
        raise ValidationError("Bad input")