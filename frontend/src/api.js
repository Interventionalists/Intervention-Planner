export const AUTH_SESSION_KEY = "interventioner-demo-authenticated";
export const AUTH_USER_KEY = "interventioner-auth-user";
export const AUTH_TOKEN_KEY = "interventioner-auth-token";

export function getAuthToken() {
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function clearAuthSession() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
}

// fetch wrapper for protected backend routes: attaches the session token and,
// if the backend rejects it (expired or missing), signs the user out.
export async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers);
  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    clearAuthSession();
    window.location.assign("/login");
  }
  return response;
}
