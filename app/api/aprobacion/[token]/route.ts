// ============================================================================
// LMS-Credit-Core: API pública de aprobación de préstamos
// Archivo: app/api/aprobacion/[token]/route.ts
// Ruta: GET/POST /api/aprobacion/[token]
// Acceso: Público — sin autenticación
// ============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getConfig } from "@/lib/services/system-config.service";
import { calculateFlatRateLoan } from "@/lib/domain/flatRateCalculator";
import { approveViaToken } from "@/lib/services";
import { ServiceError } from "@/lib/errors";

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ token: string }> };

// ============================================================================
// GET — Obtiene los datos del préstamo para mostrarlos al cliente
// ============================================================================

export async function GET(_req: Request, context: Context) {
  try {
    const { token } = await context.params;

    const loan = await prisma.loan.findUnique({
      where: { approvalToken: token },
      include: {
        client: { select: { firstName: true, lastName: true } },
      },
    });

    if (!loan) {
      return NextResponse.json(
        { error: { code: "TOKEN_INVALID", message: "Este enlace no existe o no es válido" } },
        { status: 404 }
      );
    }

    if (!loan.approvalTokenExp || loan.approvalTokenExp < new Date()) {
      return NextResponse.json(
        { error: { code: "TOKEN_EXPIRED", message: "Este enlace ha expirado. Solicita un nuevo enlace al gestor de tu préstamo" } },
        { status: 410 }
      );
    }

    if (loan.status !== "DRAFT") {
      return NextResponse.json(
        { error: { code: "TOKEN_USED", message: "Este préstamo ya fue procesado anteriormente" } },
        { status: 410 }
      );
    }

    const config = await getConfig();

    // Calcular fecha estimada del primer pago
    const calc = calculateFlatRateLoan({
      principalAmount: Number(loan.principalAmount),
      totalFinanceCharge: Number(loan.totalFinanceCharge ?? 0),
      termCount: loan.termCount,
      paymentFrequency: loan.paymentFrequency,
      startDate: new Date(),
    });

    return NextResponse.json({
      businessName: config.businessName,
      loan: {
        clientName: `${loan.client.firstName} ${loan.client.lastName ?? ""}`.trim(),
        principalAmount: Number(loan.principalAmount),
        totalFinanceCharge: Number(loan.totalFinanceCharge ?? 0),
        totalPayableAmount: Number(loan.totalPayableAmount ?? loan.principalAmount),
        installmentAmount: Number(loan.installmentAmount),
        termCount: loan.termCount,
        paymentFrequency: loan.paymentFrequency,
        firstPaymentDate: calc.schedule[0]?.dueDate.toISOString() ?? null,
        expiresAt: loan.approvalTokenExp.toISOString(),
      },
    });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" } },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST — El cliente confirma su nombre y aprueba el préstamo
// ============================================================================

export async function POST(req: Request, context: Context) {
  try {
    const { token } = await context.params;
    const body = await req.json();
    const { clientSignature } = body as { clientSignature?: string };

    const result = await approveViaToken(token, clientSignature ?? "");

    return NextResponse.json({
      success: true,
      clientName: result.clientName,
      loanId: result.loanId,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" } },
      { status: 500 }
    );
  }
}
