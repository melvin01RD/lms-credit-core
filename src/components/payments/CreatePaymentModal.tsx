"use client";

import { useState, useEffect } from "react";

interface Loan {
  id: string;
  client: {
    firstName: string;
    lastName: string | null;
    documentId: string;
  };
  remainingCapital: string;
  installmentAmount: string;
}

interface CreatePaymentModalProps {
  onClose: () => void;
  onCreated: () => void;
  preselectedLoanId?: string;
}

export default function CreatePaymentModal({ onClose, onCreated, preselectedLoanId }: CreatePaymentModalProps) {
  const [form, setForm] = useState({
    loanId: preselectedLoanId || "",
    totalAmount: "",
    paymentDate: new Date().toISOString().split("T")[0],
    type: "REGULAR",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [loans, setLoans] = useState<Loan[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Obtener usuario actual
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) setUserId(data.user.userId);
      });
  }, []);

  // Buscar préstamos
  useEffect(() => {
    if (searchTerm.length < 2) {
      setLoans([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/loans?search=${encodeURIComponent(searchTerm)}&status=ACTIVE,OVERDUE&limit=10`);
        const data = await res.json();
        setLoans(data.data || []);
      } catch (err) {
        console.error("Error buscando préstamos:", err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Si hay préstamo preseleccionado, cargarlo
  useEffect(() => {
    if (preselectedLoanId) {
      fetch(`/api/loans/${preselectedLoanId}`)
        .then((res) => res.json())
        .then((loan) => {
          setSelectedLoan(loan);
          setSearchTerm(`${loan.client.firstName} ${loan.client.lastName || ""} - ${loan.client.documentId}`);
        })
        .catch((err) => console.error("Error cargando préstamo:", err));
    }
  }, [preselectedLoanId]);

  function selectLoan(loan: Loan) {
    setSelectedLoan(loan);
    setForm({ ...form, loanId: loan.id });
    setSearchTerm(`${loan.client.firstName} ${loan.client.lastName || ""} - ${loan.client.documentId}`);
    setLoans([]);
  }

  function validateFields(): boolean {
    const errors: Record<string, string> = {};

    if (!form.loanId) {
      errors.loan = "Debes seleccionar un préstamo activo.";
    }

    const amount = Number(form.totalAmount);
    if (!form.totalAmount || isNaN(amount) || amount <= 0) {
      errors.totalAmount = "El monto debe ser mayor a cero.";
    }

    if (!form.paymentDate) {
      errors.paymentDate = "La fecha de pago es requerida.";
    }

    if (form.type === "CAPITAL_PAYMENT" && selectedLoan) {
      if (Number(selectedLoan.remainingCapital) <= 0) {
        errors.type = "Este préstamo no tiene capital pendiente para abonar.";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!validateFields()) return;

    if (!userId) {
      setError("No se pudo obtener el usuario actual");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanId: form.loanId,
          totalAmount: Number(form.totalAmount),
          paymentDate: form.paymentDate,
          type: form.type,
          createdById: userId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? "Error al registrar el pago");
        return;
      }

      onCreated();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Registrar Pago</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Búsqueda de préstamo */}
          <div className="form-group">
            <label className="form-label" htmlFor="loanSearch">Préstamo *</label>
            <div className="search-container">
              <input
                id="loanSearch"
                className="form-input"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (!preselectedLoanId) {
                    setSelectedLoan(null);
                    setForm({ ...form, loanId: "" });
                  }
                }}
                placeholder="Buscar por nombre o documento del cliente..."
                disabled={!!preselectedLoanId}
                autoFocus={!preselectedLoanId}
              />
              {searching && <span className="search-loading">Buscando...</span>}
              {loans.length > 0 && (
                <div className="search-results">
                  {loans.map((loan) => (
                    <div
                      key={loan.id}
                      className="search-result-item"
                      onClick={() => selectLoan(loan)}
                    >
                      <div className="result-name">
                        {loan.client.firstName} {loan.client.lastName ?? ""}
                      </div>
                      <div className="result-doc">{loan.client.documentId}</div>
                      <div className="result-balance">
                        Balance: RD$ {Number(loan.remainingCapital).toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {fieldErrors.loan && (
              <span className="field-error" role="alert">{fieldErrors.loan}</span>
            )}
          </div>

          {/* Información del préstamo seleccionado */}
          {selectedLoan && (
            <div className="loan-info">
              <div className="info-row">
                <span className="info-label">Cliente:</span>
                <span className="info-value">
                  {selectedLoan.client.firstName} {selectedLoan.client.lastName ?? ""}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Saldo pendiente:</span>
                <span className="info-value info-value-amount">
                  RD$ {Number(selectedLoan.remainingCapital).toLocaleString("es-DO", {
                    minimumFractionDigits: 2
                  })}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Cuota:</span>
                <span className="info-value">
                  RD$ {Number(selectedLoan.installmentAmount).toLocaleString("es-DO", {
                    minimumFractionDigits: 2
                  })}
                </span>
              </div>
            </div>
          )}

          {/* Monto */}
          <div className="form-group">
            <label className="form-label" htmlFor="totalAmount">Monto del pago *</label>
            <div className="amount-input-container">
              <span className="currency-symbol">RD$</span>
              <input
                id="totalAmount"
                className="form-input-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.totalAmount}
                onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            {selectedLoan && form.totalAmount && Number(form.totalAmount) > Number(selectedLoan.remainingCapital) && (
              <small className="warning-note">
                El monto excede el saldo pendiente
              </small>
            )}
            {fieldErrors.totalAmount && (
              <span className="field-error" role="alert">{fieldErrors.totalAmount}</span>
            )}
          </div>

          {/* Fecha y Tipo */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="paymentDate">Fecha de pago *</label>
              <input
                id="paymentDate"
                className="form-input"
                type="date"
                value={form.paymentDate}
                onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                required
                max={new Date().toISOString().split("T")[0]}
              />
              {fieldErrors.paymentDate && (
                <span className="field-error" role="alert">{fieldErrors.paymentDate}</span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="paymentType">Tipo de pago</label>
              <select
                id="paymentType"
                className="form-input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="REGULAR">Regular</option>
                <option value="CAPITAL_PAYMENT">Abono a Capital</option>
                <option value="FULL_SETTLEMENT">Liquidación Total</option>
              </select>
              {fieldErrors.type && (
                <span className="field-error" role="alert">{fieldErrors.type}</span>
              )}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={
                saving ||
                !form.loanId ||
                (!!selectedLoan && !!form.totalAmount && Number(form.totalAmount) > Number(selectedLoan.remainingCapital))
              }
            >
              {saving ? "Registrando..." : "Registrar Pago"}
            </button>
          </div>
        </form>

        <style jsx>{`
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.4);
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
            max-width: 560px;
            padding: 24px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
            max-height: 90vh;
            overflow-y: auto;
          }
          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
          }
          .modal-title {
            font-size: 1.2rem;
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
          .modal-close:hover {
            color: #374151;
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

          .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 12px;
          }
          .form-group {
            display: flex;
            flex-direction: column;
            margin-bottom: 12px;
          }
          .form-label {
            font-size: 0.8rem;
            font-weight: 600;
            color: #374151;
            margin-bottom: 4px;
          }
          .form-input {
            height: 40px;
            padding: 0 12px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            font-size: 0.875rem;
            outline: none;
            transition: border-color 0.15s;
          }
          .form-input:focus {
            border-color: #2563eb;
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
          }
          .form-input:disabled {
            background: #f9fafb;
            cursor: not-allowed;
          }

          .search-container {
            position: relative;
          }
          .search-loading {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 0.75rem;
            color: #9ca3af;
          }
          .search-results {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            margin-top: 4px;
            max-height: 200px;
            overflow-y: auto;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            z-index: 10;
          }
          .search-result-item {
            padding: 10px 12px;
            cursor: pointer;
            border-bottom: 1px solid #f3f4f6;
            transition: background 0.1s;
          }
          .search-result-item:hover {
            background: #f9fafb;
          }
          .search-result-item:last-child {
            border-bottom: none;
          }
          .result-name {
            font-size: 0.875rem;
            font-weight: 600;
            color: #111827;
          }
          .result-doc {
            font-size: 0.75rem;
            color: #6b7280;
            font-family: monospace;
            margin-top: 2px;
          }
          .result-balance {
            font-size: 0.75rem;
            color: #2563eb;
            font-weight: 500;
            margin-top: 2px;
          }

          .loan-info {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 16px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
          }
          .info-row:last-child {
            margin-bottom: 0;
          }
          .info-label {
            font-size: 0.8rem;
            color: #6b7280;
          }
          .info-value {
            font-size: 0.8rem;
            font-weight: 600;
            color: #111827;
          }
          .info-value-amount {
            color: #059669;
          }

          .amount-input-container {
            position: relative;
            display: flex;
            align-items: center;
          }
          .currency-symbol {
            position: absolute;
            left: 12px;
            font-size: 0.875rem;
            color: #6b7280;
            font-weight: 600;
          }
          .form-input-amount {
            height: 40px;
            width: 100%;
            padding: 0 12px 0 48px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            font-size: 0.875rem;
            outline: none;
            transition: border-color 0.15s;
          }
          .form-input-amount:focus {
            border-color: #2563eb;
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
          }
          .warning-note {
            display: block;
            margin-top: 4px;
            font-size: 0.75rem;
            color: #d97706;
          }

          .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 20px;
            padding-top: 16px;
            border-top: 1px solid #f3f4f6;
          }
          .btn-primary {
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px 20px;
            font-size: 0.875rem;
            font-weight: 600;
            cursor: pointer;
          }
          .btn-primary:hover:not(:disabled) {
            background: #1d4ed8;
          }
          .btn-primary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
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
          .btn-secondary:hover {
            background: #f9fafb;
          }

          .field-error {
            font-size: 0.75rem;
            color: #dc2626;
            margin-top: 3px;
            display: block;
            line-height: 1.3;
          }

          @media (max-width: 500px) {
            .form-row {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
