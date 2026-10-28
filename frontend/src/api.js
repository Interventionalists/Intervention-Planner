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

// reads are safe to repeat, so they get retried on server errors. Writes are
// never retried since a repeat could save a note or grade twice.
const RETRYABLE_METHODS = ["GET", "HEAD"];
const RETRY_DELAYS_MS = [500, 1500];

function waitForRetry(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

// fetch wrapper for protected backend routes: attaches the session token,
// retries reads that hit a 5xx or network error, and if the backend rejects
// the token (expired or missing), signs the user out.
export async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers);
  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const method = (options.method || "GET").toUpperCase();
  const retryDelays = RETRYABLE_METHODS.includes(method) ? RETRY_DELAYS_MS : [];

  let response;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await fetch(url, { ...options, headers });
    } catch (error) {
      //network failures (backend asleep, dropped connection) are retried too,
      //but an abort means the caller no longer wants the result
      if (error.name === "AbortError" || attempt >= retryDelays.length) {
        throw error;
      }
      await waitForRetry(retryDelays[attempt], options.signal);
      continue;
    }
    if (response.status < 500 || attempt >= retryDelays.length) {
      break;
    }
    await waitForRetry(retryDelays[attempt], options.signal);
  }

  if (response.status === 401) {
    clearAuthSession();
    window.location.assign("/login");
  }
  return response;
}
