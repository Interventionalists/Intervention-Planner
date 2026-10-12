import { useMemo, useState } from "react";
import StudentsList from "../components/StudentsList";
import { PageHeading } from "../components/PageElements";

function StudentsPage({ students, query, selectedStudent, onSelect }) {
  const [gradeFilter, setGradeFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const grades = [...new Set(students.map((student) => student.grade))].sort(
    (left, right) => String(left).localeCompare(String(right), undefined, { numeric: true })
  );
  const teachers = [...new Set(students.map((student) => student.teacher))].sort(
    (left, right) => left.localeCompare(right)
  );
  const filteredStudents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return students.filter(
      (student) =>
        student.name.toLowerCase().includes(normalizedQuery) &&
        (gradeFilter === "all" || String(student.grade) === gradeFilter) &&
        (teacherFilter === "all" || student.teacher === teacherFilter)
    );
  }, [gradeFilter, query, students, teacherFilter]);

  const clearFilters = () => {
    setGradeFilter("all");
    setTeacherFilter("all");
  };

  return (
    <>
      <PageHeading
        eyebrow="Students"
        title="Your students"
        subtitle="Select a student to view details."
      />
      <div className="student-filters">
        <label className="student-filter-field">
          <span>Grade</span>
          <select
            value={gradeFilter}
            onChange={(event) => setGradeFilter(event.target.value)}
          >
            <option value="all">All grades</option>
            {grades.map((grade) => (
              <option key={grade} value={String(grade)}>
                {grade}
              </option>
            ))}
          </select>
        </label>
        <label className="student-filter-field">
          <span>Teacher</span>
          <select
            value={teacherFilter}
            onChange={(event) => setTeacherFilter(event.target.value)}
          >
            <option value="all">All teachers</option>
            {teachers.map((teacher) => (
              <option key={teacher} value={teacher}>
                {teacher}
              </option>
            ))}
          </select>
        </label>
        <span className="student-filter-count" aria-live="polite">
          Showing {filteredStudents.length} of {students.length} students
        </span>
        {(gradeFilter !== "all" || teacherFilter !== "all") && (
          <button className="student-filter-clear" type="button" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>
      {filteredStudents.length === 0 ? (
        <div className="card">
          <p>No students match your search and filters.</p>
        </div>
      ) : (
        <StudentsList
          list={filteredStudents}
          selectedStudent={selectedStudent}
          onSelect={onSelect}
        />
      )}
    </>
  );
}

export default StudentsPage;
