# Formato canónico de errores de API

Todos los endpoints que usan `withAuth` (`lib/api/auth-middleware.ts`) devuelven errores con esta estructura:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Mensaje legible para el usuario",
    "details": [
      { "field": "nombreDelCampo", "message": "Descripción del problema" }
    ]
  }
}
```

El campo `details` solo aparece en errores de validación de Zod (`VALIDATION_ERROR`). Para todos los demás errores, la estructura es `{ error: { code, message } }`.

## Códigos de error por origen

### Middleware `withAuth`

| Código | Status | Cuándo ocurre |
|--------|--------|----------------|
| `NOT_AUTHENTICATED` | 401 | Sin sesión válida |
| `VALIDATION_ERROR` | 400 | Falla de Zod — `details[]` lista los campos inválidos |
| `INTERNAL_ERROR` | 500 | Error no manejado |

### Errores de servicio (`lib/errors/services.errors.ts`)

| Código | Status | Clase |
|--------|--------|-------|
| `LOAN_NOT_FOUND` | 404 | `LoanNotFoundError` |
| `PAYMENT_NOT_ALLOWED` | 400 | `PaymentNotAllowedError` |
| `INVALID_PAYMENT_AMOUNT` | 400 | `InvalidPaymentAmountError` |
| `CLIENT_NOT_FOUND` | 404 | `ClientNotFoundError` |
| `DUPLICATE_DOCUMENT` | 409 | `DuplicateDocumentError` |
| `CLIENT_HAS_ACTIVE_LOANS` | 409 | `ClientHasActiveLoansError` |
| `USER_NOT_FOUND` | 404 | `UserNotFoundError` |
| `DUPLICATE_EMAIL` | 409 | `DuplicateEmailError` |
| `INVALID_CREDENTIALS` | 401 | `InvalidCredentialsError` |
| `PAYMENT_NOT_FOUND` | 404 | `PaymentNotFoundError` |
| `CANNOT_REVERSE_PAYMENT` | 400 | `CannotReversePaymentError` |

### Códigos inline en handlers

| Código | Status | Endpoint |
|--------|--------|----------|
| `MISSING_USER_ID` | 400 | `PATCH /api/loans/[id]` |
| `INVALID_ACTION` | 400 | `PATCH /api/loans/[id]` |

## Cómo escribir assertions de error en tests

```typescript
// ✅ Correcto — valida código y estructura
expect(res.status).toBe(400);
expect(body.error.code).toBe("VALIDATION_ERROR");
expect(body.error.details).toContainEqual(
  expect.objectContaining({ field: "totalFinanceCharge" })
);

// ✅ Correcto — error de servicio sin details
expect(res.status).toBe(404);
expect(body.error.code).toBe("LOAN_NOT_FOUND");

// ❌ Evitar — formato viejo, ya no funciona
expect(body.error).toContain("totalFinanceCharge");

// ⚠️ Laxo — pasa pero no aporta valor
expect(res.status).toBe(400);
```
