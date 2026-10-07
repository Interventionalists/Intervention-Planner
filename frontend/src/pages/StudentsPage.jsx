import StudentsList from "../components/StudentsList";
import { PageHeading } from "../components/PageElements";

function StudentsPage({ students, selectedStudent, onSelect }) {
  return (
    <>
      <PageHeading
        eyebrow="Students"
        title="Your students"
        subtitle="Select a student to view details."
      />
      {students.length === 0 ? (
        <div className="card">
          <p>No students found.</p>
        </div>
      ) : (
        <StudentsList
          list={students}
          selectedStudent={selectedStudent}
          onSelect={onSelect}
        />
      )}
    </>
  );
}

export default StudentsPage;
