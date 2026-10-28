import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { AreaChart, BarChart3, LineChart, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../api";
import { CardTitle } from "../components/PageElements";
import {
  getAssignmentClass,
  getAssignmentGrade,
  normalizeAssignmentSubject,
} from "../utils/assignmentGrades";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

function getAssignmentName(point) {
  const name =
    point.Assignment ??
    point.assignment ??
    point.assignment_name ??
    point.assignmentName;
  return typeof name === "string" ? name.trim() : "";
}

function formatAssignmentDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getDateInputValue(value) {
  if (value == null || value === "") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentDateInputValue() {
  return getDateInputValue(new Date());
}

function getRequestErrorMessage(detail, fallback) {
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        const location = Array.isArray(item.loc) ? item.loc.join(".") : "";
        return [location, item.msg || item.message]
          .filter(Boolean)
          .join(": ");
      })
      .filter(Boolean)
      .join("; ") || fallback;
  }
  if (detail && typeof detail === "object") {
    return detail.message || detail.msg || JSON.stringify(detail);
  }
  return fallback;
}

function AssignmentGradesTile({
  assignments,
  subjectGoals = {},
  studentId,
  onAssignmentsChange,
  role,
  isLoading,
  error,
}) {
  const [selectedClass, setSelectedClass] = useState("all");
  const [chartType, setChartType] = useState("line");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [highlightedPointId, setHighlightedPointId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [pendingDeleteIds, setPendingDeleteIds] = useState([]);
  const [newPoints, setNewPoints] = useState([]);
  const [sheetError, setSheetError] = useState("");
  const [savingPointId, setSavingPointId] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const chartElement = useRef(null);
  const normalizedRole = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const canEditPoints = ["teacher", "interventionist", "interventionalist"].includes(
    normalizedRole
  );

  useEffect(() => {
    if (!isSheetOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIsSheetOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isSheetOpen]);

  const classes = useMemo(
    () =>
      [...new Set(assignments.map(getAssignmentClass).filter(Boolean))].sort(),
    [assignments]
  );
  const chartData = useMemo(
    () =>
      assignments
        .filter(
          (assignment) =>
            getAssignmentGrade(assignment) != null &&
            (selectedClass === "all" ||
              getAssignmentClass(assignment) === selectedClass)
        )
        .map((assignment, index) => ({
          ...assignment,
          grade: getAssignmentGrade(assignment),
          className: getAssignmentClass(assignment),
          dateLabel: formatAssignmentDate(assignment.created_at),
          chartLabel: getAssignmentName(assignment) || `Assignment ${index + 1}`,
        }))
        .sort((first, second) => {
          const firstDate = new Date(first.created_at).getTime();
          const secondDate = new Date(second.created_at).getTime();
          if (Number.isNaN(firstDate)) return 1;
          if (Number.isNaN(secondDate)) return -1;
          return firstDate - secondDate;
        }),
    [assignments, selectedClass]
  );
  const averageSubjectGoal = useMemo(() => {
    if (!subjectGoals) return null;
    const goals = Object.values(subjectGoals)
      .filter((goal) => goal != null && !(typeof goal === "string" && !goal.trim()))
      .map(Number)
      .filter(Number.isFinite);
    return goals.length
      ? goals.reduce((total, goal) => total + goal, 0) / goals.length
      : null;
  }, [subjectGoals]);
  const selectedSubjectGoal = useMemo(() => {
    if (selectedClass === "all" || !subjectGoals) return null;
    const goal = Object.entries(subjectGoals).find(
      ([subject]) =>
        normalizeAssignmentSubject(subject) ===
        normalizeAssignmentSubject(selectedClass)
    )?.[1];
    if (goal == null || (typeof goal === "string" && !goal.trim())) {
      return null;
    }
    const numericGoal = Number(goal);
    return Number.isFinite(numericGoal) ? numericGoal : null;
  }, [selectedClass, subjectGoals]);
  const chartGoal =
    selectedClass === "all" ? averageSubjectGoal : selectedSubjectGoal;
  const chartGoalLabel =
    selectedClass === "all" ? "Average goals" : "Subject goal";

  const openSheet = (point) => {
    setIsSheetOpen(true);
    setHighlightedPointId(point?.id ?? null);
    setSheetError("");
  };

  const updateDraft = (id, field, value) => {
    const assignment = assignments.find((item) => item.id === id);
    setDrafts((current) => ({
      ...current,
      [id]: {
        assignment: getAssignmentName(assignment),
        subject: getAssignmentClass(assignment),
        grade: assignment.grade == null ? "" : String(assignment.grade),
        created_at: getDateInputValue(assignment.created_at),
        ...current[id],
        [field]: value,
      },
    }));
  };

  const getPointValues = (point) => {
    const draft = drafts[point.id] || {
      assignment: getAssignmentName(point),
      subject: getAssignmentClass(point),
      grade: point.grade == null ? "" : String(point.grade),
      created_at: getDateInputValue(point.created_at),
    };
    const grade = Number(draft.grade);
    if (!draft.assignment.trim() || !draft.subject.trim()) {
      throw new Error("Enter an assignment name and class for each point.");
    }
    if (draft.grade.trim() === "" || !Number.isFinite(grade) || grade < 0) {
      throw new Error("Enter a grade of zero or higher for each point.");
    }
    if (!draft.created_at) {
      throw new Error("Choose a date for each point.");
    }
    return {
      assignment: draft.assignment.trim(),
      subject: draft.subject.trim(),
      grade,
      created_at: new Date(`${draft.created_at}T12:00:00`).toISOString(),
    };
  };

  const saveChanges = async () => {
    setSavingPointId("all");
    setSheetError("");
    const changedIds = Object.keys(drafts).filter(
      (id) => !pendingDeleteIds.includes(id)
    );
    const changedPoints = changedIds.map((id) =>
      assignments.find((item) => String(item.id) === id)
    );
    const missingPoints = changedIds.filter(
      (_, index) => !changedPoints[index]
    );
    const tasks = changedPoints
      .filter(Boolean)
      .map((point) => ({
        key: String(point.id),
        kind: "update",
        label: getAssignmentName(point) || `Assignment ${point.id}`,
        run: async () => {
          const response = await apiFetch(
            `${API_BASE_URL}/assignments-update/${encodeURIComponent(point.id)}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(getPointValues(point)),
            }
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(
              getRequestErrorMessage(
                result.detail,
                `Request failed (${response.status}).`
              )
            );
          }
          if (!result.assignment) {
            throw new Error("The update response did not include the saved point.");
          }
          return result.assignment;
        },
      }));

    const pendingDeletePoints = pendingDeleteIds.map((id) =>
      assignments.find((item) => String(item.id) === id)
    );
    pendingDeleteIds.forEach((id, index) => {
      if (!pendingDeletePoints[index]) {
        missingPoints.push(`delete:${id}`);
      }
    });
    pendingDeletePoints.filter(Boolean).forEach((point) => {
      tasks.push({
        key: `delete:${point.id}`,
        kind: "delete",
        id: String(point.id),
        label: getAssignmentName(point) || `Assignment ${point.id}`,
        run: async () => {
          const response = await apiFetch(
            `${API_BASE_URL}/assignments-delete/${encodeURIComponent(point.id)}`,
            { method: "DELETE" }
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(
              getRequestErrorMessage(
                result.detail,
                `Delete failed (${response.status}).`
              )
            );
          }
          if (result.deleted !== true) {
            throw new Error("The server did not confirm deletion.");
          }
          return point.id;
        },
      });
    });

    newPoints.forEach((newPoint) => {
      tasks.push({
        key: `new:${newPoint.id}`,
        kind: "create",
        id: newPoint.id,
        label: newPoint.assignment.trim() || "New assignment",
        run: async () => {
          if (!newPoint.assignment.trim() || !newPoint.subject.trim()) {
            throw new Error("Enter an assignment name and class.");
          }
          const grade = Number(newPoint.grade);
          if (
            newPoint.grade.trim() === "" ||
            !Number.isFinite(grade) ||
            grade < 0
          ) {
            throw new Error("Enter a grade of zero or higher.");
          }
          if (!newPoint.created_at) {
            throw new Error("Choose a date for the new point.");
          }
          const response = await apiFetch(`${API_BASE_URL}/assignments-create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              student_id: studentId,
              assignment: newPoint.assignment.trim(),
              subject: newPoint.subject.trim(),
              grade,
              created_at: new Date(`${newPoint.created_at}T12:00:00`).toISOString(),
            }),
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(
              getRequestErrorMessage(
                result.detail,
                `Request failed (${response.status}).`
              )
            );
          }
          if (!result.assignment) {
            throw new Error("The create response did not include the new point.");
          }
          return result.assignment;
        },
      });
    });

    const results = await Promise.allSettled(tasks.map((task) => task.run()));
    const updatedAssignments = [];
    const createdPoints = [];
    const savedKeys = [];
    const deletedIds = [];
    const failures = missingPoints.map((id) =>
      id.startsWith("delete:")
        ? `Point ${id.slice("delete:".length)}: no longer available.`
        : `Point ${id}: no longer available.`
    );
    results.forEach((result, index) => {
      const task = tasks[index];
      if (result.status === "fulfilled") {
        if (task.kind === "create") createdPoints.push(result.value);
        else if (task.kind === "delete") deletedIds.push(task.id);
        else updatedAssignments.push(result.value);
        savedKeys.push(task.key);
      } else {
        console.error(`Error saving ${task.label}:`, result.reason);
        failures.push(`${task.label}: ${result.reason.message || "Could not save."}`);
      }
    });

    if (updatedAssignments.length || createdPoints.length || deletedIds.length) {
      onAssignmentsChange((current) => {
        const updatedById = new Map(
          updatedAssignments.map((item) => [item.id, item])
        );
        const deletedIdSet = new Set(deletedIds);
        const next = current
          .filter((item) => !deletedIdSet.has(String(item.id)))
          .map((item) => updatedById.get(item.id) || item);
        return createdPoints.length ? [...next, ...createdPoints] : next;
      });
    }
    const savedNewPointIds = savedKeys
      .filter((key) => key.startsWith("new:"))
      .map((key) => key.slice("new:".length));
    if (savedNewPointIds.length) {
      setNewPoints((current) =>
        current.filter((point) => !savedNewPointIds.includes(point.id))
      );
    }
    if (savedKeys.length) {
      setDrafts((current) => {
        const next = { ...current };
        for (const key of savedKeys) delete next[key];
        return next;
      });
    }
    if (deletedIds.length) {
      setPendingDeleteIds((current) =>
        current.filter((id) => !deletedIds.includes(id))
      );
      if (deletedIds.includes(String(highlightedPointId))) {
        setHighlightedPointId(null);
      }
      setDrafts((current) => {
        const next = { ...current };
        deletedIds.forEach((id) => delete next[id]);
        return next;
      });
    }
    setSheetError(
      failures.length
        ? `Some changes could not be saved: ${failures.join(" ")}`
        : ""
    );
    setSavingPointId(null);
  };

  const togglePendingDelete = (point) => {
    const id = String(point.id);
    setSheetError("");
    setPendingDeleteIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const renderPointDot = ({ cx, cy, payload }) => (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill="var(--accent)"
      stroke="var(--secondary)"
      strokeWidth={2}
      className="grade-chart-point"
      role="button"
      tabIndex={0}
      aria-label={`${canEditPoints ? "Edit" : "View"} ${payload.chartLabel}, grade ${payload.grade}`}
      onClick={() => openSheet(payload)}
      onMouseEnter={() => setHoveredPoint({ point: payload, x: cx, y: cy })}
      onMouseMove={() => setHoveredPoint({ point: payload, x: cx, y: cy })}
      onMouseLeave={() => setHoveredPoint(null)}
      onFocus={() => setHoveredPoint({ point: payload, x: cx, y: cy })}
      onBlur={() => setHoveredPoint(null)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openSheet(payload);
        }
      }}
    />
  );

  return (
    <div className="card chart-card profile-progress-card">
      <CardTitle title="Assignment grades" />
      <div className="grade-chart-controls">
        <label className="grade-chart-filter">
          <span>Class</span>
          <select
            value={selectedClass}
            onChange={(event) => setSelectedClass(event.target.value)}
            disabled={classes.length === 0}
          >
            <option value="all">All classes</option>
            {classes.map((className) => (
              <option key={className} value={className}>
                {className}
              </option>
            ))}
          </select>
        </label>
        <div className="grade-chart-options">
          {chartGoal != null && (
            <div
              className="grade-chart-goal-legend"
              role="img"
              aria-label={`Red dashed line represents ${chartGoalLabel.toLowerCase()}`}
            >
              <span aria-hidden="true" />
              <span>{chartGoalLabel}</span>
            </div>
          )}
          <div className="grade-chart-types" role="group" aria-label="Graph type">
            <button
              type="button"
              aria-label="Line graph"
              aria-pressed={chartType === "line"}
              onClick={() => setChartType("line")}
            >
              <LineChart size={17} />
              <span>Line</span>
            </button>
            <button
              type="button"
              aria-label="Bar graph"
              aria-pressed={chartType === "bar"}
              onClick={() => setChartType("bar")}
            >
              <BarChart3 size={17} />
              <span>Bar</span>
            </button>
            <button
              type="button"
              aria-label="Area graph"
              aria-pressed={chartType === "area"}
              onClick={() => setChartType("area")}
            >
              <AreaChart size={17} />
              <span>Area</span>
            </button>
          </div>
        </div>
        {canEditPoints && (
          <button
            type="button"
            className="grade-chart-data-toggle"
            aria-expanded={isSheetOpen}
            onClick={() => setIsSheetOpen((open) => !open)}
          >
            {isSheetOpen ? "Hide points" : "Edit points"}
          </button>
        )}
      </div>
      {isLoading ? (
        <p className="muted" role="status">Loading assignment grades...</p>
      ) : error ? (
        <p className="grade-chart-error" role="alert">{error}</p>
      ) : chartData.length === 0 ? (
        <p className="muted">
          No graded assignments are available
          {selectedClass !== "all" ? ` for ${selectedClass}` : ""}.
        </p>
      ) : (
        <div
          className="grade-chart"
          role="group"
          aria-label="Student assignment grades over time"
          ref={chartElement}
          onMouseLeave={() => setHoveredPoint(null)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 12, right: 20, bottom: 8, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--accent)"
                strokeOpacity={0.25}
              />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 11, fill: "var(--primary)" }}
                minTickGap={18}
              />
              <YAxis
                width={42}
                tick={{ fontSize: 11, fill: "var(--primary)" }}
                domain={[0, "auto"]}
                allowDecimals
              />
              {chartGoal != null && (
                <ReferenceLine
                  y={chartGoal}
                  stroke="#dc2626"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  ifOverflow="extendDomain"
                />
              )}
              {chartType === "line" && (
                <Line
                  type="monotone"
                  dataKey="grade"
                  name="Grade"
                  stroke="var(--secondary)"
                  strokeWidth={2}
                  dot={renderPointDot}
                  activeDot={renderPointDot}
                />
              )}
              {chartType === "bar" && (
                <Bar
                  dataKey="grade"
                  name="Grade"
                  fill="var(--secondary)"
                  radius={[4, 4, 0, 0]}
                  onClick={(point) => openSheet(point.payload || point)}
                  onMouseEnter={(point, _, event) => {
                    const rect = chartElement.current?.getBoundingClientRect();
                    const dataPoint = point.payload || point;
                    if (rect && dataPoint) {
                      setHoveredPoint({
                        point: dataPoint,
                        x: event.clientX - rect.left,
                        y: event.clientY - rect.top,
                      });
                    }
                  }}
                  onMouseMove={(point, _, event) => {
                    const rect = chartElement.current?.getBoundingClientRect();
                    const dataPoint = point.payload || point;
                    if (rect && dataPoint) {
                      setHoveredPoint({
                        point: dataPoint,
                        x: event.clientX - rect.left,
                        y: event.clientY - rect.top,
                      });
                    }
                  }}
                  onMouseLeave={() => setHoveredPoint(null)}
                  cursor="pointer"
                />
              )}
              {chartType === "area" && (
                <Area
                  type="monotone"
                  dataKey="grade"
                  name="Grade"
                  stroke="var(--primary)"
                  fill="var(--secondary)"
                  fillOpacity={0.2}
                  dot={renderPointDot}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          {hoveredPoint && (
            <div
              className="assignment-grade-tooltip"
              style={{ left: hoveredPoint.x, top: hoveredPoint.y }}
              role="status"
            >
              <strong>{hoveredPoint.point.chartLabel}</strong>
              <span>
                {hoveredPoint.point.grade}{" "}
                {hoveredPoint.point.className || "Grade"}
              </span>
              <small>{hoveredPoint.point.dateLabel}</small>
            </div>
          )}
          </div>
      )}
      {isSheetOpen && (
        <div
          className="grade-points-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsSheetOpen(false);
          }}
        >
          <section
            className="grade-points-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="grade-points-title"
          >
          <div className="grade-points-sheet-header">
            <div>
              <h3 id="grade-points-title">Graph points</h3>
              <p className="muted">
                {canEditPoints
                  ? "Edit assignment details or grades, add a point, or remove one."
                  : "Assignment details and grades for this student."}
              </p>
            </div>
            <button
              type="button"
              className="grade-points-close"
              aria-label="Close points spreadsheet"
              onClick={() => setIsSheetOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          {sheetError && <p className="grade-chart-error" role="alert">{sheetError}</p>}
          <div className="grade-points-table-wrap">
            <table className="grade-points-table">
              <thead>
                <tr>
                  <th scope="col">Assignment</th>
                  <th scope="col">Class</th>
                  <th scope="col">Grade</th>
                  <th scope="col">Date</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((point) => {
                  const draft = drafts[point.id] || {
                    assignment: getAssignmentName(point),
                    subject: getAssignmentClass(point),
                    grade: point.grade == null ? "" : String(point.grade),
                    created_at: getDateInputValue(point.created_at),
                  };
                  const isSaving =
                    savingPointId === "all" ||
                    String(savingPointId) === String(point.id);
                  const isPendingDelete = pendingDeleteIds.includes(
                    String(point.id)
                  );
                  return (
                    <tr
                      key={point.id}
                      className={[
                        highlightedPointId === point.id ? "is-highlighted" : "",
                        isPendingDelete ? "is-pending-delete" : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <td>
                        <input
                          aria-label={`Assignment for ${point.chartLabel}`}
                          value={draft.assignment}
                          onChange={(event) => updateDraft(point.id, "assignment", event.target.value)}
                          maxLength={200}
                          disabled={!canEditPoints || isSaving || isPendingDelete}
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Class for ${point.chartLabel}`}
                          value={draft.subject}
                          onChange={(event) => updateDraft(point.id, "subject", event.target.value)}
                          disabled={!canEditPoints || isSaving || isPendingDelete}
                        >
                          {draft.subject && !classes.includes(draft.subject) && (
                            <option value={draft.subject}>{draft.subject}</option>
                          )}
                          {classes.length === 0 && !draft.subject && (
                            <option value="">No classes available</option>
                          )}
                          {classes.map((className) => (
                            <option key={className} value={className}>
                              {className}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label={`Grade for ${point.chartLabel}`}
                          type="number"
                          min="0"
                          step="any"
                          value={draft.grade}
                          onChange={(event) => updateDraft(point.id, "grade", event.target.value)}
                          disabled={!canEditPoints || isSaving || isPendingDelete}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Date for ${point.chartLabel}`}
                          type="date"
                          value={draft.created_at}
                          onChange={(event) =>
                            updateDraft(point.id, "created_at", event.target.value)
                          }
                          disabled={!canEditPoints || isSaving || isPendingDelete}
                        />
                      </td>
                      {canEditPoints ? (
                        <td className="grade-points-actions">
                          <button
                            type="button"
                            className="grade-points-delete"
                            aria-label={
                              isPendingDelete
                                ? `Undo delete ${point.chartLabel}`
                                : `Mark ${point.chartLabel} for deletion`
                            }
                            title={isPendingDelete ? "Undo delete" : "Delete on save"}
                            onClick={() => togglePendingDelete(point)}
                            disabled={isSaving}
                          >
                            {isPendingDelete ? <X size={15} /> : <Trash2 size={15} />}
                          </button>
                        </td>
                      ) : (
                        <td />
                      )}
                    </tr>
                  );
                })}
                {canEditPoints && newPoints.map((newPoint, index) => (
                  <tr className="grade-points-new-row" key={newPoint.id}>
                    <td>
                      <input
                        aria-label={`New assignment ${index + 1}`}
                        value={newPoint.assignment}
                        onChange={(event) =>
                          setNewPoints((current) =>
                            current.map((point) =>
                              point.id === newPoint.id
                                ? { ...point, assignment: event.target.value }
                                : point
                            )
                          )
                        }
                        maxLength={200}
                        disabled={savingPointId === "all"}
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`New class ${index + 1}`}
                        value={newPoint.subject}
                        onChange={(event) =>
                          setNewPoints((current) =>
                            current.map((point) =>
                              point.id === newPoint.id
                                ? { ...point, subject: event.target.value }
                                : point
                            )
                          )
                        }
                        disabled={savingPointId === "all"}
                      >
                        <option value="">
                          {classes.length ? "Select a class" : "No classes available"}
                        </option>
                        {classes.map((className) => (
                          <option key={className} value={className}>
                            {className}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`New grade ${index + 1}`}
                        type="number"
                        min="0"
                        step="any"
                        value={newPoint.grade}
                        onChange={(event) =>
                          setNewPoints((current) =>
                            current.map((point) =>
                              point.id === newPoint.id
                                ? { ...point, grade: event.target.value }
                                : point
                            )
                          )
                        }
                        disabled={savingPointId === "all"}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`New point date ${index + 1}`}
                        type="date"
                        value={newPoint.created_at}
                        onChange={(event) =>
                          setNewPoints((current) =>
                            current.map((point) =>
                              point.id === newPoint.id
                                ? { ...point, created_at: event.target.value }
                                : point
                            )
                          )
                        }
                        disabled={savingPointId === "all"}
                      />
                    </td>
                    <td className="grade-points-actions">
                      <button
                        type="button"
                        className="grade-points-delete"
                        aria-label={`Remove new point ${index + 1}`}
                        onClick={() =>
                          setNewPoints((current) =>
                            current.filter((point) => point.id !== newPoint.id)
                          )
                        }
                        disabled={savingPointId === "all"}
                      >
                        <X size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEditPoints && (
            <div className="grade-points-footer">
              <button
                type="button"
                className="grade-points-add"
                disabled={savingPointId === "all"}
                onClick={() => {
                    setNewPoints((current) => [
                      ...current,
                      {
                      id: globalThis.crypto?.randomUUID?.() ||
                        `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                      assignment: "",
                      subject: selectedClass === "all" ? "" : selectedClass,
                      grade: "",
                      created_at: getCurrentDateInputValue(),
                      },
                    ]);
                    setSheetError("");
                }}
              >
                <Plus size={16} />
                Add point
              </button>
              <button
                type="button"
                className="grade-points-save-all"
                onClick={saveChanges}
                disabled={
                  savingPointId === "all" ||
                  (!Object.keys(drafts).length &&
                    !pendingDeleteIds.length &&
                    !newPoints.length)
                }
              >
                {savingPointId === "all" ? "Saving..." : "Save all changes"}
              </button>
            </div>
          )}
          </section>
        </div>
      )}
    </div>
  );
}

export default AssignmentGradesTile;
