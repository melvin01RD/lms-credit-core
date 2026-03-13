import { NextResponse } from "next/server";
import { withRole } from "@/lib/api/role-middleware";
import { toggleLoanProduct } from "@/lib/services";
import { UserRole } from "@prisma/client";

export const dynamic = "force-dynamic";

// PATCH — ADMIN only
export const PATCH = withRole([UserRole.ADMIN], async (_req, context) => {
  const { id } = await context!.params;
  try {
    const updated = await toggleLoanProduct(id);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: { message: "Producto no encontrado" } }, { status: 404 });
  }
});
