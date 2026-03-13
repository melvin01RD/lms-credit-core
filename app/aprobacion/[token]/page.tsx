"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// ============================================================================
// TYPES
// ============================================================================

interface LoanData {
  clientName: string;
  principalAmount: number;
  totalFinanceCharge: number;
  totalPayableAmount: number;
  installmentAmount: number;
  termCount: number;
  paymentFrequency: string;
  firstPaymentDate: string | null;
  expiresAt: string;
}

interface PageData {
  businessName: string;
  loan: LoanData;
}

type PageState =
  | { status: "loading" }
  | { status: "error"; code: string; message: string }
  | { status: "form"; data: PageData }
  | { status: "success"; clientName: string };

// ============================================================================
// CONSTANTS
// ============================================================================

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: "Diaria",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
};

// ============================================================================
// PAGE
// ============================================================================

export default function AprobacionPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [signature, setSignature] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/aprobacion/${token}`);
        const data = await res.json();
        if (!res.ok) {
          setState({
            status: "error",
            code: data.error?.code ?? "UNKNOWN",
            message: data.error?.message ?? "Error desconocido",
          });
          return;
        }
        setState({ status: "form", data });
      } catch {
        setState({
          status: "error",
          code: "NETWORK_ERROR",
          message: "Error de conexión. Verifica tu conexión a internet e intenta de nuevo.",
        });
      }
    }
    fetchData();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signature.trim()) {
      setSubmitError("Por favor, escribe tu nombre completo para confirmar.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`/api/aprobacion/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSignature: signature.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error?.message ?? "Error al procesar la solicitud.");
        return;
      }
      setState({ status: "success", clientName: data.clientName });
    } catch {
      setSubmitError("Error de conexión. Verifica tu internet e inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---- LOADING ----
  if (state.status === "loading") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.loadingSpinner} />
          <p style={{ color: "#6b7280", marginTop: "16px", fontSize: "0.9rem" }}>
            Cargando información del préstamo...
          </p>
        </div>
      </div>
    );
  }

  // ---- ERROR ----
  if (state.status === "error") {
    const isExpired = state.code === "TOKEN_EXPIRED";
    const isUsed = state.code === "TOKEN_USED";

    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ ...styles.iconCircle, background: "#fef2f2" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isUsed ? (
                <>
                  <polyline points="20 6 9 17 4 12" />
                </>
              ) : (
                <>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </>
              )}
            </svg>
          </div>
          <h2 style={styles.errorTitle}>
            {isExpired ? "Enlace Expirado" : isUsed ? "Préstamo Ya Procesado" : "Enlace Inválido"}
          </h2>
          <p style={styles.errorMessage}>{state.message}</p>
          {isExpired && (
            <p style={{ fontSize: "0.8rem", color: "#9ca3af", marginTop: "8px" }}>
              Los enlaces de aprobación tienen una vigencia de 24 horas.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---- SUCCESS ----
  if (state.status === "success") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ ...styles.iconCircle, background: "#d1fae5" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ ...styles.sectionTitle, fontSize: "1.3rem", marginBottom: "8px" }}>
            ¡Préstamo Aprobado!
          </h2>
          <p style={{ color: "#374151", fontSize: "0.95rem", margin: "0 0 8px" }}>
            Gracias, <strong>{state.clientName}</strong>.
          </p>
          <p style={{ color: "#6b7280", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>
            Su préstamo ha sido activado exitosamente. El gestor de su préstamo le
            contactará con los detalles del primer pago.
          </p>
        </div>
      </div>
    );
  }

  // ---- FORM ----
  const { data } = state;
  const { loan } = data;

  const fmt = (n: number) =>
    `RD$ ${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-DO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const rows: { label: string; value: string; highlight?: boolean }[] = [
    { label: "Cliente", value: loan.clientName },
    { label: "Monto del préstamo", value: fmt(loan.principalAmount) },
    { label: "Cargo financiero", value: fmt(loan.totalFinanceCharge) },
    { label: "Total a pagar", value: fmt(loan.totalPayableAmount), highlight: true },
    { label: "Número de cuotas", value: `${loan.termCount} cuotas` },
    { label: "Cuota fija", value: fmt(loan.installmentAmount), highlight: true },
    { label: "Frecuencia de pago", value: FREQUENCY_LABELS[loan.paymentFrequency] ?? loan.paymentFrequency },
    { label: "Fecha primer pago", value: fmtDate(loan.firstPaymentDate) },
  ];

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <p style={styles.businessName}>{data.businessName}</p>
        <h1 style={styles.heading}>Aprobación de Préstamo</h1>
        <p style={styles.subheading}>
          Revisa los detalles de tu préstamo y confirma tu aprobación
        </p>
      </div>

      {/* Loan details card */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Detalles del Préstamo</h2>
        <div style={styles.table}>
          {rows.map((row, i) => (
            <div key={i} style={{ ...styles.tableRow, background: i % 2 === 0 ? "#f9fafb" : "#ffffff" }}>
              <span style={styles.tableLabel}>{row.label}</span>
              <span style={{ ...styles.tableValue, color: row.highlight ? "#111827" : "#374151", fontWeight: row.highlight ? 700 : 600 }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Signature card */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Firma Digital</h2>
        <p style={styles.signatureDesc}>
          Para confirmar tu aprobación, escribe tu nombre completo tal como aparece
          en tu documento de identidad.
        </p>
        <form onSubmit={handleSubmit}>
          <label style={styles.label} htmlFor="signature">
            Nombre completo
          </label>
          <input
            id="signature"
            type="text"
            placeholder="Ej: Juan Antonio Pérez"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            style={styles.input}
            autoComplete="name"
            inputMode="text"
          />
          {submitError && (
            <div style={styles.errorBox}>{submitError}</div>
          )}
          <button
            type="submit"
            disabled={submitting || !signature.trim()}
            style={{
              ...styles.submitBtn,
              opacity: submitting || !signature.trim() ? 0.6 : 1,
              cursor: submitting || !signature.trim() ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Confirmando..." : "Confirmar y Firmar"}
          </button>
        </form>
        <p style={styles.legalNote}>
          Al hacer clic en "Confirmar y Firmar", confirmas que has leído y aceptas
          los términos del préstamo detallados anteriormente.
        </p>
      </div>

      {/* Expiry notice */}
      <p style={styles.expiryNote}>
        Este enlace expira el {fmtDate(loan.expiresAt)}
      </p>
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f3f4f6",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    padding: "24px 16px 48px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  header: {
    width: "100%",
    maxWidth: "480px",
    textAlign: "center" as const,
    marginBottom: "20px",
  },
  businessName: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "#6b7280",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    margin: "0 0 8px",
  },
  heading: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#111827",
    margin: "0 0 6px",
    letterSpacing: "-0.02em",
  },
  subheading: {
    fontSize: "0.85rem",
    color: "#6b7280",
    margin: 0,
    lineHeight: 1.5,
  },
  card: {
    width: "100%",
    maxWidth: "480px",
    background: "white",
    borderRadius: "16px",
    padding: "24px",
    marginBottom: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    textAlign: "center" as const,
  },
  sectionTitle: {
    fontSize: "1rem",
    fontWeight: 700,
    color: "#111827",
    margin: "0 0 16px",
    alignSelf: "flex-start",
    textAlign: "left" as const,
  },
  table: {
    width: "100%",
    borderRadius: "8px",
    overflow: "hidden",
    border: "1px solid #e5e7eb",
  },
  tableRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    gap: "8px",
  },
  tableLabel: {
    fontSize: "0.825rem",
    color: "#6b7280",
    flexShrink: 0,
  },
  tableValue: {
    fontSize: "0.85rem",
    textAlign: "right" as const,
  },
  signatureDesc: {
    fontSize: "0.85rem",
    color: "#4b5563",
    lineHeight: 1.6,
    margin: "0 0 20px",
    textAlign: "left" as const,
    alignSelf: "flex-start",
  },
  label: {
    display: "block",
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#374151",
    marginBottom: "8px",
    textAlign: "left" as const,
    alignSelf: "flex-start",
    width: "100%",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    fontSize: "1rem",
    border: "1.5px solid #d1d5db",
    borderRadius: "10px",
    outline: "none",
    color: "#111827",
    background: "white",
    boxSizing: "border-box" as const,
    marginBottom: "12px",
    transition: "border-color 0.15s",
  },
  errorBox: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#dc2626",
    fontSize: "0.85rem",
    marginBottom: "12px",
    textAlign: "left" as const,
    width: "100%",
    boxSizing: "border-box" as const,
  },
  submitBtn: {
    width: "100%",
    padding: "14px",
    background: "#6B21E8",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontSize: "1rem",
    fontWeight: 700,
    letterSpacing: "0.01em",
    transition: "background 0.15s",
  },
  legalNote: {
    fontSize: "0.75rem",
    color: "#9ca3af",
    lineHeight: 1.5,
    marginTop: "14px",
    textAlign: "center" as const,
    alignSelf: "center",
  },
  expiryNote: {
    fontSize: "0.75rem",
    color: "#9ca3af",
    textAlign: "center" as const,
    maxWidth: "480px",
  },
  iconCircle: {
    width: "72px",
    height: "72px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "16px",
  },
  loadingSpinner: {
    width: "40px",
    height: "40px",
    border: "3px solid #e5e7eb",
    borderTop: "3px solid #6B21E8",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  errorTitle: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "#111827",
    margin: "0 0 8px",
  },
  errorMessage: {
    fontSize: "0.875rem",
    color: "#4b5563",
    lineHeight: 1.6,
    margin: 0,
    textAlign: "center" as const,
  },
} as const;
