// Agrupa los documentos del portal del paciente por atención (visita) y aplica filtro por categoría y búsqueda.
// Cada documento trae atencion_id (0 = sin atención asociada), atencion_fecha, categoria, titulo, subtitulo, fecha y estado.

function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Categorías presentes en los documentos (para mostrar solo los filtros que sirven). */
export function categoriasPresentes(documentos) {
  return [...new Set((documentos || []).map((d) => d.categoria).filter(Boolean))];
}

/**
 * @returns {Array<{id:number, fecha:string|null, documentos:Array, bloqueada:boolean, disponibles:number}>}
 * Grupos del más reciente al más antiguo; "sin atención" (id 0) siempre al final.
 * `bloqueada` = algún documento del grupo tiene saldo pendiente (el aviso se muestra una vez por grupo).
 */
export function agruparPorAtencion(documentos, { categoria = "todas", busqueda = "" } = {}) {
  const q = normalizar(busqueda).trim();
  const grupos = new Map();
  for (const doc of documentos || []) {
    if (categoria !== "todas" && doc.categoria !== categoria) continue;
    if (q && !normalizar(`${doc.titulo} ${doc.subtitulo}`).includes(q)) continue;
    const id = Number(doc.atencion_id || 0);
    if (!grupos.has(id)) grupos.set(id, { id, fecha: id > 0 ? doc.atencion_fecha || doc.fecha || null : null, documentos: [] });
    grupos.get(id).documentos.push(doc);
  }
  const lista = [...grupos.values()].map((g) => {
    g.documentos.sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
    return {
      ...g,
      fecha: g.fecha || (g.documentos[0] && g.documentos[0].fecha) || null,
      bloqueada: g.documentos.some((d) => d.estado === "pendiente_pago"),
      disponibles: g.documentos.filter((d) => d.estado === "disponible").length,
    };
  });
  lista.sort((a, b) => {
    if (a.id === 0 && b.id !== 0) return 1;
    if (b.id === 0 && a.id !== 0) return -1;
    return String(b.fecha || "").localeCompare(String(a.fecha || ""));
  });
  return lista;
}
