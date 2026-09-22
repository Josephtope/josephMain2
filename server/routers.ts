import { initTRPC } from "@trpc/server";
import type { AuthContext } from "./security/auth-context.js";

const t = initTRPC.context<AuthContext>().create();

export const appRouter = t.router({
  system: t.router({
    context: t.procedure.query(({ ctx }) => ({
      requestId: ctx.requestId ?? null,
    })),
  }),
});

export type AppRouter = typeof appRouter;
