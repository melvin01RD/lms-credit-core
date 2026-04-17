"use client";

import { useEffect, useState } from "react";
import { useRoleGuard } from "@/hooks/useRoleGuard";

// ============================================================
// TYPES
// ============================================================

interface LoanProduct {
  id: string;
  name: string;
  defaultRate: string;
  paymentFrequency: string;
  termCount: number;
  minAmount: string | null;
  maxAmount: string | null;
  active: boolean;
  createdAt: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: "Diaria",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
};

// ============================================================
// PAGE
// ============================================================

export default function ProductosPage() {
  useRoleGuard("ADMIN");
  const [products, setProducts] = useState<LoanProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<LoanProduct | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function fetchProducts() {
    setLoading(true);
    try {
      const res = await fetch("/api/loan-products?all=true");
      if (res.ok) setProducts(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  async function handleToggle(product: LoanProduct) {
    setToggling(product.id);
    try {
      const res = await fetch(`/api/loan-products/${product.id}/toggle`, { method: "PATCH" });
      if (res.ok) {
        showToast(product.active ? "Producto desactivado" : "Producto activado");
        fetchProducts();
      }
    } finally {
      setToggling(null);
    }
  }

  const fmtMoney = (n: string | null) =>
    n ? `RD$ ${Number(n).toLocaleString("es-DO", { minimumFractionDigits: 2 })}` : "—";

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Productos Crediticios</h1>
          <p className="page-subtitle">Plantillas de condiciones para nuevos préstamos</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => { setEditProduct(null); setShowModal(true); }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nuevo Producto
        </button>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tasa</th>
              <th>Frecuencia</th>
              <th>Cuotas</th>
              <th>Monto Mín.</th>
              <th>Monto Máx.</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="table-empty">Cargando...</td></tr>
            ) : !products.length ? (
              <tr><td colSpan={8} className="table-empty">No hay productos registrados</td></tr>
            ) : products.map((p) => (
              <tr key={p.id} className={p.active ? "" : "row-inactive"}>
                <td className="td-bold">{p.name}</td>
                <td>{Number(p.defaultRate).toFixed(2)}%</td>
                <td>{FREQUENCY_LABELS[p.paymentFrequency] ?? p.paymentFrequency}</td>
                <td>{p.termCount}</td>
                <td className="td-secondary">{fmtMoney(p.minAmount)}</td>
                <td className="td-secondary">{fmtMoney(p.maxAmount)}</td>
                <td>
                  <span className={`status-badge ${p.active ? "badge-active" : "badge-inactive"}`}>
                    {p.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      className="btn-icon"
                      title="Editar"
                      onClick={() => { setEditProduct(p); setShowModal(true); }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      className={`btn-toggle ${p.active ? "btn-toggle-off" : "btn-toggle-on"}`}
                      onClick={() => handleToggle(p)}
                      disabled={toggling === p.id}
                    >
                      {toggling === p.id ? "..." : p.active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ProductModal
          product={editProduct}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchProducts();
            showToast(editProduct ? "Producto actualizado" : "Producto creado exitosamente");
          }}
        />
      )}

      {toast && (
        <div className="toast-success" role="alert" aria-live="polite">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
          background: #6B21E8;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 10px 18px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .btn-primary:hover { background: #7C3AED; }

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
          min-width: 750px;
        }
        .table thead { background: #f9fafb; }
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
        .table-empty {
          text-align: center;
          padding: 40px 16px !important;
          color: #9ca3af;
        }
        .row-inactive td { opacity: 0.55; }
        .td-bold { font-weight: 600; }
        .td-secondary { color: #9ca3af; }

        .status-badge {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 12px;
          white-space: nowrap;
        }
        .badge-active { background: #d1fae5; color: #059669; }
        .badge-inactive { background: #f3f4f6; color: #6b7280; }

        .row-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .btn-icon {
          background: none;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 5px 8px;
          color: #6b7280;
          cursor: pointer;
          display: flex;
          align-items: center;
          transition: all 0.15s;
        }
        .btn-icon:hover {
          border-color: #6B21E8;
          color: #6B21E8;
        }
        .btn-toggle {
          border: none;
          border-radius: 6px;
          padding: 5px 12px;
          font-size: 0.775rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-toggle:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-toggle-off {
          background: #fef2f2;
          color: #dc2626;
        }
        .btn-toggle-off:hover:not(:disabled) { background: #fee2e2; }
        .btn-toggle-on {
          background: #d1fae5;
          color: #059669;
        }
        .btn-toggle-on:hover:not(:disabled) { background: #a7f3d0; }

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
          box-shadow: 0 4px 20px rgba(5,150,105,0.35);
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

// ============================================================
// MODAL: Create / Edit Product
// ============================================================

function ProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: LoanProduct | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = product !== null;

  const [form, setForm] = useState({
    name: product?.name ?? "",
    defaultRate: product ? String(Number(product.defaultRate).toFixed(2)) : "",
    paymentFrequency: product?.paymentFrequency ?? "WEEKLY",
    termCount: product ? String(product.termCount) : "",
    minAmount: product?.minAmount ? String(Number(product.minAmount).toFixed(2)) : "",
    maxAmount: product?.maxAmount ? String(Number(product.maxAmount).toFixed(2)) : "",
  });

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const rate = parseFloat(form.defaultRate);
    const terms = parseInt(form.termCount);

    if (!form.name.trim()) { setError("El nombre es requerido."); return; }
    if (isNaN(rate) || rate < 0) { setError("La tasa debe ser mayor o igual a 0."); return; }
    if (rate > 50) { setError("La tasa no puede superar el 50%."); return; }
    if (isNaN(terms) || terms < 1) { setError("El número de cuotas debe ser mayor a 0."); return; }

    const minAmt = form.minAmount ? parseFloat(form.minAmount) : null;
    const maxAmt = form.maxAmount ? parseFloat(form.maxAmount) : null;

    setSaving(true);
    try {
      const url = isEdit ? `/api/loan-products/${product.id}` : "/api/loan-products";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          defaultRate: rate,
          paymentFrequency: form.paymentFrequency,
          termCount: terms,
          minAmount: minAmt,
          maxAmount: maxAmt,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Error al guardar"); return; }
      onSaved();
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
          <h2 className="modal-title">{isEdit ? "Editar Producto" : "Nuevo Producto"}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label" htmlFor="pName">Nombre del producto *</label>
            <input
              id="pName"
              className="form-input"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Ej: Préstamo Personal Semanal"
              autoFocus
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="pRate">Tasa (%) *</label>
              <input
                id="pRate"
                className="form-input"
                type="number"
                step="0.01"
                min="0"
                value={form.defaultRate}
                onChange={(e) => updateField("defaultRate", e.target.value)}
                placeholder="10.00"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="pTermCount">Número de cuotas *</label>
              <input
                id="pTermCount"
                className="form-input"
                type="number"
                min="1"
                step="1"
                value={form.termCount}
                onChange={(e) => updateField("termCount", e.target.value)}
                placeholder="45"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label" htmlFor="pFreq">Frecuencia de pago *</label>
            <select
              id="pFreq"
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

          <div className="form-row" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="pMin">Monto mínimo (opcional)</label>
              <input
                id="pMin"
                className="form-input"
                type="number"
                step="0.01"
                min="0"
                value={form.minAmount}
                onChange={(e) => updateField("minAmount", e.target.value)}
                placeholder="5000"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="pMax">Monto máximo (opcional)</label>
              <input
                id="pMax"
                className="form-input"
                type="number"
                step="0.01"
                min="0"
                value={form.maxAmount}
                onChange={(e) => updateField("maxAmount", e.target.value)}
                placeholder="100000"
              />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary-modal" disabled={saving}>
              {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear producto"}
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
            z-index: 50;
            padding: 16px;
          }
          .modal {
            background: white;
            border-radius: 14px;
            width: 100%;
            max-width: 500px;
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
            border-color: #6B21E8;
            box-shadow: 0 0 0 3px rgba(107,33,232,0.1);
          }
          .form-select { cursor: pointer; appearance: auto; }
          .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 20px;
            padding-top: 16px;
            border-top: 1px solid #f3f4f6;
          }
          .btn-primary-modal {
            background: #6B21E8;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px 20px;
            font-size: 0.875rem;
            font-weight: 600;
            cursor: pointer;
          }
          .btn-primary-modal:hover:not(:disabled) { background: #7C3AED; }
          .btn-primary-modal:disabled { opacity: 0.6; cursor: not-allowed; }
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
          @media (max-width: 500px) {
            .form-row { grid-template-columns: 1fr; }
          }
        `}</style>
      </div>
    </div>
  );
}
