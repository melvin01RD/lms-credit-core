"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ============================================
// TYPES
// ============================================

interface LoanClient {
  id: string;
  firstName: string;
  lastName: string | null;
  documentId: string;
}

interface Loan {
  id: string;
  loanStructure: string;
  principalAmount: string;
  totalFinanceCharge: string | null;
  paymentFrequency: string;
  termCount: number;
  installmentAmount: string;
  remainingCapital: string;
  status: string;
  nextDueDate: string | null;
  createdAt: string;
  client: LoanClient;
}

interface PaginatedLoans {
  data: Loan[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

interface LoanProduct {
  id: string;
  name: string;
  defaultRate: string;
  paymentFrequency: string;
  termCount: number;
}

// ============================================
// CONSTANTS
// ============================================

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "Todos", value: "" },
  { label: "Activos", value: "ACTIVE" },
  { label: "En mora", value: "OVERDUE" },
  { label: "Pagados", value: "PAID" },
  { label: "Cancelados", value: "CANCELED" },
];

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  DRAFT: { bg: "#fef9c3", color: "#a16207" },
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
  DAILY: "Diaria",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
};

// ============================================
// PAGE
// ============================================

export default function LoansPage() {
  const router = useRouter();
  const [loans, setLoans] = useState<PaginatedLoans | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "15" });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/loans?${params}`);

      if (!res.ok) throw new Error("Error al cargar los préstamos");

      const data = await res.json();
      setLoans(data);
    } catch (error) {
      console.error("Error fetching loans:", error);
      setLoans({
        data: [],
        pagination: { total: 0, page: 1, limit: 15, totalPages: 0, hasNext: false, hasPrev: false },
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(fetchLoans, search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchLoans, search]);

  const fmt = (n: number) => n.toLocaleString("es-DO", { minimumFractionDigits: 2 });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Préstamos</h1>
          <p className="page-subtitle">
            {loans?.pagination.total ?? 0} préstamos registrados
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nuevo Préstamo
        </button>
      </div>

      {/* Status filter chips */}
      <div className="filter-chips">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            className={`filter-chip ${statusFilter === f.value ? "active" : ""}`}
            onClick={() => { setStatusFilter(f.value); setPage(1); }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="search-bar">
        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          className="search-input"
          placeholder="Buscar por nombre o documento del cliente..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch("")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
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
              <th>Tipo / Tasa</th>
              <th>Frecuencia</th>
              <th>Cuota</th>
              <th>Pendiente</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="table-empty">Cargando...</td></tr>
            ) : !loans?.data.length ? (
              <tr><td colSpan={9} className="table-empty">
                {search || statusFilter ? "No se encontraron resultados" : "No hay préstamos registrados"}
              </td></tr>
            ) : (
              loans.data.map((loan) => {
                const sc = STATUS_COLORS[loan.status] || STATUS_COLORS.CANCELED;
                const clientName = `${loan.client.firstName} ${loan.client.lastName ?? ""}`.trim();
                return (
                  <tr
                    key={loan.id}
                    className="table-row"
                    onClick={() => router.push(`/dashboard/prestamos/${loan.id}`)}
                  >
                    <td>
                      <div className="client-name">
                        <div className="client-avatar">
                          {loan.client.firstName[0]}{loan.client.lastName?.[0] ?? ""}
                        </div>
                        <div>
                          <span className="client-label">{clientName}</span>
                          <span className="client-doc">{loan.client.documentId}</span>
                        </div>
                      </div>
                    </td>
                    <td className="td-bold">RD$ {fmt(Number(loan.principalAmount))}</td>
                    <td>
                      <span className="badge-flat">Cargo Fijo</span>
                    </td>
                    <td>{FREQUENCY_LABELS[loan.paymentFrequency] ?? loan.paymentFrequency}</td>
                    <td>RD$ {fmt(Number(loan.installmentAmount))}</td>
                    <td>RD$ {fmt(Number(loan.remainingCapital))}</td>
                    <td>
                      <span className="status-badge" style={{ background: sc.bg, color: sc.color }}>
                        {STATUS_LABELS[loan.status] ?? loan.status}
                      </span>
                    </td>
                    <td className="td-secondary">
                      {new Date(loan.createdAt).toLocaleDateString("es-DO")}
                    </td>
                    <td>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {loans && loans.pagination.totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            disabled={!loans.pagination.hasPrev}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </button>
          <span className="pagination-info">
            Página {loans.pagination.page} de {loans.pagination.totalPages}
          </span>
          <button
            className="pagination-btn"
            disabled={!loans.pagination.hasNext}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
        </div>
      )}

      {/* Modal crear préstamo */}
      {showModal && (
        <CreateLoanModal
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); fetchLoans(); showToast("Préstamo creado exitosamente"); }}
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
          border-radius: 8px;
          padding: 10px 18px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
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

        .search-bar {
          position: relative;
          margin-bottom: 16px;
        }
        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
        }
        .search-input {
          width: 100%;
          height: 44px;
          padding: 0 40px 0 44px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          font-size: 0.9rem;
          background: white;
          outline: none;
          transition: border-color 0.15s;
        }
        .search-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
        }
        .search-clear {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 4px;
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
          min-width: 800px;
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

        .status-badge {
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

        .badge-flat {
          font-size: 0.7rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 10px;
          background: #f3f4f6;
          color: #6b7280;
          white-space: nowrap;
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
        @media (max-width: 768px) {
          .table { min-width: 100%; }
        }
      `}</style>
    </div>
  );
}

