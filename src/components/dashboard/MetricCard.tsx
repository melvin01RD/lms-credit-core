"use client";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  color?: "blue" | "green" | "red" | "orange" | "purple";
  subtitle?: string;
}

export default function MetricCard({
  title,
  value,
  icon,
  trend,
  color = "blue",
  subtitle,
}: MetricCardProps) {
  const colors = {
    blue: { bg: "#eff6ff", icon: "#2563eb", text: "#1e40af" },
    green: { bg: "#d1fae5", icon: "#059669", text: "#047857" },
    red: { bg: "#fee2e2", icon: "#dc2626", text: "#b91c1c" },
    orange: { bg: "#fef3c7", icon: "#d97706", text: "#b45309" },
    purple: { bg: "#f3e8ff", icon: "#9333ea", text: "#7e22ce" },
  };

  const colorScheme = colors[color];

  return (
    <div className="metric-card">
      <div className="metric-header">
        <div className="metric-icon" style={{ background: colorScheme.bg }}>
          <div style={{ color: colorScheme.icon }}>{icon}</div>
        </div>
        <div className="metric-info">
          <div className="metric-title">{title}</div>
          {subtitle && <div className="metric-subtitle">{subtitle}</div>}
        </div>
      </div>

      <div className="metric-value" style={{ color: colorScheme.text }}>
        {value}
      </div>

      {trend && (
        <div className="metric-trend">
          {trend.direction === "up" ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={trend.value >= 0 ? "#059669" : "#dc2626"}
              strokeWidth="2"
            >
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#dc2626"
              strokeWidth="2"
            >
              <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
              <polyline points="17 18 23 18 23 12" />
            </svg>
          )}
          <span
            className="trend-text"
            style={{ color: trend.value >= 0 ? "#059669" : "#dc2626" }}
          >
            {trend.value >= 0 ? "+" : ""}
            {trend.value}%
          </span>
          <span className="trend-label">vs mes anterior</span>
        </div>
      )}

      <style jsx>{`
        .metric-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 20px;
          transition: all 0.2s;
        }
        .metric-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          transform: translateY(-2px);
        }

        .metric-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 16px;
        }

        .metric-icon {
          width: 48px;
          height: 48px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .metric-info {
          flex: 1;
          min-width: 0;
        }

        .metric-title {
          font-size: 0.875rem;
          font-weight: 500;
          color: #6b7280;
          margin-bottom: 2px;
        }

        .metric-subtitle {
          font-size: 0.75rem;
          color: #9ca3af;
        }

        .metric-value {
          overflow-wrap: anywhere;
          font-size: 1.875rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-bottom: 8px;
        }

        .metric-trend {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
        }

        .trend-text {
          font-weight: 600;
        }

        .trend-label {
          color: #9ca3af;
        }

        @media (max-width: 640px) {
          .metric-value {
            font-size: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}
