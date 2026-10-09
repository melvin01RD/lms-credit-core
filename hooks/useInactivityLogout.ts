"use client";

import { useEffect, useRef } from "react";
import { INACTIVITY_TIMEOUT_MS } from "@/lib/config/session";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
] as const;

const THROTTLE_MS = 1_000;
const CHANNEL_NAME = "lms_activity";

/**
 * Escucha actividad del usuario y dispara logout automático tras INACTIVITY_TIMEOUT_MS
 * de inactividad. Sincroniza el timer entre pestañas vía BroadcastChannel.
 * El layout lo habilita únicamente después de confirmar la sesión.
 * El cierre utiliza el mismo callback que el botón de logout.
 */
export function useInactivityLogout(onLogout: () => void, enabled: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(0);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const callback = useRef(onLogout);
  callback.current = onLogout;

  useEffect(() => {
    if (!enabled) return;
    let expired = false;

    function logout() {
      if (expired) return;
      expired = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      callback.current();
    }

    function resetTimer() {
      if (expired) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(logout, INACTIVITY_TIMEOUT_MS);
    }

    function resume() {
      if (document.visibilityState === "visible" && Date.now() - lastActivityRef.current >= INACTIVITY_TIMEOUT_MS) void logout();
    }

    function handleActivity() {
      if (expired) return;
      const now = Date.now();
      if (now - lastActivityRef.current >= INACTIVITY_TIMEOUT_MS) { void logout(); return; }
      if (now - lastActivityRef.current < THROTTLE_MS) return;
      lastActivityRef.current = now;
      resetTimer();
      channelRef.current?.postMessage("activity");
    }

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
    channelRef.current = channel;
    if (channel) channel.onmessage = (event) => {
      if (expired || event.data !== "activity") return;
      lastActivityRef.current = Date.now(); resetTimer();
    };
    lastActivityRef.current = Date.now();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);

    const passiveEvents = new Set(["scroll", "touchstart"]);
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, {
        passive: passiveEvents.has(event),
      });
    });

    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      channel?.close();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
      channelRef.current = null;
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled]);
}
