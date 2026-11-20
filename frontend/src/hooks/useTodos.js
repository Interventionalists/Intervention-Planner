import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const TODOS_URL = `${API_BASE_URL}/todos`;

async function readError(response, fallback) {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") {
      return body.detail;
    }
  } catch {
    // body was not json; use the fallback message
  }
  return fallback;
}

// loads the signed-in user's todos and exposes create/update/delete. The
// backend scopes everything to the token's user and marks overdue incomplete
// todos as "late" whenever the list is fetched.
//
// updates are applied optimistically and rolled back if the request fails.
export function useTodos() {
  const [todos, setTodos] = useState([]);
  const [todosLoading, setTodosLoading] = useState(true);
  const [todosError, setTodosError] = useState("");
  const todosRef = useRef(todos);
  todosRef.current = todos;

  const loadTodos = useCallback(async (signal) => {
    const response = await apiFetch(TODOS_URL, { signal });
    if (!response.ok) {
      throw new Error(await readError(response, "Unable to load your todo list."));
    }
    const result = await response.json();
    return result.todos || [];
  }, []);

  const refreshTodos = useCallback(async () => {
    setTodosError("");
    try {
      const result = await loadTodos();
      setTodos(result);
      return result;
    } catch (error) {
      setTodosError(error.message || "Unable to load your todo list.");
      throw error;
    }
  }, [loadTodos]);

  useEffect(() => {
    const controller = new AbortController();
    setTodosLoading(true);
    setTodosError("");

    loadTodos(controller.signal)
      .then((result) => setTodos(result))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setTodosError(error.message || "Unable to load your todo list.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setTodosLoading(false);
        }
      });

    return () => controller.abort();
  }, [loadTodos]);

  const addTodo = useCallback(async (fields = {}) => {
    setTodosError("");
    const response = await apiFetch(TODOS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "incomplete", ...fields }),
    });
    if (!response.ok) {
      const message = await readError(response, "Unable to add the task.");
      setTodosError(message);
      throw new Error(message);
    }
    const { todo } = await response.json();
    setTodos((current) => [...current, todo]);
    return todo;
  }, []);

  const updateTodo = useCallback(async (id, fields) => {
    const previous = todosRef.current.find((todo) => todo.id === id);
    setTodosError("");
    setTodos((current) =>
      current.map((todo) => (todo.id === id ? { ...todo, ...fields } : todo))
    );

    try {
      const response = await apiFetch(`${TODOS_URL}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Unable to save the task."));
      }
      const { todo } = await response.json();
      setTodos((current) => current.map((item) => (item.id === id ? todo : item)));
      return todo;
    } catch (error) {
      if (previous) {
        setTodos((current) => current.map((item) => (item.id === id ? previous : item)));
      }
      setTodosError(error.message || "Unable to save the task.");
      throw error;
    }
  }, []);

  const deleteTodo = useCallback(async (id) => {
    const previous = todosRef.current;
    setTodosError("");
    setTodos((current) => current.filter((todo) => todo.id !== id));

    try {
      const response = await apiFetch(`${TODOS_URL}/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await readError(response, "Unable to delete the task."));
      }
    } catch (error) {
      setTodos(previous);
      setTodosError(error.message || "Unable to delete the task.");
      throw error;
    }
  }, []);

  return {
    todos,
    todosLoading,
    todosError,
    refreshTodos,
    addTodo,
    updateTodo,
    deleteTodo,
  };
}
