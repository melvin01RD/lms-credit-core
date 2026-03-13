import { NextResponse } from "next/server";
import { withRole } from "@/lib/api/role-middleware";
import { activateLoan } from "@/lib/services";
import { UserRole } from "@prisma/client";

export const dynamic = 'force-dynamic';

export const POST = withRole([UserRole.ADMIN], async (req, context) => {
  const params = await context!.params;
  const { userId } = await req.json();

  if (!userId) {
    return NextResponse.json(
      { error: { code: "MISSING_USER_ID", message: "userId es requerido" } },
      { status: 400 }
    );
  }

  const loan = await activateLoan(params.id, userId);
  return NextResponse.json(loan);
});
