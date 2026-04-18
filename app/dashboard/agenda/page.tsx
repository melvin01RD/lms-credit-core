"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type DayOfWeek = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY";

const DAYS: { value: DayOfWeek; label: string; short: string }[] = [
  { value: "MONDAY",    label: "Lunes",     short: "Lun" },
  { value: "TUESDAY",   label: "Martes",    short: "Mar" },
  { value: "WEDNESDAY", label: "Miércoles", short: "Mié" },
  { value: "THURSDAY",  label: "Jueves",    short: "Jue" },
  { value: "FRIDAY",    label: "Viernes",   short: "Vie" },
  { value: "SATURDAY",  label: "Sábado",    short: "Sáb" },
];

const JS_DAY_TO_ENUM: Record<number, DayOfWeek> = {
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

interface Loan {
  id: string;
  principalAmount: string;
  installmentAmount: string;
  remainingCapital: string;
  status: "ACTIVE" | "OVERDUE";
  nextDueDate: string | null;
  paymentFrequency: string;
  createdBy: { firstName: string; lastName: string };
}

interface AgendaClient {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  documentId: string;
  collectionDays: DayOfWeek[];
  loans: Loan[];
}

interface AgendaData {
  day: DayOfWeek;
  clients: AgendaClient[];
}

function todayEnum(): DayOfWeek {
  const d = new Date().getDay();
  return JS_DAY_TO_ENUM[d] ?? "MONDAY";
}

const FREQ_LABELS: Record<string, string> = {
  DAILY: "Diario",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Al día",
  OVERDUE: "En mora",
  PAID: "Pagado",
  CANCELED: "Cancelado",
};

export default function AgendaPage() {
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(todayEnum());
  const [data, setData] = useState<AgendaData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAgenda = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agenda?day=${selectedDay}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [selectedDay]);

  useEffect(() => { fetchAgenda(); }, [fetchAgenda]);

  const fmt = (n: number | string) =>
    Number(n).toLocaleString("es-DO", { minimumFractionDigits: 2 });

  const totalCuotas = data?.clients.reduce(
    (sum, c) => sum + c.loans.reduce((s, l) => s + Number(l.installmentAmount), 0),
    0
  ) ?? 0;

  const dayLabel = DAYS.find((d) => d.value === selectedDay)?.label ?? selectedDay;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Agenda de Cobros</h1>
          <p className="page-subtitle">
            {!loading && data
              ? `${data.clients.length} cliente${data.clients.length !== 1 ? "s" : ""} · RD$ ${fmt(totalCuotas)} en cuotas`
              : "Cargando..."}
          </p>
        </div>
      </div>

      {/* Day selector */}
      <div className="day-tabs">
        {DAYS.map((d) => (
          <button
            key={d.value}
            className={`day-tab ${selectedDay === d.value ? "day-tab-active" : ""}`}
            onClick={() => setSelectedDay(d.value)}
          >
            <span className="day-tab-short">{d.short}</span>
            <span className="day-tab-full">{d.label}</span>
            {d.value === todayEnum() && <span className="today-dot" />}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="empty-state">Cargando...</div>
      ) : !data?.clients.length ? (
        <div className="empty-state">
          No hay clientes con cobros programados para el {dayLabel.toLowerCase()}.
        </div>
      ) : (
        <div className="client-list">
          {data.clients.map((client) => (
            <div key={client.id} className="client-card">
              <div className="client-card-header">
                <div className="client-info">
                  <div className="client-avatar">
                    {client.firstName[0]}{client.lastName?.[0] ?? ""}
                  </div>
                  <div>
                    <Link href={`/dashboard/clientes/${client.id}`} className="client-name-link">
                      {client.firstName} {client.lastName ?? ""}
                    </Link>
                    <div className="client-sub">{client.phone} · {client.documentId}</div>
                  </div>
                </div>
                <div className="client-total">
                  <span className="total-label">Total cuotas</span>
                  <span className="total-amount">
                    RD$ {fmt(client.loans.reduce((s, l) => s + Number(l.installmentAmount), 0))}
                  </span>
                </div>
              </div>

              {client.loans.length > 0 && (
                <table className="loans-table">
                  <thead>
                    <tr>
                      <th>Préstamo</th>
                      <th>Frecuencia</th>
                      <th>Cuota</th>
                      <th>Pendiente</th>
                      <th>Estado</th>
                      <th>Cobrador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {client.loans.map((loan) => (
                      <tr key={loan.id}>
                        <td>
                          <Link href={`/dashboard/prestamos/${loan.id}`} className="loan-link">
                            RD$ {fmt(loan.principalAmount)}
                          </Link>
                        </td>
                        <td>{FREQ_LABELS[loan.paymentFrequency] ?? loan.paymentFrequency}</td>
                        <td className="td-bold">RD$ {fmt(loan.installmentAmount)}</td>
                        <td>RD$ {fmt(loan.remainingCapital)}</td>
                        <td>
                          <span className={`status-badge status-${loan.status.toLowerCase()}`}>
                            {STATUS_LABELS[loan.status] ?? loan.status}
                          </span>
                        </td>
                        <td className="td-secondary">
                          {loan.createdBy.firstName} {loan.createdBy.lastName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
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

        .day-tabs {
          display: flex;
          gap: 6px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .day-tab {
          position: relative;
          padding: 8px 18px;
          border-radius: 20px;
          border: 1.5px solid #e5e7eb;
          background: white;
          font-size: 0.85rem;
          font-weight: 600;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .day-tab:hover {
          border-color: #2563eb;
          color: #2563eb;
        }
        .day-tab-active {
          background: #2563eb;
          border-color: #2563eb;
          color: white;
        }
        .day-tab-active:hover {
          background: #1d4ed8;
          border-color: #1d4ed8;
          color: white;
        }
        .today-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          opacity: 0.7;
          margin-left: 2px;
        }
        .day-tab-short { display: none; }
        @media (max-width: 600px) {
          .day-tab-full { display: none; }
          .day-tab-short { display: inline; }
        }

        .empty-state {
          text-align: center;
          padding: 60px 24px;
          color: #9ca3af;
          font-size: 0.9rem;
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
        }

        .client-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .client-card {
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          overflow-x: auto;
        }
        .client-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #f3f4f6;
        }
        .client-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .client-avatar {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: #dbeafe;
          color: #2563eb;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.85rem;
          font-weight: 700;
          flex-shrink: 0;
        }
        .client-name-link {
          font-weight: 700;
          font-size: 0.95rem;
          color: #111827;
          text-decoration: none;
        }
        .client-name-link:hover { color: #2563eb; text-decoration: underline; }
        .client-sub {
          font-size: 0.8rem;
          color: #9ca3af;
          margin-top: 2px;
        }
        .client-total {
          text-align: right;
        }
        .total-label {
          display: block;
          font-size: 0.7rem;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .total-amount {
          font-size: 1rem;
          font-weight: 700;
          color: #111827;
        }

        .loans-table {
          width: 100%;
          min-width: 650px;
          border-collapse: collapse;
          font-size: 0.825rem;
        }
        .loans-table th {
          text-align: left;
          padding: 8px 20px;
          font-weight: 600;
          color: #9ca3af;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          background: #f9fafb;
        }
        .loans-table td {
          padding: 10px 20px;
          color: #374151;
          border-top: 1px solid #f3f4f6;
        }
        .loan-link {
          color: #2563eb;
          font-weight: 600;
          text-decoration: none;
        }
        .loan-link:hover { text-decoration: underline; }
        .td-bold { font-weight: 700; }
        .td-secondary { color: #9ca3af; }

        .status-badge {
          font-size: 0.72rem;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 12px;
        }
        .status-active { background: #d1fae5; color: #059669; }
        .status-overdue { background: #fee2e2; color: #dc2626; }
      `}</style>
    </div>
  );
}
