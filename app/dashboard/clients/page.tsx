"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EditClientModal from "@/components/clients/EditClientModal";

interface Client {
  id: string;
  firstName: string;
  lastName: string | null;
  documentId: string;
  phone: string;
  email: string | null;
  address: string | null;
  currency: string;
  active: boolean;
  _count: { loans: number };
}

interface PaginatedClients {
  data: Client[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<PaginatedClients | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "15" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/clients?${params}`);
      
      if (!res.ok) {
        throw new Error("Error al cargar los clientes");
      }
      
      const data = await res.json();
      setClients(data);
    } catch (error) {
      console.error("Error fetching clients:", error);
      setClients({ data: [], pagination: { total: 0, page: 1, limit: 15, totalPages: 0, hasNext: false, hasPrev: false } });
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const timer = setTimeout(fetchClients, search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchClients, search]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">
            {clients?.pagination.total ?? 0} clientes registrados
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nuevo Cliente
        </button>
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
          placeholder="Buscar por nombre, documento o teléfono..."
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
              <th>Nombre</th>
              <th>Documento</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>Préstamos</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="table-empty">Cargando...</td></tr>
            ) : !clients?.data.length ? (
              <tr><td colSpan={8} className="table-empty">
                {search ? "No se encontraron resultados" : "No hay clientes registrados o error de conexión"}
              </td></tr>
            ) : (
              clients.data.map((client) => (
                <tr key={client.id} className="table-row" onClick={() => router.push(`/dashboard/clients/${client.id}`)}>
                  <td>
                    <div className="client-name">
                      <div className="client-avatar">
                        {client.firstName[0]}{client.lastName?.[0] ?? ""}
                      </div>
                      <span>{client.firstName} {client.lastName ?? ""}</span>
                    </div>
                  </td>
                  <td className="td-mono">{client.documentId}</td>
                  <td>{client.phone}</td>
                  <td className="td-secondary">{client.email ?? "—"}</td>
                  <td>
                    <span className={`loan-badge ${client._count.loans > 0 ? "has-loans" : ""}`}>
                      {client._count.loans}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${client.active ? "active" : "inactive"}`}>
                      {client.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingClient(client);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {clients && clients.pagination.totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            disabled={!clients.pagination.hasPrev}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </button>
          <span className="pagination-info">
            Página {clients.pagination.page} de {clients.pagination.totalPages}
          </span>
          <button
            className="pagination-btn"
            disabled={!clients.pagination.hasNext}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
        </div>
      )}

      {/* Modal crear cliente */}
      {showModal && (
        <CreateClientModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            setSearch("");
            setPage(1);
            fetchClients();
            showToast("Cliente creado exitosamente");
          }}
        />
      )}

      {/* Modal editar cliente */}
      {editingClient && (
        <EditClientModal
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onUpdated={() => { setEditingClient(null); fetchClients(); }}
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
          overflow: hidden;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
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
        }
        .table td {
          padding: 12px 16px;
          color: #374151;
          border-bottom: 1px solid #f3f4f6;
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
          font-weight: 500;
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

        .td-mono {
          font-family: monospace;
          font-size: 0.825rem;
        }
        .td-secondary {
          color: #9ca3af;
        }

        .loan-badge {
          background: #f3f4f6;
          color: #6b7280;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .loan-badge.has-loans {
          background: #dbeafe;
          color: #2563eb;
        }

        .status-badge {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 12px;
        }
        .status-badge.active {
          background: #d1fae5;
          color: #059669;
        }
        .status-badge.inactive {
          background: #fee2e2;
          color: #dc2626;
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

        .btn-edit {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          background: white;
          color: #2563eb;
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-edit:hover {
          background: #eff6ff;
          border-color: #2563eb;
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

// ============================================
// MODAL: Crear Cliente
// ============================================

function CreateClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    documentId: "",
    phone: "",
    email: "",
    address: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function validateFields(): boolean {
    const errors: Record<string, string> = {};

    if (form.firstName.trim().length < 2) {
      errors.firstName = "El nombre debe tener al menos 2 caracteres.";
    }

    if (!/^\d{11}$/.test(form.documentId)) {
      errors.documentId = "Formato inválido. La cédula debe tener 11 dígitos numéricos (ej: 00112345678).";
    }

    if (!/^\d{10}$/.test(form.phone)) {
      errors.phone = "El teléfono debe tener exactamente 10 dígitos numéricos. Ejemplo: 8091234567";
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
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          email: form.email || undefined,
          address: form.address || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? "Error al crear el cliente");
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
          <h2 className="modal-title">Nuevo Cliente</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="firstName">Nombre *</label>
              <input
                id="firstName"
                className="form-input"
                value={form.firstName}
                onChange={(e) => updateField("firstName", e.target.value)}
                required
                autoFocus
                maxLength={25}
              />
              {fieldErrors.firstName && (
                <span className="field-error" role="alert">{fieldErrors.firstName}</span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="lastName">Apellido</label>
              <input
                id="lastName"
                className="form-input"
                value={form.lastName}
                onChange={(e) => updateField("lastName", e.target.value)}
                maxLength={25}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="documentId">Documento de identidad *</label>
              <input
                id="documentId"
                className={`form-input ${fieldErrors.documentId ? "input-error" : ""}`}
                value={form.documentId}
                onChange={(e) => {
                  updateField("documentId", e.target.value);
                  if (fieldErrors.documentId) {
                    setFieldErrors((prev) => ({ ...prev, documentId: "" }));
                  }
                }}
                required
                placeholder="00100000008"
                maxLength={11}
                inputMode="numeric"
              />
              {fieldErrors.documentId && (
                <span className="field-error" role="alert">{fieldErrors.documentId}</span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="phone">Teléfono *</label>
              <input
                id="phone"
                className={`form-input ${fieldErrors.phone ? "input-error" : ""}`}
                value={form.phone}
                onChange={(e) => {
                  updateField("phone", e.target.value);
                  if (fieldErrors.phone) {
                    setFieldErrors((prev) => ({ ...prev, phone: "" }));
                  }
                }}
                required
                placeholder="8090000000"
                maxLength={10}
                inputMode="numeric"
              />
              {fieldErrors.phone && (
                <span className="field-error" role="alert">{fieldErrors.phone}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email</label>
              <input
                id="email"
                className="form-input"
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="cliente@ejemplo.com"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="address">Dirección</label>
              <input
                id="address"
                className="form-input"
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                maxLength={50}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Guardando..." : "Crear Cliente"}
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
            max-width: 560px;
            padding: 24px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
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
          }
          .form-input:focus {
            border-color: #2563eb;
            box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
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

          .input-error {
            border-color: #dc2626 !important;
            box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1) !important;
          }
          .field-error {
            font-size: 0.75rem;
            color: #dc2626;
            margin-top: 3px;
            display: block;
            line-height: 1.3;
          }

          @media (max-width: 500px) {
            .form-row { grid-template-columns: 1fr; }
          }
        `}</style>
      </div>
    </div>
  );
}
