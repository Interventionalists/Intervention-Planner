// Loads users and schools and manages search, filtering, and pagination state.
// Used by UsersPage to provide its directory data and loading/error states.
import { useEffect, useState } from "react";
import { displayName } from "../utils/users";
import { apiFetch } from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");
export const PAGE_SIZE = 25;

export function useUsersDirectory(role, roleFilter, reloadKey) {
  const [users, setUsers] = useState([]);
  const [schools, setSchools] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolsError, setSchoolsError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [debouncedUserFilter, setDebouncedUserFilter] = useState("");
  const [clientSidePagination, setClientSidePagination] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedUserFilter(userFilter.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [userFilter]);

  useEffect(() => {
    if (role !== "admin") {
      setUsers([]);
      setTotalUsers(0);
      setTotalPages(0);
      setError("Admin access is required to view users.");
      setIsLoading(false);
      return undefined;
    }

    const controller = new AbortController();

    async function loadUsers() {
      setIsLoading(true);
      setError("");

      try {
        const searching = Boolean(debouncedUserFilter);
        const params = new URLSearchParams({
          page: String(searching ? 1 : currentPage),
          search: "",
        });
        if (roleFilter !== "all") {
          params.set("role", roleFilter);
        }
        const response = await fetchUsersPage(params, controller.signal);
        const data = await response.json();
        if (
          !Array.isArray(data.users) ||
          !Number.isInteger(data.total) ||
          !Number.isInteger(data.total_pages)
        ) {
          throw new Error("The users response has an unexpected format.");
        }

        if (searching) {
          const allUsers = [...data.users];
          for (let page = 2; page <= data.total_pages; page += 1) {
            const pageParams = new URLSearchParams(params);
            pageParams.set("page", String(page));
            const pageResponse = await fetchUsersPage(
              pageParams,
              controller.signal
            );
            const pageData = await pageResponse.json();
            if (!Array.isArray(pageData.users)) {
              throw new Error("The users response has an unexpected format.");
            }
            allUsers.push(...pageData.users);
          }

          setUsers(allUsers);
          setClientSidePagination(true);
          setTotalUsers(allUsers.length);
          setTotalPages(Math.ceil(allUsers.length / PAGE_SIZE));
          setCurrentPage(1);
        } else {
          setUsers(data.users);
          setClientSidePagination(false);
          setTotalUsers(data.total);
          setTotalPages(data.total_pages);
          if (data.total_pages > 0 && currentPage > data.total_pages) {
            setCurrentPage(data.total_pages);
          }
        }
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          console.error("Error fetching users:", loadError);
          setError("Could not load users. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadUsers();
    return () => controller.abort();
  }, [currentPage, debouncedUserFilter, reloadKey, role, roleFilter]);

  useEffect(() => {
    if (role !== "admin") {
      setSchools([]);
      setSchoolsError("Admin access is required to view schools.");
      setSchoolsLoading(false);
      return undefined;
    }

    const controller = new AbortController();

    async function loadSchools() {
      setSchoolsLoading(true);
      setSchoolsError("");

      try {
        const response = await apiFetch(`${API_BASE_URL}/schools-fetch`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`School request failed (${response.status}).`);
        }

        const data = await response.json();
        if (!Array.isArray(data.schools)) {
          throw new Error("The schools response has an unexpected format.");
        }

        setSchools(
          data.schools
            .map((school) =>
              school && typeof school === "object"
                ? {
                    id: school.school_id ?? school.id,
                    name: school.school_name ?? school.name,
                  }
                : null
            )
            .filter(
              (school) =>
                school &&
                school.id != null &&
                typeof school.name === "string" &&
                school.name.trim()
            )
            .map((school) => ({
              id: String(school.id),
              name: school.name.trim(),
            }))
        );
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          console.error("Error fetching schools:", loadError);
          setSchoolsError("Could not load schools. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setSchoolsLoading(false);
        }
      }
    }

    loadSchools();
    return () => controller.abort();
  }, [role]);

  const filteredUsers = clientSidePagination
    ? users.filter((user) => {
        const schoolName =
          schools.find((school) => String(school.id) === String(user.school))
            ?.name || "";
        const searchableText = [
          displayName(user),
          user.email,
          user.role,
          user.school,
          schoolName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          searchableText.includes(userFilter.trim().toLowerCase()) &&
          (roleFilter === "all" || user.role === roleFilter)
        );
      })
    : users;
  const displayedUsers = clientSidePagination
    ? filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    : users;
  const displayedTotal = clientSidePagination
    ? filteredUsers.length
    : totalUsers;
  const displayedTotalPages = clientSidePagination
    ? Math.ceil(filteredUsers.length / PAGE_SIZE)
    : totalPages;
  const firstVisiblePage = Math.max(
    1,
    Math.min(currentPage - 3, displayedTotalPages - 6)
  );
  const visiblePageNumbers = Array.from(
    { length: Math.min(displayedTotalPages, 7) },
    (_, index) => firstVisiblePage + index
  );

  return {
    users,
    setUsers,
    schools,
    schoolsLoading,
    schoolsError,
    isLoading,
    error,
    userFilter,
    setUserFilter,
    currentPage,
    setCurrentPage,
    displayedUsers,
    displayedTotal,
    displayedTotalPages,
    visiblePageNumbers,
  };
}

async function fetchUsersPage(params, signal) {
  const response = await apiFetch(
    `${API_BASE_URL}/admins-fetch-all-users?${params}`,
    { signal }
  );
  if (!response.ok) {
    throw new Error(`User request failed (${response.status}).`);
  }
  return response;
}
