# Pytest and Vue Front-End Testing Guide

This README explains how to configure and use `pytest` for Python tests and lists common commands for an HTML/Vue front end.

## Required environment

- Python 3.10 or newer
- Node.js 18 or newer, including npm
- Git
- A virtual environment for Python dependencies

Create and activate a Python virtual environment from the project root:

```bash
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
# Windows Command Prompt
.venv\Scripts\activate.bat
# macOS/Linux
source .venv/bin/activate
```

Install pytest and common plugins:

```bash
python -m pip install --upgrade pip
python -m pip install pytest pytest-cov pytest-asyncio
```

If the project provides dependency files, install them instead or as well:

```bash
python -m pip install -r requirements.txt
```

For the Vue application, change to the directory containing `package.json` and run:

```bash
npm install
npm run dev
```

## Basic use case

Within the main folder, run the following: 

```bash
python -m venv venv
venv\Scripts\Activate.ps1
pytest -v
```

this lets you run all pytests listed.


## Pytest file and test naming

Pytest discovers files named `test_*.py` or `*_test.py`. Name test functions and methods with the `test_` prefix. Test classes must begin with `Test` and must not define an `__init__` method.

Recommended examples:

```text
tests/
├── conftest.py
├── test_users.py
└── test_interventions.py
```

```python
def test_user_can_log_in():
	assert login("user@example.com", "password") is True


class TestValidation:
	def test_empty_name_is_rejected(self):
		assert validate_name("") is False
```

Use lowercase names with underscores. Name each test after the behavior and expected result, such as `test_empty_form_shows_validation_error`. Keep one logical behavior per test. Put reusable fixtures in `conftest.py`; pytest discovers them automatically.

## Basic pytest commands

Run these commands from the project root with the virtual environment active:

```bash
pytest                                      # Run all discovered tests
pytest tests/                               # Run tests in a directory
pytest tests/test_users.py                  # Run one file
pytest tests/test_users.py::test_user_can_log_in  # Run one test
pytest -k "login"                          # Match test names or keywords
pytest -m integration                       # Run tests with a marker
pytest -q                                   # Quiet output
pytest -v                                   # Verbose output
pytest -x                                   # Stop after the first failure
pytest --maxfail=2                          # Stop after two failures
pytest -s                                   # Show print output
pytest --lf                                 # Re-run last failed tests
pytest --ff                                 # Run last failures first
pytest --collect-only                       # List collected tests
pytest --tb=short                           # Short tracebacks
pytest --durations=10                       # Show 10 slowest tests
pytest --cov=. --cov-report=term-missing    # Run with coverage
pytest --cov=. --cov-report=html            # Create htmlcov/index.html
```

Example fixture and parametrized test:

```python
import pytest


@pytest.fixture
def user():
	return {"name": "Test User"}


@pytest.mark.parametrize("value,expected", [(1, True), (0, False)])
def test_is_positive(value, expected):
	assert (value > 0) is expected
```

Optional markers can be registered in `pytest.ini`:

```ini
[pytest]
testpaths = tests
markers =
	unit: fast isolated tests
	integration: tests involving multiple components or services
```

## Possible commands 

@pytest.mark.parametrize: Run the exact same test block multiple times using different arrays of input data (perfect for checking edge cases, boundary numbers, or validation rules on input fields).

with pytest.raises(SomeException):: Assert that a specific error should happen (e.g., ensuring a database unique constraint failure or a validation error throws the correct exception).

@pytest.mark.skip(reason="..."): Temporarily skip a test if a specific endpoint or Vue component is under construction.

@pytest.mark.xfail: Mark a test that you expect to fail right now because a known bug hasn't been fixed yet.

Keep tests independent, avoid production data, and use fixtures or mocks for external services.
