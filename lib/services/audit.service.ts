import { prisma } from "../db/prisma";
import { Prisma } from "@prisma/client";

// ============================================
// ENUMS
// ============================================

export enum AuditAction {
  CREATE_CLIENT = "CREATE_CLIENT",
  UPDATE_CLIENT = "UPDATE_CLIENT",
  DELETE_CLIENT = "DELETE_CLIENT",
  CREATE_LOAN = "CREATE_LOAN",
  ACTIVATE_LOAN = "ACTIVATE_LOAN",
  DELETE_DRAFT_LOAN = "DELETE_DRAFT_LOAN",
  GENERATE_APPROVAL_TOKEN = "GENERATE_APPROVAL_TOKEN",
  CANCEL_LOAN = "CANCEL_LOAN",
  REGISTER_PAYMENT = "REGISTER_PAYMENT",
  REVERSE_PAYMENT = "REVERSE_PAYMENT",
  CREATE_USER = "CREATE_USER",
  UPDATE_USER = "UPDATE_USER",
  DEACTIVATE_USER = "DEACTIVATE_USER",
}

export enum AuditEntity {
  CLIENT = "CLIENT",
  LOAN = "LOAN",
  PAYMENT = "PAYMENT",
  USER = "USER",
}

// ============================================
// AUDIT OPERATIONS
// ============================================

/**
 * Registra una entrada de auditoría.
 * Nunca lanza excepciones — si falla, lo registra en consola
 * para no interrumpir la operación principal.
 */
export async function auditLog(
  userId: string,
  action: AuditAction,
  entity: AuditEntity,
  entityId: string,
  details?: Prisma.InputJsonValue
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        details: details ?? undefined,
      },
    });
  } catch (error) {
    console.error("AuditLog failed:", error);
  }
}
