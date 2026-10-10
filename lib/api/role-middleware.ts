import { NextResponse } from "next/server";
import { getSession, refreshSession, SessionPayload } from "../auth";
import { ServiceError } from "../errors";
import { ZodError } from "zod";
import { UserRole } from "@prisma/client";
import { INACTIVITY_TIMEOUT_SECONDS, SESSION_COOKIE_NAME } from "../config/session";

// Re-exportar para que los imports de role-middleware tengan acceso
export interface AuthenticatedRequest extends Request {
  session: SessionPayload;
}

/**
 * Wrapper de autenticación + inactividad + autorización por rol + manejo de errores.
 * Verifica sesión válida → 401 NOT_AUTHENTICATED si no hay sesión.
 * Verifica inactividad → 401 SESSION_EXPIRED si lleva más de 10 min inactivo.
 * Verifica que session.role esté en allowedRoles → 403 FORBIDDEN si no tiene permiso.
 * En cada request exitoso renueva el JWT (sliding expiration).
 *
 * Uso:
 *   export const GET = withRole([UserRole.ADMIN], async (req) => { ... });
 */
export function withRole(
  allowedRoles: UserRole[],
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

      // Inactivity check — same logic as withAuth.
      // session.lastActivity is always set by getSession() for real tokens
      // (iat fallback for legacy tokens). Test mocks without lastActivity
      // fall back to `now`, evaluating to 0 and never blocking test traffic.
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

      if (!allowedRoles.includes(session.role as UserRole)) {
        return NextResponse.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "No tiene permisos para realizar esta acción",
            },
          },
          { status: 403 }
        );
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
