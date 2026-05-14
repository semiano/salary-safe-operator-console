export function getTokenName(): string | null {
  const payload = decodePayload();
  if (!payload) return null;
  // Only return a proper name or email, not sub/opaque id
  if (typeof payload.name === "string" && payload.name) return payload.name;
  if (typeof payload.username === "string" && payload.username) return payload.username;
  if (typeof payload.email === "string" && payload.email) return payload.email;
  return null;
}
const TOKEN_KEY = "salarysafe_access_token";

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function decodePayload(): Record<string, unknown> | null {
  const token = getAccessToken();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getTokenRole(): string | null {
  const payload = decodePayload();
  if (!payload) return null;
  return typeof payload.role === "string" ? payload.role : null;
}

export function isAuthenticated(): boolean {
  const token = getAccessToken();
  if (!token) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    clearAccessToken();
    return false;
  }

  try {
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (typeof payload.exp === "number") {
      const nowEpochSeconds = Math.floor(Date.now() / 1000);
      if (payload.exp <= nowEpochSeconds) {
        clearAccessToken();
        return false;
      }
    }
    return true;
  } catch {
    clearAccessToken();
    return false;
  }
}
