import StudentsList from "../components/StudentsList";
import { PageHeading } from "../components/PageElements";
import { useState } from "react";

function StudentsPage({ students, selectedStudent, onSelect, onAddSingleStudent, onAddManyStudents }) {
  const [isOpen, setIsOpen] = useState(false);
  const toggleDropdown = () => setIsOpen(!isOpen);

  return (
    <>
    <div className="student-page-header">
      <PageHeading
        eyebrow="Students"
        title="Your students"
        subtitle="Select a student to view details."
      />

      <div className = "student-actions">
        <button 
          className="add-students-button" 
          type="button" 
          aria-expanded={isOpen} 
          onClick={() => setIsOpen((open) => !open)}
        >
        Add Students
        </button>
        {isOpen && (
          <div className="student-actions-menu">
            <button type="button"
            onClick={() => {setIsOpen(false); onAddSingleStudent?.();}}>Add Single Student</button>
            <button onClick={() => {setIsOpen(false); onAddManyStudents?.();}}>Add Many Students</button>
          </div>
        )}

      </div>
    </div>
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
