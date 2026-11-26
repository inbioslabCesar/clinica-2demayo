// Protocolos de receta: agrupación para la lista y conversión de la receta actual a items guardables.

export const ALCANCES = {
  medico: { clave: "medico", titulo: "Míos", opcion: "Solo yo" },
  especialidad: { clave: "especialidad", titulo: "De mi especialidad", opcion: "Mi especialidad" },
  general: { clave: "general", titulo: "De todos los médicos", opcion: "Todos los médicos" },
};

function sinTildes(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/** Grupos Míos / De mi especialidad / De todos, con filtro por nombre o por medicamento; omite los vacíos. */
export function agruparProtocolos(protocolos, filtro = "") {
  const q = sinTildes(filtro);
  const coincide = (p) => {
    if (!q) return true;
    if (sinTildes(p?.nombre).includes(q)) return true;
    return (Array.isArray(p?.items) ? p.items : []).some((it) => sinTildes(it?.nombre).includes(q));
  };
  const grupos = Object.values(ALCANCES).map((a) => ({ ...a, items: [] }));
  (Array.isArray(protocolos) ? protocolos : []).forEach((p) => {
    if (!coincide(p)) return;
    const grupo = grupos.find((g) => g.clave === (ALCANCES[p?.alcance] ? p.alcance : "medico"));
    grupo.items.push(p);
  });
  return grupos.filter((g) => g.items.length > 0);
}

function enteroPositivo(valor) {
  const n = Number.parseInt(String(valor || "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Receta actual -> items del protocolo, en el mismo orden de la lista. */
export function itemsParaProtocolo(receta) {
  return (Array.isArray(receta) ? receta : []).map((m) => ({
    codigo: m?.codigo || "",
    nombre: m?.nombre || "",
    presentacion: m?.presentacion || "",
    concentracion: m?.concentracion || "",
    laboratorio: m?.laboratorio || "",
    dosis: m?.dosis || "",
    frecuencia: m?.frecuencia || "",
    frecuencia_tipo: m?.frecuencia_tipo || "intervalo_horas",
    frecuencia_valor: m?.frecuencia_valor ?? null,
    frecuencia_horas: Array.isArray(m?.frecuencia_horas) ? m.frecuencia_horas : [],
    duracion: m?.duracion || "",
    duracion_valor: m?.duracion_valor || 5,
    duracion_unidad: m?.duracion_unidad || "dias",
    observaciones: m?.observaciones || "",
    cantidad_dispensacion: enteroPositivo(m?.cantidad_dispensacion) || 1,
    unidad_dispensacion: m?.unidad_dispensacion || "unidad",
    manual: Boolean(m?.manual),
    origen: m?.origen || "catalogo",
  }));
}
