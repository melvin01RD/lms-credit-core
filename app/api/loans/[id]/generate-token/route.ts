import { NextResponse } from "next/server";
import { withRole } from "@/lib/api/role-middleware";
import { generateApprovalToken } from "@/lib/services";
import { UserRole } from "@prisma/client";

export const dynamic = 'force-dynamic';

/**
 * POST /api/loans/[id]/generate-token
 * Genera un token único de aprobación para compartir con el cliente.
 * El token expira en 24 horas.
 * Accesible por ADMIN y OPERATOR.
 */
export const POST = withRole([UserRole.ADMIN, UserRole.OPERATOR], async (req, context) => {
  const params = await context!.params;
  const result = await generateApprovalToken(params.id, req.session.userId);

  const origin = new URL(req.url).origin;
  const approvalUrl = `${origin}/aprobacion/${result.token}`;

  return NextResponse.json({
    approvalUrl,
    token: result.token,
    expiresAt: result.expiresAt.toISOString(),
  });
});
