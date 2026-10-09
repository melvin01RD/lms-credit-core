"use client";

export default function SessionTransition({ message, error, onRetry }: {
  message: string;
  error?: string;
  onRetry?: () => void;
}) {
  // Independent styles: this screen also renders before the dashboard's styles mount.
  return <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#F5F6FB", color: "#334155", padding: 24 }}>
    <div style={{ textAlign: "center" }} role={error ? "alert" : "status"} aria-live="polite">
      <strong>LMS Credit Core</strong>
      <p style={{ marginTop: 12 }}>{error || message}</p>
      {error && onRetry && <button onClick={onRetry} style={{ minHeight: 44, padding: "8px 20px", marginTop: 16, borderRadius: 8, background: "#6B21E8", color: "white" }}>Reintentar</button>}
    </div>
  </div>;
}
