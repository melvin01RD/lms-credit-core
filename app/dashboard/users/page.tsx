"use client";

import { useEffect, useState, useCallback } from "react";
import { useRoleGuard } from "@/hooks/useRoleGuard";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "OPERATOR";
  active: boolean;
  createdAt: string;
  _count: { createdLoans: number; payments: number };
}

export default function UsersPage() {
  useRoleGuard("ADMIN");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Fetch current session user id once on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setCurrentUserId(d?.id ?? null))
      .catch(() => null);
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (activeFilter !== "") params.set("active", activeFilter);

      const res = await fetch(`/api/users?${params}`);
      if (!res.ok) throw new Error("Error al cargar los usuarios");
      const data = await res.json();
      setUsers(data);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, activeFilter]);

  useEffect(() => {
    const timer = setTimeout(fetchUsers, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchUsers, search]);

  function showSuccess(msg: string) {
    setActionError("");
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(""), 4000);
  }

  function showError(msg: string) {
    setActionSuccess("");
    setActionError(msg);
    setTimeout(() => setActionError(""), 6000);
  }

  async function handleDeactivate(user: User) {
    if (!currentUserId) return;
    if (user.id === currentUserId) {
      showError("No puedes desactivar tu propio usuario.");
      return;
    }
    const confirmed = window.confirm(
      `¿Desactivar al usuario ${user.firstName} ${user.lastName}? Esta acción se puede revertir desde la base de datos.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deactivatedById: currentUserId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error?.message ?? "Error al desactivar el usuario");
        return;
      }
      showSuccess(`Usuario ${user.firstName} ${user.lastName} desactivado.`);
      fetchUsers();
    } catch {
      showError("Error de conexión");
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-DO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Usuarios</h1>
          <p className="page-subtitle">{users.length} usuario{users.length !== 1 ? "s" : ""} encontrado{users.length !== 1 ? "s" : ""}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nuevo Usuario
        </button>
      </div>

      {/* Feedback banners */}
      {actionSuccess && <div className="banner-success">{actionSuccess}</div>}
      {actionError && <div className="banner-error">{actionError}</div>}

      {/* Filters */}
      <div className="filters-row">
        <div className="search-bar">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch("")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <select
          className="filter-select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">Todos los roles</option>
          <option value="ADMIN">ADMIN</option>
          <option value="OPERATOR">OPERATOR</option>
        </select>

        <select
          className="filter-select"
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Creado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="table-empty">Cargando...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="table-empty">
                {search || roleFilter || activeFilter ? "No se encontraron resultados" : "No hay usuarios registrados"}
              </td></tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="table-row">
                  <td>
                    <div className="user-name">
                      <div className="user-avatar">
                        {user.firstName[0]}{user.lastName?.[0] ?? ""}
                      </div>
                      <span>{user.firstName} {user.lastName}</span>
                      {user.id === currentUserId && (
                        <span className="you-badge">Tú</span>
                      )}
                    </div>
                  </td>
                  <td className="td-secondary">{user.email}</td>
                  <td>
                    <span className={`role-badge ${user.role === "ADMIN" ? "role-admin" : "role-operator"}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${user.active ? "active" : "inactive"}`}>
                      {user.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="td-date">{formatDate(user.createdAt)}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-action btn-edit"
                        onClick={() => setEditingUser(user)}
                        title="Editar usuario"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Editar
                      </button>
                      <button
                        className="btn-action btn-password"
                        onClick={() => setPasswordUser(user)}
                        title="Cambiar contraseña"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        Contraseña
                      </button>
                      {user.active && currentUserId !== null && user.id !== currentUserId && (
                        <button
                          className="btn-action btn-deactivate"
                          onClick={() => handleDeactivate(user)}
                          title="Desactivar usuario"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                          </svg>
                          Desactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            showSuccess("Usuario creado exitosamente.");
            fetchUsers();
          }}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onUpdated={() => {
            setEditingUser(null);
            showSuccess("Usuario actualizado exitosamente.");
            fetchUsers();
          }}
        />
      )}

      {passwordUser && (
        <ChangePasswordModal
          user={passwordUser}
          currentUserId={currentUserId}
          onClose={() => setPasswordUser(null)}
          onChanged={() => {
            setPasswordUser(null);
            showSuccess("Contraseña actualizada exitosamente.");
          }}
        />
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
          transition: background 0.15s;
        }
        .btn-primary:hover { background: #1d4ed8; }

        .banner-success {
          background: #d1fae5;
          border: 1px solid #6ee7b7;
          border-radius: 8px;
          padding: 10px 14px;
          color: #065f46;
          font-size: 0.85rem;
          margin-bottom: 14px;
        }
        .banner-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 10px 14px;
          color: #dc2626;
          font-size: 0.85rem;
          margin-bottom: 14px;
        }

        .filters-row {
          display: flex;
          gap: 10px;
          margin-bottom: 16px;
          align-items: center;
        }
        .search-bar {
          position: relative;
          flex: 1;
        }
        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
        }
        .search-input {
          width: 100%;
          height: 40px;
          padding: 0 36px 0 38px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 0.875rem;
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
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 2px;
        }
        .filter-select {
          height: 40px;
          padding: 0 10px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 0.875rem;
          background: white;
          color: #374151;
          outline: none;
          cursor: pointer;
        }
        .filter-select:focus { border-color: #2563eb; }

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
        .table thead { background: #f9fafb; }
        .table th {
          text-align: left;
          padding: 12px 16px;
          font-weight: 600;
          color: #6b7280;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border-bottom: 1px solid #e5e7eb;
        }
        .table td {
          padding: 12px 16px;
          color: #374151;
          border-bottom: 1px solid #f3f4f6;
        }
        .table-row { transition: background 0.1s; }
        .table-row:hover { background: #f9fafb; }
        .table-empty {
          text-align: center;
          padding: 40px 16px !important;
          color: #9ca3af;
        }

        .user-name {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 500;
        }
        .user-avatar {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: #ede9fe;
          color: #7c3aed;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          font-weight: 700;
          flex-shrink: 0;
          text-transform: uppercase;
        }
        .you-badge {
          font-size: 0.7rem;
          font-weight: 600;
          background: #fef3c7;
          color: #d97706;
          padding: 1px 7px;
          border-radius: 10px;
        }

        .td-secondary { color: #6b7280; font-size: 0.85rem; }
        .td-date { color: #9ca3af; font-size: 0.82rem; }

        .role-badge {
          font-size: 0.73rem;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 10px;
          letter-spacing: 0.03em;
        }
        .role-admin { background: #dbeafe; color: #2563eb; }
        .role-operator { background: #f3f4f6; color: #6b7280; }

        .status-badge {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 12px;
        }
        .status-badge.active { background: #d1fae5; color: #059669; }
        .status-badge.inactive { background: #fee2e2; color: #dc2626; }

        .action-buttons {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .btn-action {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          border-radius: 6px;
          font-size: 0.78rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .btn-edit {
          border: 1px solid #e5e7eb;
          background: white;
          color: #2563eb;
        }
        .btn-edit:hover { background: #eff6ff; border-color: #2563eb; }

        .btn-password {
          border: 1px solid #e5e7eb;
          background: white;
          color: #6b7280;
        }
        .btn-password:hover { background: #f9fafb; border-color: #9ca3af; color: #374151; }

        .btn-deactivate {
          border: 1px solid #fecaca;
          background: white;
          color: #dc2626;
        }
        .btn-deactivate:hover { background: #fef2f2; }
      `}</style>
    </div>
  );
}

