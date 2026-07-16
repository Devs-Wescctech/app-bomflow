import { useEffect, useRef } from "react";

// Conecta no stream SSE do Atendimento (/api/attendance/stream?token=JWT) e
// entrega os eventos `message` e `conversation` via callbacks.
// Reconecta automaticamente com backoff simples quando a conexão cai.
export function useAttendanceSSE({ onMessage, onConversation, enabled = true }) {
  const handlersRef = useRef({ onMessage, onConversation });
  handlersRef.current = { onMessage, onConversation };

  useEffect(() => {
    if (!enabled) return undefined;

    let es = null;
    let retryTimer = null;
    let retryDelay = 2000;
    let closed = false;

    const connect = () => {
      const token = localStorage.getItem("accessToken");
      if (!token) return;

      es = new EventSource(`/api/attendance/stream?token=${encodeURIComponent(token)}`);

      es.addEventListener("message", (e) => {
        retryDelay = 2000;
        try {
          const data = JSON.parse(e.data);
          handlersRef.current.onMessage?.(data);
        } catch {
          /* payload inválido — ignora */
        }
      });

      es.addEventListener("conversation", (e) => {
        try {
          const data = JSON.parse(e.data);
          handlersRef.current.onConversation?.(data);
        } catch {
          /* ignora */
        }
      });

      es.onerror = () => {
        es?.close();
        if (closed) return;
        retryTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 30000);
          connect();
        }, retryDelay);
      };
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [enabled]);
}
