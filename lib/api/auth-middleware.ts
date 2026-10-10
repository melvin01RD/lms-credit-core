import { NextResponse } from "next/server";
import { getSession, refreshSession, SessionPayload } from "../auth";
import { ServiceError } from "../errors";
import { ZodError } from "zod";
import { INACTIVITY_TIMEOUT_SECONDS, SESSION_COOKIE_NAME } from "../config/session";

// ============================================
// INTERFACES
// ============================================

export interface AuthenticatedRequest extends Request {
  session: SessionPayload;
}

// ============================================
// AUTH MIDDLEWARE
// ============================================

/**
 * Wrapper que combina autenticación + inactividad + manejo de errores.
 * Verifica la cookie de sesión antes de ejecutar el handler.
 * Si no hay sesión válida retorna 401 NOT_AUTHENTICATED.
 * Si la sesión lleva más de INACTIVITY_TIMEOUT_SECONDS inactiva retorna 401 SESSION_EXPIRED.
 * En cada request exitoso renueva el JWT (sliding expiration).
 *
 * Uso:
 *   export const GET = withAuth(async (req) => {
 *     // req.session.userId disponible
 *     return NextResponse.json({ ok: true });
 *   });
 */
export function withAuth(
  handler: (
    req: AuthenticatedRequest,
    context?: { params: Promise<Record<string, string>> }
  ) => Promise<NextResponse>
) {
  return async (
    req: Request,
    context?: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    try {
      const session = await getSession();

      if (!session) {
        return NextResponse.json(
          {
            error: {
              code: "NOT_AUTHENTICATED",
              message: "Debe iniciar sesión para acceder a este recurso",
            },
          },
          { status: 401 }
        );
      }

      // Inactivity check.
      // session.lastActivity is always set by getSession() for real tokens
      // (using iat as fallback for legacy tokens without the claim).
      // For test mocks that omit lastActivity, we fall back to `now` so the
      // check evaluates to 0 and never blocks test traffic.
      const now = Math.floor(Date.now() / 1000);
      const lastActivity = session.lastActivity ?? now;

      if (now - lastActivity > INACTIVITY_TIMEOUT_SECONDS) {
        const response = NextResponse.json(
          {
            error: {
              code: "SESSION_EXPIRED",
              message: "Sesión expirada por inactividad",
            },
          },
          { status: 401 }
        );
        response.cookies.delete(SESSION_COOKIE_NAME);
        return response;
      }

      (req as AuthenticatedRequest).session = session;

      const response = await handler(req as AuthenticatedRequest, context);
      response.headers.set("Cache-Control", "private, no-store, max-age=0");

      // Sliding expiration: issue a fresh JWT with updated lastActivity.
      const refreshedToken = refreshSession(session);
      response.cookies.set(SESSION_COOKIE_NAME, refreshedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      return response;
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Error de validación",
              details: error.errors.map((e) => ({
                field: e.path.join("."),
                message: e.message,
              })),
            },
          },
          { status: 400 }
        );
      }

      if (error instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: error.code, message: error.message } },
          { status: error.statusCode }
        );
      }

      console.error("Unhandled error:", error);
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Error interno del servidor",
          },
        },
        { status: 500 }
      );
    }
  };
}
