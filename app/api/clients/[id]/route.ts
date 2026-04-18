import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/auth-middleware";
import { getClientById, updateClient, deactivateClient, auditLog, AuditAction, AuditEntity } from "@/lib/services";

const updateClientSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().regex(/^\d{10}$/, "El teléfono debe tener exactamente 10 dígitos numéricos").optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  currency: z.string().optional(),
  collectionDays: z.array(z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"])).optional(),
});

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (req, context) => {
  const params = await context!.params;
  const client = await getClientById(params.id);
  return NextResponse.json(client);
});

export const PUT = withAuth(async (req, context) => {
  const params = await context!.params;
  const body = await req.json();
  const data = updateClientSchema.parse(body);
  const client = await updateClient(params.id, data);
  await auditLog(req.session.userId, AuditAction.UPDATE_CLIENT, AuditEntity.CLIENT, params.id, {
    updatedFields: Object.keys(data),
  });
  return NextResponse.json(client);
});

export const DELETE = withAuth(async (req, context) => {
  const params = await context!.params;
  const client = await deactivateClient(params.id);
  await auditLog(req.session.userId, AuditAction.DELETE_CLIENT, AuditEntity.CLIENT, params.id);
  return NextResponse.json(client);
});
