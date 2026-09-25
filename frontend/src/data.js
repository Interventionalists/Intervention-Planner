// Placeholder data.
// Later, replace these objects with the results of your API calls.

export const currentUser = {
  name: "Ms. Poop",
  initials: "MP",
};

export const students = [
  {
    id: 1,
    name: "Little Timmy",
    grade: 4,
    teacher: "Ms. PP",
    group: 69,
    interventionTeacher: "Ms. Poop",
    avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Timmy",
    notes: "",
    scores: { English: 80.56, Math: 30.51, Reading: 87.67, Science: 70.32, Band: 70.40, Art: 52.30, "P.E.": 90.51 },
    recentScores: [42, 51, 47, 62, 58, 70, 76, 82],
  },
  {
    id: 2,
    name: "Jamie Johnson",
    grade: 4,
    teacher: "Mr. Carter",
    group: 12,
    interventionTeacher: "Ms. Poop",
    avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Jamie",
    notes: "Reading fluency intervention.",
    scores: { English: 91, Math: 72, Reading: 64, Science: 84, "P.E.": 95 },
    recentScores: [55, 58, 61, 63, 68, 69, 71, 74],
  },
  {
    id: 3,
    name: "Alex Rivera",
    grade: 5,
    teacher: "Ms. Brown",
    group: 8,
    interventionTeacher: "Ms. Poop",
    avatar: "https://api.dicebear.com/9.x/adventurer/svg?seed=Alex",
    notes: "Math intervention.",
    scores: { English: 84, Math: 54, Reading: 78, Science: 80, "P.E.": 88 },
    recentScores: [40, 44, 49, 51, 54, 57, 59, 63],
  }
];

export const events = [
  { id: 1, time: "8:00 AM", title: "Reading group", color: "var(--primary)" },
  { id: 2, time: "10:00 AM", title: "Progress check", color: "var(--secondary)" },
  { id: 3, time: "1:00 PM", title: "Math intervention", color: "var(--accent)" },
];

export const themePresets = [
  { name: "Navy + Blue", colors: ["#172c50", "#079bd8", "#48b7f2"] },
  { name: "Red + Pink", colors: ["#ff2e36", "#ffadb1", "#ff6268"] },
  { name: "Blue", colors: ["#1535d5", "#3daef0", "#72c7f5"] },
  { name: "Green", colors: ["#008449", "#8dd66f", "#b4e89d"] },
  { name: "Purple", colors: ["#6b20b5", "#a765dd", "#c18ae9"] },
  { name: "Gold", colors: ["#ffca19", "#ffe68c", "#fff0b5"] },
  { name: "Burgundy", colors: ["#5e0000", "#a80000", "#d33a3a"] }
];