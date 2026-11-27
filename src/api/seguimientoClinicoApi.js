import { authFetch } from "../utils/apiClient";

// Seguimiento clínico. __skipAuthEvent: un 403 (módulo apagado) se muestra como mensaje y no debe interpretarse como cierre de sesión.
const OPCIONES = { __skipAuthEvent: true, cache: "no-store" };

async function llamar(url, params = {}) {
  const query = new URLSearchParams(params);
  const res = await authFetch(`${url}?${query.toString()}`, OPCIONES);
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok || payload?.success === false) {
    const err = new Error(payload?.error || `Error HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return payload || {};
}

const API = "api_seguimiento_clinico.php";

export const estadoSeguimiento = () => llamar(API, { accion: "estado" });
export const buscarPacientesSeguimiento = (q, signal) =>
  authFetch(`${API}?${new URLSearchParams({ accion: "buscar", q }).toString()}`, { ...OPCIONES, signal })
    .then((res) => res.json().then((p) => ({ ok: res.ok, p })))
    .then(({ ok, p }) => {
      if (!ok || p?.success === false) throw new Error(p?.error || "No se pudo buscar");
      return { pacientes: p.pacientes || [], mensaje: p.mensaje || "" };
    });
export const historialPaciente = (pacienteId, pagina = 1, porPagina = 10) =>
  llamar(API, { accion: "historial", paciente_id: pacienteId, pagina, por_pagina: porPagina });
export const detalleConsultaSeguimiento = (consultaId) => llamar(API, { accion: "detalle", consulta_id: consultaId });

// Agenda del médico (endpoint existente de horarios): horas libres y ocupadas de una fecha.
export const agendaMedicoDia = (medicoId, fecha) =>
  llamar("api_horarios_disponibles.php", { medico_id: medicoId, fecha });
