const ALLOWED_FIELD_KEYS = new Set([
  "shop",
  "topic",
  "webhookId",
  "status",
  "packId",
]);

export function safeLog(message: string, fields: Record<string, string>): void {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELD_KEYS.has(key)) {
      continue;
    }
    sanitized[key] = value;
  }
  console.log(message, sanitized);
}
