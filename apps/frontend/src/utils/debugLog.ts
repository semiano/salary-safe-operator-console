export type DebugLogLevel = "debug" | "info" | "warn" | "error";

export type DebugLogEntry = {
  id: number;
  timestamp: string;
  level: DebugLogLevel;
  scope: string;
  message: string;
  data?: unknown;
};

const MAX_LOG_ENTRIES = 300;
const entries: DebugLogEntry[] = [];
const listeners = new Set<(items: DebugLogEntry[]) => void>();
let nextId = 1;

function snapshot(): DebugLogEntry[] {
  return [...entries];
}

function notify(): void {
  const items = snapshot();
  for (const listener of listeners) {
    listener(items);
  }
}

export function addDebugLog(level: DebugLogLevel, scope: string, message: string, data?: unknown): void {
  entries.push({
    id: nextId++,
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    data,
  });

  if (entries.length > MAX_LOG_ENTRIES) {
    entries.splice(0, entries.length - MAX_LOG_ENTRIES);
  }

  notify();
}

export function subscribeDebugLogs(listener: (items: DebugLogEntry[]) => void): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function clearDebugLogs(): void {
  entries.length = 0;
  notify();
}
