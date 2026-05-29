const API_BASE = "/api";

import { clearAccessToken, getAccessToken } from "../auth/token";
import { addDebugLog } from "../utils/debugLog";

function handleAuthFailure(statusCode: number): void {
  if (statusCode === 401) {
    addDebugLog("warn", "auth", "Clearing access token after 401 response");
    clearAccessToken();
  }
}

function safeJsonSnippet(payload: unknown): unknown {
  if (payload === null || payload === undefined) return payload;
  if (typeof payload === "string") {
    return payload.length > 240 ? `${payload.slice(0, 240)}...` : payload;
  }
  return payload;
}

function buildHeaders(includeAuth: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (includeAuth) {
    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  return headers;
}

export async function apiGet<T>(path: string): Promise<T> {
  addDebugLog("debug", "api", `GET ${path}`);
  const response = await fetch(`${API_BASE}${path}`, {
    headers: buildHeaders(true),
  });

  if (!response.ok) {
    addDebugLog("error", "api", `GET ${path} failed`, { status: response.status });
    handleAuthFailure(response.status);
    throw new Error(`Request failed: ${response.status}`);
  }

  addDebugLog("info", "api", `GET ${path} ok`, { status: response.status });

  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  addDebugLog("debug", "api", `POST ${path}`, { payload: safeJsonSnippet(payload) });
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: buildHeaders(true),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    addDebugLog("error", "api", `POST ${path} failed`, { status: response.status, payload: safeJsonSnippet(payload) });
    handleAuthFailure(response.status);
    throw new Error(`Request failed: ${response.status}`);
  }

  addDebugLog("info", "api", `POST ${path} ok`, { status: response.status });

  return (await response.json()) as T;
}

export async function apiPut<T>(path: string, payload: unknown): Promise<T> {
  addDebugLog("debug", "api", `PUT ${path}`, { payload: safeJsonSnippet(payload) });
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: buildHeaders(true),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    addDebugLog("error", "api", `PUT ${path} failed`, { status: response.status, payload: safeJsonSnippet(payload) });
    handleAuthFailure(response.status);
    throw new Error(`Request failed: ${response.status}`);
  }

  addDebugLog("info", "api", `PUT ${path} ok`, { status: response.status });

  return (await response.json()) as T;
}

export async function apiDelete(path: string): Promise<void> {
  addDebugLog("debug", "api", `DELETE ${path}`);
  const response = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: buildHeaders(true),
  });

  if (!response.ok) {
    addDebugLog("error", "api", `DELETE ${path} failed`, { status: response.status });
    handleAuthFailure(response.status);
    throw new Error(`Request failed: ${response.status}`);
  }

  addDebugLog("info", "api", `DELETE ${path} ok`, { status: response.status });
}

export async function apiPostPublic<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: buildHeaders(false),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function apiGetPublic<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: buildHeaders(false),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}
