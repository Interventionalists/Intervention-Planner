import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTodos } from "../hooks/useTodos";

function toLocalDateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

// the api stores a full timestamp; the date picker works in local YYYY-MM-DD
function dueDateToInput(dueDate) {
  return dueDate ? toLocalDateString(new Date(dueDate)) : "";
}

// a task due on a day is due by the end of that day, local time
function inputToDueDate(value) {
  return value ? new Date(`${value}T23:59:59`).toISOString() : null;
}

function isPastDue(dueDate) {
  return Boolean(dueDate) && new Date(dueDate) < new Date();
}

// status for a task that isn't done, based on whether its due date has passed
function openStatusFor(dueDate) {
  return isPastDue(dueDate) ? "late" : "incomplete";
}

function getDueDateColors(dueDate, completed) {
  if (completed) {
    return { background: "#fff", border: "#d5d5d5", color: "#555" };
  }
  if (!dueDate) {
    return { background: "transparent", border: "#d5d5d5", color: "#555" };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayString = toLocalDateString(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowString = toLocalDateString(tomorrow);
  const friday = new Date(today);
  friday.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7));
  const fridayString = toLocalDateString(friday);

  // red only once the due day has passed; due today is still on time (yellow)
  if (dueDate < todayString) {
    return { background: "#fde8e7", border: "#e99b96", color: "#b42318" };
  }
  if (dueDate === todayString || dueDate === tomorrowString || dueDate <= fridayString) {
    return { background: "#fff4cc", border: "#e6c75a", color: "#805b00" };
  }
  return { background: "#e5f4e9", border: "#9ac9a5", color: "#216e39" };
}

function TodoRow({ todo, position, onUpdate, onDelete }) {
  const [draft, setDraft] = useState(todo.description || "");
  const descriptionRef = useRef(null);

  // pick up server-side changes (e.g. a rollback) when not mid-edit
  useEffect(() => {
    setDraft(todo.description || "");
  }, [todo.description]);

  // grow the textarea to fit the whole description. Re-measured when the
  // text changes and when the tile is resized (which changes where lines wrap).
  useLayoutEffect(() => {
    const element = descriptionRef.current;
    if (!element) {
      return undefined;
    }
    const fit = () => {
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element.parentElement);
    return () => observer.disconnect();
  }, [draft]);

  const completed = todo.status === "done";
  const late = todo.status === "late" || (todo.status === "incomplete" && isPastDue(todo.due_date));
  const dueDateInput = dueDateToInput(todo.due_date);
  const dueDateColors = getDueDateColors(dueDateInput, completed);
  const label = todo.description || `task ${position}`;

  const saveDescription = () => {
    const trimmed = draft.trim();
    if (trimmed === (todo.description || "")) {
      return;
    }
    onUpdate(todo.id, { description: trimmed || null }).catch(() => {});
  };

  const changeCompleted = (checked) => {
    const status = checked ? "done" : openStatusFor(todo.due_date);
    onUpdate(todo.id, { status }).catch(() => {});
  };

  const changeDueDate = (value) => {
    const dueDate = inputToDueDate(value);
    const fields = { due_date: dueDate };
    if (!completed) {
      fields.status = openStatusFor(dueDate);
    }
    onUpdate(todo.id, fields).catch(() => {});
  };

  return (
    <li
      style={{
        display: "grid",
        // the description takes all spare width; the due date only what it needs
        gridTemplateColumns: "19px minmax(0, 1fr) auto 20px",
        // keep the checkbox, date and delete button on the first line of a
        // multi-line description
        alignItems: "start",
        columnGap: 9,
        padding: "4px 0",
        borderBottom: "1px solid #555",
      }}
    >
      <input
        type="checkbox"
        checked={completed}
        onChange={(event) => changeCompleted(event.target.checked)}
        aria-label={`Mark ${label} complete`}
        style={{
          width: 19,
          height: 19,
          margin: "5px 0 0",
          accentColor: "var(--primary)",
          cursor: "pointer",
        }}
      />
      <textarea
        ref={descriptionRef}
        rows={1}
        value={draft}
        placeholder="New task"
        maxLength={2000}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={saveDescription}
        onKeyDown={(event) => {
          // Enter saves; the text still wraps onto as many lines as it needs
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        aria-label={`Task ${position}`}
        style={{
          gridColumn: "2",
          display: "block",
          width: "100%",
          minWidth: 0,
          padding: "5px 0",
          border: 0,
          outline: "none",
          resize: "none",
          overflow: "hidden",
          background: "transparent",
          color: "#333",
          fontFamily: "inherit",
          fontSize: 14,
          lineHeight: "20px",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          textDecoration: completed ? "line-through" : "none",
        }}
      />
      <label
        style={{
          gridColumn: "3",
          marginTop: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          whiteSpace: "nowrap",
          color: "#758095",
          fontSize: 11,
        }}
      >
        {late && (
          <span
            style={{
              padding: "1px 6px",
              border: "1px solid #e99b96",
              borderRadius: 999,
              background: "#fde8e7",
              color: "#b42318",
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            Late
          </span>
        )}
        Due
        <input
          type="date"
          value={dueDateInput}
          onChange={(event) => changeDueDate(event.target.value)}
          aria-label={`Due date for ${label}`}
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
        onClick={() => onDelete(todo.id).catch(() => {})}
        aria-label={`Delete ${label}`}
        title="Delete task"
        style={{
          gridColumn: "4",
          marginTop: 5,
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
}

export default function PersonalTodoTile() {
  const { todos, todosLoading, todosError, addTodo, updateTodo, deleteTodo } = useTodos();
  const [adding, setAdding] = useState(false);

  const addTask = async () => {
    setAdding(true);
    try {
      await addTodo();
    } catch {
      // error is shown via todosError
    } finally {
      setAdding(false);
    }
  };

  return (
    <section
      className="card"
      style={{
        // fill the whole tile so the list grows as the tile is resized
        alignSelf: "stretch",
        flex: "1 1 auto",
        boxSizing: "border-box",
        width: "100%",
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
      {todosError && (
        <p role="alert" style={{ margin: "0 0 8px", color: "#b42318", fontSize: 12 }}>
          {todosError}
        </p>
      )}
      {todosLoading ? (
        <p style={{ margin: "8px 0", color: "#758095", fontSize: 12 }}>Loading tasks…</p>
      ) : todos.length === 0 ? (
        <p style={{ margin: "8px 0", color: "#758095", fontSize: 12 }}>No tasks yet.</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {todos.map((todo, index) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              position={index + 1}
              onUpdate={updateTodo}
              onDelete={deleteTodo}
            />
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={addTask}
        disabled={adding || todosLoading}
        style={{
          marginTop: 9,
          padding: "3px 0",
          border: 0,
          background: "transparent",
          color: "var(--primary)",
          fontSize: 12,
          cursor: adding || todosLoading ? "default" : "pointer",
        }}
      >
        {adding ? "Adding…" : "+ Add task"}
      </button>
    </section>
  );
}
