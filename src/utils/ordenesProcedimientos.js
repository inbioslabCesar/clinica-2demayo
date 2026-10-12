import { authFetch } from "./apiClient";

export async function cargarOrdenesProcedimientos(consultaId, { vista = "", signal } = {}) {
  const params = new URLSearchParams({
    consulta_id: String(consultaId),
    _t: String(Date.now()),
  });
  if (vista) params.set("vista", vista);
  const response = await authFetch(`api_ordenes_procedimientos.php?${params}`, {
    cache: "no-store",
    signal,
  });
  const data = await response.json();
  if (!response.ok || data?.success !== true || !Array.isArray(data?.ordenes)) {
    const referencia = data?.request_id ? ` (Referencia: ${data.request_id})` : "";
    throw new Error(`${data?.error || "No se pudieron cargar las solicitudes de procedimientos."}${referencia}`);
  }
  return data.ordenes;
}
