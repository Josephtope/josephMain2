export type LogLevel = "info" | "warn" | "error";

export type LogMeta = Record<string, unknown>;

export function log(level: LogLevel, message: string, meta: LogMeta = {}): void {
  const safeMeta = Object.fromEntries(Object.entries(meta).filter(([key]) => !/(secret|token|password|authorization|cookie)/i.test(key)));
  process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...safeMeta }) + "\n");
}

export function errorCategory(error: unknown): "configuration" | "database" | "request" | "internal" {
  const message = error instanceof Error ? error.message : String(error);
  if (/configuration/i.test(message)) return "configuration";
  if (/database|mysql|connection/i.test(message)) return "database";
  if (/request|origin|payload/i.test(message)) return "request";
  return "internal";
}
