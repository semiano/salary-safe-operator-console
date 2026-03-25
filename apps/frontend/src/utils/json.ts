export function safeParseJson(input: string): Record<string, unknown> {
  if (!input.trim()) {
    return {};
  }

  const parsed = JSON.parse(input);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export function formatJson(input: Record<string, unknown> | undefined): string {
  return JSON.stringify(input ?? {}, null, 2);
}
