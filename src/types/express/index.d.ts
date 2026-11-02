import type { AuthenticatedUser } from "@/shared/types/authenticated-user";

declare global {
  namespace Express {
    interface Request {
      /**
       * Populated by `requireAuth` / role middleware. Protected routes are
       * guaranteed to have it; public routes must check before use.
       */
      user: AuthenticatedUser;
      requestId?: string;
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
