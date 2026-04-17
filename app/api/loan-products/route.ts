import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/auth-middleware";
import { withRole } from "@/lib/api/role-middleware";
import { getLoanProducts, createLoanProduct } from "@/lib/services";
import { UserRole, PaymentFrequency } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const MAX_RATE = 50;

export const dynamic = "force-dynamic";

// GET — any authenticated user, ?all=true returns inactive too (admin use)
export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("all") === "true";
  const products = await getLoanProducts(includeInactive);
  return NextResponse.json(products);
});

// POST — ADMIN only
export const POST = withRole([UserRole.ADMIN], async (req) => {
  const body = await req.json();
  const { name, defaultRate, paymentFrequency, termCount, minAmount, maxAmount } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: { message: "El nombre es requerido" } }, { status: 400 });
  }
  if (typeof defaultRate !== "number" || defaultRate < 0) {
    return NextResponse.json({ error: { message: "La tasa debe ser un número mayor o igual a 0" } }, { status: 400 });
  }
  if (defaultRate > MAX_RATE) {
    return NextResponse.json({ error: { message: `La tasa no puede superar el ${MAX_RATE}%.` } }, { status: 400 });
  }
  if (!Object.values(PaymentFrequency).includes(paymentFrequency)) {
    return NextResponse.json({ error: { message: "Frecuencia de pago inválida" } }, { status: 400 });
  }
  if (typeof termCount !== "number" || termCount < 1) {
    return NextResponse.json({ error: { message: "El número de cuotas debe ser mayor a 0" } }, { status: 400 });
  }

  const duplicate = await prisma.loanProduct.findFirst({
    where: { name: { equals: name.trim(), mode: "insensitive" } },
  });
  if (duplicate) {
    return NextResponse.json({ error: { message: "Ya existe un producto con ese nombre." } }, { status: 409 });
  }

  const product = await createLoanProduct({
    name,
    defaultRate,
    paymentFrequency,
    termCount,
    minAmount: minAmount ?? null,
    maxAmount: maxAmount ?? null,
  });

  return NextResponse.json(product, { status: 201 });
});
