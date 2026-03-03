"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

interface User {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: "Clientes",
    href: "/dashboard/clients",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: "Préstamos",
    href: "/dashboard/loans",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    label: "Pagos",
    href: "/dashboard/payments",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    label: "Reportes",
    href: "/dashboard/reportes",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) {
          router.push("/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.user) setUser(data.user);
        setLoading(false);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  if (loading) {
    return (
      <div className="layout-loading">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="layout-container">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#6B21E8" />
            <path d="M8 16.5L13 21.5L24 10.5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="sidebar-brand-text">LMS Credit</span>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${isActive(item.href) ? "sidebar-link-active" : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              <span className="sidebar-link-label">{item.label}</span>
            </Link>
          ))}

          {/* Solo visible para ADMIN */}
          {user?.role === "ADMIN" && (
            <>
              <Link
                href="/dashboard/users"
                className={`sidebar-link ${isActive("/dashboard/users") ? "sidebar-link-active" : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="sidebar-link-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                  </svg>
                </span>
                <span className="sidebar-link-label">Usuarios</span>
              </Link>

              <Link
                href="/dashboard/settings"
                className={`sidebar-link ${isActive("/dashboard/settings") ? "sidebar-link-active" : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="sidebar-link-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </span>
                <span className="sidebar-link-label">Configuración</span>
              </Link>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-info">
            <div className="sidebar-avatar">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="sidebar-user-details">
              <span className="sidebar-user-name">{user?.firstName} {user?.lastName}</span>
              <span className="sidebar-user-role">{user?.role}</span>
            </div>
          </div>
          <button className="sidebar-logout" onClick={handleLogout} aria-label="Cerrar sesión">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="main-area">
        {/* Header */}
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Abrir menú">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div className="topbar-right">
            <span className="topbar-greeting">
              {user?.firstName} {user?.lastName}
              <span className={`topbar-badge ${user?.role === "ADMIN" ? "badge-admin" : "badge-operator"}`}>
                {user?.role}
              </span>
            </span>
          </div>
        </header>

        {/* Content */}
        <main className="main-content" role="main">
          {children}
        </main>
      </div>

      <style jsx>{`
        .layout-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #e5e7eb;
          border-top-color: #6B21E8;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .layout-container {
          display: flex;
          min-height: 100vh;
          background: #F5F6FB;
          font-family: var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        /* ===== SIDEBAR ===== */
        .sidebar {
          width: 240px;
          background: #1E2A4A;
          border-right: 1px solid #263554;
          display: flex;
          flex-direction: column;
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          z-index: 40;
          transition: transform 0.2s ease;
        }

        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 20px 20px 28px;
        }
        .sidebar-brand-text {
          font-size: 1.1rem;
          font-weight: 700;
          color: white;
          letter-spacing: -0.02em;
        }

        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 0 12px;
        }

        .sidebar-link {
          display: flex !important;
          align-items: center !important;
          gap: 12px !important;
          padding: 10px 12px !important;
          border-radius: 8px !important;
          font-size: 0.9rem !important;
          font-weight: 500 !important;
          color: #A8B8D8 !important;
          transition: all 0.15s ease !important;
        }
        .sidebar-link:hover {
          background: #263554 !important;
          color: white !important;
        }
        .sidebar-link-active {
          background: #6B21E8 !important;
          color: white !important;
        }
        .sidebar-link-active:hover {
          background: #7C3AED !important;
          color: white !important;
        }
        .sidebar-link-icon {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          color: inherit;
        }
        .sidebar-link-label {
          color: inherit;
        }

        .sidebar-footer {
          padding: 16px;
          border-top: 1px solid #263554;
        }
        .sidebar-user-info {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        .sidebar-avatar {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: #6B21E8;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 700;
          flex-shrink: 0;
        }
        .sidebar-user-details {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .sidebar-user-name {
          font-size: 0.825rem;
          font-weight: 600;
          color: white;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sidebar-user-role {
          font-size: 0.7rem;
          color: #A8B8D8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .sidebar-logout {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #263554;
          border-radius: 8px;
          background: none;
          font-size: 0.8rem;
          font-weight: 500;
          color: #A8B8D8;
          cursor: pointer;
          transition: all 0.15s;
        }
        .sidebar-logout:hover {
          border-color: #ef4444;
          color: #ef4444;
          background: #fef2f2;
        }

        /* ===== MAIN AREA ===== */
        .main-area {
          flex: 1;
          margin-left: 240px;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        }

        /* ===== TOPBAR ===== */
        .topbar {
          height: 56px;
          background: white;
          border-bottom: 1px solid #E0E0F0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 0 24px;
          position: sticky;
          top: 0;
          z-index: 30;
        }
        .menu-toggle {
          display: none;
          background: none;
          border: none;
          color: #6b7280;
          cursor: pointer;
          padding: 4px;
        }
        .topbar-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .topbar-greeting {
          font-size: 0.85rem;
          color: #374151;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .topbar-badge {
          font-size: 0.7rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 4px;
        }
        .badge-admin {
          background: #EDE9FE;
          color: #6B21E8;
        }
        .badge-operator {
          background: #f3f4f6;
          color: #6b7280;
        }
        /* ===== CONTENT ===== */
        .main-content {
          flex: 1;
          padding: 24px;
        }

        /* ===== MOBILE OVERLAY ===== */
        .sidebar-overlay {
          display: none;
        }

        /* ===== RESPONSIVE ===== */
        @media (max-width: 768px) {
          .sidebar {
            transform: translateX(-100%);
          }
          .sidebar-open {
            transform: translateX(0);
          }
          .sidebar-overlay {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.4);
            z-index: 35;
          }
          .main-area {
            margin-left: 0;
          }
          .menu-toggle {
            display: flex;
          }
          .topbar {
            justify-content: space-between;
          }
        }
      `}</style>
    </div>
  );
}
