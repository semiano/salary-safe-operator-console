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
