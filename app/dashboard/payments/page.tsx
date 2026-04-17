"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import CreatePaymentModal from "@/components/payments/CreatePaymentModal";
import ReportButton from "@/components/reports/ReportButton";

// ============================================
// INTERFACES
// ============================================

interface PaymentClient {
  id: string;
  firstName: string;
  lastName: string | null;
  documentId: string;
}

interface PaymentLoan {
  id: string;
  client: PaymentClient;
}

interface PaymentUser {
  id: string;
  firstName: string;
  lastName: string;
}

interface Payment {
  id: string;
  loanId: string;
  paymentDate: string;
  totalAmount: string;
  capitalApplied: string;
  interestApplied: string;
  lateFeeApplied: string;
  type: string;
  createdAt: string;
  loan: PaymentLoan;
  createdBy: PaymentUser;
}

interface PaginatedPayments {
  data: Payment[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ============================================
// CONSTANTS
// ============================================

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  REGULAR: { bg: "#dbeafe", color: "#2563eb" },
  CAPITAL_PAYMENT: { bg: "#fef3c7", color: "#d97706" },
  FULL_SETTLEMENT: { bg: "#d1fae5", color: "#059669" },
};

const TYPE_LABELS: Record<string, string> = {
  REGULAR: "Regular",
  CAPITAL_PAYMENT: "Abono Capital",
  FULL_SETTLEMENT: "Liquidación",
};

const TYPE_FILTERS = [
  { value: "", label: "Todos" },
  { value: "REGULAR", label: "Regular" },
  { value: "CAPITAL_PAYMENT", label: "Abono Capital" },
  { value: "FULL_SETTLEMENT", label: "Liquidación" },
];

// ============================================
// PAGE
// ============================================

export default function PaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<PaginatedPayments | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }

  const hasFilters = typeFilter || dateFrom || dateTo;

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "15" });
      if (typeFilter) params.set("type", typeFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/payments?${params}`);

      if (!res.ok) throw new Error("Error al cargar los pagos");

      const data = await res.json();
      setPayments(data);
    } catch (error) {
      console.error("Error fetching payments:", error);
      setPayments({
        data: [],
        pagination: { total: 0, page: 1, limit: 15, totalPages: 0, hasNext: false, hasPrev: false },
      });
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  function clearFilters() {
    setTypeFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  const fmt = (n: number) => n.toLocaleString("es-DO", { minimumFractionDigits: 2 });

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Pagos</h1>
          <p className="page-subtitle">
            {payments?.pagination.total ?? 0} pagos registrados
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Registrar Pago
        </button>
      </div>

      {/* Filter chips (tipo) */}
      <div className="filter-chips">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            className={`filter-chip ${typeFilter === f.value ? "active" : ""}`}
            onClick={() => { setTypeFilter(f.value); setPage(1); }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Date filters */}
      <div className="date-filters">
        <div className="date-filter-group">
          <label className="date-label">Desde</label>
          <input
            type="date"
            className="date-input"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
        </div>
        <div className="date-filter-group">
          <label className="date-label">Hasta</label>
          <input
            type="date"
            className="date-input"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
        </div>
        {hasFilters && (
          <button className="clear-filters-btn" onClick={clearFilters}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Monto</th>
              <th>Capital</th>
              <th>Interés</th>
              <th>Mora</th>
              <th>Tipo</th>
              <th>Fecha</th>
              <th>Registrado por</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="table-empty">Cargando...</td></tr>
            ) : !payments?.data.length ? (
              <tr><td colSpan={9} className="table-empty">
                <div className="empty-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                </div>
                {hasFilters ? "No se encontraron pagos con los filtros aplicados" : "No hay pagos registrados"}
              </td></tr>
            ) : (
              payments.data.map((payment) => {
                const tc = TYPE_COLORS[payment.type] || TYPE_COLORS.REGULAR;
                const clientName = `${payment.loan.client.firstName} ${payment.loan.client.lastName ?? ""}`.trim();
                const isNegative = Number(payment.totalAmount) < 0;

                return (
                  <tr
                    key={payment.id}
                    className="table-row"
                    onClick={() => router.push(`/dashboard/payments/${payment.id}`)}
                  >
                    <td>
                      <div className="client-name">
                        <div className="client-avatar">
                          {payment.loan.client.firstName[0]}{payment.loan.client.lastName?.[0] ?? ""}
                        </div>
                        <div>
                          <span className="client-label">{clientName}</span>
                          <span className="client-doc">{payment.loan.client.documentId}</span>
                        </div>
                      </div>
                    </td>
                    <td className="td-bold">
                      RD$ {fmt(Math.abs(Number(payment.totalAmount)))}
                    </td>
                    <td>RD$ {fmt(Math.abs(Number(payment.capitalApplied)))}</td>
                    <td>RD$ {fmt(Math.abs(Number(payment.interestApplied)))}</td>
                    <td>
                      {Number(payment.lateFeeApplied) !== 0
                        ? `RD$ ${fmt(Math.abs(Number(payment.lateFeeApplied)))}`
                        : "—"}
                    </td>
                    <td>
                      <span className="type-badge" style={{ background: tc.bg, color: tc.color }}>
                        {isNegative ? "Reversión" : (TYPE_LABELS[payment.type] ?? payment.type)}
                      </span>
                    </td>
                    <td className="td-secondary">
                      {new Date(payment.paymentDate).toLocaleDateString("es-DO")}
                    </td>
                    <td className="td-secondary">
                      {payment.createdBy
                        ? `${payment.createdBy.firstName} ${payment.createdBy.lastName}`
                        : "—"}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span onClick={(e) => e.stopPropagation()}>
                          <ReportButton
                            type="recibo-pago"
                            entityId={payment.id}
                            variant="icon"
                            mode="preview"
                          />
                        </span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {payments && payments.pagination.totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            disabled={!payments.pagination.hasPrev}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </button>
          <span className="pagination-info">
            Página {payments.pagination.page} de {payments.pagination.totalPages}
          </span>
          <button
            className="pagination-btn"
            disabled={!payments.pagination.hasNext}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
        </div>
      )}

      {showModal && (
        <CreatePaymentModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            fetchPayments();
            showToast("Pago registrado exitosamente");
          }}
        />
      )}

      {toast && (
        <div className="toast-success" role="alert" aria-live="polite">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {toast}
        </div>
      )}

      <style jsx>{`
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
        }
        .page-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.02em;
        }
        .page-subtitle {
          font-size: 0.85rem;
          color: #6b7280;
          margin-top: 2px;
        }
        .btn-primary {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 10px;
          padding: 10px 20px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
          flex-shrink: 0;
        }
        .btn-primary:hover {
          background: #1d4ed8;
        }

        .filter-chips {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .filter-chip {
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
          border: 1px solid #e5e7eb;
          background: white;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.15s;
        }
        .filter-chip:hover {
          border-color: #2563eb;
          color: #2563eb;
        }
        .filter-chip.active {
          background: #2563eb;
          color: white;
          border-color: #2563eb;
        }

        .date-filters {
          display: flex;
          align-items: flex-end;
          gap: 12px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .date-filter-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .date-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
        }
        .date-input {
          height: 40px;
          padding: 0 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 0.85rem;
          background: white;
          outline: none;
          transition: border-color 0.15s;
          color: #374151;
        }
        .date-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
        }
        .clear-filters-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: white;
          font-size: 0.8rem;
          font-weight: 500;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.15s;
          height: 40px;
        }
        .clear-filters-btn:hover {
          border-color: #dc2626;
          color: #dc2626;
          background: #fef2f2;
        }

        .table-container {
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          overflow-x: auto;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
          min-width: 900px;
        }
        .table thead {
          background: #f9fafb;
        }
        .table th {
          text-align: left;
          padding: 12px 16px;
          font-weight: 600;
          color: #6b7280;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border-bottom: 1px solid #e5e7eb;
          white-space: nowrap;
        }
        .table td {
          padding: 12px 16px;
          color: #374151;
          border-bottom: 1px solid #f3f4f6;
          white-space: nowrap;
        }
        .table-row {
          cursor: pointer;
          transition: background 0.1s;
        }
        .table-row:hover {
          background: #f9fafb;
        }
        .table-empty {
          text-align: center;
          padding: 40px 16px !important;
          color: #9ca3af;
        }
        .empty-icon {
          margin-bottom: 12px;
        }

        .client-name {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .client-avatar {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: #dbeafe;
          color: #2563eb;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          font-weight: 700;
          flex-shrink: 0;
        }
        .client-label {
          display: block;
          font-weight: 500;
          color: #111827;
        }
        .client-doc {
          display: block;
          font-size: 0.75rem;
          color: #9ca3af;
          font-family: monospace;
        }

        .td-bold {
          font-weight: 600;
        }
        .td-secondary {
          color: #9ca3af;
        }

        .type-badge {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 12px;
          white-space: nowrap;
        }

        .pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-top: 16px;
        }
        .pagination-btn {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 0.85rem;
          color: #374151;
          cursor: pointer;
          transition: all 0.15s;
        }
        .pagination-btn:hover:not(:disabled) {
          border-color: #2563eb;
          color: #2563eb;
        }
        .pagination-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .pagination-info {
          font-size: 0.825rem;
          color: #6b7280;
        }

        .toast-success {
          position: fixed;
          top: 24px;
          right: 24px;
          background: #059669;
          color: white;
          padding: 12px 18px;
          border-radius: 10px;
          font-size: 0.875rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 20px rgba(5, 150, 105, 0.35);
          z-index: 100;
          animation: slideIn 0.2s ease;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
