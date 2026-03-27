import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/auth-middleware";
import { createLoan, getLoans } from "@/lib/services";
import { LoanStatus } from "@prisma/client";

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") ?? 1);
  const limit = Number(searchParams.get("limit") ?? 20);
  const clientId = searchParams.get("clientId") ?? undefined;
  const statusParam = searchParams.get("status");
  const status = statusParam
    ? statusParam.includes(",")
      ? (statusParam.split(",") as LoanStatus[])
      : (statusParam as LoanStatus)
    : undefined;
  const search = searchParams.get("search") ?? undefined;

  const result = await getLoans(
    { clientId, status, search },
    { page, limit }
  );

  return NextResponse.json(result);
});

export const POST = withAuth(async (req) => {
  const body = await req.json();

  if (body.totalFinanceCharge == null) {
    return NextResponse.json(
      { error: "totalFinanceCharge es requerido para Flat Rate" },
      { status: 400 }
    );
  }

  const loanStatus = body.status === 'DRAFT' ? 'DRAFT' : undefined;
  const loan = await createLoan({ ...body, loanStructure: "FLAT_RATE", status: loanStatus });
  return NextResponse.json(loan, { status: 201 });
});
