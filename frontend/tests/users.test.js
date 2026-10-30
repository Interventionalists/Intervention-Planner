import { test } from "node:test";
import assert from "node:assert/strict";

import { displayName, toDateTimeLocal, USER_ROLES } from "../src/utils/users.js";
import { getStudentsNeedingAttention } from "../src/components/studentsNeedingAttention.js";

test("USER_ROLES matches the roles the backend accepts", () => {
  assert.deepEqual(USER_ROLES, ["teacher", "interventionist", "admin"]);
});

test("displayName falls back through full name, name, email", () => {
  assert.equal(displayName({ first_name: "Ada", last_name: "Lovelace" }), "Ada Lovelace");
  assert.equal(displayName({ first_name: "Ada", last_name: null }), "Ada");
  assert.equal(displayName({ name: "Legacy Name", email: "a@b.co" }), "Legacy Name");
  assert.equal(displayName({ email: "a@b.co" }), "a@b.co");
  assert.equal(displayName({}), "Unnamed user");
});

test("toDateTimeLocal formats local time for datetime-local inputs", () => {
  const date = new Date(2026, 9, 30, 14, 5, 59);
  assert.equal(toDateTimeLocal(date), "2026-10-30T14:05");
});

test("students with any score below 60 need attention", () => {
  const struggling = { id: 1, scores: { Math: 59.9, English: 85 } };
  const fine = { id: 2, scores: { Math: 60, English: 100 } };

  const result = getStudentsNeedingAttention([struggling, fine]);

  assert.deepEqual(result, [
    { student: struggling, lowScores: [{ subject: "Math", score: 59.9 }] },
  ]);
});

test("students without numeric scores are not flagged", () => {
  const result = getStudentsNeedingAttention([
    { id: 1 },
    { id: 2, scores: {} },
    { id: 3, scores: { Art: "n/a" } },
  ]);

  assert.deepEqual(result, []);
});

test("string scores are compared as numbers", () => {
  const result = getStudentsNeedingAttention([{ id: 1, scores: { Math: "45" } }]);
  assert.deepEqual(result[0].lowScores, [{ subject: "Math", score: 45 }]);
});
