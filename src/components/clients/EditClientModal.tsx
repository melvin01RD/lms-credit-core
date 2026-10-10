'use client';

import { useState, useEffect } from 'react';

type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY';

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: 'MONDAY',    label: 'Lun' },
  { value: 'TUESDAY',   label: 'Mar' },
  { value: 'WEDNESDAY', label: 'Mié' },
  { value: 'THURSDAY',  label: 'Jue' },
  { value: 'FRIDAY',    label: 'Vie' },
  { value: 'SATURDAY',  label: 'Sáb' },
];

interface Client {
  id: string;
  firstName: string;
  lastName: string | null;
  documentId: string;
  phone: string;
  email: string | null;
  address: string | null;
  currency: string;
  collectionDays?: DayOfWeek[];
}

interface EditClientModalProps {
  client: Client;
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditClientModal({ client, onClose, onUpdated }: EditClientModalProps) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
    currency: 'DOP',
  });
  const [collectionDays, setCollectionDays] = useState<DayOfWeek[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      firstName: client.firstName,
      lastName: client.lastName || '',
      phone: client.phone,
      email: client.email || '',
      address: client.address || '',
      currency: client.currency,
    });
    setCollectionDays(client.collectionDays ?? []);
  }, [client]);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleDay(day: DayOfWeek) {
    setCollectionDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          email: form.email || undefined,
          address: form.address || undefined,
          collectionDays,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? 'Error al actualizar el cliente');
        return;
      }

      onUpdated();
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Editar Cliente</h2>
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
              <label className="form-label" htmlFor="edit-firstName">Nombre *</label>
              <input
                className="form-input"
                value={form.firstName}
                id="edit-firstName"
                autoComplete="given-name"
                onChange={(e) => updateField('firstName', e.target.value)}
                required
                autoFocus
                maxLength={25}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Apellido</label>
              <input
                className="form-input"
                value={form.lastName}
                onChange={(e) => updateField('lastName', e.target.value)}
                maxLength={25}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Documento de identidad</label>
            <input
              className="form-input-disabled"
              value={client.documentId}
              disabled
            />
            <small className="field-note">El documento no puede ser modificado</small>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="edit-phone">Teléfono *</label>
              <input
                className="form-input"
                value={form.phone}
                id="edit-phone"
                type="tel"
                autoComplete="tel"
                onChange={(e) => updateField('phone', e.target.value)}
                required
                maxLength={10}
                pattern="\d{10}"
                inputMode="numeric"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Moneda</label>
              <select
                className="form-input"
                value={form.currency}
                onChange={(e) => updateField('currency', e.target.value)}
              >
                <option value="DOP">DOP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email" inputMode="email" autoComplete="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Dirección</label>
              <input
                className="form-input"
                value={form.address}
                autoComplete="street-address"
                onChange={(e) => updateField('address', e.target.value)}
                maxLength={50}
              />
            </div>
          </div>

          {/* Días de cobro */}
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">Días de cobro</label>
            <div className="days-grid">
              {DAYS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`day-btn ${collectionDays.includes(value) ? 'day-btn-active' : ''}`}
                  onClick={() => toggleDay(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
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
          .form-input, .form-input-disabled {
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
          .form-input-disabled {
            background: #f9fafb;
            color: #9ca3af;
            cursor: not-allowed;
          }
          .field-note {
            font-size: 0.75rem;
            color: #6b7280;
            margin-top: 4px;
          }

          .days-grid {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 4px;
          }
          .day-btn {
            padding: 6px 14px;
            border-radius: 20px;
            border: 1.5px solid #e5e7eb;
            background: white;
            font-size: 0.8rem;
            font-weight: 600;
            color: #6b7280;
            cursor: pointer;
            transition: all 0.15s;
          }
          .day-btn:hover {
            border-color: #2563eb;
            color: #2563eb;
          }
          .day-btn-active {
            background: #2563eb;
            border-color: #2563eb;
            color: white;
          }
          .day-btn-active:hover {
            background: #1d4ed8;
            border-color: #1d4ed8;
            color: white;
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

          @media (max-width: 500px) {
            .form-row { grid-template-columns: 1fr; }
          }
        `}</style>
      </div>
    </div>
  );
}
