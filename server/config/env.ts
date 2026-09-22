import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_API_ORIGINS: z
    .string()
    .default("http://localhost:8081,http://localhost:19006"),
  DATABASE_URL: z.string().url().optional(),
  EXPECTED_SCHEMA_VERSION: z.string().min(1).default("phase4-baseline"),
  SESSION_SIGNING_KEY: z.string().min(32).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  TOKEN_ENCRYPTION_KEY: z.string().min(16).optional(),
});

export type AppConfig = z.infer<typeof envSchema> & {
  allowedOrigins: string[];
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Invalid server configuration: ${fields}`);
  }
  const config = parsed.data;
  const sessionKey = config.SESSION_SIGNING_KEY ?? config.SESSION_SECRET;
  if (config.NODE_ENV !== "test" && !sessionKey)
    throw new Error(
      "Invalid server configuration: SESSION_SIGNING_KEY is required",
    );
  if (config.NODE_ENV !== "test" && !config.TOKEN_ENCRYPTION_KEY)
    throw new Error(
      "Invalid server configuration: TOKEN_ENCRYPTION_KEY is required",
    );
  return {
    ...config,
    allowedOrigins: config.PUBLIC_API_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

export function redactedConfig(config: AppConfig): Record<string, unknown> {
  return {
    nodeEnv: config.NODE_ENV,
    port: config.PORT,
    allowedOrigins: config.allowedOrigins,
    databaseConfigured: Boolean(config.DATABASE_URL),
    expectedSchemaVersion: config.EXPECTED_SCHEMA_VERSION,
  };
}
