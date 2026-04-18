"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ReportButton from "@/components/reports/ReportButton";

// ============================================
// INTERFACES
// ============================================

interface ClientOption {
  id: string;
  firstName: string;
  lastName: string | null;
  documentId: string;
}

interface PaymentOption {
  id: string;
  paymentDate: string;
  totalAmount: string;
  capitalApplied: string;
  interestApplied: string;
  lateFeeApplied: string;
  type: string;
  loan: {
    id: string;
    principalAmount: string;
    paymentFrequency: string;
    remainingCapital: string;
    status: string;
  };
}

// ============================================
// CONSTANTS
// ============================================

const TYPE_LABELS: Record<string, string> = {
  REGULAR: "Regular",
  CAPITAL_PAYMENT: "Abono a Capital",
  FULL_SETTLEMENT: "Liquidación Total",
  ADVANCE: "Adelanto",
};

const FREQ_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
};

// ============================================
// PAGE
// ============================================

export default function ReciboPagoPage() {
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Selection state
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [payments, setPayments] = useState<PaymentOption[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentOption | null>(null);

  // Search clients
  const searchClients = useCallback(async (query: string) => {
    if (query.length < 2) {
      setClients([]);
      setShowDropdown(false);
      return;
    }

    setSearchLoading(true);
    try {
      const res = await fetch(`/api/clients/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setClients(data);
        setShowDropdown(true);
      }
    } catch {
      console.error("Error searching clients");
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        searchClients(searchQuery);
      } else {
        setClients([]);
        setShowDropdown(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchClients]);

  // Fetch payments for selected client
  useEffect(() => {
    if (!selectedClient) {
      setPayments([]);
      setSelectedPayment(null);
      return;
    }

    async function fetchPayments() {
      setPaymentsLoading(true);
      try {
        // Get all loans for client, then get payments
        const loansRes = await fetch(`/api/clients/${selectedClient!.id}/loans?limit=100`);
        if (!loansRes.ok) return;
        const loansResponse = await loansRes.json();
        const loansData = loansResponse.data || loansResponse;

        const allPayments: PaymentOption[] = [];
        for (const loan of loansData) {
          const paymentsRes = await fetch(`/api/loans/${loan.id}/payments`);
          if (paymentsRes.ok) {
            const paymentsData = await paymentsRes.json();
            const mapped = (Array.isArray(paymentsData) ? paymentsData : paymentsData.data || []).map(
              (p: any) => ({
                ...p,
                loan: {
                  id: loan.id,
                  principalAmount: loan.principalAmount,
                  paymentFrequency: loan.paymentFrequency,
                  remainingCapital: loan.remainingCapital,
                  status: loan.status,
                },
              })
            );
            allPayments.push(...mapped);
          }
        }

        // Sort by date desc
        allPayments.sort(
          (a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
        );
        setPayments(allPayments);
      } catch {
        console.error("Error fetching payments");
      } finally {
        setPaymentsLoading(false);
      }
    }

    fetchPayments();
  }, [selectedClient]);

  function handleSelectClient(client: ClientOption) {
    setSelectedClient(client);
    setSearchQuery(`${client.firstName} ${client.lastName ?? ""}`.trim());
    setShowDropdown(false);
    setSelectedPayment(null);
  }

  function handleClearSelection() {
    setSelectedClient(null);
    setSelectedPayment(null);
    setSearchQuery("");
    setPayments([]);
  }

  const fmt = (n: number) =>
    n.toLocaleString("es-DO", { minimumFractionDigits: 2 });
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("es-DO", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <div>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link href="/dashboard/reportes" className="breadcrumb-link">
          Reportes
        </Link>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="breadcrumb-current">Recibo de Pago</span>
      </div>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Recibo de Pago</h1>
          <p className="page-subtitle">
            Busca un cliente y selecciona un pago para generar el recibo PDF
          </p>
        </div>
      </div>

      {/* Step 1: Search Client */}
      <div className="card">
        <div className="step-header">
          <span className="step-number">1</span>
          <h2 className="step-title">Buscar Cliente</h2>
        </div>

        <div className="search-container">
          <div className="search-input-wrapper">
            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="Buscar por nombre o cédula..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (selectedClient) {
                  setSelectedClient(null);
                  setPayments([]);
                  setSelectedPayment(null);
                }
              }}
              onFocus={() => {
                if (clients.length > 0 && !selectedClient) setShowDropdown(true);
              }}
            />
            {(searchQuery || selectedClient) && (
              <button className="search-clear" onClick={handleClearSelection}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Dropdown */}
          {showDropdown && !selectedClient && (
            <div className="search-dropdown">
              {searchLoading ? (
                <div className="dropdown-empty">Buscando...</div>
              ) : clients.length === 0 ? (
                <div className="dropdown-empty">No se encontraron clientes</div>
              ) : (
                clients.map((client) => (
                  <div
                    key={client.id}
                    className="dropdown-item"
                    onClick={() => handleSelectClient(client)}
                  >
                    <div className="dropdown-avatar">
                      {client.firstName[0]}
                      {client.lastName?.[0] ?? ""}
                    </div>
                    <div>
                      <span className="dropdown-name">
                        {client.firstName} {client.lastName ?? ""}
                      </span>
                      <span className="dropdown-doc">{client.documentId}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {selectedClient && (
          <div className="selected-client-info">
            <div className="selected-avatar">
              {selectedClient.firstName[0]}
              {selectedClient.lastName?.[0] ?? ""}
            </div>
            <div>
              <span className="selected-name">
                {selectedClient.firstName} {selectedClient.lastName ?? ""}
              </span>
              <span className="selected-doc">{selectedClient.documentId}</span>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Select Payment */}
      {selectedClient && (
        <div className="card">
          <div className="step-header">
            <span className="step-number">2</span>
            <h2 className="step-title">Seleccionar Pago</h2>
          </div>

          {paymentsLoading ? (
            <div className="loading-text">Cargando pagos...</div>
          ) : payments.length === 0 ? (
            <div className="empty-text">Este cliente no tiene pagos registrados</div>
          ) : (
            <div className="payments-list">
              {payments.map((payment) => {
                const isSelected = selectedPayment?.id === payment.id;
                const isNegative = Number(payment.totalAmount) < 0;

                return (
                  <div
                    key={payment.id}
                    className={`payment-item ${isSelected ? "payment-item--selected" : ""}`}
                    onClick={() => setSelectedPayment(payment)}
                  >
                    <div className="payment-item-left">
                      <div className="payment-item-radio">
                        {isSelected && <div className="payment-item-radio-dot" />}
                      </div>
                      <div>
                        <span className={`payment-item-amount ${isNegative ? "negative" : ""}`}>
                          {isNegative ? "−" : ""}RD$ {fmt(Math.abs(Number(payment.totalAmount)))}
                        </span>
                        <span className="payment-item-date">{fmtDate(payment.paymentDate)}</span>
                      </div>
                    </div>
                    <div className="payment-item-right">
                      <span className="payment-item-type">
                        {TYPE_LABELS[payment.type] ?? payment.type}
                      </span>
                      <span className="payment-item-freq">
                        {FREQ_LABELS[payment.loan.paymentFrequency] ?? payment.loan.paymentFrequency}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Preview & Generate */}
      {selectedPayment && (
        <div className="card">
          <div className="step-header">
            <span className="step-number">3</span>
            <h2 className="step-title">Generar Recibo</h2>
          </div>

          {/* Payment summary */}
          <div className="summary-grid">
            <div className="summary-item">
              <span className="summary-label">Cliente</span>
              <span className="summary-value">
                {selectedClient!.firstName} {selectedClient!.lastName ?? ""}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Documento</span>
              <span className="summary-value">{selectedClient!.documentId}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Monto del pago</span>
              <span className="summary-value">
                RD$ {fmt(Math.abs(Number(selectedPayment.totalAmount)))}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Fecha de pago</span>
              <span className="summary-value">{fmtDate(selectedPayment.paymentDate)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Capital aplicado</span>
              <span className="summary-value">
                RD$ {fmt(Math.abs(Number(selectedPayment.capitalApplied)))}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Interés aplicado</span>
              <span className="summary-value">
                RD$ {fmt(Math.abs(Number(selectedPayment.interestApplied)))}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Mora aplicada</span>
              <span className="summary-value">
                {Number(selectedPayment.lateFeeApplied) > 0
                  ? `RD$ ${fmt(Number(selectedPayment.lateFeeApplied))}`
                  : "—"}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Tipo de pago</span>
              <span className="summary-value">
                {TYPE_LABELS[selectedPayment.type] ?? selectedPayment.type}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="action-buttons">
            <ReportButton
              type="recibo-pago"
              entityId={selectedPayment.id}
              label="Ver Recibo PDF"
              variant="primary"
              size="lg"
              mode="preview"
            />
            <ReportButton
              type="recibo-pago"
              entityId={selectedPayment.id}
              label="Descargar PDF"
              variant="outline"
              size="lg"
              mode="download"
            />
          </div>
        </div>
      )}

      <style jsx>{`
        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 20px;
          font-size: 0.85rem;
        }
        .breadcrumb-current {
          color: #6b7280;
        }

        .page-header {
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

        .card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 16px;
        }

        .step-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }
        .step-number {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #2563eb;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          font-weight: 700;
          flex-shrink: 0;
        }
        .step-title {
          font-size: 1rem;
          font-weight: 700;
          color: #111827;
        }

        /* Search */
        .search-container {
          position: relative;
        }
        .search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .search-icon {
          position: absolute;
          left: 12px;
          pointer-events: none;
        }
        .search-input {
          width: 100%;
          height: 44px;
          padding: 0 40px 0 40px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          font-size: 0.9rem;
          outline: none;
          transition: border-color 0.15s;
          background: white;
          color: #111827;
        }
        .search-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
        .search-input::placeholder {
          color: #9ca3af;
        }
        .search-clear {
          position: absolute;
          right: 10px;
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 4px;
          display: flex;
        }
        .search-clear:hover {
          color: #374151;
        }

        /* Dropdown */
        .search-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          margin-top: 4px;
          max-height: 240px;
          overflow-y: auto;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
          z-index: 20;
        }
        .dropdown-empty {
          padding: 16px;
          text-align: center;
          color: #9ca3af;
          font-size: 0.85rem;
        }
        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          cursor: pointer;
          transition: background 0.1s;
        }
        .dropdown-item:hover {
          background: #f9fafb;
        }
        .dropdown-avatar {
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
        .dropdown-name {
          display: block;
          font-size: 0.85rem;
          font-weight: 500;
          color: #111827;
        }
        .dropdown-doc {
          display: block;
          font-size: 0.75rem;
          color: #9ca3af;
          font-family: monospace;
        }

        /* Selected client */
        .selected-client-info {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 14px;
          padding: 12px;
          background: #eff6ff;
          border-radius: 10px;
          border: 1px solid #dbeafe;
        }
        .selected-avatar {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: #2563eb;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 700;
          flex-shrink: 0;
        }
        .selected-name {
          display: block;
          font-size: 0.9rem;
          font-weight: 600;
          color: #111827;
        }
        .selected-doc {
          display: block;
          font-size: 0.75rem;
          color: #6b7280;
          font-family: monospace;
        }

        /* Payments list */
        .loading-text,
        .empty-text {
          padding: 20px 0;
          text-align: center;
          color: #9ca3af;
          font-size: 0.85rem;
        }
        .payments-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 320px;
          overflow-y: auto;
        }
        .payment-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 14px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .payment-item:hover {
          border-color: #2563eb;
          background: #fafbff;
        }
        .payment-item--selected {
          border-color: #2563eb;
          background: #eff6ff;
        }
        .payment-item-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .payment-item-radio {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid #d1d5db;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .payment-item--selected .payment-item-radio {
          border-color: #2563eb;
        }
        .payment-item-radio-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #2563eb;
        }
        .payment-item-amount {
          display: block;
          font-size: 0.9rem;
          font-weight: 600;
          color: #111827;
        }
        .payment-item-amount.negative {
          color: #dc2626;
        }
        .payment-item-date {
          display: block;
          font-size: 0.75rem;
          color: #9ca3af;
        }
        .payment-item-right {
          text-align: right;
        }
        .payment-item-type {
          display: block;
          font-size: 0.8rem;
          font-weight: 500;
          color: #374151;
        }
        .payment-item-freq {
          display: block;
          font-size: 0.7rem;
          color: #9ca3af;
        }

        /* Summary grid */
        .summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 20px;
        }
        .summary-item {
          padding: 10px 14px;
          background: #f9fafb;
          border-radius: 8px;
        }
        .summary-label {
          display: block;
          font-size: 0.7rem;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 2px;
        }
        .summary-value {
          display: block;
          font-size: 0.9rem;
          font-weight: 600;
          color: #111827;
        }

        /* Action buttons */
        .action-buttons {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        @media (max-width: 640px) {
          .summary-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <style jsx global>{`
        .breadcrumb-link {
          color: #2563eb;
          text-decoration: none;
        }
        .breadcrumb-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
