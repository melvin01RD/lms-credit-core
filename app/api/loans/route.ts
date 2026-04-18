import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/auth-middleware";
import { createLoan, getLoans } from "@/lib/services";
import { LoanStatus } from "@prisma/client";

const createLoanSchema = z.object({
  clientId: z.string(),
  createdById: z.string(),
  principalAmount: z.number().positive("El capital debe ser mayor a cero"),
  totalFinanceCharge: z.number().min(0, "El cargo financiero no puede ser negativo"),
  termCount: z.number().int().min(1).max(360, "El número de cuotas no puede superar 360"),
  paymentFrequency: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]),
  startDate: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE"]).optional(),
  loanProductId: z.string().optional(),
  notes: z.string().optional(),
}).refine(
  (d) => d.totalFinanceCharge <= d.principalAmount,
  { message: "El cargo financiero no puede superar el monto del capital", path: ["totalFinanceCharge"] }
);

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
  const data = createLoanSchema.parse(body);
  const loanStatus = data.status === "DRAFT" ? "DRAFT" : undefined;
  const loan = await createLoan({ ...data, loanStructure: "FLAT_RATE", status: loanStatus });
  return NextResponse.json(loan, { status: 201 });
});
