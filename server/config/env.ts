import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_API_ORIGINS: z.string().optional(),
  PUBLIC_WEB_ORIGIN_ALLOWLIST: z.string().optional(),
  DATABASE_URL: z.string().url().optional(),
  EXPECTED_SCHEMA_VERSION: z
    .string()
    .min(1)
    .default("phase6-sender-authorization"),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_CONNECTION_REDIRECT_URI: z.string().url().optional(),
  NATIVE_RETURN_URI_ALLOWLIST: z
    .string()
    .default("manusstudio://oauth/callback")
    .transform((value) =>
      value
        .split(",")
        .map((uri) => uri.trim())
        .filter(Boolean),
    ),
  OAUTH_STATE_SIGNING_KEY: z.string().min(32).optional(),
  OAUTH_STATE_KEY_VERSION: z.string().min(1).default("v1"),
  OAUTH_STATE_LIFETIME_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(900)
    .default(600),
  LOGIN_EXCHANGE_CODE_LIFETIME_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(600)
    .default(120),
  SESSION_SIGNING_KEY: z.string().min(32).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  SESSION_KEY_VERSION: z.string().min(1).default("v1"),
  SESSION_LIFETIME_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(60 * 60 * 24 * 30)
    .default(60 * 60 * 24 * 7),
  AUTH_ISSUER: z.string().min(1).default("stealth-mail-studio"),
  AUTH_AUDIENCE: z.string().min(1).default("stealth-mail-studio-api"),
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
  if (config.NODE_ENV !== "test" && !sessionKey) {
    throw new Error(
      "Invalid server configuration: SESSION_SIGNING_KEY is required",
    );
  }
  if (config.NODE_ENV !== "test" && !config.TOKEN_ENCRYPTION_KEY) {
    throw new Error(
      "Invalid server configuration: TOKEN_ENCRYPTION_KEY is required",
    );
  }
  if (config.NODE_ENV !== "test") {
    for (const [name, value] of [
      ["GOOGLE_OAUTH_CLIENT_ID", config.GOOGLE_OAUTH_CLIENT_ID],
      ["GOOGLE_OAUTH_CLIENT_SECRET", config.GOOGLE_OAUTH_CLIENT_SECRET],
      ["GOOGLE_OAUTH_REDIRECT_URI", config.GOOGLE_OAUTH_REDIRECT_URI],
      ["GOOGLE_CONNECTION_REDIRECT_URI", config.GOOGLE_CONNECTION_REDIRECT_URI],
      ["OAUTH_STATE_SIGNING_KEY", config.OAUTH_STATE_SIGNING_KEY],
    ] as const) {
      if (!value)
        throw new Error(`Invalid server configuration: ${name} is required`);
    }
  }
  return {
    ...config,
    allowedOrigins: (
      config.PUBLIC_WEB_ORIGIN_ALLOWLIST ??
      config.PUBLIC_API_ORIGINS ??
      "http://localhost:8081,http://localhost:19006"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

export function redactedConfig(config: AppConfig): Record<string, unknown> {
  return {
    nodeEnv: config.NODE_ENV,
    port: config.PORT,
    allowedOrigins: config.allowedOrigins,
    nativeReturnUriCount: config.NATIVE_RETURN_URI_ALLOWLIST.length,
    databaseConfigured: Boolean(config.DATABASE_URL),
    expectedSchemaVersion: config.EXPECTED_SCHEMA_VERSION,
    googleOAuthConfigured: Boolean(
      config.GOOGLE_OAUTH_CLIENT_ID &&
      config.GOOGLE_OAUTH_CLIENT_SECRET &&
      config.GOOGLE_OAUTH_REDIRECT_URI,
    ),
  };
}