// ============================================
// MODAL: Crear Préstamo
// ============================================

interface SearchClient {
  id: string;
  firstName: string;
  lastName: string | null;
  documentId: string;
  phone: string;
}

function CreateLoanModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState<SearchClient[]>([]);
  const [selectedClient, setSelectedClient] = useState<SearchClient | null>(null);
  const [searchingClients, setSearchingClients] = useState(false);

  const [products, setProducts] = useState<LoanProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");

  const [form, setForm] = useState({
    principalAmount: "",
    totalFinanceCharge: "",
    paymentFrequency: "WEEKLY",
    termCount: "",
    guarantees: "",
  });

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Fetch active loan products
  useEffect(() => {
    fetch("/api/loan-products")
      .then((r) => r.ok ? r.json() : [])
      .then(setProducts)
      .catch(() => {});
  }, []);

  // Search clients with debounce
  useEffect(() => {
    if (clientSearch.length < 2) {
      setClientResults([]);
      return;
    }

    setSearchingClients(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients/search?q=${encodeURIComponent(clientSearch)}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setClientResults(data);
        }
      } catch {
        // ignore
      } finally {
        setSearchingClients(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [clientSearch]);

  function updateField(field: string, value: string) {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      // When principal changes and a product is selected, auto-calc charge
      if (field === "principalAmount" && selectedProductId) {
        const product = products.find((p) => p.id === selectedProductId);
        if (product) {
          const principal = parseFloat(value);
          updated.totalFinanceCharge =
            !isNaN(principal) && principal > 0
              ? String((principal * Number(product.defaultRate) / 100).toFixed(2))
              : "";
        }
      }
      return updated;
    });
  }

  function handleProductSelect(productId: string) {
    setSelectedProductId(productId);
    if (!productId) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const principal = parseFloat(form.principalAmount);
    const charge =
      !isNaN(principal) && principal > 0
        ? String((principal * Number(product.defaultRate) / 100).toFixed(2))
        : form.totalFinanceCharge;
    setForm((prev) => ({
      ...prev,
      paymentFrequency: product.paymentFrequency,
      termCount: String(product.termCount),
      totalFinanceCharge: charge,
    }));
  }

  // Calculate estimated installment (client-side preview)
  const estimatedInstallment = (() => {
    const P = parseFloat(form.principalAmount);
    const n = parseInt(form.termCount);
    if (!P || !n || P <= 0 || n <= 0) return null;

    const charge = parseFloat(form.totalFinanceCharge);
    if (isNaN(charge) || charge < 0) return null;
    return (P + charge) / n;
  })();

  function validateFields(): boolean {
    const errors: Record<string, string> = {};

    const principal = parseFloat(form.principalAmount);
    if (!form.principalAmount || isNaN(principal) || principal <= 0) {
      errors.principalAmount = "El monto debe ser mayor a cero.";
    }

    const charge = parseFloat(form.totalFinanceCharge);
    if (form.totalFinanceCharge === "" || isNaN(charge) || charge < 0) {
      errors.totalFinanceCharge = "El cargo financiero no puede estar vacío ni ser negativo.";
    }

    const terms = parseInt(form.termCount);
    if (!form.termCount || isNaN(terms) || terms <= 0) {
      errors.termCount = "El número de cuotas debe ser mayor a cero.";
    }

    if (!selectedClient) {
      errors.client = "Debe seleccionar un cliente.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!validateFields()) return;

    setSaving(true);

    try {
      // Get current user for createdById
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) {
        setError("Sesión expirada. Recarga la página.");
        return;
      }
      const meData = await meRes.json();

      const loanPayload = {
        clientId: selectedClient!.id,
        loanStructure: "FLAT_RATE",
        principalAmount: parseFloat(form.principalAmount),
        totalFinanceCharge: parseFloat(form.totalFinanceCharge),
        paymentFrequency: form.paymentFrequency,
        termCount: parseInt(form.termCount),
        createdById: meData.user.userId,
        guarantees: form.guarantees || undefined,
      };

      const res = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loanPayload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? "Error al crear el préstamo");
        return;
      }

      onCreated();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  const fmt = (n: number) => n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Nuevo Préstamo</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Client search */}
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label" htmlFor="clientSearch">Cliente *</label>
            {selectedClient ? (
              <div className="selected-client">
                <div className="selected-client-avatar">
                  {selectedClient.firstName[0]}{selectedClient.lastName?.[0] ?? ""}
                </div>
                <div className="selected-client-info">
                  <span className="selected-client-name">
                    {selectedClient.firstName} {selectedClient.lastName ?? ""}
                  </span>
                  <span className="selected-client-doc">{selectedClient.documentId}</span>
                </div>
                <button
                  type="button"
                  className="selected-client-clear"
                  onClick={() => { setSelectedClient(null); setClientSearch(""); }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="client-search-wrapper">
                <input
                  id="clientSearch"
                  className="form-input"
                  placeholder="Buscar cliente por nombre o documento..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  autoFocus
                />
                {searchingClients && (
                  <span className="client-search-loading">Buscando...</span>
                )}
                {clientResults.length > 0 && (
                  <div className="client-dropdown">
                    {clientResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="client-dropdown-item"
                        onClick={() => {
                          setSelectedClient(c);
                          setClientSearch("");
                          setClientResults([]);
                        }}
                      >
                        <div className="client-dropdown-avatar">
                          {c.firstName[0]}{c.lastName?.[0] ?? ""}
                        </div>
                        <div>
                          <span className="client-dropdown-name">
                            {c.firstName} {c.lastName ?? ""}
                          </span>
                          <span className="client-dropdown-doc">{c.documentId}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {fieldErrors.client && (
              <span className="field-error" role="alert">{fieldErrors.client}</span>
            )}
          </div>

          {/* Product selector */}
          {products.length > 0 && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" htmlFor="loanProduct">Producto Crediticio (opcional)</label>
              <select
                id="loanProduct"
                className="form-input form-select"
                value={selectedProductId}
                onChange={(e) => handleProductSelect(e.target.value)}
              >
                <option value="">Sin plantilla</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {Number(p.defaultRate).toFixed(2)}% / {p.termCount} cuotas {FREQUENCY_LABELS[p.paymentFrequency]}
                  </option>
                ))}
              </select>
              {selectedProductId && (
                <span style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: 3 }}>
                  Condiciones pre-llenadas. Puedes editarlas libremente.
                </span>
              )}
            </div>
          )}

          {/* Loan fields */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="principalAmount">Monto del préstamo *</label>
              <input
                id="principalAmount"
                className="form-input"
                type="number"
                step="0.01"
                min="0"
                value={form.principalAmount}
                onChange={(e) => updateField("principalAmount", e.target.value)}
                placeholder="50000"
              />
              {fieldErrors.principalAmount && (
                <span className="field-error" role="alert">{fieldErrors.principalAmount}</span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="totalFinanceCharge">Cargo Financiero (RD$) *</label>
              <input
                id="totalFinanceCharge"
                className="form-input"
                type="number"
                step="0.01"
                min="0"
                value={form.totalFinanceCharge}
                onChange={(e) => updateField("totalFinanceCharge", e.target.value)}
                placeholder="3500"
              />
              {fieldErrors.totalFinanceCharge && (
                <span className="field-error" role="alert">{fieldErrors.totalFinanceCharge}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="paymentFrequency">Frecuencia de pago *</label>
              <select
                id="paymentFrequency"
                className="form-input form-select"
                value={form.paymentFrequency}
                onChange={(e) => updateField("paymentFrequency", e.target.value)}
              >
                <option value="DAILY">Diaria</option>
                <option value="WEEKLY">Semanal</option>
                <option value="BIWEEKLY">Quincenal</option>
                <option value="MONTHLY">Mensual</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="termCount">Número de cuotas *</label>
              <input
                id="termCount"
                className="form-input"
                type="number"
                min="1"
                step="1"
                value={form.termCount}
                onChange={(e) => updateField("termCount", e.target.value)}
                placeholder="45"
              />
              {fieldErrors.termCount && (
                <span className="field-error" role="alert">{fieldErrors.termCount}</span>
              )}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label" htmlFor="guarantees">Garantías (opcional)</label>
            <input
              id="guarantees"
              className="form-input"
              value={form.guarantees}
              onChange={(e) => updateField("guarantees", e.target.value)}
              placeholder="Descripción de garantías..."
            />
          </div>

          {/* Installment preview */}
          {estimatedInstallment !== null && (
            <div className="installment-preview">
              <span className="installment-preview-label">Cuota estimada</span>
              <span className="installment-preview-value">
                RD$ {fmt(estimatedInstallment)}
              </span>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Creando..." : "Crear Préstamo"}
            </button>
          </div>
        </form>

        <style jsx>{`
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 200;
            padding: 16px;
          }
          .modal {
            background: white;
            border-radius: 14px;
            width: 100%;
            max-width: 560px;
            padding: 24px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
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
          .modal-close:hover { color: #374151; }

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
            background: white;
          }
          .form-input:focus {
            border-color: #2563eb;
            box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
          }
          .form-select {
            cursor: pointer;
            appearance: auto;
          }

          /* Client search */
          .client-search-wrapper {
            position: relative;
          }
          .client-search-loading {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 0.75rem;
            color: #9ca3af;
          }
          .client-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            margin-top: 4px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.1);
            z-index: 10;
            max-height: 200px;
            overflow-y: auto;
          }
          .client-dropdown-item {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            padding: 10px 12px;
            border: none;
            background: none;
            cursor: pointer;
            text-align: left;
            transition: background 0.1s;
          }
          .client-dropdown-item:hover {
            background: #f9fafb;
          }
          .client-dropdown-avatar {
            width: 30px;
            height: 30px;
            border-radius: 8px;
            background: #dbeafe;
            color: #2563eb;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.65rem;
            font-weight: 700;
            flex-shrink: 0;
          }
          .client-dropdown-name {
            display: block;
            font-size: 0.85rem;
            font-weight: 500;
            color: #111827;
          }
          .client-dropdown-doc {
            display: block;
            font-size: 0.75rem;
            color: #9ca3af;
            font-family: monospace;
          }

          /* Selected client */
          .selected-client {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            background: #f0f7ff;
            border: 1px solid #bfdbfe;
            border-radius: 8px;
          }
          .selected-client-avatar {
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
          .selected-client-info {
            flex: 1;
          }
          .selected-client-name {
            display: block;
            font-size: 0.875rem;
            font-weight: 600;
            color: #111827;
          }
          .selected-client-doc {
            display: block;
            font-size: 0.75rem;
            color: #6b7280;
            font-family: monospace;
          }
          .selected-client-clear {
            background: none;
            border: none;
            color: #9ca3af;
            cursor: pointer;
            padding: 4px;
          }
          .selected-client-clear:hover { color: #dc2626; }

          /* Installment preview */
          .installment-preview {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 12px;
          }
          .installment-preview-label {
            font-size: 0.85rem;
            font-weight: 600;
            color: #166534;
          }
          .installment-preview-value {
            font-size: 1.1rem;
            font-weight: 700;
            color: #059669;
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
          .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
          .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
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

          .field-error {
            font-size: 0.75rem;
            color: #dc2626;
            margin-top: 3px;
            display: block;
            line-height: 1.3;
          }
          .form-input.input-error {
            border-color: #dc2626 !important;
            box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1) !important;
          }

          @media (max-width: 500px) {
            .form-row { grid-template-columns: 1fr; }
          }
        `}</style>
      </div>
    </div>
  );
}
