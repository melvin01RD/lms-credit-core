"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // BUG-S1-05: leer del DOM para capturar autofill que bypasea onChange de React
    const emailValue =
      (document.getElementById("email") as HTMLInputElement)?.value ?? email;
    const passwordValue =
      (document.getElementById("password") as HTMLInputElement)?.value ?? password;

    if (!emailValue.trim() || !passwordValue.trim()) {
      setError("Por favor ingresa tu correo y contraseña.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailValue, password: passwordValue }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg =
          data.error?.message ||
          data.error?.details?.[0]?.message ||
          "Error al iniciar sesión";
        setError(msg);
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Error de conexión. Intente nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-left">
        <div className="login-brand">
          <div className="brand-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#2563eb" />
              <path
                d="M8 16.5L13 21.5L24 10.5"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="brand-name">LMS Credit Core</h1>
        </div>

        <div className="login-hero">
          <h2 className="hero-title">Gestión de Préstamos</h2>
          <p className="hero-subtitle">
            Administra créditos, clientes y pagos de forma simple y eficiente.
          </p>
        </div>

        <div className="login-stats">
          <div className="stat-item">
            <div className="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <span>Gestión de clientes</span>
          </div>
          <div className="stat-item">
            <div className="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <span>Control de préstamos</span>
          </div>
          <div className="stat-item">
            <div className="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            </div>
            <span>Registro de pagos</span>
          </div>
        </div>
      </div>

      <div className="login-right">
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-header">
            <h3 className="form-title">Iniciar Sesión</h3>
            <p className="form-subtitle">Ingrese sus credenciales para continuar</p>
          </div>

          {error && (
            <div className="form-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email" className="form-label">
              Correo electrónico
            </label>
            <div className="input-wrapper">
              <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <input
                id="email"
                type="text"
                className="form-input"
                placeholder="usuario@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              Contraseña
            </label>
            <div className="input-wrapper">
              <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="form-submit"
            disabled={loading}
          >
            {loading ? (
              <span className="loading-spinner" />
            ) : (
              "Entrar"
            )}
          </button>

          <p className="form-footer">
            Sistema de uso interno — LMS Credit Core v1.0
          </p>
        </form>
      </div>

      <style jsx>{`
        .login-container {
          display: flex;
          min-height: 100vh;
          font-family: var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        /* ===== PANEL IZQUIERDO ===== */
        .login-left {
          flex: 1;
          background: linear-gradient(135deg, #1e3a5f 0%, #0f2744 50%, #0a1929 100%);
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 3rem 4rem;
          color: white;
          position: relative;
          overflow: hidden;
        }

        .login-left::before {
          content: "";
          position: absolute;
          top: -50%;
          right: -30%;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(37, 99, 235, 0.15) 0%, transparent 70%);
          pointer-events: none;
        }

        .login-left::after {
          content: "";
          position: absolute;
          bottom: -20%;
          left: -10%;
          width: 400px;
          height: 400px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%);
          pointer-events: none;
        }

        .login-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 4rem;
          position: relative;
          z-index: 1;
        }

        .brand-icon {
          flex-shrink: 0;
        }

        .brand-name {
          font-size: 1.25rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: white;
        }

        .login-hero {
          position: relative;
          z-index: 1;
          margin-bottom: 3rem;
        }

        .hero-title {
          font-size: 2.5rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1.15;
          margin-bottom: 1rem;
          background: linear-gradient(135deg, #ffffff 0%, #93c5fd 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero-subtitle {
          font-size: 1.1rem;
          color: rgba(255, 255, 255, 0.6);
          line-height: 1.6;
          max-width: 360px;
        }

        .login-stats {
          display: flex;
          flex-direction: column;
          gap: 16px;
          position: relative;
          z-index: 1;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .stat-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #60a5fa;
          flex-shrink: 0;
        }

        /* ===== PANEL DERECHO ===== */
        .login-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          background: #fafbfc;
        }

        .login-form {
          width: 100%;
          max-width: 400px;
        }

        .form-header {
          margin-bottom: 2rem;
        }

        .form-title {
          font-size: 1.65rem;
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.02em;
          margin-bottom: 0.4rem;
        }

        .form-subtitle {
          font-size: 0.925rem;
          color: #6b7280;
        }

        .form-error {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 10px;
          padding: 12px 16px;
          margin-bottom: 1.5rem;
          color: #dc2626;
          font-size: 0.875rem;
          animation: shake 0.4s ease-in-out;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }

        .form-group {
          margin-bottom: 1.25rem;
        }

        .form-label {
          display: block;
          font-size: 0.825rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 6px;
          letter-spacing: 0.01em;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 14px;
          color: #9ca3af;
          pointer-events: none;
          z-index: 1;
        }

        .form-input {
          width: 100%;
          height: 48px;
          padding: 0 14px 0 44px;
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          font-size: 0.95rem;
          color: #111827;
          background: white;
          transition: all 0.2s ease;
          outline: none;
        }

        .form-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }

        .form-input::placeholder {
          color: #c9cdd4;
        }

        .password-toggle {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          cursor: pointer;
          color: #9ca3af;
          padding: 4px;
          display: flex;
          align-items: center;
          transition: color 0.2s;
        }

        .password-toggle:hover {
          color: #6b7280;
        }

        .form-submit {
          width: 100%;
          height: 48px;
          margin-top: 0.5rem;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          letter-spacing: 0.01em;
        }

        .form-submit:hover:not(:disabled) {
          background: #1d4ed8;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
        }

        .form-submit:active:not(:disabled) {
          transform: translateY(0);
        }

        .form-submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .loading-spinner {
          width: 20px;
          height: 20px;
          border: 2.5px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .form-footer {
          text-align: center;
          margin-top: 2rem;
          font-size: 0.75rem;
          color: #9ca3af;
        }

        /* ===== RESPONSIVE ===== */
        @media (max-width: 768px) {
          .login-container {
            flex-direction: column;
          }

          .login-left {
            padding: 2rem 1.5rem;
            min-height: auto;
          }

          .hero-title {
            font-size: 1.75rem;
          }

          .login-stats {
            display: none;
          }

          .login-brand {
            margin-bottom: 2rem;
          }

          .login-hero {
            margin-bottom: 1.5rem;
          }

          .login-right {
            padding: 2rem 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}
