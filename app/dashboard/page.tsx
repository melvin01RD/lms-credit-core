"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MetricCard from "@/components/dashboard/MetricCard";
import ChartCard from "@/components/dashboard/ChartCard";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DashboardMetrics {
  totalLoaned: number;
  totalOutstanding: number;
  totalInterest: number;
  totalLateFees: number;
  overdueAmount: number;
  activeClients: number;
  activeLoans: number;
  overdueLoans: number;
  paidLoans: number;
  paymentsThisMonth: number;
  paymentsThisMonthAmount: number;
  loansByMonth: { month: string; count: number; amount: number }[];
  paymentsByMonth: {
    month: string;
    count: number;
    amount: number;
    capital: number;
    interest: number;
  }[];
  portfolioDistribution: {
    status: string;
    count: number;
    percentage: number;
    amount: number;
  }[];
  upcomingPayments: {
    loanId: string;
    clientName: string;
    clientDocument: string;
    dueDate: string;
    installmentAmount: number;
    daysUntilDue: number;
  }[];
}

interface FlatRateMetrics {
  cobrosHoy: number;
  cuotasVencidas: number;
  montoVencido: number;
  carteraActiva: number;
  prestamosActivos: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [flatRateMetrics, setFlatRateMetrics] = useState<FlatRateMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
    // Actualizar cada 30 segundos
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchMetrics() {
    try {
      const [res, flatRes] = await Promise.all([
        fetch("/api/reports/dashboard"),
        fetch("/api/dashboard/flat-rate"),
      ]);
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
      if (flatRes.ok) {
        const flatData = await flatRes.json();
        setFlatRateMetrics(flatData);
      }
    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setLoading(false);
    }
  }

