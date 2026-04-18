"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

// ============================================
// TYPES
// ============================================

interface LoanClient {
  id: string;
  firstName: string;
  lastName: string | null;
  documentId: string;
  phone: string;
  email: string | null;
  address: string | null;
}

interface LoanUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Payment {
  id: string;
  paymentDate: string;
  totalAmount: string;
  capitalApplied: string;
  interestApplied: string;
  lateFeeApplied: string;
  type: string;
  createdBy?: {
    firstName: string;
    lastName: string;
  };
}

interface LoanDetail {
  id: string;
  principalAmount: string;
  totalFinanceCharge: string | null;
  paymentFrequency: string;
  termCount: number;
  installmentAmount: string;
  remainingCapital: string;
  status: string;
  nextDueDate: string | null;
  guarantees: string | null;
  createdAt: string;
  updatedAt: string;
  client: LoanClient;
  payments: Payment[];
  createdBy: LoanUser | null;
  updatedBy: LoanUser | null;
  // Flujo de aprobación
  approvalToken?: string | null;
  approvalTokenExp?: string | null;
}

interface LoanSummary {
  principalAmount: number;
  remainingCapital: number;
  capitalPaid: number;
  interestPaid: number;
  lateFeesPaid: number;
  totalPaid: number;
  paymentCount: number;
  progressPercentage: number;
}

interface AmortizationEntry {
  installmentNumber: number;
  dueDate: string;
  totalPayment: number;
  principalPayment: number;
  interestPayment: number;
  remainingBalance: number;
}

// ============================================
// CONSTANTS
// ============================================

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  DRAFT: { bg: "#fef3c7", color: "#d97706" },
  ACTIVE: { bg: "#d1fae5", color: "#059669" },
  OVERDUE: { bg: "#fee2e2", color: "#dc2626" },
  PAID: { bg: "#dbeafe", color: "#2563eb" },
  CANCELED: { bg: "#f3f4f6", color: "#6b7280" },
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activo",
  OVERDUE: "En mora",
  PAID: "Pagado",
  CANCELED: "Cancelado",
};

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  REGULAR: "Regular",
  CAPITAL_PAYMENT: "Abono a capital",
  FULL_SETTLEMENT: "Liquidación total",
  ADVANCE: "Adelanto",
};

// ============================================
// PAGE
// ============================================

