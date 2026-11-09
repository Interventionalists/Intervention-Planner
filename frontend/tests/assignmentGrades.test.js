import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calculateAssignmentGrades,
  getAssignmentClass,
  getAssignmentGrade,
  normalizeAssignmentSubject,
} from "../src/utils/assignmentGrades.js";

test("getAssignmentClass prefers class, falls back to subject, and trims", () => {
  assert.equal(getAssignmentClass({ class: " math ", subject: "art" }), "math");
  assert.equal(getAssignmentClass({ subject: "science" }), "science");
  assert.equal(getAssignmentClass({ class: 5 }), "");
  assert.equal(getAssignmentClass({}), "");
});

test("getAssignmentGrade parses numbers and treats blanks as missing", () => {
  assert.equal(getAssignmentGrade({ grade: 88 }), 88);
  assert.equal(getAssignmentGrade({ grade: "72.5" }), 72.5);
  assert.equal(getAssignmentGrade({ grade: 0 }), 0);
  assert.equal(getAssignmentGrade({ grade: null }), null);
  assert.equal(getAssignmentGrade({}), null);
  assert.equal(getAssignmentGrade({ grade: "   " }), null);
  assert.equal(getAssignmentGrade({ grade: "abc" }), null);
  assert.equal(getAssignmentGrade({ grade: Infinity }), null);
});

test("normalizeAssignmentSubject matches backend subject codes", () => {
  assert.equal(normalizeAssignmentSubject("Math"), "math");
  assert.equal(normalizeAssignmentSubject("Social Studies"), "socialstudies");
  assert.equal(normalizeAssignmentSubject("P.E."), "p_e");
  assert.equal(normalizeAssignmentSubject("pe"), "p_e");
});

test("calculateAssignmentGrades averages per class, sorted by class", () => {
  const result = calculateAssignmentGrades([
    { class: "science", grade: 90 },
    { class: "math", grade: 80 },
    { class: "math", grade: "100" },
    { subject: "math", grade: 60 },
  ]);

  assert.deepEqual(result, { math: 80, science: 90 });
  assert.deepEqual(Object.keys(result), ["math", "science"]);
});

test("calculateAssignmentGrades skips ungraded or unclassed assignments", () => {
  const result = calculateAssignmentGrades([
    { class: "math", grade: null },
    { class: "", grade: 50 },
    { class: "art", grade: "" },
    { class: "art", grade: 70 },
  ]);

  assert.deepEqual(result, { art: 70 });
});

test("calculateAssignmentGrades returns an empty object for no assignments", () => {
  assert.deepEqual(calculateAssignmentGrades([]), {});
});
