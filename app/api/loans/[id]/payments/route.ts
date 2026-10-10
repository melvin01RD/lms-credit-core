import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/auth-middleware";
import { getLoanPayments, createPayment } from "@/lib/services";
import { readPaymentInput } from "@/lib/api/payment-input";

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (req, context) => {
  const params = await context!.params;
  const payments = await getLoanPayments(params.id);
  return NextResponse.json(payments);
});

export const POST = withAuth(async (req, context) => {
  const params = await context!.params;
  const result = await createPayment(await readPaymentInput(req, req.session.userId, params.id));
  
  return NextResponse.json(result, { status: 201 });
});