  const fmt = (n: number) =>
    n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtShort = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toFixed(0);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Cargando dashboard...</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="error-container">
        <p>Error al cargar las métricas</p>
        <button onClick={fetchMetrics} className="btn-retry">
          Reintentar
        </button>
      </div>
    );
  }

  // Colores para gráficos
  const COLORS = {
    Activos: "#2563eb",
    "En Mora": "#dc2626",
    Pagados: "#059669",
    Cancelados: "#6b7280",
  };

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Dashboard Ejecutivo</h1>
          <p className="dashboard-subtitle">
            Vista general de tu negocio en tiempo real
          </p>
        </div>
        <button onClick={fetchMetrics} className="btn-refresh">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* Métricas Principales */}
      <div className="metrics-grid">
        <MetricCard
          title="Total Prestado"
          value={`RD$ ${fmtShort(metrics.totalLoaned)}`}
          color="blue"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
        />

        <MetricCard
          title="Capital Pendiente"
          value={`RD$ ${fmtShort(metrics.totalOutstanding)}`}
          color="orange"
          subtitle={`${metrics.totalLoaned > 0 ? ((metrics.totalOutstanding / metrics.totalLoaned) * 100).toFixed(1) : "0"}% del total`}
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
        />

        <MetricCard
          title="Ingresos por Interés"
          value={`RD$ ${fmtShort(metrics.totalInterest)}`}
          color="green"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          }
        />

        <MetricCard
          title="Préstamos en Mora"
          value={metrics.overdueLoans}
          color="red"
          subtitle={`RD$ ${fmtShort(metrics.overdueAmount)} en mora`}
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        />

        <MetricCard
          title="Clientes Activos"
          value={metrics.activeClients}
          color="purple"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />

        <MetricCard
          title="Pagos del Mes"
          value={`RD$ ${fmtShort(metrics.paymentsThisMonthAmount)}`}
          color="green"
          subtitle={`${metrics.paymentsThisMonth} transacciones`}
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          }
        />
      </div>

      {/* Métricas Flat Rate */}
      {flatRateMetrics && (
        <div className="flat-rate-section">
          <h2 className="section-title">Cartera Cargo Fijo (Flat Rate)</h2>
          <div className="metrics-grid">
            <MetricCard
              title="Cobros Hoy"
              value={`RD$ ${fmtShort(flatRateMetrics.cobrosHoy)}`}
              color="green"
              subtitle="Pagos recibidos hoy"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              }
            />
            <MetricCard
              title="Cuotas Vencidas"
              value={flatRateMetrics.cuotasVencidas}
              color="red"
              subtitle={`RD$ ${fmtShort(flatRateMetrics.montoVencido)} en mora`}
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              }
            />
            <MetricCard
              title="Cartera Activa"
              value={`RD$ ${fmtShort(flatRateMetrics.carteraActiva)}`}
              color="blue"
              subtitle={`${flatRateMetrics.prestamosActivos} préstamos activos`}
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              }
            />
          </div>
        </div>
      )}

      {/* Gráficos */}
      <div className="charts-grid">
        {/* Préstamos por Mes */}
        <ChartCard
          title="Préstamos Desembolsados"
          description="Últimos 6 meses"
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={metrics.loansByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                }}
                formatter={(value: any) => `RD$ ${fmt(Number(value))}`}
              />
              <Bar dataKey="amount" fill="#2563eb" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Distribución de Cartera */}
        <ChartCard title="Distribución de Cartera" description="Por estado">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={metrics.portfolioDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry: any) => `${entry.status}: ${entry.count}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="count"
              >
                {metrics.portfolioDistribution.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[entry.status as keyof typeof COLORS] || "#6b7280"}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any, name: any, props: any) =>
                  [`${value} (${props.payload.percentage.toFixed(1)}%)`, name]
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Pagos Cobrados */}
        <ChartCard
          title="Pagos Cobrados"
          description="Capital vs Interés - Últimos 6 meses"
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics.paymentsByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                }}
                formatter={(value: any) => `RD$ ${fmt(Number(value))}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="capital"
                stroke="#2563eb"
                strokeWidth={2}
                name="Capital"
              />
              <Line
                type="monotone"
                dataKey="interest"
                stroke="#059669"
                strokeWidth={2}
                name="Interés"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Próximos Vencimientos */}
      {metrics.upcomingPayments.length > 0 && (
        <ChartCard
          title="Próximos Vencimientos"
          description="Préstamos con cuotas en los próximos 7 días"
        >
          <div className="upcoming-table-container">
            <table className="upcoming-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Documento</th>
                  <th>Vence en</th>
                  <th>Cuota</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {metrics.upcomingPayments.map((payment) => (
                  <tr
                    key={payment.loanId}
                    className="upcoming-row"
                    onClick={() => router.push(`/dashboard/loans/${payment.loanId}`)}
                  >
                    <td className="td-bold">{payment.clientName}</td>
                    <td className="td-mono">{payment.clientDocument}</td>
                    <td>
                      <span
                        className={`days-badge ${
                          payment.daysUntilDue < 0
                            ? "overdue"
                            : payment.daysUntilDue <= 2
                            ? "urgent"
                            : "normal"
                        }`}
                      >
                        {payment.daysUntilDue < 0
                          ? `${Math.abs(payment.daysUntilDue)} días vencido`
                          : payment.daysUntilDue === 0
                          ? "Hoy"
                          : payment.daysUntilDue === 1
                          ? "Mañana"
                          : `En ${payment.daysUntilDue} días`}
                      </span>
                    </td>
                    <td className="td-amount">RD$ {fmt(payment.installmentAmount)}</td>
                    <td>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#9ca3af"
                        strokeWidth="2"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      <style jsx>{`
        .dashboard {
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
        }

        .dashboard-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.02em;
          margin: 0 0 4px 0;
        }

        .dashboard-subtitle {
          font-size: 0.95rem;
          color: #6b7280;
          margin: 0;
        }

        .btn-refresh {
          display: flex;
          align-items: center;
          gap: 8px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 10px 16px;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          transition: all 0.15s;
        }

        .btn-refresh:hover {
          border-color: #2563eb;
          color: #2563eb;
          background: #eff6ff;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }

        .flat-rate-section {
          margin-bottom: 24px;
        }

        .section-title {
          font-size: 1rem;
          font-weight: 600;
          color: #374151;
          margin: 0 0 14px 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .section-title::before {
          content: "";
          display: inline-block;
          width: 4px;
          height: 18px;
          background: #2563eb;
          border-radius: 2px;
        }

        .charts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }

        .upcoming-table-container {
          overflow-x: auto;
        }

        .upcoming-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .upcoming-table thead {
          border-bottom: 2px solid #e5e7eb;
        }

        .upcoming-table th {
          text-align: left;
          padding: 12px 16px;
          font-weight: 600;
          color: #6b7280;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .upcoming-table td {
          padding: 14px 16px;
          color: #374151;
          border-bottom: 1px solid #f3f4f6;
        }

        .upcoming-row {
          cursor: pointer;
          transition: background 0.1s;
        }

        .upcoming-row:hover {
          background: #f9fafb;
        }

        .td-bold {
          font-weight: 600;
        }

        .td-mono {
          font-family: monospace;
          font-size: 0.825rem;
          color: #6b7280;
        }

        .td-amount {
          font-weight: 600;
          color: #059669;
        }

        .days-badge {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 12px;
        }

        .days-badge.overdue {
          background: #fee2e2;
          color: #dc2626;
        }

        .days-badge.urgent {
          background: #fef3c7;
          color: #d97706;
        }

        .days-badge.normal {
          background: #dbeafe;
          color: #2563eb;
        }

        .loading-container,
        .error-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          gap: 16px;
        }

        .loading-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #e5e7eb;
          border-top-color: #2563eb;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .btn-retry {
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 10px 20px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-retry:hover {
          background: #1d4ed8;
        }

        @media (max-width: 768px) {
          .dashboard {
            padding: 16px;
          }

          .dashboard-header {
            flex-direction: column;
            gap: 16px;
          }

          .btn-refresh {
            width: 100%;
            justify-content: center;
          }

          .metrics-grid {
            grid-template-columns: 1fr;
          }

          .charts-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
