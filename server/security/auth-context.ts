import type { Request } from "express";

export type AuthContext = {
  requestId?: string;
  bearerToken?: string;
  sessionCookie?: string;
};

function cookieValue(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  const pair = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return pair?.slice(name.length + 1);
}

export function createAuthContext(
  req: Request & { requestId?: string },
): AuthContext {
  const authorization = req.header("authorization");
  const bearerToken = authorization?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  const sessionCookie = cookieValue(req.header("cookie"), "sms_session");
  return {
    ...(req.requestId ? { requestId: req.requestId } : {}),
    ...(bearerToken ? { bearerToken } : {}),
    ...(sessionCookie ? { sessionCookie } : {}),
  };
}

export function requireAuthenticated(context: AuthContext): string {
  const credential = context.bearerToken ?? context.sessionCookie;
  if (!credential) throw new Error("Request authentication is required");
  return credential;
}
