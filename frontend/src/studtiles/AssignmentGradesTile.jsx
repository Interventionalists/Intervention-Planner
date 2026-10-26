import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AreaChart, BarChart3, LineChart } from "lucide-react";
import { useMemo, useState } from "react";
import { CardTitle } from "../components/PageElements";
import {
  getAssignmentClass,
  getAssignmentGrade,
} from "../utils/assignmentGrades";

function formatAssignmentDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function AssignmentGradesTile({ assignments, isLoading, error }) {
  const [selectedClass, setSelectedClass] = useState("all");
  const [chartType, setChartType] = useState("line");

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
          chartLabel: assignment.assignment || `Assignment ${index + 1}`,
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
        <div className="grade-chart" role="img" aria-label="Student assignment grades over time">
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
              <Tooltip
                contentStyle={{ borderColor: "var(--secondary)" }}
                labelStyle={{ color: "var(--primary)" }}
                itemStyle={{ color: "var(--secondary)" }}
                cursor={{ fill: "var(--accent)", fillOpacity: 0.12 }}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.chartLabel
                    ? `${payload[0].payload.chartLabel} · ${payload[0].payload.dateLabel}`
                    : "Assignment"
                }
                formatter={(value, _, item) => [
                  value,
                  `${item.payload.className || "Grade"} grade`,
                ]}
              />
              {chartType === "line" && (
                <Line
                  type="monotone"
                  dataKey="grade"
                  name="Grade"
                  stroke="var(--secondary)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "var(--accent)" }}
                  activeDot={{ r: 6 }}
                />
              )}
              {chartType === "bar" && (
                <Bar dataKey="grade" name="Grade" fill="var(--secondary)" radius={[4, 4, 0, 0]} />
              )}
              {chartType === "area" && (
                <Area
                  type="monotone"
                  dataKey="grade"
                  name="Grade"
                  stroke="var(--primary)"
                  fill="var(--secondary)"
                  fillOpacity={0.2}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default AssignmentGradesTile;
