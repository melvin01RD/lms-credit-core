"use client";

import { useEffect, useState } from "react";
import { useRoleGuard } from "@/hooks/useRoleGuard";

interface SystemConfig {
  businessName: string;
  rnc: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  lateFeeType: "PERCENTAGE_DAILY" | "FIXED";
  lateFeeValue: number;
  gracePeriodDays: number;
  defaultMonthlyRate: number | null;
  defaultWeeklyRate: number | null;
  defaultDailyRate: number | null;
}

type Tab = "negocio" | "mora" | "tasas";

export default function SettingsPage() {
  useRoleGuard("ADMIN");
  const [activeTab, setActiveTab] = useState<Tab>("negocio");
  const [form, setForm] = useState<SystemConfig>({
    businessName: "",
    rnc: "",
    address: "",
    phone: "",
    email: "",
    lateFeeType: "PERCENTAGE_DAILY",
    lateFeeValue: 0,
    gracePeriodDays: 0,
    defaultMonthlyRate: null,
    defaultWeeklyRate: null,
    defaultDailyRate: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setForm({
          businessName: data.businessName ?? "",
          rnc: data.rnc ?? "",
          address: data.address ?? "",
          phone: data.phone ?? "",
          email: data.email ?? "",
          lateFeeType: data.lateFeeType ?? "PERCENTAGE_DAILY",
          lateFeeValue: Number(data.lateFeeValue ?? 0),
          gracePeriodDays: Number(data.gracePeriodDays ?? 0),
          defaultMonthlyRate: data.defaultMonthlyRate != null ? Number(data.defaultMonthlyRate) : null,
          defaultWeeklyRate: data.defaultWeeklyRate != null ? Number(data.defaultWeeklyRate) : null,
          defaultDailyRate: data.defaultDailyRate != null ? Number(data.defaultDailyRate) : null,
        });
      })
      .catch(() => showToast("error", "Error al cargar la configuración"))
      .finally(() => setLoading(false));
  }, []);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  function updateField(field: keyof SystemConfig, value: string | number | null) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (saving || !window.confirm("¿Guardar los cambios en la configuración del negocio y sus parámetros?")) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        lateFeeValue: Number(form.lateFeeValue),
        gracePeriodDays: Number(form.gracePeriodDays),
        defaultMonthlyRate: form.defaultMonthlyRate != null ? Number(form.defaultMonthlyRate) : null,
        defaultWeeklyRate: form.defaultWeeklyRate != null ? Number(form.defaultWeeklyRate) : null,
        defaultDailyRate: form.defaultDailyRate != null ? Number(form.defaultDailyRate) : null,
        rnc: form.rnc || null,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast("error", err.error?.message ?? "Error al guardar");
      } else {
        showToast("success", "Configuración guardada correctamente");
      }
    } catch {
      showToast("error", "Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-box">
        <div className="spinner" />
        <p>Cargando configuración...</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === "success" ? "✓" : "✕"} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuración del Sistema</h1>
          <p className="page-subtitle">Parámetros generales del negocio y del sistema</p>
        </div>
        <button className="btn-save" onClick={handleSave} disabled={saving}>
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab${activeTab === "negocio" ? " active" : ""}`} onClick={() => setActiveTab("negocio")}>
          Datos del Negocio
        </button>
        <button className={`tab${activeTab === "mora" ? " active" : ""}`} onClick={() => setActiveTab("mora")}>
          Parámetros de Mora
        </button>
        <button className={`tab${activeTab === "tasas" ? " active" : ""}`} onClick={() => setActiveTab("tasas")}>
          Tasas por Defecto
        </button>
      </div>

      {/* Panel */}
      <div className="panel">

        {/* ── Sección 1: Datos del Negocio ── */}
        {activeTab === "negocio" && (
          <div className="section">
            <h2 className="section-title">Datos del Negocio</h2>
            <div className="form-grid">
              <div className="form-group full">
                <label className="form-label">Nombre del negocio *</label>
                <input
                  className="form-input"
                  value={form.businessName}
                  onChange={(e) => updateField("businessName", e.target.value)}
                  placeholder="LMS Credit SRL"
                />
              </div>
              <div className="form-group">
                <label className="form-label">RNC</label>
                <input
                  className="form-input"
                  value={form.rnc ?? ""}
                  onChange={(e) => updateField("rnc", e.target.value)}
                  placeholder="000-00000-0"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input
                  className="form-input"
                  value={form.phone ?? ""}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="(809) 555-0000"
                />
              </div>
              <div className="form-group full">
                <label className="form-label">Dirección</label>
                <input
                  className="form-input"
                  value={form.address ?? ""}
                  onChange={(e) => updateField("address", e.target.value)}
                  placeholder="Santo Domingo, D.N."
                />
              </div>
              <div className="form-group full">
                <label className="form-label">Email de contacto</label>
                <input
                  className="form-input"
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="admin@lmscredit.com"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Sección 2: Parámetros de Mora ── */}
        {activeTab === "mora" && (
          <div className="section">
            <h2 className="section-title">Parámetros de Mora</h2>
            <div className="form-grid">
              <div className="form-group full">
                <label className="form-label">Tipo de recargo por mora</label>
                <div className="radio-group">
                  <label className={`radio-card${form.lateFeeType === "PERCENTAGE_DAILY" ? " selected" : ""}`}>
                    <input
                      type="radio"
                      value="PERCENTAGE_DAILY"
                      checked={form.lateFeeType === "PERCENTAGE_DAILY"}
                      onChange={() => updateField("lateFeeType", "PERCENTAGE_DAILY")}
                    />
                    <span className="radio-title">% Diario</span>
                    <span className="radio-desc">Porcentaje sobre el monto vencido por cada día</span>
                  </label>
                  <label className={`radio-card${form.lateFeeType === "FIXED" ? " selected" : ""}`}>
                    <input
                      type="radio"
                      value="FIXED"
                      checked={form.lateFeeType === "FIXED"}
                      onChange={() => updateField("lateFeeType", "FIXED")}
                    />
                    <span className="radio-title">Monto Fijo</span>
                    <span className="radio-desc">Monto fijo en RD$ por cada cuota vencida</span>
                  </label>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">
                  {form.lateFeeType === "PERCENTAGE_DAILY" ? "% por día" : "RD$ fijo por cuota"}
                </label>
                <div className="input-with-suffix">
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.lateFeeValue}
                    onChange={(e) => updateField("lateFeeValue", e.target.value === "" ? 0 : parseFloat(e.target.value))}
                  />
                  <span className="input-suffix">
                    {form.lateFeeType === "PERCENTAGE_DAILY" ? "%" : "RD$"}
                  </span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Días de gracia</label>
                <div className="input-with-suffix">
                  <input
                    className="form-input"
                    type="number"
                    step="1"
                    min="0"
                    value={form.gracePeriodDays}
                    onChange={(e) => updateField("gracePeriodDays", e.target.value === "" ? 0 : parseInt(e.target.value))}
                  />
                  <span className="input-suffix">días</span>
                </div>
                <p className="field-hint">0 = sin gracia; se aplica mora desde el primer día de vencimiento</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Sección 3: Tasas por Defecto ── */}
        {activeTab === "tasas" && (
          <div className="section">
            <h2 className="section-title">Tasas de Interés por Defecto</h2>
            <div className="info-banner">
              Estos valores se pre-cargan al crear un nuevo préstamo y pueden modificarse por préstamo individualmente.
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Tasa mensual por defecto</label>
                <div className="input-with-suffix">
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.defaultMonthlyRate ?? ""}
                    onChange={(e) => updateField("defaultMonthlyRate", e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="24"
                  />
                  <span className="input-suffix">%</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Tasa semanal por defecto</label>
                <div className="input-with-suffix">
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.defaultWeeklyRate ?? ""}
                    onChange={(e) => updateField("defaultWeeklyRate", e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="6"
                  />
                  <span className="input-suffix">%</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Tasa diaria por defecto</label>
                <div className="input-with-suffix">
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.defaultDailyRate ?? ""}
                    onChange={(e) => updateField("defaultDailyRate", e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="1"
                  />
                  <span className="input-suffix">%</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .settings-page {
          padding: 24px;
          max-width: 860px;
          margin: 0 auto;
        }

        /* Toast */
        .toast {
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 12px 20px;
          border-radius: 10px;
          font-size: 0.875rem;
          font-weight: 500;
          z-index: 100;
          box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        }
        .toast-success { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
        .toast-error   { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }

        /* Header */
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
        }
        .page-title {
          font-size: 1.6rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 4px 0;
          letter-spacing: -0.02em;
        }
        .page-subtitle {
          font-size: 0.9rem;
          color: #6b7280;
          margin: 0;
        }
        .btn-save {
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 10px 22px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .btn-save:hover:not(:disabled) { background: #1d4ed8; }
        .btn-save:disabled { opacity: 0.6; cursor: not-allowed; }

        /* Tabs */
        .tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 20px;
          background: #f3f4f6;
          padding: 4px;
          border-radius: 10px;
          width: fit-content;
        }
        .tab {
          padding: 8px 18px;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          color: #6b7280;
          background: transparent;
          cursor: pointer;
          transition: all 0.15s;
        }
        .tab:hover { color: #374151; }
        .tab.active {
          background: white;
          color: #111827;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08);
        }

        /* Panel */
        .panel {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 28px;
        }

        /* Section */
        .section-title {
          font-size: 1rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 20px 0;
          padding-bottom: 12px;
          border-bottom: 1px solid #f3f4f6;
        }

        /* Form grid */
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .form-group.full { grid-column: 1 / -1; }

        .form-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: #374151;
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

        .field-hint {
          font-size: 0.72rem;
          color: #9ca3af;
          margin: 0;
        }

        /* Input with suffix */
        .input-with-suffix {
          display: flex;
          align-items: center;
        }
        .input-with-suffix .form-input {
          border-radius: 8px 0 0 8px;
          flex: 1;
        }
        .input-suffix {
          height: 40px;
          display: flex;
          align-items: center;
          padding: 0 12px;
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          border-left: none;
          border-radius: 0 8px 8px 0;
          font-size: 0.8rem;
          color: #6b7280;
          font-weight: 500;
          white-space: nowrap;
        }

        /* Radio cards */
        .radio-group {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .radio-card {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 14px 16px;
          border: 2px solid #e5e7eb;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .radio-card input[type="radio"] { display: none; }
        .radio-card:hover { border-color: #93c5fd; background: #eff6ff; }
        .radio-card.selected { border-color: #2563eb; background: #eff6ff; }
        .radio-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: #111827;
        }
        .radio-card.selected .radio-title { color: #2563eb; }
        .radio-desc {
          font-size: 0.72rem;
          color: #6b7280;
        }

        /* Info banner */
        .info-banner {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          padding: 12px 16px;
          font-size: 0.82rem;
          color: #1d4ed8;
          margin-bottom: 20px;
        }

        /* Loading */
        .loading-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 300px;
          gap: 12px;
          color: #6b7280;
        }
        .spinner {
          width: 36px;
          height: 36px;
          border: 3px solid #e5e7eb;
          border-top-color: #2563eb;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 600px) {
          .form-grid { grid-template-columns: 1fr; }
          .form-group.full { grid-column: 1; }
          .radio-group { grid-template-columns: 1fr; }
          .page-header { flex-direction: column; gap: 12px; }
        }
      `}</style>
    </div>
  );
}
