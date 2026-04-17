import { NextResponse } from "next/server";
import { withRole } from "@/lib/api/role-middleware";
import { updateLoanProduct } from "@/lib/services";
import { UserRole, PaymentFrequency } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const MAX_RATE = 50;

export const dynamic = "force-dynamic";

// PUT — ADMIN only
export const PUT = withRole([UserRole.ADMIN], async (req, context) => {
  const { id } = await context!.params;
  const body = await req.json();
  const { name, defaultRate, paymentFrequency, termCount, minAmount, maxAmount } = body;

  if (name !== undefined && !name?.trim()) {
    return NextResponse.json({ error: { message: "El nombre no puede estar vacío" } }, { status: 400 });
  }
  if (defaultRate !== undefined && (typeof defaultRate !== "number" || defaultRate < 0)) {
    return NextResponse.json({ error: { message: "La tasa debe ser mayor o igual a 0" } }, { status: 400 });
  }
  if (defaultRate !== undefined && defaultRate > MAX_RATE) {
    return NextResponse.json({ error: { message: `La tasa no puede superar el ${MAX_RATE}%.` } }, { status: 400 });
  }
  if (paymentFrequency !== undefined && !Object.values(PaymentFrequency).includes(paymentFrequency)) {
    return NextResponse.json({ error: { message: "Frecuencia de pago inválida" } }, { status: 400 });
  }
  if (termCount !== undefined && (typeof termCount !== "number" || termCount < 1)) {
    return NextResponse.json({ error: { message: "El número de cuotas debe ser mayor a 0" } }, { status: 400 });
  }

  if (name !== undefined) {
    const duplicate = await prisma.loanProduct.findFirst({
      where: {
        name: { equals: name.trim(), mode: "insensitive" },
        id: { not: id },
      },
    });
    if (duplicate) {
      return NextResponse.json({ error: { message: "Ya existe un producto con ese nombre." } }, { status: 409 });
    }
  }

  try {
    const updated = await updateLoanProduct(id, {
      name,
      defaultRate,
      paymentFrequency,
      termCount,
      minAmount,
      maxAmount,
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: { message: "Producto no encontrado" } }, { status: 404 });
  }
});
