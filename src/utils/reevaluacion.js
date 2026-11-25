export const REEVALUACION_MAX_DIAS = 7;

export const DEFAULT_REEVALUACION = {
  programar: false,
  reevaluacion_id: null,
  fecha: "",
  hora: "",
  sin_hora_fija: false,
  tipo_motivo: "resultados",
  motivo: "",
};

const pad2 = (n) => String(n).padStart(2, "0");

export function limaYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d + Number(days || 0));
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export const REEVALUACION_ESTADOS = {
  pendiente: { label: "Pendiente", classes: "bg-violet-100 text-violet-800 border-violet-200" },
  en_espera: { label: "En espera", classes: "bg-sky-100 text-sky-800 border-sky-200" },
  en_revision: { label: "En revisión", classes: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  completada: { label: "Completada", classes: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelada: { label: "Cancelada", classes: "bg-rose-100 text-rose-800 border-rose-200" },
  no_asistio: { label: "No asistió", classes: "bg-amber-100 text-amber-800 border-amber-200" },
  vencida: { label: "Vencida", classes: "bg-slate-200 text-slate-700 border-slate-300" },
};

export function reevaluacionEstadoLabel(estado) {
  return REEVALUACION_ESTADOS[String(estado || "").toLowerCase()]?.label || String(estado || "-");
}

export function reevaluacionEstadoClasses(estado) {
  return REEVALUACION_ESTADOS[String(estado || "").toLowerCase()]?.classes || "bg-slate-100 text-slate-700 border-slate-200";
}

export const REEVALUACION_BADGE_CLASSES = "bg-violet-100 text-violet-800 border-violet-200";

export const REEVALUACION_MOTIVOS = [
  { value: "resultados", label: "Revisar resultados" },
  { value: "tratamiento", label: "Respuesta a tratamiento" },
  { value: "otro", label: "Otro" },
];

/** Modelo del formulario de la HC a partir de la fila que devuelve el servidor (solo si sigue abierta). */
export function buildReevaluacionForm(row) {
  if (!row || Number(row.abierta) !== 1) return { ...DEFAULT_REEVALUACION };
  return {
    programar: true,
    reevaluacion_id: Number(row.id) || null,
    fecha: String(row.fecha_sugerida || ""),
    hora: String(row.hora_sugerida || ""),
    sin_hora_fija: Number(row.sin_hora_fija) === 1,
    tipo_motivo: String(row.tipo_motivo || "resultados"),
    motivo: String(row.motivo || ""),
  };
}

/** "jue 26/11 · 10:30" o "jue 26/11 · sin hora fija". */
export function formatReevaluacionCuando(fecha, hora, sinHoraFija) {
  const ymd = String(fecha || "").slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return "-";
  const dt = new Date(y, m - 1, d);
  const dia = new Intl.DateTimeFormat("es-PE", { weekday: "short" }).format(dt).replace(".", "");
  const base = `${dia} ${pad2(d)}/${pad2(m)}`;
  const hm = String(hora || "").slice(0, 5);
  if (hm && !sinHoraFija) return `${base} · ${hm}`;
  return `${base} · sin hora fija`;
}