// ============================================
// MODAL: Crear Usuario
// ============================================

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "OPERATOR" as "ADMIN" | "OPERATOR",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Error al crear el usuario");
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
          <h2 className="modal-title">Nuevo Usuario</h2>
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
              <label className="form-label">Nombre *</label>
              <input className="form-input" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Apellido *</label>
              <input className="form-input" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "12px" }}>
            <label className="form-label">Email *</label>
            <input className="form-input" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required placeholder="usuario@ejemplo.com" />
          </div>

          <div className="form-group" style={{ marginBottom: "12px" }}>
            <label className="form-label">Contraseña *</label>
            <input className="form-input" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required minLength={8} placeholder="Mín. 8 caracteres, 1 mayúscula, 1 número" />
            <span className="form-hint">Debe contener al menos 1 mayúscula, 1 minúscula y 1 número.</span>
          </div>

          <div className="form-group" style={{ marginBottom: "4px" }}>
            <label className="form-label">Rol *</label>
            <div className="role-options">
              <label className={`role-card ${form.role === "OPERATOR" ? "selected" : ""}`}>
                <input type="radio" name="role" value="OPERATOR" checked={form.role === "OPERATOR"} onChange={() => update("role", "OPERATOR")} />
                <span className="role-card-title">OPERATOR</span>
                <span className="role-card-desc">Gestión de clientes, préstamos y pagos</span>
              </label>
              <label className={`role-card ${form.role === "ADMIN" ? "selected" : ""}`}>
                <input type="radio" name="role" value="ADMIN" checked={form.role === "ADMIN"} onChange={() => update("role", "ADMIN")} />
                <span className="role-card-title">ADMIN</span>
                <span className="role-card-desc">Acceso total incluyendo usuarios y configuración</span>
              </label>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Creando..." : "Crear Usuario"}
            </button>
          </div>
        </form>

        <ModalStyles />
      </div>
    </div>
  );
}

