"use client";

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export default function ChartCard({ title, description, children, actions }: ChartCardProps) {
  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">{title}</h3>
          {description && <p className="chart-description">{description}</p>}
        </div>
        {actions && <div className="chart-actions">{actions}</div>}
      </div>
      <div className="chart-body">{children}</div>

      <style jsx>{`
        .chart-card {
          min-width: 0;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
        }

        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 20px 24px 16px;
          border-bottom: 1px solid #f3f4f6;
        }

        .chart-title {
          font-size: 1.1rem;
          font-weight: 700;
          color: #111827;
          margin: 0;
        }

        .chart-description {
          font-size: 0.85rem;
          color: #6b7280;
          margin: 4px 0 0 0;
        }

        .chart-actions {
          display: flex;
          gap: 8px;
        }

        .chart-body {
          padding: 24px;
        }

        @media (max-width: 640px) {
          .chart-body { padding: 12px 4px; }
          .chart-header {
            flex-direction: column;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}
