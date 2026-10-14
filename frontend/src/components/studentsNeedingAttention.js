export function getStudentsNeedingAttention(students) {
  return students
    .map((student) => {
      const lowScores = Object.entries(student.scores ?? {})
        .map(([subject, score]) => ({ subject, score: Number(score) }))
        .filter(({ score }) => Number.isFinite(score) && score < 60);

      return { student, lowScores };
    })
    .filter(({ lowScores }) => lowScores.length > 0);
}
