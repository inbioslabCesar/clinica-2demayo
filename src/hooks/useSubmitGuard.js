import { useRef, useState } from "react";

export function generarClientRequestId(prefix = "cotizacion") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Lógica del candado, independiente de React para poder probarla.
 * - `run(task, fingerprint)` ignora llamadas mientras haya una en curso (candado síncrono).
 * - `task` recibe `(clientRequestId, release)`. El id se conserva entre intentos con el mismo
 *   `fingerprint` (el backend reconoce el reintento) y cambia si el contenido cambia.
 *   Hay que llamar `release()` cuando el registro se confirmó, para que el siguiente use un id nuevo.
 */
export function createSubmitGuard(prefix = "cotizacion", onBusyChange = () => {}) {
  let locked = false;
  let request = { id: "", fingerprint: "" };

  const release = () => {
    request = { id: "", fingerprint: "" };
  };

  const run = async (task, fingerprint = "") => {
    if (locked) return undefined;
    locked = true;
    onBusyChange(true);
    try {
      if (!request.id || request.fingerprint !== fingerprint) {
        request = { id: generarClientRequestId(prefix), fingerprint };
      }
      return await task(request.id, release);
    } finally {
      locked = false;
      onBusyChange(false);
    }
  };

  return { run, release };
}

/** Hook: expone `saving` (para deshabilitar botones) y `run` (envío protegido). */
export default function useSubmitGuard(prefix = "cotizacion") {
  const [saving, setSaving] = useState(false);
  const guardRef = useRef(null);
  if (!guardRef.current) {
    guardRef.current = createSubmitGuard(prefix, setSaving);
  }
  return { saving, run: guardRef.current.run };
}
