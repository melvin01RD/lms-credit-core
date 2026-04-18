import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/auth-middleware";
import { createClient, getClients, auditLog, AuditAction, AuditEntity } from "@/lib/services";

const createClientSchema = z.object({
  firstName: z.string(),
  lastName: z.string().optional(),
  documentId: z.string().regex(/^\d{11}$/, "La cédula debe tener exactamente 11 dígitos numéricos"),
  phone: z.string().regex(/^\d{10}$/, "El teléfono debe tener exactamente 10 dígitos numéricos"),
  email: z.string().optional(),
  address: z.string().optional(),
  currency: z.string().optional(),
});

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") ?? 1);
  const limit = Number(searchParams.get("limit") ?? 20);
  const search = searchParams.get("search") ?? undefined;
  const active = searchParams.get("active");
  const currency = searchParams.get("currency") ?? undefined;

  const result = await getClients(
    {
      search,
      active: active !== null ? active === "true" : undefined,
      currency,
    },
    { page, limit }
  );

  return NextResponse.json(result);
});

export const POST = withAuth(async (req) => {
  const body = await req.json();
  const data = createClientSchema.parse(body);
  const client = await createClient(data);
  await auditLog(req.session.userId, AuditAction.CREATE_CLIENT, AuditEntity.CLIENT, client.id, {
    firstName: client.firstName,
    currency: client.currency,
  });
  return NextResponse.json(client, { status: 201 });
});
