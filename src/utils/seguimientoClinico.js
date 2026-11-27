// Utilidades de Seguimiento Clínico: presentar con claridad lo que guarda cada HC.
// Las plantillas por especialidad guardan claves propias ("motivo_de_consulta", "plan_de_trabajo"...), así que la vista es genérica.

/** Metadatos de la plantilla de HC que no son contenido clínico. */
const CLAVES_NO_CLINICAS = new Set(["template"]);

export function etiquetaClave(clave) {
  const texto = String(clave || "").replace(/_/g, " ").trim();
  if (!texto) return "";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function esValorVacio(valor) {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === "string") return valor.trim() === "";
  if (Array.isArray(valor)) return valor.every(esValorVacio);
  if (typeof valor === "object") return Object.values(valor).every(esValorVacio);
  return false;
}

/** Tipo de presentación de un campo de la HC. */
export function tipoCampoHc(clave, valor) {
  if (clave === "diagnosticos" && Array.isArray(valor)) return "diagnosticos";
  if (clave === "receta" && Array.isArray(valor)) return "receta";
  if (Array.isArray(valor)) return "lista";
  if (valor && typeof valor === "object") return "objeto";
  return "texto";
}

/** Campos de la HC a mostrar, en el orden guardado: sin metadatos de plantilla ni campos vacíos. */
export function camposVisiblesHc(datos) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) return [];
  return Object.entries(datos)
    .filter(([clave, valor]) => !CLAVES_NO_CLINICAS.has(clave) && !esValorVacio(valor))
    .map(([clave, valor]) => ({ clave, etiqueta: etiquetaClave(clave), tipo: tipoCampoHc(clave, valor), valor }));
}

/** Fecha YYYY-MM-DD (o con hora) a DD/MM/AAAA sin pasar por zonas horarias. */
export function formatearFechaCorta(valor) {
  const m = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Números de página a mostrar (con null donde hay un salto): 1 … 4 5 [6] 7 8 … 20. */
export function paginasVisibles(actual, totalPaginas, ventana = 1) {
  const total = Math.max(1, Number(totalPaginas) || 1);
  const pag = Math.min(Math.max(1, Number(actual) || 1), total);
  const mostrar = new Set([1, total]);
  for (let i = pag - ventana; i <= pag + ventana; i += 1) {
    if (i >= 1 && i <= total) mostrar.add(i);
  }
  const orden = [...mostrar].sort((a, b) => a - b);
  const salida = [];
  orden.forEach((n, i) => {
    if (i > 0 && n - orden[i - 1] > 1) salida.push(null);
    salida.push(n);
  });
  return salida;
}

export function formatearHora(valor) {
  const m = String(valor || "").match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}

const ESTADOS = {
  completada: { texto: "Atendida", clase: "bg-emerald-100 text-emerald-800" },
  pendiente: { texto: "Programada", clase: "bg-blue-100 text-blue-800" },
  falta_cancelar: { texto: "Falta cancelar", clase: "bg-amber-100 text-amber-800" },
  cancelada: { texto: "Cancelada", clase: "bg-gray-200 text-gray-700" },
};

export function insigniaEstado(estado) {
  return ESTADOS[String(estado || "").toLowerCase()] || { texto: String(estado || "—"), clase: "bg-gray-100 text-gray-700" };
}

/** Texto de la línea de tiempo para el diagnóstico principal. */
export function textoDiagnostico(item) {
  const dx = item?.diagnostico_principal;
  if (!dx || !dx.nombre) return item?.tiene_hc ? "Sin diagnóstico registrado" : "Sin historia clínica";
  const extra = Number(item?.total_diagnosticos || 0) > 1 ? ` (+${item.total_diagnosticos - 1})` : "";
  return `${dx.codigo ? `${dx.codigo} · ` : ""}${dx.nombre}${extra}`;
}
