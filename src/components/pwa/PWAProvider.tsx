"use client";

import { useEffect, useState } from "react";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

export default function PWAProvider() {
  const [offline, setOffline] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const connectivity = () => setOffline(!navigator.onLine);
    connectivity();
    setIos(/iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches);
    const install = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const installed = () => { setPrompt(null); setIos(false); };
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('appinstalled', installed);
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(console.error);
    }
    return () => {
      window.removeEventListener('online', connectivity); window.removeEventListener('offline', connectivity);
      window.removeEventListener('beforeinstallprompt', install); window.removeEventListener('appinstalled', installed);
    };
  }, []);
  return <>
    {offline && <div className="connectivity-banner" role="alert">Sin conexión. No se pueden registrar pagos. <a href="/offline.html">Más información</a></div>}
    {!dismissed && !offline && (prompt || ios) && <aside className="install-banner" aria-label="Instalar LMS Credit Core">
      {prompt ? <button onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }}>Instalar LMS Credit Core</button> : <span>En Safari: Compartir → Añadir a pantalla de inicio.</span>}
      <button aria-label="Ocultar instrucciones de instalación" onClick={() => setDismissed(true)}>Cerrar</button>
    </aside>}
  </>;
}
