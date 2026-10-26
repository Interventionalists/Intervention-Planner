import { useState } from "react";

const initialTasks = Array.from({ length: 4 }, (_, index) => ({
  id: index + 1,
  text: "",
  completed: false,
  dueDate: "",
}));

function getDueDateColors(dueDate, completed) {
  if (completed) {
    return { background: "#fff", border: "#d5d5d5", color: "#555" };
  }
  if (!dueDate) {
    return { background: "transparent", border: "#d5d5d5", color: "#555" };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowString = [
    tomorrow.getFullYear(),
    String(tomorrow.getMonth() + 1).padStart(2, "0"),
    String(tomorrow.getDate()).padStart(2, "0"),
  ].join("-");
  const friday = new Date(today);
  friday.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7));
  const fridayString = [
    friday.getFullYear(),
    String(friday.getMonth() + 1).padStart(2, "0"),
    String(friday.getDate()).padStart(2, "0"),
  ].join("-");

  if (dueDate <= todayString) {
    return { background: "#fde8e7", border: "#e99b96", color: "#b42318" };
  }
  if (dueDate === tomorrowString || dueDate <= fridayString) {
    return { background: "#fff4cc", border: "#e6c75a", color: "#805b00" };
  }
  return { background: "#e5f4e9", border: "#9ac9a5", color: "#216e39" };
}

export default function PersonalTodoTile() {
  const [tasks, setTasks] = useState(initialTasks);
  const [nextTaskId, setNextTaskId] = useState(initialTasks.length + 1);

  const updateTask = (id, updates) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === id ? { ...task, ...updates } : task
      )
    );
  };

  const deleteTask = (id) => {
    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== id));
  };

  const addTask = () => {
    setTasks((currentTasks) => [
      ...currentTasks,
      { id: nextTaskId, text: "", completed: false, dueDate: "" },
    ]);
    setNextTaskId((currentId) => currentId + 1);
  };

  return (
    <section
      className="card"
      style={{
        alignSelf: "start",
        padding: 16,
        border: "1px solid #d5d5d5",
        borderRadius: 13,
        background: "#fff",
      }}
    >
      <h2
        style={{
          margin: "0 0 8px",
          paddingBottom: 8,
          borderBottom: "1px solid #555",
          color: "#333",
          fontSize: 15,
          fontWeight: 400,
          letterSpacing: "0.02em",
        }}
      >
        TODO
      </h2>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {tasks.map((task) => {
          const dueDateColors = getDueDateColors(task.dueDate, task.completed);
          return (
            <li
              key={task.id}
              style={{
                display: "grid",
                gridTemplateColumns: "19px minmax(0, 1fr) minmax(130px, 1fr) 20px",
                alignItems: "center",
                columnGap: 9,
                padding: "4px 0",
                borderBottom: "1px solid #555",
              }}
            >
              <input
                type="checkbox"
                checked={task.completed}
                onChange={(event) =>
                  updateTask(task.id, { completed: event.target.checked })
                }
                aria-label={`Mark task ${task.id} complete`}
                style={{
                  width: 19,
                  height: 19,
                  margin: 0,
                  accentColor: "var(--primary)",
                  cursor: "pointer",
                }}
              />
              <input
                type="text"
                value={task.text}
                onChange={(event) =>
                  updateTask(task.id, { text: event.target.value })
                }
                aria-label={`Task ${task.id}`}
                style={{
                  gridColumn: "2",
                  width: "100%",
                  minWidth: 0,
                  padding: "5px 0",
                  border: 0,
                  outline: "none",
                  background: "transparent",
                  color: "#333",
                  fontSize: 14,
                  textDecoration: task.completed ? "line-through" : "none",
                }}
              />
              <label
                style={{
                  gridColumn: "3",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  whiteSpace: "nowrap",
                  color: "#758095",
                  fontSize: 11,
                }}
              >
                Due
                <input
                  type="date"
                  value={task.dueDate}
                  onChange={(event) =>
                    updateTask(task.id, { dueDate: event.target.value })
                  }
                  aria-label={`Due date for task ${task.id}`}
                  style={{
                    minWidth: 0,
                    padding: "2px 4px",
                    border: `1px solid ${dueDateColors.border}`,
                    borderRadius: 4,
                    background: dueDateColors.background,
                    color: dueDateColors.color,
                    fontSize: 11,
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => deleteTask(task.id)}
                aria-label={`Delete task ${task.id}`}
                title="Delete task"
                style={{
                  gridColumn: "4",
                  width: 20,
                  height: 20,
                  padding: 0,
                  border: 0,
                  borderRadius: "50%",
                  background: "transparent",
                  color: "#777",
                  fontSize: 16,
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                x
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={addTask}
        style={{
          marginTop: 9,
          padding: "3px 0",
          border: 0,
          background: "transparent",
          color: "var(--primary)",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        + Add task
      </button>
    </section>
  );
}
