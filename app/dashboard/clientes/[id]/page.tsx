"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY';

const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: 'Lun',
  TUESDAY: 'Mar',
  WEDNESDAY: 'Mié',
  THURSDAY: 'Jue',
  FRIDAY: 'Vie',
  SATURDAY: 'Sáb',
};

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
  createdAt: string;
  collectionDays: DayOfWeek[];
  loans: Loan[];
}

interface Loan {
  id: string;
  principalAmount: string;
  totalFinanceCharge: string | null;
  paymentFrequency: string;
  termCount: number;
  installmentAmount: string;
  remainingCapital: string;
  status: string;
  nextDueDate: string | null;
  createdAt: string;
}

interface ClientStats {
  client: Client;
  stats: {
    totalLoans: number;
    activeLoans: number;
    overdueLoans: number;
    paidLoans: number;
    totalBorrowed: number;
    totalOutstanding: number;
  };
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ClientStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchClient() {
      try {
        const res = await fetch(`/api/clients/${id}`);
        if (!res.ok) {
          setError("Cliente no encontrado");
          return;
        }
        const client = await res.json();

        // Calcular stats desde los datos del cliente
        const loans = client.loans || [];
        const stats = {
          totalLoans: loans.length,
          activeLoans: loans.filter((l: Loan) => l.status === "ACTIVE").length,
          overdueLoans: loans.filter((l: Loan) => l.status === "OVERDUE").length,
          paidLoans: loans.filter((l: Loan) => l.status === "PAID").length,
          totalBorrowed: loans.reduce((s: number, l: Loan) => s + Number(l.principalAmount), 0),
          totalOutstanding: loans
            .filter((l: Loan) => l.status === "ACTIVE" || l.status === "OVERDUE")
            .reduce((s: number, l: Loan) => s + Number(l.remainingCapital), 0),
        };

        setData({ client, stats });
      } catch {
        setError("Error al cargar el cliente");
      } finally {
        setLoading(false);
      }
    }

