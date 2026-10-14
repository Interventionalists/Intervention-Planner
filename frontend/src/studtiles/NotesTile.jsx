import StudentNotes from "../components/StudentNotes";

function NotesTile({ studentId, userId }) {
  return (
    <div className="card">
      <StudentNotes studentId={studentId} userId={userId} />
    </div>
  );
}

export default NotesTile;
