import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiFileText,
  FiPrinter,
  FiSave,
  FiTrash2,
  FiUser,
} from "react-icons/fi";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  eliminarPlantillaResultadoClinicoOcupacional,
  guardarPlantillaResultadoClinicoOcupacional,
  guardarResultadoClinicoOcupacional,
  obtenerDetalleOrdenOcupacional,
  obtenerResultadoClinicoOcupacional,
  registrarEmisionPdfResultadoClinicoOcupacional,
} from "../../api/ocupacionalApi";
import FormatoClinicoCampos from "../../components/ocupacional/FormatoClinicoCampos";
import { BASE_URL } from "../../config/config";
import { authFetch } from "../../utils/apiClient";
import { formatColegiatura, formatProfesionalName } from "../../utils/profesionalDisplay";

const RESULTADO_ESTADOS = {
  pendiente: { label: "Sin atender", icon: FiAlertCircle, className: "border-red-200 bg-red-50 text-red-700" },
  borrador: { label: "En proceso", icon: FiClock, className: "border-amber-200 bg-amber-50 text-amber-800" },
  finalizado: { label: "Finalizado", icon: FiCheckCircle, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  observado: { label: "Observado", icon: FiAlertCircle, className: "border-rose-300 bg-rose-100 text-rose-800" },
};

const PSICO_TEMPLATE_CODES = ["psicologia_basica", "epworth_test", "fobia_estres"];
const PSICO_MAIN_DEFAULTS = {
  presentacion: "adecuada",
  postura: "erguida",
  discurso_ritmo: "fluido",
  discurso_tono: "moderado",
  discurso_articulacion: "sin_dificultad",
  orientacion_tiempo: "orientado",
  orientacion_espacio: "orientado",
  orientacion_persona: "orientado",
  nivel_intelectual: "NORMAL PROMEDIO",
  coordinacion_visomotriz: "ADECUADO A LA REALIDAD",
  nivel_memoria: "ADECUADO (CORTO PLAZO) (MEDIANO PLAZO) (LARGO PLAZO)",
  personalidad: "TENDENCIA A LA ESTABILIDAD EMOCIONAL",
  afectividad: "MANEJO ADECUADO DE EMOCIONES",
  motivo_evaluacion: "EVALUACION MEDICA OCUPACIONAL",
  conclusion_cognitiva: "COMUNICACION ASERTIVA, PRESENTA ADECUADO ALINO HIGIENE PERSONAL\nORIENTADO EN TIEMPO ESPACIO Y PERSONA\nNIEGA TENER ANTECEDENTES JUDICIALES POLICIALES Y PENALES ASI COMO CONSUMIR SUSTANCIAS PSICOACTIVAS.\nCAPACIDAD DE MEMORIA CORTO MEDIANO Y LARGO PLAZO ADECUADO.",
  conclusion_emocional: "NO SE ENCUENTRA INDICADORES QUE ALTEREN DICHA AREA Y PUESTO DE TRABAJO EN LA EMPRESA\nHABILIDADES SOCIALES ADECUADA\nTENDENCIA A LA ESTABILIDAD EMOCIONAL",
  recomendaciones: "APTO PSICOLOGICAMENTE PARA EL PUESTO QUE POSTULA",
};

const PSICO_MAIN_KEYS = [
  "presentacion",
  "postura",
  "discurso_ritmo",
  "discurso_tono",
  "discurso_articulacion",
  "orientacion_tiempo",
  "orientacion_espacio",
  "orientacion_persona",
  "nivel_intelectual",
  "coordinacion_visomotriz",
  "nivel_memoria",
  "personalidad",
  "afectividad",
  "motivo_evaluacion",
  "conclusion_cognitiva",
  "conclusion_emocional",
  "recomendaciones",
  "observaciones",
];

function emptyPatch(keys) {
  return keys.reduce((acc, key) => {
    acc[key] = "";
    return acc;
  }, {});
}

function epworthPatch(value) {
  const patch = { obs: "" };
  for (let i = 1; i <= 8; i += 1) patch[`p${i}`] = value;
  return patch;
}

function fobiaPatch(value) {
  const patch = { obs: "" };
  for (let i = 1; i <= 22; i += 1) patch[`p${i}`] = value;
  return patch;
}

function resolveAssetUrl(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";
  if (/^(https?:\/\/|data:|blob:)/i.test(raw)) return raw;
  return `${BASE_URL}${raw.replace(/^\/+/, "")}`;
}

function inferDataUrlImageFormat(dataUrl) {
  if (/^data:image\/png/i.test(String(dataUrl || ""))) return "PNG";
  if (/^data:image\/jpe?g/i.test(String(dataUrl || ""))) return "JPEG";
  return "PNG";
}

async function loadImageAsDataUrl(imageUrl) {
  if (!imageUrl) return "";
  if (/^data:image\//i.test(String(imageUrl))) return String(imageUrl);
  const response = await fetch(imageUrl, { credentials: "include" });
  if (!response.ok) return "";
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer imagen"));
    reader.readAsDataURL(blob);
  });
}

