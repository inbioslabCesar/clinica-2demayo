const TTL_MS = 2 * 60 * 60 * 1000;
const claveAlmacen = (pacienteId) => `servicios_volver_a:${Number(pacienteId || 0)}`;

const esRutaInterna = (valor) => typeof valor === "string" && valor.trim().startsWith("/") && !valor.trim().startsWith("//");
const limpiar = (valor) => (typeof valor === "string" ? valor.trim() : "");

const ETIQUETAS = {
  "/pacientes": "Volver a Pacientes",
  "/cotizaciones": "Volver a Atenciones",
  "/recordatorios-citas": "Volver a Recordatorios",
  "/": "Volver al Dashboard",
};

/** Solo se recuerda el origen "lista de Pacientes" (con sus filtros de URL); el resto viaja en state/query. */
export const esOrigenPacientes = (ruta) => esRutaInterna(ruta) && /^\/pacientes(\?|$)/.test(ruta.trim());

/**
 * Ruta a la que vuelve la pantalla de servicios. Nunca depende del historial del navegador:
 * los módulos regresan a servicios con un navigate nuevo, y -1 terminaba reabriendo el módulo.
 * Prioridad: origen explícito (state o ?back_to) > origen recordado (lista de Pacientes) > /pacientes o /.
 */
export function resolverRutaVolver({ state, query, pacienteId, guardada } = {}) {
  const deState = limpiar(state?.backTo) || limpiar(state?.from);
  const explicita = deState || limpiar(query);
  if (esRutaInterna(explicita)) return explicita;
  if (Number(pacienteId || 0) > 0 && esOrigenPacientes(guardada)) return guardada.trim();
  return pacienteId ? "/pacientes" : "/";
}

export function etiquetaVolver(ruta) {
  const base = String(ruta || "").split("?")[0];
  return ETIQUETAS[base] || "Volver";
}

export function guardarOrigenPacientes(almacen, pacienteId, ruta, ahora = Date.now()) {
  if (!almacen || Number(pacienteId || 0) <= 0 || !esOrigenPacientes(ruta)) return;
  try {
    almacen.setItem(claveAlmacen(pacienteId), JSON.stringify({ ruta: ruta.trim(), t: ahora }));
  } catch {
    /* almacenamiento no disponible: se usa /pacientes */
  }
}

export function leerOrigenPacientes(almacen, pacienteId, ahora = Date.now()) {
  if (!almacen || Number(pacienteId || 0) <= 0) return "";
  try {
    const dato = JSON.parse(almacen.getItem(claveAlmacen(pacienteId)) || "null");
    if (!dato || !esOrigenPacientes(dato.ruta) || ahora - Number(dato.t || 0) > TTL_MS) return "";
    return dato.ruta;
  } catch {
    return "";
  }
}

export function olvidarOrigenPacientes(almacen, pacienteId) {
  try {
    almacen?.removeItem(claveAlmacen(pacienteId));
  } catch {
    /* sin acción */
  }
}