    fetchClient();
  }, [id]);

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>Cargando...</div>;
  }

  if (error || !data) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <p style={{ color: "#dc2626", marginBottom: "16px" }}>{error}</p>
        <button onClick={() => router.push("/dashboard/clientes")} style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}>
          Volver a clientes
        </button>
      </div>
    );
  }

  const { client, stats } = data;
  const fmt = (n: number) => n.toLocaleString("es-DO", { minimumFractionDigits: 2 });

  const statusColors: Record<string, { bg: string; color: string }> = {
    DRAFT: { bg: "#fef9c3", color: "#a16207" },
    ACTIVE: { bg: "#d1fae5", color: "#059669" },
    OVERDUE: { bg: "#fee2e2", color: "#dc2626" },
    PAID: { bg: "#dbeafe", color: "#2563eb" },
    CANCELED: { bg: "#f3f4f6", color: "#6b7280" },
  };

  const statusLabels: Record<string, string> = {
    DRAFT: "Borrador",
    ACTIVE: "Activo",
    OVERDUE: "En mora",
    PAID: "Pagado",
    CANCELED: "Cancelado",
  };

  const frequencyLabels: Record<string, string> = {
    WEEKLY: "Semanal",
    BIWEEKLY: "Quincenal",
    MONTHLY: "Mensual",
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link href="/dashboard/clientes" className="breadcrumb-link">Clientes</Link>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        <span className="breadcrumb-current">{client.firstName} {client.lastName ?? ""}</span>
      </div>

      {/* Client header */}
      <div className="client-header">
        <div className="client-header-left">
          <div className="client-big-avatar">
            {client.firstName[0]}{client.lastName?.[0] ?? ""}
          </div>
          <div>
            <h1 className="client-full-name">{client.firstName} {client.lastName ?? ""}</h1>
            <div className="client-meta">
              <span>{client.documentId}</span>
              <span>•</span>
              <span>{client.phone}</span>
              {client.email && <><span>•</span><span>{client.email}</span></>}
            </div>
          </div>
        </div>
        <span className={`status-pill ${client.active ? "active" : "inactive"}`}>
          {client.active ? "Activo" : "Inactivo"}
        </span>
      </div>

      {/* Stats */}
      <div className="mini-stats">
        <div className="mini-stat">
          <span className="mini-stat-value">{stats.totalLoans}</span>
          <span className="mini-stat-label">Préstamos</span>
        </div>
        <div className="mini-stat">
          <span className="mini-stat-value" style={{ color: "#059669" }}>{stats.activeLoans}</span>
          <span className="mini-stat-label">Activos</span>
        </div>
        <div className="mini-stat">
          <span className="mini-stat-value" style={{ color: "#dc2626" }}>{stats.overdueLoans}</span>
          <span className="mini-stat-label">En mora</span>
        </div>
        <div className="mini-stat">
          <span className="mini-stat-value">RD$ {fmt(stats.totalBorrowed)}</span>
          <span className="mini-stat-label">Total prestado</span>
        </div>
        <div className="mini-stat">
          <span className="mini-stat-value" style={{ color: "#dc2626" }}>RD$ {fmt(stats.totalOutstanding)}</span>
          <span className="mini-stat-label">Pendiente</span>
        </div>
      </div>

      {/* Loans table */}
      <div className="section-header">
        <h2 className="section-title">Préstamos</h2>
        <Link href={`/dashboard/prestamos`} className="btn-small-primary">
          + Nuevo Préstamo
        </Link>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Monto</th>
              <th>Tasa</th>
              <th>Frecuencia</th>
              <th>Cuota</th>
              <th>Pendiente</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {client.loans.length === 0 ? (
              <tr><td colSpan={8} className="table-empty">Este cliente no tiene préstamos</td></tr>
            ) : (
              client.loans.map((loan) => {
                const sc = statusColors[loan.status] || statusColors.CANCELED;
                return (
                  <tr
                    key={loan.id}
                    className="table-row"
                    onClick={() => router.push(`/dashboard/prestamos/${loan.id}`)}
                  >
                    <td className="td-bold">RD$ {fmt(Number(loan.principalAmount))}</td>
                    <td>Cargo Fijo</td>
                    <td>{frequencyLabels[loan.paymentFrequency] ?? loan.paymentFrequency}</td>
                    <td>RD$ {fmt(Number(loan.installmentAmount))}</td>
                    <td>RD$ {fmt(Number(loan.remainingCapital))}</td>
                    <td>
                      <span className="status-badge" style={{ background: sc.bg, color: sc.color }}>
                        {statusLabels[loan.status] ?? loan.status}
                      </span>
                    </td>
                    <td className="td-secondary">
                      {new Date(loan.createdAt).toLocaleDateString("es-DO")}
                    </td>
                    <td>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {(client.address || client.collectionDays?.length > 0) && (
        <div className="info-block">
          {client.address && (
            <div><span className="info-label">Dirección:</span> {client.address}</div>
          )}
          {client.collectionDays?.length > 0 && (
            <div style={{ marginTop: client.address ? '10px' : 0 }}>
              <span className="info-label">Días de cobro:</span>
              <span style={{ display: 'inline-flex', gap: '6px', marginLeft: '8px', flexWrap: 'wrap' }}>
                {client.collectionDays.map((day) => (
                  <span key={day} className="day-badge">{DAY_LABELS[day]}</span>
                ))}
              </span>
            </div>
          )}
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
        .breadcrumb-link {
          color: #2563eb;
          text-decoration: none;
        }
        .breadcrumb-link:hover { text-decoration: underline; }
        .breadcrumb-current { color: #6b7280; }

        .client-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .client-header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .client-big-avatar {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          background: #2563eb;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
          font-weight: 700;
        }
        .client-full-name {
          font-size: 1.4rem;
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.02em;
        }
        .client-meta {
          display: flex;
          gap: 8px;
          font-size: 0.85rem;
          color: #6b7280;
          margin-top: 2px;
        }

        .status-pill {
          font-size: 0.8rem;
          font-weight: 600;
          padding: 4px 14px;
          border-radius: 20px;
        }
        .status-pill.active { background: #d1fae5; color: #059669; }
        .status-pill.inactive { background: #fee2e2; color: #dc2626; }

        .mini-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
          margin-bottom: 28px;
        }
        .mini-stat {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 14px 16px;
        }
        .mini-stat-value {
          display: block;
          font-size: 1.2rem;
          font-weight: 700;
          color: #111827;
        }
        .mini-stat-label {
          font-size: 0.75rem;
          color: #9ca3af;
          margin-top: 2px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .section-title {
          font-size: 1.1rem;
          font-weight: 700;
          color: #111827;
        }
        .btn-small-primary {
          font-size: 0.825rem;
          font-weight: 600;
          color: #2563eb;
          text-decoration: none;
          padding: 6px 14px;
          border: 1px solid #2563eb;
          border-radius: 8px;
          transition: all 0.15s;
        }
        .btn-small-primary:hover {
          background: #2563eb;
          color: white;
        }

        .table-container {
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          overflow-x: auto;
          margin-bottom: 20px;
        }
        .table { width: 100%; min-width: 700px; border-collapse: collapse; font-size: 0.85rem; }
        .table thead { background: #f9fafb; }
        .table th {
          text-align: left; padding: 10px 14px; font-weight: 600; color: #6b7280;
          font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em;
          border-bottom: 1px solid #e5e7eb;
        }
        .table td { padding: 10px 14px; color: #374151; border-bottom: 1px solid #f3f4f6; }
        .table-row { cursor: pointer; transition: background 0.1s; }
        .table-row:hover { background: #f9fafb; }
        .table-empty { text-align: center; padding: 32px 14px !important; color: #9ca3af; }
        .td-bold { font-weight: 600; }
        .td-secondary { color: #9ca3af; }

        .status-badge {
          font-size: 0.7rem; font-weight: 600; padding: 3px 10px; border-radius: 12px;
        }

        .info-block {
          font-size: 0.85rem;
          color: #6b7280;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 12px 16px;
        }
        .info-label { font-weight: 600; color: #374151; }
        .day-badge {
          background: #dbeafe;
          color: #2563eb;
          font-size: 0.72rem;
          font-weight: 700;
          padding: 2px 9px;
          border-radius: 12px;
        }
      `}</style>
    </div>
  );
}
