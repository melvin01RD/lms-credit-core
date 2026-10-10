import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/auth-middleware";
import { createPayment, getPayments } from "@/lib/services";
import { PaymentType } from "@prisma/client";
import { readPaymentInput } from "@/lib/api/payment-input";

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") ?? 1);
  const limit = Number(searchParams.get("limit") ?? 20);
  const loanId = searchParams.get("loanId") ?? undefined;
  const type = searchParams.get("type") as PaymentType | undefined;
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const result = await getPayments(
    {
      loanId,
      type,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    },
    { page, limit }
  );

  return NextResponse.json(result);
});

export const POST = withAuth(async (req) => {
  const result = await createPayment(await readPaymentInput(req, req.session.userId));

  return NextResponse.json(result, { status: 201 });
});
