import { authFetch } from "../utils/apiClient";

// Panel del personal para el portal del paciente. __skipAuthEvent: un 403 (módulo apagado o sin permiso)
// se muestra como mensaje y no debe interpretarse como cierre de sesión.
const OPCIONES = { __skipAuthEvent: true };

async function llamar(accion, { method = "GET", body, params = {} } = {}) {
  const query = new URLSearchParams({ accion, ...params });
  const res = await authFetch(`api_paciente_portal_gestion.php?${query.toString()}`, {
    ...OPCIONES,
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok || !payload?.success) {
    const err = new Error(payload?.error || `Error HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return payload;
}

export const buscarPacientesPortal = (q) => llamar("buscar", { params: { q } }).then((p) => p.data || []);
export const obtenerPacientePortal = (pacienteId) => llamar("paciente", { params: { paciente_id: pacienteId } });
export const obtenerConfigPortal = () => llamar("config");
export const guardarConfigPortal = (modo, bloquearDeuda) =>
  llamar("guardar_config", { method: "POST", body: { modo, bloquear_deuda: bloquearDeuda } });
export const generarPinPortal = (pacienteId) => llamar("generar_pin", { method: "POST", body: { paciente_id: pacienteId } });
export const desactivarAccesoPortal = (pacienteId) =>
  llamar("desactivar_acceso", { method: "POST", body: { paciente_id: pacienteId } });
export const decidirDocumentoPortal = (pacienteId, tipo, refId, decision, motivo = "") =>
  llamar("liberar", { method: "POST", body: { paciente_id: pacienteId, tipo, ref_id: refId, decision, motivo } });
export const publicarArchivoPortal = (pacienteId, tipo, refId, publicar) =>
  llamar("publicar_archivo", { method: "POST", body: { paciente_id: pacienteId, tipo, ref_id: refId, publicar } });