// ============================================
// MODAL: Editar Usuario
// ============================================

function EditUserModal({
  user,
  onClose,
  onUpdated,
}: {
  user: User;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [form, setForm] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Error al actualizar el usuario");
        return;
      }
      onUpdated();
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
          <h2 className="modal-title">Editar Usuario</h2>
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
              <label className="form-label">Nombre *</label>
              <input className="form-input" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Apellido *</label>
              <input className="form-input" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "16px" }}>
            <label className="form-label">Email *</label>
            <input className="form-input" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        </form>

        <ModalStyles />
      </div>
    </div>
  );
}

// ============================================
// MODAL: Cambiar Contraseña
// ============================================

function ChangePasswordModal({
  user,
  currentUserId,
  onClose,
  onChanged,
}: {
  user: User;
  currentUserId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, resetById: currentUserId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Error al cambiar la contraseña");
        return;
      }
      onChanged();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Cambiar Contraseña</h2>
            <p className="modal-subtitle">{user.firstName} {user.lastName}</p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: "12px" }}>
            <label className="form-label">Nueva contraseña *</label>
            <input
              className="form-input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Mín. 8 caracteres, 1 mayúscula, 1 número"
              autoFocus
            />
            <span className="form-hint">Debe contener al menos 1 mayúscula, 1 minúscula y 1 número.</span>
          </div>

          <div className="form-group" style={{ marginBottom: "16px" }}>
            <label className="form-label">Confirmar contraseña *</label>
            <input
              className="form-input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Repetir contraseña"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Guardando..." : "Cambiar Contraseña"}
            </button>
          </div>
        </form>

        <ModalStyles />
      </div>
    </div>
  );
}

// ============================================
// Shared modal styles (reused across modals)
// ============================================

function ModalStyles() {
  return (
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
        max-width: 520px;
        padding: 24px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.15);
      }
      .modal-sm {
        max-width: 420px;
      }
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 20px;
      }
      .modal-title {
        font-size: 1.15rem;
        font-weight: 700;
        color: #111827;
      }
      .modal-subtitle {
        font-size: 0.825rem;
        color: #6b7280;
        margin-top: 2px;
      }
      .modal-close {
        background: none;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        padding: 4px;
        flex-shrink: 0;
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
      .form-hint {
        font-size: 0.75rem;
        color: #9ca3af;
        margin-top: 4px;
      }

      .role-options {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-top: 4px;
      }
      .role-card {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 12px;
        border: 2px solid #e5e7eb;
        border-radius: 10px;
        cursor: pointer;
        transition: border-color 0.15s;
      }
      .role-card input { display: none; }
      .role-card.selected { border-color: #2563eb; background: #eff6ff; }
      .role-card-title {
        font-size: 0.85rem;
        font-weight: 700;
        color: #111827;
      }
      .role-card-desc {
        font-size: 0.75rem;
        color: #6b7280;
        line-height: 1.3;
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
        transition: background 0.15s;
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
        transition: background 0.15s;
      }
      .btn-secondary:hover { background: #f9fafb; }

      @media (max-width: 500px) {
        .form-row { grid-template-columns: 1fr; }
        .role-options { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
