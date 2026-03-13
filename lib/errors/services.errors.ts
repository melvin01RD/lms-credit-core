/**
 * Errores personalizados para la capa de servicios
 */

export class ServiceError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string, statusCode: number = 400) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============================================
// CLIENT ERRORS
// ============================================

export class ClientNotFoundError extends ServiceError {
  constructor(identifier: string) {
    super(`Cliente no encontrado: ${identifier}`, "CLIENT_NOT_FOUND", 404);
  }
}

export class DuplicateDocumentError extends ServiceError {
  constructor(documentId: string) {
    super(`Ya existe un cliente con el documento: ${documentId}`, "DUPLICATE_DOCUMENT", 409);
  }
}

export class ClientHasActiveLoansError extends ServiceError {
  constructor(clientId: string, loanCount: number) {
    super(`No se puede eliminar el cliente ${clientId}. Tiene ${loanCount} préstamo(s) activo(s)`, "CLIENT_HAS_ACTIVE_LOANS", 409);
  }
}

export class InvalidClientDataError extends ServiceError {
  constructor(message: string) {
    super(message, "INVALID_CLIENT_DATA", 400);
  }
}

// ============================================
// USER ERRORS
// ============================================

export class UserNotFoundError extends ServiceError {
  constructor(identifier: string) {
    super(`Usuario no encontrado: ${identifier}`, "USER_NOT_FOUND", 404);
  }
}

export class DuplicateEmailError extends ServiceError {
  constructor(email: string) {
    super(`Ya existe un usuario con el email: ${email}`, "DUPLICATE_EMAIL", 409);
  }
}

export class InvalidCredentialsError extends ServiceError {
  constructor() {
    super("Credenciales inválidas", "INVALID_CREDENTIALS", 401);
  }
}

export class UserInactiveError extends ServiceError {
  constructor(userId: string) {
    super(`El usuario ${userId} está inactivo`, "USER_INACTIVE", 403);
  }
}

export class InvalidPasswordError extends ServiceError {
  constructor(message: string = "Contraseña inválida") {
    super(message, "INVALID_PASSWORD", 400);
  }
}

export class CannotDeactivateSelfError extends ServiceError {
  constructor() {
    super("No puedes desactivar tu propia cuenta", "CANNOT_DEACTIVATE_SELF", 400);
  }
}

// ============================================
// PAYMENT ERRORS
// ============================================

export class PaymentNotFoundError extends ServiceError {
  constructor(paymentId: string) {
    super(`Pago no encontrado: ${paymentId}`, "PAYMENT_NOT_FOUND", 404);
  }
}

export class PaymentExceedsBalanceError extends ServiceError {
  constructor(paymentAmount: number, remainingBalance: number) {
    super(`El capital aplicado (${paymentAmount}) excede el balance pendiente (${remainingBalance})`, "PAYMENT_EXCEEDS_BALANCE", 400);
  }
}

export class CannotReversePaymentError extends ServiceError {
  constructor(paymentId: string, reason: string) {
    super(`No se puede reversar el pago ${paymentId}: ${reason}`, "CANNOT_REVERSE_PAYMENT", 400);
  }
}

// ============================================
// LOAN ERRORS
// ============================================

export class LoanNotFoundError extends ServiceError {
  constructor(loanId: string) {
    super(`Préstamo con ID ${loanId} no encontrado`, "LOAN_NOT_FOUND", 404);
  }
}

export class PaymentNotAllowedError extends ServiceError {
  constructor(loanId: string, status: string) {
    super(`No se puede registrar pago en préstamo ${loanId} con estado ${status}`, "PAYMENT_NOT_ALLOWED", 400);
  }
}

export class InvalidPaymentAmountError extends ServiceError {
  constructor(message: string) {
    super(message, "INVALID_PAYMENT_AMOUNT", 400);
  }
}

// ============================================
// APPROVAL TOKEN ERRORS
// ============================================

export class TokenNotFoundError extends ServiceError {
  constructor() {
    super("Este enlace no existe o no es válido", "TOKEN_INVALID", 404);
  }
}

export class TokenExpiredError extends ServiceError {
  constructor() {
    super("Este enlace ha expirado. Solicita un nuevo enlace al gestor de tu préstamo", "TOKEN_EXPIRED", 410);
  }
}

export class TokenAlreadyUsedError extends ServiceError {
  constructor() {
    super("Este préstamo ya fue procesado anteriormente", "TOKEN_USED", 410);
  }
}