async function cropImageWhitespaceDataUrl(dataUrl) {
  if (!dataUrl) return "";
  const image = await new Promise((resolve, reject) => {
    const loadedImage = new Image();
    loadedImage.onload = () => resolve(loadedImage);
    loadedImage.onerror = () => reject(new Error("No se pudo procesar el logo ocupacional"));
    loadedImage.src = dataUrl;
  });
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.naturalWidth || image.width;
  sourceCanvas.height = image.naturalHeight || image.height;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
  let minX = sourceCanvas.width;
  let minY = sourceCanvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < sourceCanvas.height; y += 1) {
    for (let x = 0; x < sourceCanvas.width; x += 1) {
      const index = (y * sourceCanvas.width + x) * 4;
      const visible = pixels[index + 3] > 12
        && (pixels[index] < 248 || pixels[index + 1] < 248 || pixels[index + 2] < 248);
      if (!visible) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return dataUrl;
  const padding = Math.max(2, Math.round(Math.min(sourceCanvas.width, sourceCanvas.height) * 0.01));
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(sourceCanvas.width - 1, maxX + padding);
  maxY = Math.min(sourceCanvas.height - 1, maxY + padding);
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = cropWidth;
  outputCanvas.height = cropHeight;
  outputCanvas.getContext("2d").drawImage(sourceCanvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return outputCanvas.toDataURL("image/png");
}

async function cropSignatureToMainStrokeDataUrl(dataUrl) {
  if (!dataUrl) return "";
  const image = await new Promise((resolve, reject) => {
    const loadedImage = new Image();
    loadedImage.onload = () => resolve(loadedImage);
    loadedImage.onerror = () => reject(new Error("No se pudo procesar la firma"));
    loadedImage.src = dataUrl;
  });

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, width, height).data;

  const total = width * height;
  const mask = new Uint8Array(total);
  const visited = new Uint8Array(total);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const p = idx * 4;
      const alpha = data[p + 3];
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      if (alpha > 16 && (r < 245 || g < 245 || b < 245)) {
        mask[idx] = 1;
      }
    }
  }

  const queue = new Int32Array(total);
  let bestArea = 0;
  let bestBox = null;
  const neighbors = [-1, 1, -width, width];

  for (let start = 0; start < total; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (head < tail) {
      const current = queue[head++];
      const cy = Math.floor(current / width);
      const cx = current - cy * width;
      area += 1;
      if (cx < minX) minX = cx;
      if (cy < minY) minY = cy;
      if (cx > maxX) maxX = cx;
      if (cy > maxY) maxY = cy;

      for (let i = 0; i < neighbors.length; i += 1) {
        const next = current + neighbors[i];
        if (next < 0 || next >= total) continue;
        if (neighbors[i] === -1 && cx === 0) continue;
        if (neighbors[i] === 1 && cx === width - 1) continue;
        if (neighbors[i] === -width && cy === 0) continue;
        if (neighbors[i] === width && cy === height - 1) continue;
        if (!mask[next] || visited[next]) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    if (area > bestArea) {
      bestArea = area;
      bestBox = { minX, minY, maxX, maxY };
    }
  }

  if (!bestBox || bestArea < 20) {
    return dataUrl;
  }

  const padding = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  const cropMinX = Math.max(0, bestBox.minX - padding);
  const cropMinY = Math.max(0, bestBox.minY - padding);
  const cropMaxX = Math.min(width - 1, bestBox.maxX + padding);
  const cropMaxY = Math.min(height - 1, bestBox.maxY + padding);
  const cropWidth = cropMaxX - cropMinX + 1;
  const cropHeight = cropMaxY - cropMinY + 1;

  const output = document.createElement("canvas");
  output.width = cropWidth;
  output.height = cropHeight;
  output.getContext("2d").drawImage(canvas, cropMinX, cropMinY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return output.toDataURL("image/png");
}

async function fetchConfiguracionClinica() {
  const response = await authFetch("api_configuracion.php", { method: "GET" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || "No se pudo cargar configuracion clinica");
  }
  return payload?.data || payload || {};
}

function normalizeDocDate(input) {
  const value = String(input || "").trim();
  if (!value) return "-";
  const parts = value.split("-");
  if (parts.length === 3 && parts[0].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return value;
}

function normalizePsicoValue(value, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function psicoOptionLabel(value, map) {
  const key = String(value || "").trim().toLowerCase();
  return map[key] || normalizePsicoValue(value, "-");
}

function normalizeCompareText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function simplifyProfessionalName(value) {
  return normalizeCompareText(value)
    .replace(/^(DRA|DR|PSIC|OBST|OD|LIC|NUT|PROF)\s+/g, "")
    .trim();
}

function esPruebaPsicologica(item = {}) {
  const codigo = String(item?.examen_codigo || "").toUpperCase().trim();
  const grupo = normalizeCompareText(item?.examen_grupo || "");
  const subgrupo = normalizeCompareText(item?.examen_subgrupo || "");
  const descripcion = normalizeCompareText(item?.examen_descripcion || "");

  if (["PSI_0001", "EPW_0001", "FOBIA"].includes(codigo)) return true;
  if (codigo.startsWith("PSI_")) return true;
  if (grupo.includes("PSICOLOG") || subgrupo.includes("PSICOLOG") || descripcion.includes("PSICOLOG")) return true;
  return false;
}

function clavePruebaPsicologica(item = {}) {
  const codigo = String(item?.examen_codigo || "").toUpperCase().trim();
  const descripcion = normalizeCompareText(item?.examen_descripcion || "");

  if (codigo === "EV-007" || codigo === "PSI_0001" || descripcion.includes("INFORME PSICOLOGICO")) {
    return "PSICO_MAIN";
  }
  if (codigo === "EV-008" || codigo === "EPW_0001" || descripcion.includes("EPWORTH")) {
    return "PSICO_EPWORTH";
  }
  if (codigo === "EV-009" || codigo === "FOBIA" || descripcion.includes("FOBIA") || descripcion.includes("ESTRES")) {
    return "PSICO_FOBIA";
  }

  return `PSICO_${codigo || "GEN"}`;
}

function scorePreferenciaPruebaPsicologica(item = {}) {
  const codigo = String(item?.examen_codigo || "").toUpperCase().trim();
  if (/^EV-\d+$/i.test(codigo)) return 3;
  if (codigo.startsWith("PSI_")) return 2;
  return 1;
}

function rutaExamen(basePath, ordenId, detalleId) {
  return `${basePath}/${ordenId}/examen/${detalleId}`;
}

function estadoVisual(item, resultado) {
  if (String(item?.estado_ejecucion || "") === "observado") return "observado";
  if (String(resultado?.estado || "") === "finalizado") return "finalizado";
  if (resultado?.id || ["en_proceso", "realizado"].includes(String(item?.estado_ejecucion || ""))) return "borrador";
  return "pendiente";
}

function ResultadoBadge({ estado }) {
  const config = RESULTADO_ESTADOS[estado] || RESULTADO_ESTADOS.pendiente;
  const Icon = config.icon;
  return <span className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold ${config.className}`}><Icon aria-hidden="true" />{config.label}</span>;
}

function resumirParametrosLaboratorio(parametros) {
  if (!Array.isArray(parametros) || parametros.length === 0) return "";
  return parametros
    .filter((parametro) => parametro && typeof parametro === "object")
    .map((parametro) => {
      const nombre = String(parametro.nombre || "").trim();
      const valor = String(parametro.valor || "").trim();
      const unidad = String(parametro.unidad || "").trim();
      if (!nombre || !valor) return "";
      return unidad ? `${nombre}: ${valor} ${unidad}` : `${nombre}: ${valor}`;
    })
    .filter((linea) => linea !== "")
    .join("\n");
}

function normalizarDatosLabBasico(datosEntrada) {
  const datos = (datosEntrada && typeof datosEntrada === "object") ? structuredClone(datosEntrada) : {};
  const parametros = Array.isArray(datos.parametros) ? datos.parametros.filter((p) => p && typeof p === "object") : [];
  const resumen = String(datos.resultado_laboratorio_resumen || "").trim();
  const existeParametroCompleto = parametros.some((parametro) => {
    const nombre = String(parametro.nombre || "").trim();
    const valor = String(parametro.valor || "").trim();
    return nombre !== "" && valor !== "";
  });

  if (resumen && !existeParametroCompleto) {
    parametros.unshift({
      grupo: "LABORATORIO",
      nombre: "Laboratorio",
      valor: resumen,
      unidad: "",
      referencia: "",
    });
  }

  if (!resumen) {
    const resumenAuto = resumirParametrosLaboratorio(parametros);
    if (resumenAuto) {
      datos.resultado_laboratorio_resumen = resumenAuto;
    }
  }

  datos.parametros = parametros;
  return datos;
}

export default function FormatoClinicoExamenPage() {
  const params = useParams();
  const location = useLocation();
  const ordenId = Number(params.ordenId || 0);
  const detalleId = Number(params.detalleId || 0);
  const [orden, setOrden] = useState(null);
  const [resultadoContexto, setResultadoContexto] = useState(null);
  const [form, setForm] = useState({ formatoCodigo: "", datos: {}, observacion: "" });
  const [plantillaId, setPlantillaId] = useState("0");
  const [plantillaNombre, setPlantillaNombre] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [profesionales, setProfesionales] = useState([]);
  const [normalizadorActivo, setNormalizadorActivo] = useState(false);

  const cargarProfesionales = useCallback(async () => {
    try {
      const response = await authFetch("api_medicos.php", { method: "GET" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success || !Array.isArray(payload.medicos)) {
        setProfesionales([]);
        return;
      }

      const lista = payload.medicos
        .map((row) => ({
          id: Number(row?.id || 0),
          nombre: String(row?.nombre || "").trim(),
          apellido: String(row?.apellido || "").trim(),
          tipo_profesional: String(row?.tipo_profesional || "medico").trim().toLowerCase(),
          abreviatura_profesional: String(row?.abreviatura_profesional || "").trim(),
          colegio_sigla: String(row?.colegio_sigla || "").trim(),
          nro_colegiatura: String(row?.nro_colegiatura || row?.cmp || "").trim(),
          cmp: String(row?.cmp || "").trim(),
          firma: String(row?.firma || "").trim(),
        }))
        .filter((row) => row.id > 0)
        .sort((a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`));
      setProfesionales(lista);
    } catch {
      setProfesionales([]);
    }
  }, []);

  const cargar = useCallback(async () => {
    if (ordenId <= 0 || detalleId <= 0) {
      setError("La ruta del examen no es válida");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [ordenData, resultadoData] = await Promise.all([
        obtenerDetalleOrdenOcupacional(ordenId),
        obtenerResultadoClinicoOcupacional({ ordenDetalleId: detalleId }),
      ]);
      const item = (ordenData?.items || []).find((candidate) => Number(candidate.id) === detalleId);
      if (!item || Number(resultadoData?.detalle?.orden_id || 0) !== ordenId) {
        throw new Error("El examen no pertenece a la orden indicada");
      }
      const resultado = resultadoData?.data || null;
      const sugerida = resultadoData?.plantillaSugerida;
      const plantillaBase = sugerida && typeof sugerida === "object" ? sugerida : {};
      const datosGuardados = resultado?.datos_json && typeof resultado.datos_json === "object" ? resultado.datos_json : {};
      const datos = resultado?.id ? { ...plantillaBase, ...datosGuardados } : { ...plantillaBase };
      const nombreResponsable = String(ordenData?.medico_nombre_snapshot || ordenData?.medico_responsable || "").trim();
      if (!resultado?.id && nombreResponsable && Object.prototype.hasOwnProperty.call(datos, "responsable_evaluacion")) {
        const actual = String(datos.responsable_evaluacion || "").trim();
        if (!actual) {
          datos.responsable_evaluacion = nombreResponsable;
        }
      }
      const plantillas = Array.isArray(resultadoData?.plantillasDisponibles) ? resultadoData.plantillasDisponibles : [];
      setOrden(ordenData);
      setResultadoContexto(resultadoData);
      setForm({
        formatoCodigo: String(resultado?.formato_codigo || resultadoData?.detalle?.formato_codigo || item.examen_codigo || "formato_general").toLowerCase(),
        datos,
        observacion: String(resultado?.observacion || item.observacion_ejecucion || ""),
      });
      setPlantillaId(plantillas.length > 0 ? String(plantillas[0].id || 0) : "0");
      setPlantillaNombre(`${String(item.examen_codigo || "examen").toLowerCase()}_plantilla`);
    } catch (err) {
      setOrden(null);
      setResultadoContexto(null);
      setError(err.message || "No se pudo cargar el examen");
    } finally {
      setLoading(false);
    }
  }, [detalleId, ordenId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    cargarProfesionales();
  }, [cargarProfesionales]);

  const itemIndex = useMemo(
    () => (orden?.items || []).findIndex((candidate) => Number(candidate.id) === detalleId),
    [detalleId, orden]
  );
  const item = itemIndex >= 0 ? orden.items[itemIndex] : null;
  const resultado = resultadoContexto?.data || null;
  const plantillas = resultadoContexto?.plantillasDisponibles || [];
  const readOnly = ["cerrada", "anulada"].includes(String(orden?.estado || ""));
  const estado = estadoVisual(item, resultado);
  const templateCode = String(resultadoContexto?.detalle?.template_code || "general_basico");
  const mostrarNormalizadorPsicologia = PSICO_TEMPLATE_CODES.includes(templateCode);
  const mostrarSignosVitales = ["lab_basico", "psicologia_basica", "epworth_test", "fobia_estres"].includes(templateCode);
  const triaje = orden?.triaje && typeof orden.triaje === "object" ? orden.triaje : {};
  const examenCodigoActual = String(item?.examen_codigo || "").toUpperCase();
  const pruebasPsicologiaRelacionadas = useMemo(() => {
    const items = Array.isArray(orden?.items) ? orden.items.filter((candidate) => esPruebaPsicologica(candidate)) : [];
    const grouped = new Map();

    items.forEach((candidate) => {
      const key = clavePruebaPsicologica(candidate);
      const list = grouped.get(key) || [];
      list.push(candidate);
      grouped.set(key, list);
    });

    const picked = [];
    grouped.forEach((list) => {
      const actual = list.find((candidate) => Number(candidate?.id || 0) === detalleId);
      if (actual) {
        picked.push(actual);
        return;
      }
      list.sort((a, b) => {
        const diff = scorePreferenciaPruebaPsicologica(b) - scorePreferenciaPruebaPsicologica(a);
        if (diff !== 0) return diff;
        return Number(a?.id || 0) - Number(b?.id || 0);
      });
      picked.push(list[0]);
    });

    return picked
      .map((candidate) => ({
        id: Number(candidate.id || 0),
        codigo: String(candidate.examen_codigo || "").toUpperCase(),
        descripcion: String(candidate.examen_descripcion || "Examen psicológico"),
      }))
      .filter((candidate) => candidate.id > 0)
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [detalleId, orden]);
  const mostrarNavegacionPsicologia = esPruebaPsicologica(item)
    || ["psicologia_basica", "epworth_test", "fobia_estres"].includes(templateCode);
  const listaNavegacion = mostrarNavegacionPsicologia
    ? pruebasPsicologiaRelacionadas.map((exam) => ({ id: exam.id, examen_descripcion: exam.descripcion }))
    : (orden?.items || []);
  const indexNavegacion = useMemo(
    () => listaNavegacion.findIndex((candidate) => Number(candidate?.id || 0) === detalleId),
    [detalleId, listaNavegacion]
  );
  const anterior = indexNavegacion > 0 ? listaNavegacion[indexNavegacion - 1] : null;
  const siguiente = indexNavegacion >= 0 && indexNavegacion < listaNavegacion.length - 1 ? listaNavegacion[indexNavegacion + 1] : null;
  const esVistaEnfermeria = location.pathname.startsWith("/mis-triajes-ocupacionales");
  const baseEvaluacionesPath = esVistaEnfermeria
    ? "/mis-triajes-ocupacionales"
    : (location.pathname.startsWith("/mis-evaluaciones-ocupacionales")
      ? "/mis-evaluaciones-ocupacionales"
      : "/salud-ocupacional/evaluacion-medica");
  const etiquetaRetorno = esVistaEnfermeria ? "Triaje ocupacional" : "Evaluación médica ocupacional";

  useEffect(() => {
    setNormalizadorActivo(false);
  }, [detalleId, templateCode]);

  const responsableProfesionalId = Number(form?.datos?.responsable_profesional_id || 0);
  const responsableProfesional = useMemo(
    () => profesionales.find((profesional) => Number(profesional.id) === responsableProfesionalId) || null,
    [profesionales, responsableProfesionalId]
  );
  const responsableNombreVisible = String(
    form?.datos?.responsable_evaluacion
    || (responsableProfesional ? formatProfesionalName(responsableProfesional) : "")
    || orden?.medico_nombre_snapshot
    || orden?.medico_responsable
    || "No asignado"
  ).trim();
  const responsableColegiaturaVisible = String(
    form?.datos?.responsable_colegiatura
    || (responsableProfesional ? formatColegiatura(responsableProfesional) : "")
    || (orden?.medico_cmp_snapshot ? `CMP ${orden.medico_cmp_snapshot}` : "")
    || "Sin colegiatura registrada"
  ).trim();
  const responsableProfesionalFirma = useMemo(() => {
    const firmaDirecta = String(responsableProfesional?.firma || "").trim();
    if (firmaDirecta) return responsableProfesional;

    const responsableSimple = simplifyProfessionalName(form?.datos?.responsable_evaluacion || responsableNombreVisible);
    if (!responsableSimple) return null;

    const candidatos = profesionales.filter((profesional) => {
      const nombreSimple = simplifyProfessionalName(formatProfesionalName(profesional));
      if (!nombreSimple) return false;
      return nombreSimple === responsableSimple
        || nombreSimple.includes(responsableSimple)
        || responsableSimple.includes(nombreSimple);
    });

    const conFirma = candidatos.find((profesional) => String(profesional?.firma || "").trim() !== "");
    return conFirma || null;
  }, [form?.datos?.responsable_evaluacion, profesionales, responsableNombreVisible, responsableProfesional]);

  const onChangeResponsableProfesional = (value) => {
    const id = Number(value || 0);
    if (id <= 0) {
      setForm((current) => ({
        ...current,
        datos: {
          ...(current.datos || {}),
          responsable_profesional_id: "",
          responsable_tipo_profesional: "",
          responsable_colegiatura: "",
        },
      }));
      return;
    }

    const profesional = profesionales.find((row) => Number(row.id) === id);
    if (!profesional) return;

    const nombre = formatProfesionalName(profesional);
    const colegiatura = formatColegiatura(profesional);
    setForm((current) => ({
      ...current,
      datos: {
        ...(current.datos || {}),
        responsable_profesional_id: String(profesional.id),
        responsable_tipo_profesional: String(profesional.tipo_profesional || "").trim().toLowerCase(),
        responsable_colegiatura: colegiatura,
        responsable_evaluacion: nombre,
      },
    }));
  };

  const cambiarDato = (key, value) => {
    setForm((current) => {
      const datos = { ...(current.datos || {}), [key]: value };
      if (["peso_kg", "talla_cm"].includes(key)) {
        const peso = Number(key === "peso_kg" ? value : datos.peso_kg);
        const tallaCm = Number(key === "talla_cm" ? value : datos.talla_cm);
        datos.imc = peso > 0 && tallaCm > 0 ? (peso / ((tallaCm / 100) ** 2)).toFixed(2) : "";
      }
      return { ...current, datos };
    });
  };

  const cambiarAudiometria = (oido, frecuencia, value) => {
    setForm((current) => ({
      ...current,
      datos: { ...current.datos, [oido]: { ...(current.datos?.[oido] || {}), [frecuencia]: value } },
    }));
  };

  const cambiarParametro = (index, key, value) => {
    setForm((current) => ({
      ...current,
      datos: {
        ...current.datos,
        parametros: Array.isArray(current.datos?.parametros)
          ? current.datos.parametros.map((parametro, currentIndex) => currentIndex === index ? { ...parametro, [key]: value } : parametro)
          : [],
      },
    }));
  };

  const aplicarNormalizacion = useCallback((activar) => {
    if (!mostrarNormalizadorPsicologia) return;
    setForm((current) => {
      const datosActuales = current?.datos && typeof current.datos === "object" ? current.datos : {};
      let patch = {};
      if (templateCode === "psicologia_basica") {
        patch = activar ? PSICO_MAIN_DEFAULTS : emptyPatch(PSICO_MAIN_KEYS);
      } else if (templateCode === "epworth_test") {
        patch = activar ? epworthPatch("0") : epworthPatch("");
      } else if (templateCode === "fobia_estres") {
        patch = activar ? fobiaPatch("NO") : fobiaPatch("");
      }
      return { ...current, datos: { ...datosActuales, ...patch } };
    });
    setNormalizadorActivo(activar);
  }, [mostrarNormalizadorPsicologia, templateCode]);

  const guardar = async (estadoResultado) => {
    if (readOnly || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const datosJson = templateCode === "lab_basico"
        ? normalizarDatosLabBasico(form.datos)
        : form.datos;

      await guardarResultadoClinicoOcupacional({
        ordenDetalleId: detalleId,
        formatoCodigo: form.formatoCodigo,
        datosJson,
        estado: estadoResultado,
        observacion: form.observacion,
      });
      setMessage(estadoResultado === "finalizado" ? "Examen finalizado correctamente" : "Borrador guardado correctamente");
      await cargar();
    } catch (err) {
      setError(err.message || "No se pudo guardar el resultado clínico");
    } finally {
      setSaving(false);
    }
  };

  const aplicarPlantilla = () => {
    const selected = plantillas.find((template) => String(template.id || 0) === plantillaId);
    if (!selected?.datos_json || typeof selected.datos_json !== "object") {
      setError("Seleccione una plantilla válida");
      return;
    }
    setForm((current) => ({ ...current, datos: structuredClone(selected.datos_json) }));
    setError("");
  };

  const guardarPlantilla = async () => {
    if (readOnly || templateSaving) return;
    const nombre = plantillaNombre.trim();
    if (!nombre) {
      setError("Ingrese un nombre para la plantilla");
      return;
    }
    setTemplateSaving(true);
    setError("");
    try {
      await guardarPlantillaResultadoClinicoOcupacional({
        ordenDetalleId: detalleId,
        nombre,
        templateCode: resultadoContexto?.detalle?.template_code || "",
        examenCodigo: item?.examen_codigo || "",
        examenDescripcion: item?.examen_descripcion || "",
        formatoCodigo: form.formatoCodigo,
        datosJson: form.datos,
      });
      setMessage("Plantilla guardada en el catálogo");
      await cargar();
    } catch (err) {
      setError(err.message || "No se pudo guardar la plantilla");
    } finally {
      setTemplateSaving(false);
    }
  };

  const eliminarPlantilla = async () => {
    const selected = plantillas.find((template) => String(template.id || 0) === plantillaId);
    if (readOnly || Number(selected?.id || 0) <= 0) return;
    if (!window.confirm(`¿Eliminar la plantilla "${selected.nombre || selected.codigo}"?`)) return;
    setTemplateSaving(true);
    setError("");
    try {
      await eliminarPlantillaResultadoClinicoOcupacional(selected.id, { ordenDetalleId: detalleId });
      setMessage("Plantilla eliminada del catálogo");
      await cargar();
    } catch (err) {
      setError(err.message || "No se pudo eliminar la plantilla");
    } finally {
      setTemplateSaving(false);
    }
  };

  const imprimir = async () => {
    if (String(resultado?.estado || "") !== "finalizado") return;
    try {
      await registrarEmisionPdfResultadoClinicoOcupacional({ ordenDetalleId: detalleId, formatoCodigo: form.formatoCodigo });

      if (templateCode !== "psicologia_basica") {
        window.print();
        return;
      }

      const jsPDF = (await import("jspdf")).default;
      const [configuracionClinica, logoRawDataUrl] = await Promise.all([
        fetchConfiguracionClinica().catch(() => ({})),
        Promise.resolve(""),
      ]);

      const logoUrl = resolveAssetUrl(configuracionClinica?.logo_ocupacional_url || configuracionClinica?.logo_url || "");
      const logoSelloUrl = resolveAssetUrl(configuracionClinica?.logo_url || configuracionClinica?.logo_ocupacional_url || "");
      let firmaRaw = String(responsableProfesionalFirma?.firma || "").trim();
      if (!firmaRaw) {
        const tipoResponsable = String(form?.datos?.responsable_tipo_profesional || "").trim().toLowerCase();
        if (tipoResponsable === "medico") {
          firmaRaw = String(orden?.medico_firma_snapshot || "").trim();
        }
      }
      const firmaUrl = /^(data:|https?:\/\/|blob:|uploads\/|\/uploads\/)/i.test(firmaRaw)
        ? resolveAssetUrl(firmaRaw)
        : "";
      const [logoDataUrlSource, firmaDataUrlRaw, logoSelloDataUrlRaw] = await Promise.all([
        logoUrl ? loadImageAsDataUrl(logoUrl).catch(() => "") : Promise.resolve(logoRawDataUrl),
        firmaUrl ? loadImageAsDataUrl(firmaUrl).catch(() => "") : Promise.resolve(""),
        logoSelloUrl ? loadImageAsDataUrl(logoSelloUrl).catch(() => "") : Promise.resolve(""),
      ]);
      const logoDataUrl = logoDataUrlSource
        ? await cropImageWhitespaceDataUrl(logoDataUrlSource).catch(() => logoDataUrlSource)
        : "";
      const logoSelloDataUrl = logoSelloDataUrlRaw
        ? await cropImageWhitespaceDataUrl(logoSelloDataUrlRaw).catch(() => logoSelloDataUrlRaw)
        : "";
      const firmaDataUrl = firmaDataUrlRaw
        ? await cropSignatureToMainStrokeDataUrl(firmaDataUrlRaw).catch(() => firmaDataUrlRaw)
        : "";

      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const datos = form?.datos && typeof form.datos === "object" ? form.datos : {};
      const responsable = normalizePsicoValue(datos.responsable_evaluacion || responsableNombreVisible, "No consignado");
      const motivo = normalizePsicoValue(datos.motivo_evaluacion, "EVALUACION MEDICA OCUPACIONAL");
      const fechaEvaluacionRaw = String(orden?.fecha_orden || "").trim();
      const fechaEvaluacion = normalizeDocDate(fechaEvaluacionRaw);

      const normalizeKey = (value) => normalizeCompareText(value);
      const hasAny = (value, keys) => {
        const token = normalizeKey(value);
        return keys.some((key) => token === normalizeKey(key));
      };
      const markOption = (value, keys) => (hasAny(value, keys) ? "X" : "");
      const drawSectionHeader = (left, top, widthValue, text) => {
        doc.setFillColor(0, 0, 0);
        doc.rect(left, top, widthValue, 7, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(text, left + 2, top + 5.1);
        doc.setTextColor(0, 0, 0);
      };

      const drawLabelLine = (left, top, label, value, widthValue, fontSize = 9) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(fontSize);
        doc.text(`${label}:`, left, top);
        doc.setFont("helvetica", "normal");
        doc.text(String(value || ""), left + doc.getTextWidth(`${label}: `), top);
        doc.line(left, top + 0.8, left + widthValue, top + 0.8);
      };

      const splitDate = (input) => {
        const value = String(input || "").trim();
        if (!value || !value.includes("-")) return ["", "", ""];
        const parts = value.split("-");
        if (parts[0]?.length === 4) return [parts[2] || "", parts[1] || "", parts[0] || ""];
        return [parts[0] || "", parts[1] || "", parts[2] || ""];
      };

      const [dia, mes, anio] = splitDate(fechaEvaluacionRaw || fechaEvaluacion);
      const lugarNacimiento = String(datos.lugar_nacimiento || "").trim();
      const gradoInstruccion = String(datos.grado_instruccion || "").trim();
      const residencia = String(datos.residencia || "").trim();
      const resumenTexto = String(
        datos.resumen
        || datos.hallazgos
        || [datos.conclusion_cognitiva, datos.conclusion_emocional].filter((v) => String(v || "").trim() !== "").join("\n")
      ).trim();
      const conclusionFinal = String(datos.conclusion || datos.recomendaciones || "").trim();
      const recomendacionesFinal = String(datos.observaciones || "").trim();

      const x = 8;
      const w = 194;
      let y = 8;

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(x, y, w, 280);

      if (logoDataUrl) {
        const logoProps = doc.getImageProperties(logoDataUrl);
        const ratio = logoProps.width / logoProps.height;
        const logoW = Math.min(56, 18 * ratio);
        const logoH = logoW / ratio;
        doc.addImage(logoDataUrl, inferDataUrlImageFormat(logoDataUrl), x + 6, y + 4, logoW, logoH);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      doc.text("INFORME PSICOLOGICO", x + w / 2, y + 10, { align: "center" });
      doc.text("OCUPACIONAL", x + w / 2, y + 15, { align: "center" });

      y += 23;
      drawLabelLine(x + 3, y, "Nro. Inf", String(orden?.codigo || ""), 60);
      drawLabelLine(x + 102, y, "N°HC", String(orden?.paciente_historia_clinica || ""), 25);
      y += 4;

      drawSectionHeader(x + 0.8, y, w - 1.6, "I.- DATOS GENERALES:");
      y += 10;
      drawLabelLine(x + 3, y, "Apellidos y Nombres", normalizePsicoValue(orden?.paciente_nombre_completo, ""), 120, 8.4);
      y += 5;
      drawLabelLine(x + 3, y, "Edad", String(orden?.paciente_edad || ""), 30, 8.4);
      drawLabelLine(x + 37, y, "Lugar de Nacimiento", lugarNacimiento, 60, 8.4);
      drawLabelLine(x + 102, y, "Fecha de Nacimiento", normalizeDocDate(orden?.paciente_fecha_nacimiento || ""), 42, 8.4);
      y += 5;
      drawLabelLine(x + 3, y, "Grado de Instrucción", gradoInstruccion, 55, 8.4);
      drawLabelLine(x + 62, y, "Lugar de Residencia", residencia, 54, 8.4);
      drawLabelLine(x + 120, y, "Puesto de trabajo", String(orden?.puesto_trabajo || ""), 40, 8.4);
      y += 5;
      drawLabelLine(x + 3, y, "Empresa donde labora", String(orden?.empresa || ""), 107, 8.4);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.4);
      doc.text("Fecha de evaluación:", x + 113, y);
      const dateBoxX = x + 153;
      const dateBoxW = 41;
      const dateCellW = dateBoxW / 3;
      doc.rect(dateBoxX, y - 3.4, dateBoxW, 8.2);
      doc.line(dateBoxX + dateCellW, y - 3.4, dateBoxX + dateCellW, y + 4.8);
      doc.line(dateBoxX + dateCellW * 2, y - 3.4, dateBoxX + dateCellW * 2, y + 4.8);
      doc.setFont("helvetica", "normal");
      doc.text(dia, dateBoxX + dateCellW / 2, y - 0.3, { align: "center" });
      doc.text(mes, dateBoxX + dateCellW * 1.5, y - 0.3, { align: "center" });
      doc.text(anio, dateBoxX + dateCellW * 2.5, y - 0.3, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.text("Dia", dateBoxX + dateCellW / 2, y + 3.4, { align: "center" });
      doc.text("Mes", dateBoxX + dateCellW * 1.5, y + 3.4, { align: "center" });
      doc.text("Año", dateBoxX + dateCellW * 2.5, y + 3.4, { align: "center" });
      y += 7;

      drawSectionHeader(x + 0.8, y, w - 1.6, "II.- MOTIVO DE EVALUACION:");
      y += 10;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const motivoLines = doc.splitTextToSize(motivo || "", w - 10).slice(0, 3);
      for (let i = 0; i < 3; i += 1) {
        const lineY = y + (i * 4.6);
        doc.line(x + 2, lineY + 1, x + w - 2, lineY + 1);
        if (motivoLines[i]) doc.text(motivoLines[i], x + 3, lineY);
      }
      y += 17;

      drawSectionHeader(x + 0.8, y, w - 1.6, "III.- OBSERVACION DE CONDUCTAS:");
      y += 10;
      doc.setFontSize(9);
      doc.text(`- Presentación: Adecuado ( ${markOption(datos.presentacion, ["0", "adecuada", "adecuado"])} ) Inadecuado ( ${markOption(datos.presentacion, ["1", "inadecuada", "inadecuado"])} )`, x + 3, y);
      y += 5.6;
      doc.text(`- Postura        : Erguida ( ${markOption(datos.postura, ["0", "erguida"])} ) Encorvada ( ${markOption(datos.postura, ["1", "encorvada"])} )`, x + 3, y);
      y += 5.6;
      doc.text(`- Discurso       : Ritmo: Lento ( ${markOption(datos.discurso_ritmo, ["0", "lento"])} ) Rápido ( ${markOption(datos.discurso_ritmo, ["1", "rapido"])} ) Fluido ( ${markOption(datos.discurso_ritmo, ["2", "fluido"])} )`, x + 3, y);
      y += 5.6;
      doc.text(`                      Tono: Bajo ( ${markOption(datos.discurso_tono, ["0", "bajo"])} ) Moderado ( ${markOption(datos.discurso_tono, ["1", "moderado"])} ) Alto ( ${markOption(datos.discurso_tono, ["2", "alto"])} )`, x + 3, y);
      y += 5.6;
      doc.text(`                      Articulación: con dificultad ( ${markOption(datos.discurso_articulacion, ["0", "con_dificultad", "con dificultad"])} ) sin dificultad ( ${markOption(datos.discurso_articulacion, ["1", "sin_dificultad", "sin dificultad"])} )`, x + 3, y);
      y += 5.6;
      doc.text(`- Orientación  ~~ Tiempo : Orientado ( ${markOption(datos.orientacion_tiempo, ["0", "orientado"])} ) Desorientado ( ${markOption(datos.orientacion_tiempo, ["1", "desorientado"])} )`, x + 3, y);
      y += 5.6;
      doc.text(`                     Espacio: Orientado ( ${markOption(datos.orientacion_espacio, ["0", "orientado"])} ) Desorientado ( ${markOption(datos.orientacion_espacio, ["1", "desorientado"])} )`, x + 3, y);
      y += 5.6;
      doc.text(`                     Persona: Orientado ( ${markOption(datos.orientacion_persona, ["0", "orientado"])} ) Desorientado ( ${markOption(datos.orientacion_persona, ["1", "desorientado"])} )`, x + 3, y);
      y += 8;

      drawSectionHeader(x + 0.8, y, w - 1.6, "IV.- RESULTADOS DE EVALUACION:");
      y += 10;
      const drawResultRow = (label, value) => {
        doc.text(`• ${label}`, x + 5, y);
        doc.text(`: ${String(value || "")}`, x + 55, y);
        doc.line(x + 54, y + 1, x + w - 3, y + 1);
        y += 5;
      };
      drawResultRow("Nivel Intelectual", datos.nivel_intelectual);
      drawResultRow("Coordinación Visomotriz", datos.coordinacion_visomotriz);
      drawResultRow("Nivel de Memoria", datos.nivel_memoria);
      drawResultRow("Personalidad", datos.personalidad);
      drawResultRow("Afectividad", datos.afectividad);
      y += 1.4;

      drawSectionHeader(x + 0.8, y, w - 1.6, "V.- RESUMEN:");
      y += 10;
      doc.setFont("helvetica", "normal");
      const resumenLines = doc.splitTextToSize(resumenTexto, w - 8).slice(0, 8);
      for (let i = 0; i < Math.max(4, resumenLines.length); i += 1) {
        const text = resumenLines[i] || "";
        doc.text(text, x + 3, y + (i * 5.6));
      }
      y += Math.max(4, resumenLines.length) * 5.6 + 2.5;

      drawSectionHeader(x + 0.8, y, w - 1.6, "VI.- CONCLUSION:");
      y += 10;
      const conclusionLines = doc.splitTextToSize(conclusionFinal, w - 8).slice(0, 2);
      doc.text(conclusionLines.length > 0 ? conclusionLines : [""], x + 3, y);
      y += 11;

      drawSectionHeader(x + 0.8, y, w - 1.6, "VI.- RECOMENDACIONES:");
      y += 10;
      const recomendacionLines = doc.splitTextToSize(recomendacionesFinal, w - 8).slice(0, 3);
      for (let i = 0; i < 3; i += 1) {
        const rowY = y + i * 5.6;
        doc.line(x + 2, rowY + 1, x + w - 2, rowY + 1);
        if (recomendacionLines[i]) doc.text(recomendacionLines[i], x + 3, rowY);
      }

      const firmaY = 268;
      if (firmaDataUrl) {
        doc.addImage(firmaDataUrl, inferDataUrlImageFormat(firmaDataUrl), 128, firmaY, 40, 14);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.8);
      doc.text("Lic.", 149, firmaY + 15, { align: "center" });
      doc.line(125, firmaY + 16.3, 173, firmaY + 16.3);
      doc.text("C.S.P.:", 149, firmaY + 20, { align: "center" });
      doc.line(125, firmaY + 21.3, 173, firmaY + 21.3);
      doc.text("PSICOLOGA / O", 149, firmaY + 25, { align: "center" });

      const safeOrder = String(orden?.codigo || `orden_${ordenId}`).replace(/[^A-Za-z0-9_-]/g, "_");
      doc.save(`resultado_psicologico_${safeOrder}.pdf`);
    } catch (err) {
      setError(err.message || "No se pudo preparar la impresión");
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-cyan-700">Cargando examen clínico...</div>;
  }

  if (!orden || !item || !resultadoContexto) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-lg border border-red-200 bg-white p-6 text-center shadow-sm">
          <FiAlertCircle className="mx-auto text-3xl text-red-600" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">No se pudo abrir el examen</h1>
          <p className="mt-2 text-sm text-red-700">{error || "El examen solicitado no existe"}</p>
          <Link className="mt-5 inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" to={baseEvaluacionesPath}><FiArrowLeft />Volver a evaluaciones</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ecfeff_100%)] px-3 py-4 print:bg-white print:p-0 sm:px-5 lg:px-7">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <header className="border-b border-cyan-200 pb-4 print:border-slate-400">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <Link className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase text-cyan-700 hover:text-cyan-900 print:hidden" to={baseEvaluacionesPath}><FiArrowLeft />{etiquetaRetorno}</Link>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{item.examen_descripcion || "Examen ocupacional"}</h1>
                <ResultadoBadge estado={estado} />
              </div>
              <p className="mt-1 text-sm text-slate-600">{item.examen_codigo || "Sin código"} · {item.examen_grupo || "Examen clínico"}</p>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              {!esVistaEnfermeria && anterior ? <Link className="inline-flex h-10 items-center gap-1 rounded border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" to={rutaExamen(baseEvaluacionesPath, ordenId, anterior.id)} title={anterior.examen_descripcion}><FiChevronLeft />Anterior</Link> : null}
              {!esVistaEnfermeria && siguiente ? <Link className="inline-flex h-10 items-center gap-1 rounded border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" to={rutaExamen(baseEvaluacionesPath, ordenId, siguiente.id)} title={siguiente.examen_descripcion}>Siguiente<FiChevronRight /></Link> : null}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-x-5 gap-y-3 border-y border-slate-200 bg-white px-4 py-3 text-xs shadow-sm sm:grid-cols-3 lg:grid-cols-6" aria-label="Contexto del examen">
          <div className="col-span-2 sm:col-span-1"><p className="font-semibold uppercase text-slate-500">Paciente</p><p className="mt-0.5 font-semibold text-slate-900">{orden.paciente_nombre_completo || "-"}</p></div>
          <div><p className="font-semibold uppercase text-slate-500">Documento</p><p className="mt-0.5 text-slate-800">{orden.documento_numero || "-"}</p></div>
          <div><p className="font-semibold uppercase text-slate-500">Orden</p><p className="mt-0.5 text-slate-800">{orden.codigo || "-"}</p></div>
          <div><p className="font-semibold uppercase text-slate-500">Empresa</p><p className="mt-0.5 text-slate-800">{orden.empresa || "-"}</p></div>
          <div><p className="font-semibold uppercase text-slate-500">Puesto</p><p className="mt-0.5 text-slate-800">{orden.puesto_trabajo || "-"}</p></div>
          <div><p className="font-semibold uppercase text-slate-500">Evaluación</p><p className="mt-0.5 text-slate-800">{orden.tipo_nombre || orden.tipo_codigo || "-"}</p></div>
        </section>

        {mostrarSignosVitales ? (
          <section className="border-y border-slate-200 bg-white px-4 py-3 shadow-sm" aria-labelledby="signos-vitales-examen-title">
            <h2 id="signos-vitales-examen-title" className="mb-2 text-xs font-bold uppercase text-slate-600">Signos vitales de la evaluación</h2>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 xl:grid-cols-8">
              {[
                ["Talla", triaje.talla_cm, "cm"],
                ["Peso", triaje.peso_kg, "kg"],
                ["IMC", triaje.imc, ""],
                ["Perímetro abdominal", triaje.perimetro_abdominal_cm, "cm"],
                ["F. respiratoria", triaje.frecuencia_respiratoria, "rpm"],
                ["F. cardiaca", triaje.frecuencia_cardiaca, "lpm"],
                ["Presión arterial", triaje.presion_sistolica || triaje.presion_diastolica ? `${triaje.presion_sistolica || "-"}/${triaje.presion_diastolica || "-"}` : "", "mmHg"],
                ["Temperatura", triaje.temperatura, "°C"],
              ].map(([label, value, unit]) => (
                <div key={label} className="border-l-2 border-cyan-300 bg-slate-50 px-2 py-1.5">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p>
                  <p className="mt-0.5 font-semibold text-slate-900">{String(value || "-")}{value && unit ? ` ${unit}` : ""}</p>
                </div>
              ))}
            </div>
            {Object.keys(triaje).length === 0 ? <p className="mt-2 text-xs text-amber-700">Triaje aún no finalizado para esta orden.</p> : null}
          </section>
        ) : null}

        {!esVistaEnfermeria && mostrarNavegacionPsicologia ? (
          <section className="border-y border-cyan-200 bg-white px-4 py-3 shadow-sm" aria-labelledby="psico-links-title">
            <h2 id="psico-links-title" className="mb-2 text-xs font-bold uppercase text-slate-600">Pruebas psicológicas relacionadas</h2>
            <div className="flex flex-wrap gap-2">
              {pruebasPsicologiaRelacionadas.length === 0 ? <p className="text-xs text-slate-500">No hay otras pruebas psicológicas asociadas en esta orden.</p> : null}
              {pruebasPsicologiaRelacionadas.map((exam) => {
                const activo = Number(exam.id) === Number(detalleId);
                return (
                  <Link
                    key={exam.id}
                    className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs font-semibold ${activo ? "border-cyan-500 bg-cyan-50 text-cyan-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                    to={rutaExamen(baseEvaluacionesPath, ordenId, exam.id)}
                    aria-current={activo ? "page" : undefined}
                    title={exam.descripcion}
                  >
                    {exam.codigo}
                    <span className="hidden max-w-[300px] truncate sm:inline">{exam.descripcion}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {mostrarNormalizadorPsicologia ? (
          <section className="border-y border-cyan-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-bold uppercase text-slate-600">Normalización rápida</h2>
                <p className="mt-1 text-xs text-slate-500">Autocompleta valores referenciales del formato. Luego puedes editar cualquier campo.</p>
              </div>
              <button
                type="button"
                className={`rounded border px-3 py-1.5 text-xs font-semibold transition ${normalizadorActivo ? "border-emerald-400 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"} disabled:opacity-50`}
                onClick={() => aplicarNormalizacion(!normalizadorActivo)}
                disabled={readOnly || saving}
              >
                {normalizadorActivo ? "Normalización activa" : "Activar normalización"}
              </button>
            </div>
          </section>
        ) : null}

        {readOnly ? <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">La orden está {orden.estado}. El examen se muestra en modo de solo lectura.</div> : null}
        {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden">{error}</div> : null}
        {message ? <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 print:hidden">{message}</div> : null}

        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
          <section className="min-w-0 bg-white p-3 shadow-sm sm:p-5" aria-labelledby="formato-clinico-title">
            <div className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3">
              <FiFileText className="text-cyan-700" />
              <h2 id="formato-clinico-title" className="font-semibold text-slate-900">Formato clínico</h2>
              <span className="ml-auto text-xs text-slate-500">{resultadoContexto.detalle?.template_code || "general_basico"}</span>
            </div>
            <FormatoClinicoCampos
              templateCode={templateCode}
              datos={form.datos}
              onChange={cambiarDato}
              onAudiometriaChange={cambiarAudiometria}
              onParametroChange={cambiarParametro}
              disabled={readOnly || saving}
            />
            <label className="mt-4 block text-xs font-medium text-slate-700">
              <span className="mb-1 block">Observación clínica</span>
              <textarea className="min-h-24 w-full resize-y rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" value={form.observacion} onChange={(event) => setForm((current) => ({ ...current, observacion: event.target.value }))} disabled={readOnly || saving} />
            </label>
          </section>

          <aside className="space-y-4 print:hidden">
            <section className="bg-white p-4 shadow-sm">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900"><FiUser className="text-cyan-700" />Responsable</h2>
              <label className="mt-3 block text-xs font-medium text-slate-700">
                <span className="mb-1 block">Médico/Psicólogo responsable</span>
                <select
                  className="h-10 w-full rounded border border-slate-300 px-2 text-sm"
                  value={responsableProfesionalId > 0 ? String(responsableProfesionalId) : "0"}
                  onChange={(event) => onChangeResponsableProfesional(event.target.value)}
                  disabled={readOnly || saving}
                >
                  <option value="0">Seleccionar responsable...</option>
                  {profesionales.map((profesional) => (
                    <option key={profesional.id} value={String(profesional.id)}>
                      {formatProfesionalName(profesional)} · {formatColegiatura(profesional)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-3 text-sm font-medium text-slate-800">{responsableNombreVisible}</p>
              <p className="text-xs text-slate-500">{responsableColegiaturaVisible}</p>
              {resultado?.updated_at ? <p className="mt-3 text-xs text-slate-500">Última actualización: {resultado.updated_at}</p> : null}
            </section>

            {!esVistaEnfermeria ? (
              <section className="space-y-3 bg-white p-4 shadow-sm">
                <h2 className="font-semibold text-slate-900">Plantillas</h2>
                <select className="h-10 w-full rounded border border-slate-300 px-2 text-sm" value={plantillaId} onChange={(event) => setPlantillaId(event.target.value)} disabled={readOnly || templateSaving}>
                  {plantillas.map((template) => <option key={`${template.id || 0}-${template.codigo || "template"}`} value={String(template.id || 0)}>{template.nombre || template.codigo || "Plantilla sugerida"}</option>)}
                </select>
                <button type="button" className="h-10 w-full rounded border border-cyan-300 text-sm font-medium text-cyan-700 hover:bg-cyan-50 disabled:opacity-50" onClick={aplicarPlantilla} disabled={readOnly || templateSaving || plantillas.length === 0}>Aplicar plantilla</button>
                <input className="h-10 w-full rounded border border-slate-300 px-3 text-sm" value={plantillaNombre} onChange={(event) => setPlantillaNombre(event.target.value)} placeholder="Nombre de plantilla" disabled={readOnly || templateSaving} />
                <div className="grid grid-cols-[1fr_40px] gap-2">
                  <button type="button" className="h-10 rounded border border-amber-300 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50" onClick={guardarPlantilla} disabled={readOnly || templateSaving}>{templateSaving ? "Procesando..." : "Guardar plantilla"}</button>
                  <button type="button" className="flex h-10 items-center justify-center rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50" onClick={eliminarPlantilla} disabled={readOnly || templateSaving || Number(plantillaId) <= 0} title="Eliminar plantilla" aria-label="Eliminar plantilla"><FiTrash2 /></button>
                </div>
              </section>
            ) : null}

            <section className="space-y-2 bg-white p-4 shadow-sm">
              <button type="button" className="flex h-11 w-full items-center justify-center gap-2 rounded border border-cyan-400 text-sm font-semibold text-cyan-800 hover:bg-cyan-50 disabled:opacity-50" onClick={() => guardar("borrador")} disabled={readOnly || saving}><FiSave />{saving ? "Guardando..." : "Guardar borrador"}</button>
              <button type="button" className="flex h-11 w-full items-center justify-center gap-2 rounded bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" onClick={() => guardar("finalizado")} disabled={readOnly || saving}><FiCheckCircle />Finalizar examen</button>
              {!esVistaEnfermeria ? <button type="button" className="flex h-11 w-full items-center justify-center gap-2 rounded border border-slate-400 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50" onClick={imprimir} disabled={String(resultado?.estado || "") !== "finalizado"}><FiPrinter />Imprimir resultado</button> : null}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}