export default function LoanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loan, setLoan] = useState<LoanDetail | null>(null);
  const [summary, setSummary] = useState<LoanSummary | null>(null);
  const [amortization, setAmortization] = useState<AmortizationEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"info" | "payments" | "amortization">("info");
  const [loadingAmortization, setLoadingAmortization] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [draftAction, setDraftAction] = useState<"activating" | "deleting" | null>(null);
  const [draftError, setDraftError] = useState("");
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  // Fetch loan + summary + current user
  useEffect(() => {
    async function fetchLoan() {
      try {
        const [loanRes, summaryRes, meRes] = await Promise.all([
          fetch(`/api/loans/${id}`),
          fetch(`/api/loans/${id}/summary`),
          fetch(`/api/auth/me`),
        ]);

        if (!loanRes.ok) {
          setError("Préstamo no encontrado");
          return;
        }

        const loanData = await loanRes.json();
        setLoan(loanData);

        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          setSummary(summaryData.summary);
        }

        if (meRes.ok) {
          const meData = await meRes.json();
          setUserRole(meData.user?.role ?? null);
          setUserId(meData.user?.userId ?? null);
        }
      } catch {
        setError("Error al cargar el préstamo");
      } finally {
        setLoading(false);
      }
    }

    fetchLoan();
  }, [id]);

  // Fetch amortization on tab switch
  useEffect(() => {
    if (activeTab !== "amortization" || amortization !== null) return;

    async function fetchAmortization() {
      setLoadingAmortization(true);
      try {
        const res = await fetch(`/api/loans/${id}/amortization`);
        if (res.ok) {
          const data = await res.json();
          setAmortization(data);
        }
      } catch {
        // ignore
      } finally {
        setLoadingAmortization(false);
      }
    }

    fetchAmortization();
  }, [activeTab, amortization, id]);

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>Cargando...</div>;
  }

  if (error || !loan) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <p style={{ color: "#dc2626", marginBottom: "16px" }}>{error}</p>
        <button
          onClick={() => router.push("/dashboard/prestamos")}
          style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}
        >
          Volver a préstamos
        </button>
      </div>
    );
  }

  const fmt = (n: number) => n.toLocaleString("es-DO", { minimumFractionDigits: 2 });
  const sc = STATUS_COLORS[loan.status] || STATUS_COLORS.CANCELED;
  const clientName = `${loan.client.firstName} ${loan.client.lastName ?? ""}`.trim();
  const isDraft = loan.status === "DRAFT";
  const canCancel = loan.status === "ACTIVE" || loan.status === "OVERDUE";
  const isAdmin = userRole === "ADMIN";

  async function handleActivate() {
    if (!userId) return;
    setDraftAction("activating");
    setDraftError("");
    try {
      const res = await fetch(`/api/loans/${loan!.id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setDraftError(data.error?.message ?? "Error al activar el préstamo");
        return;
      }
      setLoan({ ...loan!, status: "ACTIVE" });
      router.refresh();
    } catch {
      setDraftError("Error de conexión");
    } finally {
      setDraftAction(null);
    }
  }

  async function handleDeleteDraft() {
    if (!userId) return;
    setDraftAction("deleting");
    setDraftError("");
    try {
      const res = await fetch(`/api/loans/${loan!.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setDraftError(data.error?.message ?? "Error al eliminar el borrador");
        return;
      }
      router.push("/dashboard/prestamos");
    } catch {
      setDraftError("Error de conexión");
    } finally {
      setDraftAction(null);
    }
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link href="/dashboard/prestamos" className="breadcrumb-link">Préstamos</Link>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        <span className="breadcrumb-current">Detalle del préstamo</span>
      </div>

      {/* Header */}
      <div className="loan-header">
        <div className="loan-header-left">
          <div className="loan-amount-block">
            <h1 className="loan-amount">RD$ {fmt(Number(loan.principalAmount))}</h1>
            <div className="loan-meta">
              <Link href={`/dashboard/clientes/${loan.client.id}`} className="loan-client-link">
                {clientName}
              </Link>
              <span className="meta-sep">•</span>
              <span>{FREQUENCY_LABELS[loan.paymentFrequency] ?? loan.paymentFrequency}</span>
              <span className="meta-sep">•</span>
              <span>{loan.termCount} cuotas</span>
              <span className="meta-sep">•</span>
              <span>Cargo Fijo</span>
            </div>
          </div>
        </div>
        <div className="loan-header-right">
          <span className="status-pill" style={{ background: sc.bg, color: sc.color }}>
            {STATUS_LABELS[loan.status] ?? loan.status}
          </span>
          {canCancel && (
            <button className="btn-danger" onClick={() => setShowCancelModal(true)}>
              Cancelar Préstamo
            </button>
          )}
        </div>
      </div>

      {/* DRAFT banner */}
      {isDraft && (
        <div className="draft-banner">
          <div className="draft-banner-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </div>
          <div className="draft-banner-content">
            <p className="draft-banner-title">Préstamo en Borrador</p>
            <p className="draft-banner-desc">Este préstamo aún no está activo. Debe ser activado para poder registrar pagos y generar el plan de cuotas.</p>
          </div>
          <div className="draft-banner-actions">
            <button
              className="btn-send-approval"
              onClick={() => setShowApprovalModal(true)}
              disabled={draftAction !== null}
            >
              Enviar para Aprobación
            </button>
            {isAdmin && (
              <button
                className="btn-activate"
                onClick={handleActivate}
                disabled={draftAction !== null}
              >
                {draftAction === "activating" ? "Activando..." : "Activar Préstamo"}
              </button>
            )}
            <button
              className="btn-delete-draft"
              onClick={handleDeleteDraft}
              disabled={draftAction !== null}
            >
              {draftAction === "deleting" ? "Eliminando..." : "Eliminar Borrador"}
            </button>
          </div>
        </div>
      )}
      {draftError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", color: "#dc2626", fontSize: "0.85rem", marginBottom: "16px" }}>
          {draftError}
        </div>
      )}

      {/* Progress bar */}
      {!isDraft && summary && (
        <div className="progress-section">
          <div className="progress-header">
            <span className="progress-label">Progreso de pago</span>
            <span className="progress-pct">{summary.progressPercentage.toFixed(1)}%</span>
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{ width: `${Math.min(summary.progressPercentage, 100)}%` }}
            />
          </div>
          <div className="progress-amounts">
            <span>RD$ {fmt(summary.capitalPaid)} pagado</span>
            <span>RD$ {fmt(summary.remainingCapital)} pendiente</span>
          </div>
        </div>
      )}

      {/* KPI cards */}
      {!isDraft && summary && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <span className="kpi-value">RD$ {fmt(summary.totalPaid)}</span>
            <span className="kpi-label">Total pagado</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-value">RD$ {fmt(summary.capitalPaid)}</span>
            <span className="kpi-label">Capital pagado</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-value">RD$ {fmt(summary.interestPaid)}</span>
            <span className="kpi-label">Intereses pagados</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-value">{summary.paymentCount}</span>
            <span className="kpi-label">Pagos realizados</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-value">RD$ {fmt(Number(loan.installmentAmount))}</span>
            <span className="kpi-label">Cuota fija</span>
          </div>
          {summary.lateFeesPaid > 0 && (
            <div className="kpi-card">
              <span className="kpi-value" style={{ color: "#dc2626" }}>RD$ {fmt(summary.lateFeesPaid)}</span>
              <span className="kpi-label">Mora pagada</span>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === "info" ? "active" : ""}`}
          onClick={() => setActiveTab("info")}
        >
          Información
        </button>
        {!isDraft && (
          <button
            className={`tab ${activeTab === "payments" ? "active" : ""}`}
            onClick={() => setActiveTab("payments")}
          >
            Pagos ({loan.payments.length})
          </button>
        )}
        {!isDraft && (
          <button
            className={`tab ${activeTab === "amortization" ? "active" : ""}`}
            onClick={() => setActiveTab("amortization")}
          >
            Amortización
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="tab-content">
        {activeTab === "info" && <InfoTab loan={loan} />}
        {!isDraft && activeTab === "payments" && <PaymentsTab payments={loan.payments} />}
        {!isDraft && activeTab === "amortization" && (
          <AmortizationTab entries={amortization} loading={loadingAmortization} />
        )}
      </div>

      {/* Approval token modal */}
      {showApprovalModal && (
        <ApprovalTokenModal
          loanId={loan.id}
          existingToken={loan.approvalToken}
          existingTokenExp={loan.approvalTokenExp}
          onClose={() => setShowApprovalModal(false)}
        />
      )}

      {/* Cancel modal */}
      {showCancelModal && (
        <CancelLoanModal
          loanId={loan.id}
          onClose={() => setShowCancelModal(false)}
          onCanceled={() => {
            setShowCancelModal(false);
            setLoan({ ...loan, status: "CANCELED" });
            if (summary) setSummary({ ...summary });
          }}
        />
      )}

      <style jsx>{`
        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 20px;
          font-size: 0.85rem;
        }
        .breadcrumb-current { color: #6b7280; }

        .loan-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
          gap: 16px;
          flex-wrap: wrap;
        }
        .loan-header-left {
          flex: 1;
          min-width: 0;
        }
        .loan-header-right {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }
        .loan-amount {
          font-size: 1.8rem;
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.02em;
        }
        .loan-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          color: #6b7280;
          margin-top: 4px;
          flex-wrap: wrap;
        }
        .meta-sep { color: #d1d5db; }

        .status-pill {
          font-size: 0.8rem;
          font-weight: 600;
          padding: 4px 14px;
          border-radius: 20px;
          white-space: nowrap;
        }
        .btn-danger {
          background: white;
          color: #dc2626;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 0.825rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-danger:hover {
          background: #fef2f2;
          border-color: #dc2626;
        }

        /* Progress */
        .progress-section {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 16px 20px;
          margin-bottom: 20px;
        }
        .progress-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .progress-label {
          font-size: 0.85rem;
          font-weight: 600;
          color: #374151;
        }
        .progress-pct {
          font-size: 0.85rem;
          font-weight: 700;
          color: #2563eb;
        }
        .progress-bar-bg {
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }
        .progress-bar-fill {
          height: 100%;
          background: #2563eb;
          border-radius: 4px;
          transition: width 0.4s ease;
        }
        .progress-amounts {
          display: flex;
          justify-content: space-between;
          margin-top: 6px;
          font-size: 0.75rem;
          color: #9ca3af;
        }

        /* KPIs */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
          margin-bottom: 24px;
        }
        .kpi-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 14px 16px;
        }
        .kpi-value {
          display: block;
          font-size: 1.1rem;
          font-weight: 700;
          color: #111827;
        }
        .kpi-label {
          font-size: 0.75rem;
          color: #9ca3af;
          margin-top: 2px;
        }

        /* Tabs */
        .tabs {
          display: flex;
          gap: 0;
          border-bottom: 2px solid #e5e7eb;
          margin-bottom: 0;
        }
        .tab {
          padding: 10px 20px;
          font-size: 0.85rem;
          font-weight: 600;
          color: #6b7280;
          background: none;
          border: none;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -2px;
          transition: all 0.15s;
        }
        .tab:hover { color: #374151; }
        .tab.active {
          color: #2563eb;
          border-bottom-color: #2563eb;
        }

        .tab-content {
          padding-top: 20px;
        }

        /* DRAFT banner */
        .draft-banner {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 12px;
          padding: 16px 20px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .draft-banner-icon {
          flex-shrink: 0;
          margin-top: 2px;
        }
        .draft-banner-content {
          flex: 1;
          min-width: 0;
        }
        .draft-banner-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: #92400e;
          margin: 0 0 4px;
        }
        .draft-banner-desc {
          font-size: 0.825rem;
          color: #78350f;
          margin: 0;
          line-height: 1.5;
        }
        .draft-banner-actions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-shrink: 0;
          flex-wrap: wrap;
        }
        .btn-send-approval {
          background: white;
          color: #6B21E8;
          border: 1.5px solid #6B21E8;
          border-radius: 8px;
          padding: 9px 18px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .btn-send-approval:hover:not(:disabled) { background: #f5f3ff; }
        .btn-send-approval:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-activate {
          background: #6B21E8;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 9px 18px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
          white-space: nowrap;
        }
        .btn-activate:hover:not(:disabled) { background: #5b1dc4; }
        .btn-activate:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-delete-draft {
          background: white;
          color: #dc2626;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 9px 18px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .btn-delete-draft:hover:not(:disabled) { background: #fef2f2; border-color: #dc2626; }
        .btn-delete-draft:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>

      <style jsx global>{`
        .breadcrumb-link {
          color: #2563eb;
          text-decoration: none;
        }
        .breadcrumb-link:hover { text-decoration: underline; }
        .loan-client-link {
          color: #2563eb;
          text-decoration: none;
          font-weight: 500;
        }
        .loan-client-link:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}

// ============================================
// TAB: Information
// ============================================

function InfoTab({ loan }: { loan: LoanDetail }) {
  const fmt = (n: number) => n.toLocaleString("es-DO", { minimumFractionDigits: 2 });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("es-DO", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="info-grid">
      <div className="info-section">
        <h3 className="info-section-title">Datos del préstamo</h3>
        <div className="info-rows">
          <div className="info-row">
            <span className="info-label">Monto principal</span>
            <span className="info-value">RD$ {fmt(Number(loan.principalAmount))}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Cargo Financiero</span>
            <span className="info-value">RD$ {fmt(Number(loan.totalFinanceCharge ?? 0))}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Frecuencia de pago</span>
            <span className="info-value">{FREQUENCY_LABELS[loan.paymentFrequency] ?? loan.paymentFrequency}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Número de cuotas</span>
            <span className="info-value">{loan.termCount}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Cuota fija</span>
            <span className="info-value">RD$ {fmt(Number(loan.installmentAmount))}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Capital pendiente</span>
            <span className="info-value">RD$ {fmt(Number(loan.remainingCapital))}</span>
          </div>
          {loan.nextDueDate && (
            <div className="info-row">
              <span className="info-label">Próximo vencimiento</span>
              <span className="info-value">{fmtDate(loan.nextDueDate)}</span>
            </div>
          )}
          {loan.guarantees && (
            <div className="info-row">
              <span className="info-label">Garantías</span>
              <span className="info-value">{loan.guarantees}</span>
            </div>
          )}
          <div className="info-row">
            <span className="info-label">Fecha de creación</span>
            <span className="info-value">{fmtDate(loan.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="info-section">
        <h3 className="info-section-title">Datos del cliente</h3>
        <div className="info-rows">
          <div className="info-row">
            <span className="info-label">Nombre</span>
            <span className="info-value">
              <Link href={`/dashboard/clientes/${loan.client.id}`} style={{ color: "#2563eb", textDecoration: "none" }}>
                {loan.client.firstName} {loan.client.lastName ?? ""}
              </Link>
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Documento</span>
            <span className="info-value" style={{ fontFamily: "monospace" }}>{loan.client.documentId}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Teléfono</span>
            <span className="info-value">{loan.client.phone}</span>
          </div>
          {loan.client.email && (
            <div className="info-row">
              <span className="info-label">Email</span>
              <span className="info-value">{loan.client.email}</span>
            </div>
          )}
          {loan.client.address && (
            <div className="info-row">
              <span className="info-label">Dirección</span>
              <span className="info-value">{loan.client.address}</span>
            </div>
          )}
        </div>
      </div>

      {loan.createdBy && (
        <div className="info-section" style={{ gridColumn: "1 / -1" }}>
          <h3 className="info-section-title">Creado por</h3>
          <div className="info-rows">
            <div className="info-row">
              <span className="info-label">Usuario</span>
              <span className="info-value">{loan.createdBy.firstName} {loan.createdBy.lastName}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Email</span>
              <span className="info-value">{loan.createdBy.email}</span>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .info-section {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 18px 20px;
        }
        .info-section-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: #111827;
          margin-bottom: 14px;
        }
        .info-rows {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .info-label {
          font-size: 0.825rem;
          color: #6b7280;
        }
        .info-value {
          font-size: 0.825rem;
          font-weight: 600;
          color: #111827;
          text-align: right;
        }
        @media (max-width: 700px) {
          .info-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

// ============================================
// TAB: Payments
// ============================================

function PaymentsTab({ payments }: { payments: Payment[] }) {
  const fmt = (n: number) => n.toLocaleString("es-DO", { minimumFractionDigits: 2 });

  if (payments.length === 0) {
    return (
      <div className="empty-state">
        <p>No hay pagos registrados</p>
        <style jsx>{`
          .empty-state {
            text-align: center;
            padding: 40px;
            color: #9ca3af;
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Monto total</th>
            <th>Capital</th>
            <th>Interés</th>
            <th>Mora</th>
            <th>Tipo</th>
            <th>Registrado por</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td>{new Date(p.paymentDate).toLocaleDateString("es-DO")}</td>
              <td className="td-bold">RD$ {fmt(Number(p.totalAmount))}</td>
              <td>RD$ {fmt(Number(p.capitalApplied))}</td>
              <td>RD$ {fmt(Number(p.interestApplied))}</td>
              <td>{Number(p.lateFeeApplied) > 0 ? `RD$ ${fmt(Number(p.lateFeeApplied))}` : "—"}</td>
              <td>
                <span className="type-badge">
                  {PAYMENT_TYPE_LABELS[p.type] ?? p.type}
                </span>
              </td>
              <td className="td-secondary">
                {p.createdBy ? `${p.createdBy.firstName} ${p.createdBy.lastName}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <style jsx>{`
        .table-container {
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          overflow-x: auto;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
          min-width: 700px;
        }
        .table thead { background: #f9fafb; }
        .table th {
          text-align: left;
          padding: 10px 14px;
          font-weight: 600;
          color: #6b7280;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border-bottom: 1px solid #e5e7eb;
          white-space: nowrap;
        }
        .table td {
          padding: 10px 14px;
          color: #374151;
          border-bottom: 1px solid #f3f4f6;
          white-space: nowrap;
        }
        .td-bold { font-weight: 600; }
        .td-secondary { color: #9ca3af; }
        .type-badge {
          font-size: 0.7rem;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 12px;
          background: #f3f4f6;
          color: #6b7280;
        }
      `}</style>
    </div>
  );
}

// ============================================
// TAB: Amortization
// ============================================

function AmortizationTab({
  entries,
  loading,
}: {
  entries: AmortizationEntry[] | null;
  loading: boolean;
}) {
  const fmt = (n: number | undefined | null) =>
    (n == null ? 0 : Number(n)).toLocaleString("es-DO", { minimumFractionDigits: 2 });

  if (loading) {
    return <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>Cargando tabla de amortización...</div>;
  }

  if (!entries || entries.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af", background: "white", border: "1px solid #e5e7eb", borderRadius: "12px" }}>
        No se pudo cargar la tabla de amortización
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Fecha</th>
            <th>Cuota total</th>
            <th>Capital</th>
            <th>Interés</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.installmentNumber}>
              <td className="td-center">{entry.installmentNumber}</td>
              <td>{new Date(entry.dueDate).toLocaleDateString("es-DO")}</td>
              <td className="td-bold">RD$ {fmt(entry.totalPayment)}</td>
              <td>RD$ {fmt(entry.principalPayment)}</td>
              <td>RD$ {fmt(entry.interestPayment)}</td>
              <td>RD$ {fmt(entry.remainingBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <style jsx>{`
        .table-container {
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          overflow-x: auto;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
          min-width: 600px;
        }
        .table thead { background: #f9fafb; }
        .table th {
          text-align: left;
          padding: 10px 14px;
          font-weight: 600;
          color: #6b7280;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border-bottom: 1px solid #e5e7eb;
          white-space: nowrap;
        }
        .table td {
          padding: 10px 14px;
          color: #374151;
          border-bottom: 1px solid #f3f4f6;
          white-space: nowrap;
        }
        .td-bold { font-weight: 600; }
        .td-center { text-align: center; color: #9ca3af; }
      `}</style>
    </div>
  );
}

// ============================================
// MODAL: Cancel Loan
// ============================================

function CancelLoanModal({
  loanId,
  onClose,
  onCanceled,
}: {
  loanId: string;
  onClose: () => void;
  onCanceled: () => void;
}) {
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState("");

  async function handleCancel() {
    setCanceling(true);
    setError("");

    try {
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) {
        setError("Sesión expirada. Recarga la página.");
        return;
      }
      const meData = await meRes.json();

      const res = await fetch(`/api/loans/${loanId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: meData.user.userId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? data.error ?? "Error al cancelar el préstamo");
        return;
      }

      onCanceled();
    } catch {
      setError("Error de conexión");
    } finally {
      setCanceling(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Cancelar Préstamo</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-warning">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p>Esta acción no se puede deshacer. El préstamo será marcado como <strong>CANCELADO</strong> permanentemente.</p>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Volver
          </button>
          <button
            type="button"
            className="btn-confirm-danger"
            onClick={handleCancel}
            disabled={canceling}
          >
            {canceling ? "Cancelando..." : "Confirmar cancelación"}
          </button>
        </div>

        <style jsx>{`
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 50;
            padding: 16px;
          }
          .modal {
            background: white;
            border-radius: 14px;
            width: 100%;
            max-width: 440px;
            padding: 24px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
          }
          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
          }
          .modal-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: #111827;
          }
          .modal-close {
            background: none;
            border: none;
            color: #9ca3af;
            cursor: pointer;
            padding: 4px;
          }
          .modal-close:hover { color: #374151; }

          .modal-warning {
            display: flex;
            gap: 12px;
            align-items: flex-start;
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 8px;
            padding: 14px;
            margin-bottom: 16px;
          }
          .modal-warning p {
            font-size: 0.85rem;
            color: #991b1b;
            line-height: 1.5;
            margin: 0;
          }

          .modal-error {
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 8px;
            padding: 10px 14px;
            color: #dc2626;
            font-size: 0.85rem;
            margin-bottom: 16px;
          }

          .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            padding-top: 8px;
          }
          .btn-secondary {
            background: white;
            color: #374151;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 10px 20px;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
          }
          .btn-secondary:hover { background: #f9fafb; }
          .btn-confirm-danger {
            background: #dc2626;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px 20px;
            font-size: 0.875rem;
            font-weight: 600;
            cursor: pointer;
          }
          .btn-confirm-danger:hover:not(:disabled) { background: #b91c1c; }
          .btn-confirm-danger:disabled { opacity: 0.6; cursor: not-allowed; }
        `}</style>
      </div>
    </div>
  );
}

// ============================================
// MODAL: Approval Token
// ============================================

function ApprovalTokenModal({
  loanId,
  existingToken,
  existingTokenExp,
  onClose,
}: {
  loanId: string;
  existingToken?: string | null;
  existingTokenExp?: string | null;
  onClose: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [generatedExpiry, setGeneratedExpiry] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const now = new Date();
  const hasActiveToken =
    existingToken &&
    existingTokenExp &&
    new Date(existingTokenExp) > now;

  const existingUrl = hasActiveToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/aprobacion/${existingToken}`
    : null;

  const displayUrl = generatedUrl ?? existingUrl;
  const displayExpiry = generatedExpiry ?? (hasActiveToken ? existingTokenExp : null);

  function getRemainingTime(expIso: string): string {
    const diff = new Date(expIso).getTime() - Date.now();
    if (diff <= 0) return "expirado";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${mins}m restantes`;
    return `${mins} minutos restantes`;
  }

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch(`/api/loans/${loanId}/generate-token`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Error al generar el enlace");
        return;
      }
      const data = await res.json();
      setGeneratedUrl(data.approvalUrl);
      setGeneratedExpiry(data.expiresAt);
    } catch {
      setError("Error de conexión");
    } finally {
      setGenerating(false);
    }
  }

  function handleCopy() {
    if (displayUrl) {
      navigator.clipboard.writeText(displayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal atm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Enviar para Aprobación</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="atm-desc">
          Genera un enlace único para que el cliente revise y apruebe su préstamo desde su teléfono.
          El enlace expira en 24 horas.
        </p>

        {/* Active token info */}
        {displayUrl ? (
          <div className="atm-url-section">
            {displayExpiry && (
              <div className="atm-expiry">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <span>Enlace activo — {getRemainingTime(displayExpiry)}</span>
              </div>
            )}
            <div className="atm-url-box">
              <span className="atm-url-text">{displayUrl}</span>
            </div>
            <div className="atm-url-actions">
              <button className="btn-copy" onClick={handleCopy}>
                {copied ? "✓ Copiado" : "Copiar enlace"}
              </button>
              <button
                className="btn-regen"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? "Generando..." : "Regenerar"}
              </button>
            </div>
          </div>
        ) : (
          <div className="atm-empty">
            <p className="atm-empty-text">No hay un enlace activo para este préstamo.</p>
            <button
              className="btn-gen-primary"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? "Generando..." : "Generar enlace de aprobación"}
            </button>
          </div>
        )}

        {error && <div className="atm-error">{error}</div>}

        <style jsx>{`
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 50;
            padding: 16px;
          }
          .modal {
            background: white;
            border-radius: 14px;
            width: 100%;
            max-width: 440px;
            padding: 24px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
          }
          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
          }
          .modal-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: #111827;
          }
          .modal-close {
            background: none;
            border: none;
            color: #9ca3af;
            cursor: pointer;
            padding: 4px;
          }
          .modal-close:hover { color: #374151; }
          .atm-modal { max-width: 520px; }
          .atm-desc {
            font-size: 0.85rem;
            color: #6b7280;
            line-height: 1.6;
            margin: 0 0 20px;
          }
          .atm-url-section { width: 100%; }
          .atm-expiry {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.8rem;
            font-weight: 600;
            color: #059669;
            margin-bottom: 10px;
          }
          .atm-url-box {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 10px 14px;
            word-break: break-all;
            margin-bottom: 12px;
          }
          .atm-url-text {
            font-size: 0.8rem;
            color: #4b5563;
            font-family: monospace;
          }
          .atm-url-actions {
            display: flex;
            gap: 10px;
          }
          .btn-copy {
            flex: 1;
            background: #6B21E8;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px 16px;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s;
          }
          .btn-copy:hover { background: #5b1dc4; }
          .btn-regen {
            background: white;
            color: #6b7280;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 10px 16px;
            font-size: 0.85rem;
            font-weight: 500;
            cursor: pointer;
          }
          .btn-regen:hover:not(:disabled) { background: #f9fafb; }
          .btn-regen:disabled { opacity: 0.6; cursor: not-allowed; }
          .atm-empty {
            text-align: center;
            padding: 16px 0;
          }
          .atm-empty-text {
            font-size: 0.85rem;
            color: #9ca3af;
            margin: 0 0 14px;
          }
          .btn-gen-primary {
            background: #6B21E8;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 12px 24px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s;
          }
          .btn-gen-primary:hover:not(:disabled) { background: #5b1dc4; }
          .btn-gen-primary:disabled { opacity: 0.6; cursor: not-allowed; }
          .atm-error {
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 8px;
            padding: 10px 14px;
            color: #dc2626;
            font-size: 0.85rem;
            margin-top: 14px;
          }
        `}</style>
      </div>
    </div>
  );
}
