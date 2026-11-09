import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";

import {
  AUTH_SESSION_KEY,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  apiFetch,
  clearAuthSession,
  getAuthToken,
} from "../src/api.js";

// minimal browser globals api.js relies on
function fakeStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

let fetchCalls;
let responses;
let redirects;

function respond(...queue) {
  responses = queue;
}

beforeEach(() => {
  fetchCalls = [];
  redirects = [];
  globalThis.sessionStorage = fakeStorage();
  globalThis.window = { location: { assign: (url) => redirects.push(url) } };
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { status: next };
  };
  // skip the real 500ms/1500ms retry waits
  mock.timers.enable({ apis: ["setTimeout"] });
});

afterEach(() => {
  mock.timers.reset();
});

// lets pending retries run by advancing fake time once the loop is waiting
async function settle(promise) {
  let done = false;
  promise.finally(() => (done = true)).catch(() => {});
  while (!done) {
    await new Promise((resolve) => setImmediate(resolve));
    mock.timers.tick(2000);
  }
  return promise;
}

test("clearAuthSession removes every auth key", () => {
  sessionStorage.setItem(AUTH_SESSION_KEY, "true");
  sessionStorage.setItem(AUTH_USER_KEY, "{}");
  sessionStorage.setItem(AUTH_TOKEN_KEY, "token");

  clearAuthSession();

  assert.equal(getAuthToken(), null);
  assert.equal(sessionStorage.getItem(AUTH_USER_KEY), null);
  assert.equal(sessionStorage.getItem(AUTH_SESSION_KEY), null);
});

test("attaches the bearer token and keeps caller headers", async () => {
  sessionStorage.setItem(AUTH_TOKEN_KEY, "abc123");
  respond(200);

  await apiFetch("/x", { headers: { "Content-Type": "application/json" } });

  const headers = fetchCalls[0].options.headers;
  assert.equal(headers.get("Authorization"), "Bearer abc123");
  assert.equal(headers.get("Content-Type"), "application/json");
});

test("sends no Authorization header when signed out", async () => {
  respond(200);

  await apiFetch("/x");

  assert.equal(fetchCalls[0].options.headers.has("Authorization"), false);
});

test("retries GET requests on server errors, then succeeds", async () => {
  respond(503, 502, 200);

  const response = await settle(apiFetch("/x"));

  assert.equal(response.status, 200);
  assert.equal(fetchCalls.length, 3);
});

test("gives up after two retries and returns the last error response", async () => {
  respond(500, 500, 500, 200);

  const response = await settle(apiFetch("/x"));

  assert.equal(response.status, 500);
  assert.equal(fetchCalls.length, 3);
});

test("retries GET requests on network errors", async () => {
  respond(new TypeError("Failed to fetch"), 200);

  const response = await settle(apiFetch("/x"));

  assert.equal(response.status, 200);
  assert.equal(fetchCalls.length, 2);
});

test("never retries writes, so notes and grades aren't saved twice", async () => {
  for (const method of ["POST", "put", "PATCH", "DELETE"]) {
    fetchCalls = [];
    respond(500, 200);

    const response = await apiFetch("/x", { method });

    assert.equal(response.status, 500, method);
    assert.equal(fetchCalls.length, 1, method);
  }
});

test("does not retry 4xx responses", async () => {
  respond(404, 200);

  const response = await apiFetch("/x");

  assert.equal(response.status, 404);
  assert.equal(fetchCalls.length, 1);
});

test("does not retry an aborted request", async () => {
  const abort = new DOMException("Aborted", "AbortError");
  respond(abort, 200);

  await assert.rejects(apiFetch("/x"), { name: "AbortError" });
  assert.equal(fetchCalls.length, 1);
});

test("aborting while waiting to retry stops the retry", async () => {
  const controller = new AbortController();
  respond(500, 200);

  const pending = apiFetch("/x", { signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();

  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(fetchCalls.length, 1);
});

test("a 401 signs the user out and redirects to login", async () => {
  sessionStorage.setItem(AUTH_TOKEN_KEY, "expired");
  sessionStorage.setItem(AUTH_USER_KEY, "{}");
  respond(401);

  const response = await apiFetch("/x");

  assert.equal(response.status, 401);
  assert.equal(getAuthToken(), null);
  assert.deepEqual(redirects, ["/login"]);
});
