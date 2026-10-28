export function getAssignmentClass(assignment) {
  const className = assignment.class ?? assignment.subject;
  return typeof className === "string" ? className.trim() : "";
}

export function getAssignmentGrade(assignment) {
  if (
    assignment.grade == null ||
    (typeof assignment.grade === "string" && !assignment.grade.trim())
  ) {
    return null;
  }

  const grade = Number(assignment.grade);
  return Number.isFinite(grade) ? grade : null;
}

export function normalizeAssignmentSubject(subject) {
  const normalized = subject.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized === "pe" ? "p_e" : normalized;
}

export function calculateAssignmentGrades(assignments) {
  const gradeTotals = new Map();

  for (const assignment of assignments) {
    const className = getAssignmentClass(assignment);
    const grade = getAssignmentGrade(assignment);
    if (!className || grade == null) {
      continue;
    }

    const totals = gradeTotals.get(className) ?? { total: 0, count: 0 };
    totals.total += grade;
    totals.count += 1;
    gradeTotals.set(className, totals);
  }

  return Object.fromEntries(
    [...gradeTotals.entries()]
      .sort(([firstClass], [secondClass]) =>
        firstClass.localeCompare(secondClass)
      )
      .map(([className, totals]) => [
        className,
        totals.total / totals.count,
      ])
  );
}
