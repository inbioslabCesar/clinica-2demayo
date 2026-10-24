import { useCallback, useRef, useState } from "react";

export function generarClientRequestId(prefix = "cotizacion") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Evita envíos duplicados de un registro (doble clic, dos botones, reintento).
 * - `run(task, fingerprint)` ignora llamadas mientras haya una en curso (candado síncrono con ref).
 * - `task` recibe `(clientRequestId, release)`. El id se conserva entre intentos con el mismo
 *   `fingerprint` (el backend reconoce el reintento) y cambia si el contenido cambia.
 *   Hay que llamar `release()` cuando el registro se confirmó, para que el siguiente use un id nuevo.
 */
export default function useSubmitGuard(prefix = "cotizacion") {
  const lockRef = useRef(false);
  const requestRef = useRef({ id: "", fingerprint: "" });
  const [saving, setSaving] = useState(false);

  const release = useCallback(() => {
    requestRef.current = { id: "", fingerprint: "" };
  }, []);

  const run = useCallback(async (task, fingerprint = "") => {
    if (lockRef.current) return undefined;
    lockRef.current = true;
    setSaving(true);
    try {
      if (!requestRef.current.id || requestRef.current.fingerprint !== fingerprint) {
        requestRef.current = { id: generarClientRequestId(prefix), fingerprint };
      }
      return await task(requestRef.current.id, release);
    } finally {
      lockRef.current = false;
      setSaving(false);
    }
  }, [prefix, release]);

  return { saving, run };
}
