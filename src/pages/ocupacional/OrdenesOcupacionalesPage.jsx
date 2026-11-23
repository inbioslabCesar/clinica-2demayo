import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiActivity,
  FiAlertCircle,
  FiCheckCircle,
  FiSearch,
  FiClipboard,
  FiEdit2,
  FiEye,
  FiFileText,
  FiImage,
  FiMoreHorizontal,
  FiPrinter,
  FiTrash2,
  FiUserCheck,
  FiXCircle,
} from "react-icons/fi";
import {
  editarOrdenOcupacional,
  eliminarOrdenOcupacional,
  listarEmpresasOcupacionales,
  listarProtocolosOcupacionales,
  listarTiposEvaluacionOcupacional,
  listarTrabajadoresOcupacionalesPaginado,
  listarHistoriaOcupacionalPorOrden,
  guardarHistoriaOcupacional,
  anularHistoriaOcupacional,
  obtenerHistoriaClinicaOcupacionalConsolidada,
  obtenerResultadoClinicoOcupacional,
  guardarResultadoClinicoOcupacional,
  registrarEmisionPdfResultadoClinicoOcupacional,
  resolverFirmantePdfResultadoClinicoOcupacional,
  guardarPlantillaResultadoClinicoOcupacional,
  eliminarPlantillaResultadoClinicoOcupacional,
  actualizarDetalleOrdenOcupacional,
  listarInterconsultasOcupacionales,
  crearInterconsultaOcupacional,
  responderInterconsultaOcupacional,
  levantarInterconsultaOcupacional,
  anularInterconsultaOcupacional,
  listarEventosOrdenOcupacional,
  obtenerDetalleOrdenOcupacional,
  obtenerReporteOrdenesOcupacionales,
  obtenerResumenOrdenesOcupacionales,
  listarOrdenesOcupacionalesPaginado,
  previsualizarOrdenOcupacional,
  anularOrdenOcupacional,
  cerrarOrdenOcupacional,
  guardarAptitudOrdenOcupacional,
  registrarEmisionCertificadoOrdenOcupacional,
  registrarOrdenOcupacional,
} from "../../api/ocupacionalApi";
import { BASE_URL } from "../../config/config";
import FormatoClinicoCampos from "../../components/ocupacional/FormatoClinicoCampos";
import { formatProfesionalName } from "../../utils/profesionalDisplay";

const APTITUD_LABELS = {
  APTO: "Apto",
  APTO_CON_RESTRICCIONES: "Apto con restricciones",
  NO_APTO: "No apto",
};

const LEGACY_APTITUD_OPTIONS = [
  "APTO",
  "NO APTO",
  "OBSERVADO",
  "APTO CON RESTRICCION",
  "SANO",
  "EXAMEN COMPLEMENTARIO HCG BETA POSITIVO",
  "EXAMEN COMPLEMENTARIO HCG BETA NEGATIVO",
  "PRUEBA ANTIGENA COVID-19 NEGATIVO",
  "PRUEBA ANTIGENA COVID-19 POSITIVO",
  "EXAMEN DE RETIRO CONCLUIDO",
  "CONCLUIDO - NORMAL",
  "EXAMEN COMPLEMENTARIO CONCLUIDO",
  "EN PROCESO",
  "NO CONCLUIDO",
  "PRUEBA RÁPIDA SEROLÓGICA COVID-19 IGG/IGM NO REACTIVO",
  "PRUEBA RÁPIDA SEROLÓGICA COVID-19 IGM REACTIVO",
  "PRUEBA RÁPIDA SEROLÓGICA COVID-19 IGG/IGM REACTIVO",
  "PRUEBA RÁPIDA SEROLÓGICA COVID-19 IGG REACTIVO",
  "APTO_CON_RESTRICCIONES",
  "NO_APTO",
];

function normalizeAptitudKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const base = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (base === "APTO_CON_RESTRICCION") return "APTO_CON_RESTRICCIONES";
  if (base === "NOAPTO") return "NO_APTO";
  return base;
}

function esAptitudConRestriccion(value) {
  return normalizeAptitudKey(value) === "APTO_CON_RESTRICCIONES";
}

function formatAptitudLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Pendiente";
  return APTITUD_LABELS[raw] || APTITUD_LABELS[normalizeAptitudKey(raw)] || raw;
}

function aptitudBadgeClass(value) {
  const key = normalizeAptitudKey(value);
  if (key === "APTO") return "bg-emerald-100 text-emerald-700";
  if (key === "APTO_CON_RESTRICCIONES") return "bg-amber-100 text-amber-800";
  if (key === "NO_APTO") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-600";
}

function resumenLevantamientoOrden(row) {
  const total = Number(row?.interconsultas_levantadas || 0);
  const noFavorables = Number(row?.levantamientos_no_favorables || 0);
  if (noFavorables > 0) return `${noFavorables} no favorable${noFavorables === 1 ? "" : "s"}`;
  if (total > 0) return `${total} favorable${total === 1 ? "" : "s"}`;
  if (Number(row?.interconsultas_abiertas || 0) > 0) return "Pendiente";
  return "-";
}

function textoObservacionesOrden(row) {
  const clinica = String(row?.observaciones_resumen || "").trim();
  if (clinica) return clinica;
  if (Number(row?.total_observados || 0) > 0) return `${row.total_observados} examen(es) observado(s)`;
  return "Sin observaciones";
}

function ordenListaParaAptitud(row) {
  if (!row) return false;
  return String(row.estado || "") !== "anulada";
}

function formatTrabajadorLabel(trabajador) {
  if (!trabajador) return "";
  const nombre = String(trabajador.nombre_completo || "Paciente sin nombre").trim() || "Paciente sin nombre";
  const documento = String(trabajador.documento_numero || "").trim();
  const puesto = String(trabajador.puesto_trabajo || "").trim();
  const empresa = String(trabajador.empresa || "").trim();
  const extra = [documento ? `DNI: ${documento}` : "", puesto, empresa].filter(Boolean).join(" | ");
  return extra ? `${nombre} | ${extra}` : nombre;
}

function ActionIconButton({ icon: _Icon, label, disabled = false, active = false, badge = 0, onClick }) {
  return (
    <button
      type="button"
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md border text-lg transition-colors ${active ? "border-violet-500 bg-violet-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"} disabled:cursor-not-allowed disabled:opacity-35`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <_Icon aria-hidden="true" />
      {Number(badge || 0) > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
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
  if (/^data:image\//i.test(String(imageUrl))) {
    return String(imageUrl);
  }
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

async function fetchConfiguracionClinica() {
  const response = await fetch(`${BASE_URL}api_get_configuracion.php`, {
    method: "GET",
    credentials: "include",
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !payload?.success) {
    return null;
  }
  return payload.data || null;
}

const ROUTE_AREA_DEFINITIONS = [
  { title: "EVALUACION MEDICA", order: 10, aliases: ["EVALUACION MEDICA", "MEDICINA OCUPACIONAL"] },
  { title: "OSTEOMUSCULAR", order: 20, aliases: ["OSTEOMUSCULAR", "MUSCULOESQUELET"] },
  { title: "OFTALMOLOGIA", order: 30, aliases: ["OFTALMO", "VISION"] },
  { title: "RADIOGRAFIA", order: 40, aliases: ["RADIOGRAF", "RAYOS X", "RAYOSX"] },
  { title: "PSICOLOGIA", order: 50, aliases: ["PSICOLOG", "PSICOMETR"] },
  { title: "EXAMEN DE LABORATORIO", order: 60, aliases: ["LABORATORIO", "HEMATOLOG", "BIOQUIM", "TOXICOLOG"] },
  { title: "OTORRINOLARINGOLOGIA", order: 70, aliases: ["OTORRINO", "AUDIOMETR", "AUDICION"] },
  { title: "ELECTROCARDIOGRAMA", order: 80, aliases: ["ELECTROCARD", "CARDIOLOG", " ECG ", " EKG "] },
  { title: "TRIAJE", order: 90, aliases: ["TRIAJE", "TRIAGE", "SIGNOS VITALES"] },
];

function normalizeRouteText(value) {
  return ` ${String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()} `;
}

function resolveRouteArea(item) {
  const groupText = normalizeRouteText(item?.examen_grupo);
  const fullText = normalizeRouteText([
    item?.examen_grupo,
    item?.examen_subgrupo,
    item?.examen_descripcion,
    item?.examen_codigo,
  ].filter(Boolean).join(" "));
  const matchDefinition = (text) => ROUTE_AREA_DEFINITIONS.find((definition) => (
    definition.aliases.some((alias) => text.includes(normalizeRouteText(alias).trim()))
  ));
  const definition = matchDefinition(groupText) || matchDefinition(fullText);
  if (definition) return definition;

  const rawGroup = String(item?.examen_grupo || item?.examen_subgrupo || "OTROS EXAMENES").trim().toUpperCase();
  const configuredOrder = Number(item?.grupo_orden || 0);
  return {
    title: rawGroup || "OTROS EXAMENES",
    order: configuredOrder > 0 ? configuredOrder : 85,
    aliases: [],
  };
}

function buildRouteGroups(items) {
  const groups = new Map();
  (Array.isArray(items) ? items : []).forEach((item, sourceIndex) => {
    const area = resolveRouteArea(item);
    if (!groups.has(area.title)) {
      groups.set(area.title, { title: area.title, order: area.order, items: [] });
    }
    groups.get(area.title).items.push({ ...item, sourceIndex });
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: group.items.sort((left, right) => (
        Number(left.examen_orden || 0) - Number(right.examen_orden || 0)
        || String(left.examen_subgrupo || "").localeCompare(String(right.examen_subgrupo || ""), "es")
        || left.sourceIndex - right.sourceIndex
      )),
    }))
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, "es"));
}

function escapeRouteHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatRouteDate(value) {
  const parts = String(value || "").split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value || "");
}

function buildRouteVitals(det) {
  const triaje = det?.triaje && typeof det.triaje === "object" ? det.triaje : {};
  const systolic = String(triaje.presion_sistolica || "").trim();
  const diastolic = String(triaje.presion_diastolica || "").trim();
  return [
    { label: "PA", value: systolic || diastolic ? `${systolic}/${diastolic}` : "" },
    { label: "IMC", value: triaje.imc || "" },
    { label: "TALLA", value: triaje.talla_cm || "" },
    { label: "PESO", value: triaje.peso_kg || "" },
    { label: "FC", value: triaje.frecuencia_cardiaca || "" },
    { label: "FR", value: triaje.frecuencia_respiratoria || "" },
    { label: "T°", value: triaje.temperatura || "" },
    { label: "P. ABD.", value: triaje.perimetro_abdominal_cm || triaje.perimetro_abdominal || "" },
  ];
}

async function fetchMedicosCrud() {
  const response = await fetch(`${BASE_URL}api_medicos.php?accion=catalogo_certificadores`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !payload?.success) return [];
  return Array.isArray(payload.medicos) ? payload.medicos : [];
}

function isMedicoCertificador(medico) {
  const tipo = String(medico?.tipo_profesional || "medico").trim().toLowerCase();
  const cmp = String(medico?.cmp || medico?.nro_colegiatura || "").trim();
  const tieneFirma = Number(medico?.tiene_firma || 0) === 1 || String(medico?.firma || "").trim() !== "";
  return tipo === "medico" && Boolean(cmp) && tieneFirma;
}

function normalizeCompareText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildMedicoToken(medico) {
  const apellido = String(medico?.apellido || "").trim().toUpperCase();
  if (apellido) return apellido;
  const nombreCompleto = [medico?.nombre, medico?.apellido].filter(Boolean).join(" ").trim().toUpperCase();
  return nombreCompleto || "MEDICO";
}

function isTransientNetworkMessage(message) {
  const msg = String(message || "").toLowerCase();
  const isHttp5xx = /error http 5\d{2}/.test(msg) || msg.includes("internal server error");
  return (
    msg.includes("network changed")
    || msg.includes("err_network_changed")
    || msg.includes("failed to fetch")
    || msg.includes("networkerror")
    || msg.includes("load failed")
    || isHttp5xx
  );
}

function resolveMedicoFromOrden(det, medicos = []) {
  const lista = Array.isArray(medicos) ? medicos : [];
  if (!lista.length) return null;

  const medicoId = Number(det?.medico_responsable_id || 0);
  if (medicoId > 0) {
    const byId = lista.find((m) => Number(m.id) === medicoId);
    if (byId) return byId;
  }

  const firmas = [det?.medico_responsable, det?.firma_doctor]
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  for (const raw of firmas) {
    if (/^\d+$/.test(raw)) {
      const byId = lista.find((m) => Number(m.id) === Number(raw));
      if (byId) return byId;
    }
  }

  const normalizedTokens = firmas.map((v) => normalizeCompareText(v)).filter(Boolean);
  if (!normalizedTokens.length) return null;

  const matches = lista.filter((m) => {
      const full = normalizeCompareText(`${m?.nombre || ""} ${m?.apellido || ""}`);
      const apellido = normalizeCompareText(m?.apellido || "");
      const token = normalizeCompareText(buildMedicoToken(m));
      return normalizedTokens.some((needle) => {
        if (!needle) return false;
        return (
          full === needle
          || apellido === needle
          || token === needle
          || full.includes(needle)
          || needle.includes(apellido)
        );
      });
    });

  if (!matches.length) return null;

  const withFirma = matches.find((m) => (
    Number(m?.tiene_firma || 0) === 1 || String(m?.firma || "").trim() !== ""
  ));
  return withFirma || matches[0];
}

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isIsoDateString(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const dt = new Date(`${text}T00:00:00`);
  return Number.isFinite(dt.getTime()) && dt.toISOString().slice(0, 10) === text;
}

function formatIsoDateForCertificate(value) {
  const text = String(value || "").trim();
  if (!isIsoDateString(text)) return "-";
  const [y, m, d] = text.split("-");
  return `${d}-${m}-${y}`;
}

function resolveCertificadoFormDates(det) {
  const fechaOrden = String(det?.fecha_orden || "").trim();
  const fechaEvaluacionRef = String(det?.certificado_fecha_evaluacion_ref || "").trim();
  const fechaEmisionRef = String(det?.certificado_fecha_emision_ref || "").trim();
  const fechaEvaluacionEfectiva = String(det?.certificado_fecha_evaluacion || "").trim();
  const evaluacion = fechaEvaluacionRef || fechaEvaluacionEfectiva || fechaOrden || todayIso();
  return {
    fechaEvaluacion: evaluacion,
    fechaEmision: fechaEmisionRef,
  };
}

function prettyJsonInput(value) {
  if (value == null) return "[]";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? "[]" : trimmed;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[]";
  }
}

function normalizeHistoriaList(value) {
  let parsed = value;
  if (typeof parsed === "string") {
    const text = parsed.trim();
    if (!text) return [];
    try {
      parsed = JSON.parse(text);
    } catch {
      return [text];
    }
  }
  if (parsed === null || parsed === undefined) return [];
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.map((item) => {
    if (item === null || item === undefined) return "";
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return String(item);
    return Object.entries(item)
      .map(([key, itemValue]) => `${key.replaceAll("_", " ")}: ${String(itemValue ?? "")}`)
      .join(" | ");
  }).filter((item) => item.trim() !== "");
}

function ListaClinicaEditable({ title, singular, value, onChange, disabled }) {
  const items = normalizeHistoriaList(value);
  const updateItem = (index, nextValue) => onChange(items.map((item, currentIndex) => currentIndex === index ? nextValue : item));
  const removeItem = (index) => onChange(items.filter((_, currentIndex) => currentIndex !== index));
  return (
    <fieldset className="rounded border border-slate-200 bg-white p-3 disabled:opacity-70" disabled={disabled}>
      <legend className="px-1 text-xs font-semibold text-slate-700">{title}</legend>
      <div className="space-y-2">
        {items.length === 0 ? <p className="text-xs text-slate-500">Sin registros</p> : null}
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="flex items-start gap-2">
            <textarea
              className="min-h-14 min-w-0 flex-1 resize-y rounded border border-slate-300 px-2 py-1 text-xs"
              value={item}
              onChange={(event) => updateItem(index, event.target.value)}
              aria-label={`${singular} ${index + 1}`}
            />
            <button type="button" className="shrink-0 rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50" onClick={() => removeItem(index)}>
              Eliminar
            </button>
          </div>
        ))}
        <button type="button" className="rounded border border-cyan-300 px-2 py-1 text-xs text-cyan-700 hover:bg-cyan-50" onClick={() => onChange([...items, ""])}>
          Agregar {singular.toLowerCase()}
        </button>
      </div>
    </fieldset>
  );
}

const RESULTADO_PDF_LABELS = {
  motivo: "Motivo",
  motivo_evaluacion: "Motivo de evaluacion",
  antecedentes_ocupacionales: "Antecedentes ocupacionales",
  antecedentes_personales: "Antecedentes personales",
  anamnesis: "Anamnesis",
  examen_fisico: "Examen fisico",
  diagnostico: "Diagnostico",
  hallazgos: "Hallazgos",
  conclusion: "Conclusion",
  recomendaciones: "Recomendaciones",
  observaciones: "Observaciones",
  agudeza_visual_od: "Agudeza visual OD",
  agudeza_visual_oi: "Agudeza visual OI",
  vision_colores: "Vision de colores",
  impresion: "Impresion",
  ritmo: "Ritmo",
  frecuencia: "Frecuencia",
  eje: "Eje",
};

function buildResultadoPdfTables(templateCode, datos) {
  const safeDatos = datos && typeof datos === "object" ? datos : {};
  if (templateCode === "triaje_clinico") {
    return [{
      title: "Signos vitales y antropometria",
      head: [["Parametro", "Resultado", "Unidad"]],
      body: [
        ["Presion sistolica", safeDatos.presion_sistolica || "-", "mmHg"],
        ["Presion diastolica", safeDatos.presion_diastolica || "-", "mmHg"],
        ["Frecuencia cardiaca", safeDatos.frecuencia_cardiaca || "-", "lpm"],
        ["Frecuencia respiratoria", safeDatos.frecuencia_respiratoria || "-", "rpm"],
        ["Temperatura", safeDatos.temperatura || "-", "°C"],
        ["Saturacion de oxigeno", safeDatos.saturacion_oxigeno || "-", "%"],
        ["Peso", safeDatos.peso_kg || "-", "kg"],
        ["Talla", safeDatos.talla_cm || "-", "cm"],
        ["Perimetro abdominal", safeDatos.perimetro_abdominal_cm || "-", "cm"],
        ["IMC", safeDatos.imc || "-", "kg/m2"],
        ["Observaciones", safeDatos.observaciones || "-", ""],
      ],
    }];
  }

  if (templateCode === "audiometria_basica") {
    const frequencies = ["500", "1000", "2000", "3000", "4000", "6000", "8000"];
    return [{
      title: "Umbrales audiometricos (dB HL)",
      head: [["Oido", ...frequencies.map((frequency) => `${frequency} Hz`)]],
      body: [
        ["Derecho", ...frequencies.map((frequency) => safeDatos.od?.[frequency] ?? "-")],
        ["Izquierdo", ...frequencies.map((frequency) => safeDatos.oi?.[frequency] ?? "-")],
      ],
    }, {
      title: "Evaluacion audiometrica",
      head: [["Campo", "Resultado"]],
      body: [
        ["Otoscopia OD", safeDatos.otoscopia_od || "-"],
        ["Otoscopia OI", safeDatos.otoscopia_oi || "-"],
        ["Impresion audiometrica", safeDatos.impresion || "-"],
        ["Recomendaciones", safeDatos.recomendaciones || "-"],
      ],
    }];
  }

  if (templateCode === "lab_basico") {
    const parametros = Array.isArray(safeDatos.parametros) ? safeDatos.parametros : [];
    return [{
      title: "Resultados de laboratorio",
      head: [["Parametro", "Resultado", "Referencia"]],
      body: parametros.length > 0
        ? parametros.map((parametro) => [parametro.nombre || "-", parametro.valor || "-", parametro.referencia || "-"])
        : [["Sin parametros estructurados", "-", "-"]],
    }, {
      title: "Interpretacion",
      head: [["Campo", "Resultado"]],
      body: [["Hallazgos", safeDatos.hallazgos || "-"], ["Conclusion", safeDatos.conclusion || "-"], ["Recomendaciones", safeDatos.recomendaciones || "-"]],
    }];
  }

  const rows = Object.entries(safeDatos)
    .filter(([, value]) => !Array.isArray(value) && (value === null || typeof value !== "object"))
    .map(([key, value]) => [RESULTADO_PDF_LABELS[key] || key.replaceAll("_", " "), String(value || "-")]);
  return [{
    title: "Resultado clinico",
    head: [["Campo", "Resultado"]],
    body: rows.length > 0 ? rows : [["Resultado", "Sin datos estructurados"]],
  }];
}

export default function OrdenesOcupacionalesPage() {
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState(0);
  const [empresaQ, setEmpresaQ] = useState("");
  const [empresaOpen, setEmpresaOpen] = useState(false);
  const [empresaActiveIndex, setEmpresaActiveIndex] = useState(-1);

  const [trabajadores, setTrabajadores] = useState([]);
  const [trabajadorId, setTrabajadorId] = useState(0);
  const [trabajadorQ, setTrabajadorQ] = useState("");
  const [trabajadorQDebounced, setTrabajadorQDebounced] = useState("");
  const [trabajadorOpen, setTrabajadorOpen] = useState(false);
  const [trabajadorActiveIndex, setTrabajadorActiveIndex] = useState(-1);
  const [trabajadoresLoading, setTrabajadoresLoading] = useState(false);
  const [trabajadoresMeta, setTrabajadoresMeta] = useState({ page: 1, per_page: 20, total: 0, total_pages: 0 });
  const [trabajadorSnapshot, setTrabajadorSnapshot] = useState(null);

  const [protocolos, setProtocolos] = useState([]);
  const [protocoloId, setProtocoloId] = useState(0);

  const [tipos, setTipos] = useState([]);
  const [tipoEvaluacionId, setTipoEvaluacionId] = useState(0);

  const [fechaOrden, setFechaOrden] = useState(todayIso());
  const [observacion, setObservacion] = useState("");
  const [subcontrataEmpresaId, setSubcontrataEmpresaId] = useState(0);
  const [facturarEmpresaId, setFacturarEmpresaId] = useState(0);
  const [firmaDoctor, setFirmaDoctor] = useState("GALLEGOS");
  const [medicosCrud, setMedicosCrud] = useState([]);
  const [medicoOrdenId, setMedicoOrdenId] = useState(0);
  const [modoOrden, setModoOrden] = useState("CONVALIDACION");
  const [gestanteOrden, setGestanteOrden] = useState(false);
  const [documentoOrden, setDocumentoOrden] = useState("");
  const [indicaDr, setIndicaDr] = useState("");

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(0);

  const [rows, setRows] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(0);
  const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, total_pages: 0 });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [empresaFiltroId, setEmpresaFiltroId] = useState(0);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resumen, setResumen] = useState(null);
  const [exportandoGlobal, setExportandoGlobal] = useState(false);
  const [anulandoId, setAnulandoId] = useState(0);
  const [cerrandoId, setCerrandoId] = useState(0);
  const [editandoOrdenId, setEditandoOrdenId] = useState(0);
  const [eliminandoOrdenId, setEliminandoOrdenId] = useState(0);
  const [pdfId, setPdfId] = useState(0);
  const [detalleModalOpen, setDetalleModalOpen] = useState(false);
  const [detalleModalVista, setDetalleModalVista] = useState("full");
  const [detalleModalLoading, setDetalleModalLoading] = useState(false);
  const [detalleModalData, setDetalleModalData] = useState(null);
  const [detalleModalError, setDetalleModalError] = useState("");
  const [detalleForms, setDetalleForms] = useState({});
  const [savingDetalleId, setSavingDetalleId] = useState(0);
  const [eventosFiltros, setEventosFiltros] = useState({ tipo: "", fechaDesde: "", fechaHasta: "" });
  const [eventosFiltrados, setEventosFiltrados] = useState([]);
  const [eventosLoading, setEventosLoading] = useState(false);
  const [aptitudForm, setAptitudForm] = useState({
    aptitud: "",
    restriccion: "",
    recomendacion: "",
    medicoId: 0,
    certificadoFechaEvaluacion: "",
    certificadoFechaEmision: "",
  });
  const [savingAptitud, setSavingAptitud] = useState(false);
  const [certificandoId, setCertificandoId] = useState(0);
  const [interconsultas, setInterconsultas] = useState([]);
  const [interconsultasLoading, setInterconsultasLoading] = useState(false);
  const [interconsultasError, setInterconsultasError] = useState("");
  const [interconsultaSavingKey, setInterconsultaSavingKey] = useState("");
  const [interconsultaForm, setInterconsultaForm] = useState({
    detalleId: 0,
    especialidad: "",
    motivo: "",
    cie10: "",
    diagnostico: "",
    observaciones: "",
  });
  const [interconsultaRespuestaForms, setInterconsultaRespuestaForms] = useState({});
  const [interconsultaLevantamientoForms, setInterconsultaLevantamientoForms] = useState({});
  const [historiaRows, setHistoriaRows] = useState([]);
  const [historiaLoading, setHistoriaLoading] = useState(false);
  const [historiaSaving, setHistoriaSaving] = useState(false);
  const [historiaAnulandoId, setHistoriaAnulandoId] = useState(0);
  const [historiaError, setHistoriaError] = useState("");
  const [historiaEditingId, setHistoriaEditingId] = useState(0);
  const [historiaForm, setHistoriaForm] = useState({
    motivo_evaluacion: "",
    puesto_actual: "",
    area_trabajo: "",
    tiempo_puesto_meses: "",
    observaciones: "",
    antecedentes_laborales_json: [],
    antecedentes_patologicos_json: [],
    habitos_json: [],
  });
  const [clinicaConsolidada, setClinicaConsolidada] = useState(null);
  const [clinicaLoading, setClinicaLoading] = useState(false);
  const [clinicaError, setClinicaError] = useState("");
  const [formatoModalOpen, setFormatoModalOpen] = useState(false);
  const [formatoModalLoading] = useState(false);
  const [formatoModalSaving, setFormatoModalSaving] = useState(false);
  const [formatoPdfGenerating, setFormatoPdfGenerating] = useState(false);
  const [formatoModalError, setFormatoModalError] = useState("");
  const [formatoModalData, setFormatoModalData] = useState(null);
  const [formatoPlantillaSeleccionada, setFormatoPlantillaSeleccionada] = useState("0");
  const [formatoPlantillaNombre, setFormatoPlantillaNombre] = useState("");
  const [formatoPlantillaSaving, setFormatoPlantillaSaving] = useState(false);
  const [formatoForm, setFormatoForm] = useState({
    ordenDetalleId: 0,
    examenCodigo: "",
    examenDescripcion: "",
    formatoCodigo: "",
    estado: "borrador",
    observacion: "",
    datos: {},
    datosJsonText: "{}",
  });
  const trabajadoresRequestRef = useRef(0);
  const empresaComboRef = useRef(null);
  const trabajadorComboRef = useRef(null);
  const ordenesRequestRef = useRef(0);
  const resumenRequestRef = useRef(0);
  const ordenesRetryRef = useRef(0);
  const deepLinkHandledRef = useRef(false);
  const medicoOrden = useMemo(
    () => (medicosCrud || []).find((m) => Number(m.id) === Number(medicoOrdenId)) || null,
    [medicosCrud, medicoOrdenId]
  );
  const empresaSeleccionada = useMemo(
    () => (empresas || []).find((item) => Number(item.id) === Number(empresaId)) || null,
    [empresas, empresaId]
  );
  const empresaInputValue = empresaOpen ? empresaQ : String(empresaSeleccionada?.razon_social || "");
  const empresasFiltradas = useMemo(() => {
    const term = String(empresaQ || "").trim().toLowerCase();
    if (!term) return empresas || [];
    return (empresas || []).filter((item) => {
      const razonSocial = String(item.razon_social || "").toLowerCase();
      const ruc = String(item.ruc || "").toLowerCase();
      return razonSocial.includes(term) || ruc.includes(term);
    });
  }, [empresas, empresaQ]);
  const empresaOpciones = useMemo(
    () => [{ id: 0, razon_social: "Seleccione empresa", ruc: "" }, ...(empresasFiltradas || [])],
    [empresasFiltradas]
  );
  const trabajadorSeleccionado = useMemo(() => {
    const fromList = (trabajadores || []).find((item) => Number(item.id) === Number(trabajadorId));
    if (fromList) return fromList;
    if (Number(trabajadorSnapshot?.id || 0) === Number(trabajadorId || 0)) {
      return trabajadorSnapshot;
    }
    return null;
  }, [trabajadores, trabajadorId, trabajadorSnapshot]);
  const trabajadorInputValue = trabajadorOpen ? trabajadorQ : formatTrabajadorLabel(trabajadorSeleccionado);
  const trabajadorOpciones = useMemo(() => trabajadores || [], [trabajadores]);

  const limpiarSeleccionTrabajador = useCallback(() => {
    setTrabajadorId(0);
    setTrabajadorSnapshot(null);
    setTrabajadorQ("");
    setTrabajadorQDebounced("");
    setTrabajadorOpen(false);
    setTrabajadorActiveIndex(-1);
  }, []);

  const seleccionarEmpresa = useCallback((id) => {
    setEmpresaId(Number(id || 0));
    setEmpresaQ("");
    setEmpresaOpen(false);
    setEmpresaActiveIndex(-1);
    limpiarSeleccionTrabajador();
    setPreview(null);
    setMessage("");
  }, [limpiarSeleccionTrabajador]);

  const seleccionarTrabajador = useCallback((trabajador) => {
    if (!trabajador || Number(trabajador.id) <= 0) return;
    setTrabajadorId(Number(trabajador.id));
    setTrabajadorSnapshot(trabajador);
    setTrabajadorQ("");
    setTrabajadorQDebounced("");
    setTrabajadorOpen(false);
    setTrabajadorActiveIndex(-1);
    setPreview(null);
    setMessage("");
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQDebounced(q.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setTrabajadorQDebounced(trabajadorQ.trim());
    }, 300);
    return () => window.clearTimeout(t);
  }, [trabajadorQ]);

  useEffect(() => {
    const onMouseDown = (event) => {
      if (empresaComboRef.current && !empresaComboRef.current.contains(event.target)) {
        setEmpresaOpen(false);
        setEmpresaActiveIndex(-1);
      }
      if (trabajadorComboRef.current && !trabajadorComboRef.current.contains(event.target)) {
        setTrabajadorOpen(false);
        setTrabajadorActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  useEffect(() => {
    if (!empresaOpen) {
      setEmpresaActiveIndex(-1);
      return;
    }
    const selectedIndex = empresaOpciones.findIndex((item) => Number(item.id) === Number(empresaId));
    setEmpresaActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [empresaOpen, empresaId, empresaOpciones]);

  useEffect(() => {
    if (!trabajadorOpen) {
      setTrabajadorActiveIndex(-1);
      return;
    }
    const selectedIndex = trabajadorOpciones.findIndex((item) => Number(item.id) === Number(trabajadorId));
    setTrabajadorActiveIndex(selectedIndex >= 0 ? selectedIndex : (trabajadorOpciones.length > 0 ? 0 : -1));
  }, [trabajadorOpen, trabajadorId, trabajadorOpciones]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const [empData, tipoData, medicosData] = await Promise.all([
          listarEmpresasOcupacionales({ estado: "activo" }),
          listarTiposEvaluacionOcupacional(),
          fetchMedicosCrud(),
        ]);

        if (cancelled) return;

        setEmpresas(empData || []);
        setEmpresaId((currentId) => currentId || Number(empData?.[0]?.id || 0));

        setTipos(tipoData || []);
        setTipoEvaluacionId((currentId) => currentId || Number(tipoData?.[0]?.id || 0));

        const medicosElegibles = (medicosData || []).filter(isMedicoCertificador);
        setMedicosCrud(medicosElegibles);
        setMedicoOrdenId((currentId) => currentId || Number(medicosElegibles[0]?.id || 0));
        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "No se pudo cargar catalogos iniciales");
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!medicoOrden) return;
    setFirmaDoctor(buildMedicoToken(medicoOrden));
  }, [medicoOrden]);

  const cargarTrabajadores = useCallback(async () => {
    const requestId = ++trabajadoresRequestRef.current;
    if (!empresaId) {
      setTrabajadores([]);
      setTrabajadorId(0);
      setTrabajadorSnapshot(null);
      setTrabajadoresMeta({ page: 1, per_page: 20, total: 0, total_pages: 0 });
      setTrabajadoresLoading(false);
      return;
    }

    setTrabajadoresLoading(true);
    try {
      const payload = await listarTrabajadoresOcupacionalesPaginado({
        estado: "activo",
        q: trabajadorQDebounced,
        empresaId,
        page: 1,
        perPage: 20,
        sortBy: "documento_numero",
        sortDir: "asc",
      });

      const list = payload.data || [];
      if (requestId !== trabajadoresRequestRef.current) {
        return;
      }
      setTrabajadores(list);
      setTrabajadoresMeta(payload.meta || { page: 1, per_page: 20, total: 0, total_pages: 0 });
      setTrabajadorId((currentId) => Number(currentId || 0));
      setTrabajadorSnapshot((current) => {
        const selected = list.find((it) => Number(it.id) === Number(trabajadorId || 0));
        return selected || current;
      });
      setError("");
    } catch (err) {
      if (requestId === trabajadoresRequestRef.current) {
        setError(err.message || "No se pudo cargar trabajadores");
      }
    } finally {
      if (requestId === trabajadoresRequestRef.current) {
        setTrabajadoresLoading(false);
      }
    }
  }, [empresaId, trabajadorQDebounced, trabajadorId]);

  const cargarProtocolos = useCallback(async () => {
    if (!empresaId) {
      setProtocolos([]);
      setProtocoloId(0);
      return;
    }

    try {
      const data = await listarProtocolosOcupacionales({ empresaId, estado: "activo" });
      setProtocolos(data || []);
      setProtocoloId((currentId) => (
        data.some((it) => Number(it.id) === Number(currentId))
          ? currentId
          : (data.length ? Number(data[0].id) : 0)
      ));
      setError("");
    } catch (err) {
      setError(err.message || "No se pudo cargar protocolos");
    }
  }, [empresaId]);

  useEffect(() => {
    cargarTrabajadores();
    cargarProtocolos();
  }, [cargarTrabajadores, cargarProtocolos]);

  const cargarOrdenes = useCallback(async () => {
    const requestId = ++ordenesRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const payload = await listarOrdenesOcupacionalesPaginado({
        empresaId: empresaFiltroId,
        estado: filtroEstado,
        tipo: filtroTipo,
        fechaDesde: filtroFechaDesde,
        fechaHasta: filtroFechaHasta,
        q: qDebounced,
        page,
        perPage,
      });
      if (requestId !== ordenesRequestRef.current) {
        return;
      }
      setRows(payload.data || []);
      setMeta(payload.meta || { page: 1, per_page: perPage, total: 0, total_pages: 0 });
      ordenesRetryRef.current = 0;
      setError("");
    } catch (err) {
      if (requestId !== ordenesRequestRef.current) {
        return;
      }

      const errMessage = String(err?.message || "").trim();
      if (isTransientNetworkMessage(errMessage) && ordenesRetryRef.current < 2) {
        const nextRetry = ordenesRetryRef.current + 1;
        ordenesRetryRef.current = nextRetry;
        window.setTimeout(() => {
          if (requestId === ordenesRequestRef.current) {
            cargarOrdenes();
          }
        }, 250 * nextRetry);
        return;
      }

      ordenesRetryRef.current = 0;
      setError(err.message || "No se pudo cargar ordenes");
    } finally {
      if (requestId === ordenesRequestRef.current) {
        setLoading(false);
      }
    }
  }, [empresaFiltroId, filtroEstado, filtroTipo, filtroFechaDesde, filtroFechaHasta, qDebounced, page, perPage]);

  useEffect(() => {
    cargarOrdenes();
  }, [cargarOrdenes]);

  useEffect(() => {
    if (selectedOrderId > 0 && !rows.some((row) => Number(row.id) === Number(selectedOrderId))) {
      setSelectedOrderId(0);
    }
  }, [rows, selectedOrderId]);

  const selectedOrder = useMemo(
    () => rows.find((row) => Number(row.id) === Number(selectedOrderId)) || null,
    [rows, selectedOrderId]
  );

  const cargarResumen = useCallback(async () => {
    const requestId = ++resumenRequestRef.current;
    try {
      const data = await obtenerResumenOrdenesOcupacionales({
        empresaId: empresaFiltroId,
        estado: filtroEstado,
        tipo: filtroTipo,
        fechaDesde: filtroFechaDesde,
        fechaHasta: filtroFechaHasta,
        q: qDebounced,
      });
      if (requestId !== resumenRequestRef.current) {
        return;
      }
      setResumen(data);
      setError("");
    } catch {
      if (requestId === resumenRequestRef.current) {
        setResumen(null);
      }
    }
  }, [empresaFiltroId, filtroEstado, filtroTipo, filtroFechaDesde, filtroFechaHasta, qDebounced]);

  useEffect(() => {
    const hasCoreData = empresas.length > 0 && tipos.length > 0 && Array.isArray(rows);
    const normalizedError = String(error || "").toLowerCase();
    const isRecoverableMsg = normalizedError.includes("respuesta no json")
      || /error http 5\d{2}/.test(normalizedError)
      || normalizedError.includes("internal server error");
    const hasLoadedData = rows.length > 0 || (resumen && typeof resumen === "object");
    if (isRecoverableMsg && hasCoreData && hasLoadedData) {
      setError("");
    }
  }, [error, empresas.length, tipos.length, rows, resumen]);

  useEffect(() => {
    cargarResumen();
  }, [cargarResumen]);

  const recargarListadoYResumen = useCallback(async () => {
    await Promise.all([cargarOrdenes(), cargarResumen()]);
  }, [cargarOrdenes, cargarResumen]);

  const canPreview = useMemo(() => {
    return empresaId > 0 && trabajadorId > 0 && protocoloId > 0 && tipoEvaluacionId > 0;
  }, [empresaId, trabajadorId, protocoloId, tipoEvaluacionId]);

  const onPrevisualizar = async () => {
    if (!canPreview) {
      setError("Complete empresa, trabajador, protocolo y tipo de evaluacion");
      return;
    }

    setPreviewLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await previsualizarOrdenOcupacional({
        empresaId,
        trabajadorId,
        protocoloId,
        tipoEvaluacionId,
      });
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setError(err.message || "No se pudo previsualizar la orden");
    } finally {
      setPreviewLoading(false);
    }
  };

  const onRegistrar = async () => {
    if (!preview) {
      setError("Primero previsualice la orden");
      return;
    }
    if (!medicoOrden) {
      setError("Seleccione un medico responsable con CMP y firma");
      return;
    }

    setRegistrando(true);
    setError("");
    setMessage("");
    try {
      const firmaDoctorPayload = medicoOrden ? buildMedicoToken(medicoOrden) : String(firmaDoctor || "").trim();
      if (editingOrderId > 0) {
        const data = await editarOrdenOcupacional({
          id: editingOrderId,
          empresaId,
          trabajadorId,
          protocoloId,
          tipoEvaluacionId,
          fechaOrden,
          observacion,
          subcontrataEmpresaId,
          facturarEmpresaId,
          medicoResponsableId: medicoOrden.id,
          modo: modoOrden,
          gestante: gestanteOrden,
          documento: documentoOrden,
          indicaDr,
        });
        setMessage(`Orden actualizada: ${data.codigo}`);
      } else {
        const data = await registrarOrdenOcupacional({
          empresaId,
          trabajadorId,
          protocoloId,
          tipoEvaluacionId,
          fechaOrden,
          observacion,
          subcontrataEmpresaId,
          facturarEmpresaId,
          medicoResponsableId: medicoOrden.id,
          firmaDoctor: firmaDoctorPayload,
          modo: modoOrden,
          gestante: gestanteOrden,
          documento: documentoOrden,
          indicaDr,
        });
        setMessage(`Orden registrada: ${data.codigo} (${data.total_items} examenes)`);
      }

      setObservacion("");
      setDocumentoOrden("");
      setIndicaDr("");
      setPreview(null);
      setEditingOrderId(0);
      setEditandoOrdenId(0);
      await recargarListadoYResumen();
    } catch (err) {
      setError(err.message || (editingOrderId > 0 ? "No se pudo editar la orden" : "No se pudo registrar la orden"));
    } finally {
      setRegistrando(false);
    }
  };

  const hydrateInterconsultas = (rowsInterconsultas) => {
    const rowsValue = Array.isArray(rowsInterconsultas) ? rowsInterconsultas : [];
    setInterconsultas(rowsValue);
    const respuestas = {};
    const levantamientos = {};
    rowsValue.forEach((row) => {
      respuestas[row.id] = {
        especialista: row.especialista_nombre || "",
        respuesta: row.respuesta || "",
        archivo: null,
      };
      levantamientos[row.id] = {
        levantamiento: row.levantamiento || "",
        recomendacion: row.recomendacion || "",
        resultado: row.resultado_levantamiento || "FAVORABLE",
        medicoId: Number(row.medico_levantamiento_id || medicoOrdenId || medicosCrud[0]?.id || 0),
      };
    });
    setInterconsultaRespuestaForms(respuestas);
    setInterconsultaLevantamientoForms(levantamientos);
  };

  const recargarInterconsultas = async (ordenId) => {
    setInterconsultasLoading(true);
    setInterconsultasError("");
    try {
      const rowsInterconsultas = await listarInterconsultasOcupacionales(ordenId);
      hydrateInterconsultas(rowsInterconsultas);
    } catch (err) {
      setInterconsultasError(err.message || "No se pudieron cargar interconsultas");
      hydrateInterconsultas([]);
    } finally {
      setInterconsultasLoading(false);
    }
  };

  const onVerDetalle = async (ordenId, vista = "full") => {
    setDetalleModalVista(vista === "aptitud" ? "aptitud" : "full");
    setDetalleModalOpen(true);
    setDetalleModalLoading(true);
    setDetalleModalError("");
    setDetalleModalData(null);
    setError("");
    try {
      const det = await obtenerDetalleOrdenOcupacional(ordenId);
      setDetalleModalData(det);
      const initialForms = {};
      (det.items || []).forEach((it) => {
        initialForms[it.id] = {
          estado: it.estado_ejecucion || "pendiente",
          observacion: it.observacion_ejecucion || "",
        };
      });
      setDetalleForms(initialForms);
      setEventosFiltros({ tipo: "", fechaDesde: "", fechaHasta: "" });
      setEventosFiltrados(det.eventos || []);
      setInterconsultaForm({ detalleId: 0, especialidad: "", motivo: "", cie10: "", diagnostico: "", observaciones: "" });
      await recargarInterconsultas(ordenId);
      const fechasCertificadoForm = resolveCertificadoFormDates(det);
      setAptitudForm({
        aptitud: det.aptitud_final || "",
        restriccion: det.restriccion_final || "",
        recomendacion: det.recomendacion_final || "",
        medicoId: Number(det.medico_responsable_id || resolveMedicoFromOrden(det, medicosCrud)?.id || 0),
        certificadoFechaEvaluacion: fechasCertificadoForm.fechaEvaluacion,
        certificadoFechaEmision: fechasCertificadoForm.fechaEmision,
      });
      setHistoriaEditingId(0);
      setHistoriaError("");
      setHistoriaForm({
        motivo_evaluacion: "",
        puesto_actual: det.puesto_trabajo || "",
        area_trabajo: "",
        tiempo_puesto_meses: "",
        observaciones: "",
        antecedentes_laborales_json: [],
        antecedentes_patologicos_json: [],
        habitos_json: [],
      });
      setHistoriaLoading(true);
      try {
        const historia = await listarHistoriaOcupacionalPorOrden(ordenId);
        setHistoriaRows(historia.data || []);
      } catch (histErr) {
        setHistoriaError(histErr.message || "No se pudo cargar historia ocupacional");
        setHistoriaRows([]);
      } finally {
        setHistoriaLoading(false);
      }

      setClinicaLoading(true);
      setClinicaError("");
      try {
        const consolidada = await obtenerHistoriaClinicaOcupacionalConsolidada(ordenId);
        setClinicaConsolidada(consolidada);
      } catch (clinErr) {
        setClinicaConsolidada(null);
        setClinicaError(clinErr.message || "No se pudo cargar historia clinica consolidada");
      } finally {
        setClinicaLoading(false);
      }
    } catch (err) {
      const msg = err.message || "No se pudo obtener detalle de la orden";
      setDetalleModalError(msg);
      setError(msg);
    } finally {
      setDetalleModalLoading(false);
    }
  };

  const recargarDetalleModal = async (ordenId) => {
    const det = await obtenerDetalleOrdenOcupacional(ordenId);
    setDetalleModalData(det);
    const nextForms = {};
    (det.items || []).forEach((it) => {
      nextForms[it.id] = {
        estado: it.estado_ejecucion || "pendiente",
        observacion: it.observacion_ejecucion || "",
      };
    });
    setDetalleForms(nextForms);
    setEventosFiltrados(det.eventos || []);
    await recargarInterconsultas(ordenId);
    const fechasCertificadoForm = resolveCertificadoFormDates(det);
    setAptitudForm({
      aptitud: det.aptitud_final || "",
      restriccion: det.restriccion_final || "",
      recomendacion: det.recomendacion_final || "",
      medicoId: Number(det.medico_responsable_id || resolveMedicoFromOrden(det, medicosCrud)?.id || 0),
      certificadoFechaEvaluacion: fechasCertificadoForm.fechaEvaluacion,
      certificadoFechaEmision: fechasCertificadoForm.fechaEmision,
    });
    try {
      const historia = await listarHistoriaOcupacionalPorOrden(ordenId);
      setHistoriaRows(historia.data || []);
    } catch {
      setHistoriaRows([]);
    }

    try {
      const consolidada = await obtenerHistoriaClinicaOcupacionalConsolidada(ordenId);
      setClinicaConsolidada(consolidada);
      setClinicaError("");
    } catch (clinErr) {
      setClinicaConsolidada(null);
      setClinicaError(clinErr.message || "No se pudo cargar historia clinica consolidada");
    }
  };

  const onRecargarClinicaConsolidada = async () => {
    if (!detalleModalData?.id) return;
    setClinicaLoading(true);
    setClinicaError("");
    try {
      const consolidada = await obtenerHistoriaClinicaOcupacionalConsolidada(detalleModalData.id);
      setClinicaConsolidada(consolidada);
    } catch (err) {
      setClinicaConsolidada(null);
      setClinicaError(err.message || "No se pudo recargar historia clinica consolidada");
    } finally {
      setClinicaLoading(false);
    }
  };

  const onAbrirFormatoClinico = useCallback((item, ordenId = 0) => {
    const detalleId = Number(item?.id || 0);
    const resolvedOrdenId = Number(item?.orden_id || ordenId || 0);
    if (detalleId <= 0 || resolvedOrdenId <= 0) return;
    window.location.assign(`/salud-ocupacional/evaluacion-medica/${resolvedOrdenId}/examen/${detalleId}`);
  }, []);

  const onAbrirTriajeOrden = async (row) => {
    if (!row?.id || Number(row.triaje_detalle_id || 0) <= 0) return;
    setError("");
    try {
      const detalle = await obtenerDetalleOrdenOcupacional(row.id);
      const triaje = (detalle?.items || []).find((item) => Number(item.id) === Number(row.triaje_detalle_id));
      if (!triaje) {
        throw new Error("No se encontro el examen de Triaje en la orden seleccionada");
      }
      onAbrirFormatoClinico(triaje, row.id);
    } catch (err) {
      setError(err.message || "No se pudo abrir el formato de Triaje");
    }
  };

  useEffect(() => {
    if (deepLinkHandledRef.current) return undefined;
    const params = new URLSearchParams(window.location.search);
    const ordenId = Number(params.get("orden_id") || 0);
    const detalleId = Number(params.get("detalle_id") || 0);
    if (params.get("abrir_formato") !== "1" || ordenId <= 0 || detalleId <= 0) return undefined;

    deepLinkHandledRef.current = true;
    onAbrirFormatoClinico({ id: detalleId }, ordenId);
    return undefined;
  }, [onAbrirFormatoClinico]);

  const onCargarPlantillaSugeridaFormato = () => {
    const plantilla = formatoModalData?.plantillaSugerida;
    if (!plantilla || typeof plantilla !== "object") {
      setFormatoModalError("No hay plantilla sugerida para este examen");
      return;
    }
    setFormatoForm((prev) => ({ ...prev, datos: plantilla, datosJsonText: prettyJsonInput(plantilla) }));
    setFormatoModalError("");
  };

  const onAplicarPlantillaSeleccionada = () => {
    const list = Array.isArray(formatoModalData?.plantillasDisponibles) ? formatoModalData.plantillasDisponibles : [];
    const selected = list.find((tpl) => String(tpl.id || 0) === String(formatoPlantillaSeleccionada || "0"));
    if (!selected || typeof selected.datos_json !== "object") {
      setFormatoModalError("Seleccione una plantilla valida");
      return;
    }
    setFormatoForm((prev) => ({ ...prev, datos: selected.datos_json, datosJsonText: prettyJsonInput(selected.datos_json) }));
    setFormatoModalError("");
  };

  const onGuardarPlantillaCatalogo = async () => {
    const parsedDatos = formatoForm.datos;
    if (!parsedDatos || typeof parsedDatos !== "object" || Array.isArray(parsedDatos)) {
      setFormatoModalError("Los datos del formato son invalidos para guardarlos como plantilla");
      return;
    }

    const nombre = String(formatoPlantillaNombre || "").trim();
    if (!nombre) {
      setFormatoModalError("Ingrese un nombre de plantilla");
      return;
    }

    setFormatoPlantillaSaving(true);
    setFormatoModalError("");
    try {
      const saved = await guardarPlantillaResultadoClinicoOcupacional({
        ordenDetalleId: Number(formatoForm.ordenDetalleId || 0),
        nombre: String(nombre).trim(),
        templateCode: formatoModalData?.detalle?.template_code || "",
        examenCodigo: formatoForm.examenCodigo || "",
        examenDescripcion: formatoForm.examenDescripcion || "",
        formatoCodigo: formatoForm.formatoCodigo || "",
        datosJson: parsedDatos,
      });

      const existentes = Array.isArray(formatoModalData?.plantillasDisponibles)
        ? formatoModalData.plantillasDisponibles.filter((tpl) => Number(tpl.id || 0) !== Number(saved?.id || 0))
        : [];
      const actualizadas = [saved, ...existentes];
      setFormatoModalData((prev) => ({
        ...(prev || {}),
        plantillasDisponibles: actualizadas,
        plantillaSugerida: saved?.datos_json || prev?.plantillaSugerida || {},
      }));
      setFormatoPlantillaSeleccionada(String(saved?.id || 0));
      if (detalleModalData?.id) {
        await recargarDetalleModal(detalleModalData.id);
      }
      setMessage("Plantilla guardada en catalogo");
    } catch (err) {
      setFormatoModalError(err.message || "No se pudo guardar plantilla");
    } finally {
      setFormatoPlantillaSaving(false);
    }
  };

  const onEliminarPlantillaCatalogo = async () => {
    const list = Array.isArray(formatoModalData?.plantillasDisponibles) ? formatoModalData.plantillasDisponibles : [];
    const selected = list.find((tpl) => String(tpl.id || 0) === String(formatoPlantillaSeleccionada || "0"));
    if (!selected || Number(selected.id || 0) <= 0) {
      setFormatoModalError("Solo puede eliminar plantillas del catalogo");
      return;
    }

    const ok = window.confirm(`Eliminar plantilla "${selected.nombre || selected.codigo || selected.id}"?`);
    if (!ok) return;

    setFormatoPlantillaSaving(true);
    setFormatoModalError("");
    try {
      await eliminarPlantillaResultadoClinicoOcupacional(selected.id, {
        ordenDetalleId: Number(formatoForm.ordenDetalleId || 0),
      });
      const restantes = list.filter((tpl) => Number(tpl.id || 0) !== Number(selected.id || 0));
      setFormatoModalData((prev) => ({ ...(prev || {}), plantillasDisponibles: restantes }));
      setFormatoPlantillaSeleccionada(restantes.length > 0 ? String(restantes[0].id || 0) : "0");
      if (detalleModalData?.id) {
        await recargarDetalleModal(detalleModalData.id);
      }
      setMessage("Plantilla eliminada del catalogo");
    } catch (err) {
      setFormatoModalError(err.message || "No se pudo eliminar plantilla");
    } finally {
      setFormatoPlantillaSaving(false);
    }
  };

  const onGuardarFormatoClinico = async () => {
    if (!formatoForm.ordenDetalleId) {
      setFormatoModalError("No hay detalle seleccionado");
      return;
    }

    const parsedDatos = formatoForm.datos;
    if (!parsedDatos || typeof parsedDatos !== "object" || Array.isArray(parsedDatos)) {
      setFormatoModalError("Los datos clinicos son invalidos");
      return;
    }

    setFormatoModalSaving(true);
    setFormatoModalError("");
    try {
      await guardarResultadoClinicoOcupacional({
        ordenDetalleId: formatoForm.ordenDetalleId,
        formatoCodigo: formatoForm.formatoCodigo,
        datosJson: parsedDatos,
        estado: formatoForm.estado,
        observacion: formatoForm.observacion,
      });

      if (detalleModalData?.id) {
        await recargarDetalleModal(detalleModalData.id);
      }
      setMessage(`Formato clinico guardado (${formatoForm.examenCodigo || formatoForm.formatoCodigo})`);
      setFormatoModalOpen(false);
    } catch (err) {
      setFormatoModalError(err.message || "No se pudo guardar formato clinico");
    } finally {
      setFormatoModalSaving(false);
    }
  };

  const onDescargarFormatoClinicoPdf = async () => {
    if (!formatoForm.ordenDetalleId || !detalleModalData?.id) return;

    setFormatoPdfGenerating(true);
    setFormatoModalError("");
    try {
      const [resultadoPersistido, orden, configuracionClinica, firmantePdfCtx, jsPDFModule, autoTableModule] = await Promise.all([
        obtenerResultadoClinicoOcupacional({
          ordenDetalleId: formatoForm.ordenDetalleId,
          formatoCodigo: formatoForm.formatoCodigo,
        }),
        obtenerDetalleOrdenOcupacional(detalleModalData.id),
        fetchConfiguracionClinica(),
        resolverFirmantePdfResultadoClinicoOcupacional({
          ordenDetalleId: formatoForm.ordenDetalleId,
          formatoCodigo: formatoForm.formatoCodigo,
        }).catch(() => null),
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const resultado = resultadoPersistido?.data;
      if (!resultado || String(resultado.estado || "") !== "finalizado") {
        throw new Error("Solo se puede generar el PDF de un resultado clinico finalizado");
      }

      const templateCode = String(resultadoPersistido?.detalle?.template_code || "general_basico");
      const datos = resultado.datos_json && typeof resultado.datos_json === "object" ? resultado.datos_json : {};
      const jsPDF = jsPDFModule.default;
      const autoTable = autoTableModule.default;
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const areaCode = String(firmantePdfCtx?.area_code || "").trim().toLowerCase();
      const signer = firmantePdfCtx?.signer && typeof firmantePdfCtx.signer === "object" ? firmantePdfCtx.signer : null;
      const isLabArea = areaCode === "laboratorio";
      const logoRaw = String(
        (firmantePdfCtx?.branding?.logo_url || "")
        || (isLabArea ? (configuracionClinica?.logo_laboratorio_url || "") : "")
        || configuracionClinica?.logo_ocupacional_url
        || configuracionClinica?.logo_url
        || ""
      ).trim();
      const logoUrl = logoRaw ? resolveAssetUrl(logoRaw) : "";

      const firmaRawMedico = String(orden.medico_firma_snapshot || "").trim();
      const firmaRawLab = String(signer?.firma_data_url || "").trim();
      const firmaRaw = isLabArea && firmaRawLab ? firmaRawLab : firmaRawMedico;
      const firmaUrl = /^(data:|https?:\/\/|blob:|uploads\/|\/uploads\/)/i.test(firmaRaw) ? resolveAssetUrl(firmaRaw) : "";
      const [logoDataUrl, firmaDataUrl] = await Promise.all([
        logoUrl ? loadImageAsDataUrl(logoUrl).catch(() => "") : Promise.resolve(""),
        firmaUrl ? loadImageAsDataUrl(firmaUrl).catch(() => "") : Promise.resolve(""),
      ]);
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.5);
      doc.rect(8, 8, 194, 281);
      if (logoDataUrl) {
        doc.addImage(logoDataUrl, inferDataUrlImageFormat(logoDataUrl), 12, 12, 22, 22);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(String(configuracionClinica?.nombre_clinica || "CLINICA 2 DE MAYO"), 40, 18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(`RUC: ${String(configuracionClinica?.ruc || "-")}`, 40, 23);
      doc.text(`Direccion: ${String(configuracionClinica?.direccion || "-")}`, 40, 27);
      doc.text(`Telefono: ${String(configuracionClinica?.telefono || "-")}`, 40, 31);
      doc.line(12, 38, 198, 38);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("RESULTADO CLINICO OCUPACIONAL", 105, 47, { align: "center" });
      doc.setFontSize(11);
      doc.text(`${formatoForm.examenCodigo} - ${formatoForm.examenDescripcion}`, 105, 54, { align: "center" });

      autoTable(doc, {
        startY: 60,
        theme: "grid",
        margin: { left: 12, right: 12 },
        styles: { fontSize: 8.5, cellPadding: 1.8, textColor: [17, 24, 39] },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
        head: [["Datos del trabajador", "", "Orden", ""]],
        body: [[
          "Trabajador", String(orden.paciente_nombre_completo || "-"),
          "Codigo", String(orden.codigo || "-"),
        ], [
          "Documento", String(orden.documento_numero || "-"),
          "Fecha", String(orden.fecha_orden || "-"),
        ], [
          "Empresa", String(orden.empresa || "-"),
          "Tipo", `${String(orden.tipo_codigo || "")} ${String(orden.tipo_nombre || "")}`.trim() || "-",
        ], [
          "Puesto", String(orden.puesto_trabajo || "-"),
          "Protocolo", String(orden.protocolo_descripcion || "-"),
        ]],
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 25 }, 1: { cellWidth: 64 }, 2: { fontStyle: "bold", cellWidth: 22 }, 3: { cellWidth: 75 } },
      });

      let nextY = (doc.lastAutoTable?.finalY || 94) + 8;
      buildResultadoPdfTables(templateCode, datos).forEach((table) => {
        if (nextY > 245) {
          doc.addPage();
          nextY = 18;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.text(table.title, 12, nextY);
        autoTable(doc, {
          startY: nextY + 3,
          theme: "grid",
          margin: { left: 12, right: 12 },
          styles: { fontSize: 8.5, cellPadding: 1.8, overflow: "linebreak" },
          headStyles: { fillColor: [14, 116, 144], textColor: [255, 255, 255] },
          head: table.head,
          body: table.body,
        });
        nextY = (doc.lastAutoTable?.finalY || nextY + 10) + 8;
      });

      if (nextY > 238) {
        doc.addPage();
        nextY = 28;
      }
      if (firmaDataUrl) {
        doc.addImage(firmaDataUrl, inferDataUrlImageFormat(firmaDataUrl), 142, nextY, 40, 16);
      }
      doc.setDrawColor(100, 116, 139);
      doc.line(126, nextY + 18, 196, nextY + 18);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const firmanteLabel = String(firmantePdfCtx?.firmante_label || (isLabArea ? "PROFESIONAL DE LABORATORIO" : "MEDICO RESPONSABLE"));
      doc.text(firmanteLabel, 161, nextY + 23, { align: "center" });
      doc.setFont("helvetica", "normal");
      const firmanteNombre = isLabArea
        ? String(signer?.nombre || "No consignado")
        : String(orden.medico_nombre_snapshot || "No consignado");
      doc.text(firmanteNombre, 161, nextY + 28, { align: "center" });

      const cmp = String(orden.medico_cmp_snapshot || "").trim();
      const rne = String(orden.medico_rne_snapshot || "").trim();
      const rna = String(orden.medico_rna_snapshot || "").trim();
      const labCargo = String(signer?.cargo || "").trim();
      const labColegiatura = String(signer?.colegiatura || "").trim();
      doc.setFontSize(8);
      if (isLabArea) {
        if (labCargo) doc.text(labCargo, 161, nextY + 32, { align: "center" });
        if (labColegiatura) doc.text(labColegiatura, 161, nextY + 36, { align: "center" });
      } else {
        if (cmp) doc.text(`CMP: ${cmp}`, 161, nextY + 32, { align: "center" });
        if (rne) doc.text(`RNE: ${rne}`, 161, nextY + 36, { align: "center" });
        if (rna) doc.text(`RNA: ${rna}`, 161, nextY + 40, { align: "center" });
      }

      const pageCount = doc.getNumberOfPages();
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        doc.setPage(pageNumber);
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(`Resultado finalizado: ${String(resultado.updated_at || "-")}`, 12, 284);
        doc.text(`Pagina ${pageNumber} de ${pageCount}`, 198, 284, { align: "right" });
      }

      const safeOrder = String(orden.codigo || `orden_${detalleModalData.id}`).replace(/[^A-Za-z0-9_-]/g, "_");
      const safeExam = String(formatoForm.examenCodigo || "resultado").replace(/[^A-Za-z0-9_-]/g, "_");
      await registrarEmisionPdfResultadoClinicoOcupacional({
        ordenDetalleId: formatoForm.ordenDetalleId,
        formatoCodigo: formatoForm.formatoCodigo,
      });
      doc.save(`resultado_${safeOrder}_${safeExam}.pdf`);
      setMessage(`PDF clinico generado: ${safeExam}`);
    } catch (err) {
      setFormatoModalError(err.message || "No se pudo generar el PDF clinico");
    } finally {
      setFormatoPdfGenerating(false);
    }
  };

  const onFormatoDatoChange = (key, value) => {
    setFormatoForm((prev) => {
      const nextDatos = { ...(prev.datos || {}), [key]: value };
      if (key === "peso_kg" || key === "talla_cm") {
        const peso = Number(key === "peso_kg" ? value : nextDatos.peso_kg);
        const tallaCm = Number(key === "talla_cm" ? value : nextDatos.talla_cm);
        nextDatos.imc = peso > 0 && tallaCm > 0 ? (peso / ((tallaCm / 100) ** 2)).toFixed(2) : "";
      }
      return { ...prev, datos: nextDatos, datosJsonText: prettyJsonInput(nextDatos) };
    });
  };

  const onFormatoAudiometriaChange = (oido, frecuencia, value) => {
    setFormatoForm((prev) => {
      const currentDatos = prev.datos || {};
      const nextDatos = {
        ...currentDatos,
        [oido]: { ...(currentDatos[oido] || {}), [frecuencia]: value },
      };
      return { ...prev, datos: nextDatos, datosJsonText: prettyJsonInput(nextDatos) };
    });
  };

  const onFormatoParametroChange = (index, key, value) => {
    setFormatoForm((prev) => {
      const nextParametros = Array.isArray(prev.datos?.parametros)
        ? prev.datos.parametros.map((parametro, currentIndex) => currentIndex === index ? { ...parametro, [key]: value } : parametro)
        : [];
      const nextDatos = { ...(prev.datos || {}), parametros: nextParametros };
      return { ...prev, datos: nextDatos, datosJsonText: prettyJsonInput(nextDatos) };
    });
  };

  const exportHistoriaClinicaPdf = async () => {
    if (!detalleModalData?.id) return;

    let data = clinicaConsolidada;
    if (!data) {
      data = await obtenerHistoriaClinicaOcupacionalConsolidada(detalleModalData.id);
      setClinicaConsolidada(data);
    }

    const cab = data?.cabecera || {};
    const resumenClin = data?.resumen || {};
    const detallesClin = data?.detalles || [];
    const historiasClin = data?.historias || [];

    const jsPDF = (await import("jspdf")).default;
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text("HISTORIA CLINICA OCUPACIONAL CONSOLIDADA", 105, 14, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Orden: ${cab.codigo || ""} | Fecha: ${cab.fecha_orden || ""} | Estado: ${cab.estado || ""}`, 14, 22);
    doc.text(`Empresa: ${cab.empresa || ""}`, 14, 28);
    doc.text(`Documento: ${cab.documento_numero || ""} | Puesto: ${cab.puesto_trabajo || ""}`, 14, 34);
    doc.text(`Protocolo: ${cab.protocolo_descripcion || ""} | Tipo: ${cab.tipo_codigo || ""} - ${cab.tipo_nombre || ""}`, 14, 40);

    autoTable(doc, {
      startY: 46,
      head: [["Resumen clinico", "Valor"]],
      body: [
        ["Total examenes", String(resumenClin.total_items || 0)],
        ["Completados", String(resumenClin.total_completados || 0)],
        ["Observados", String(resumenClin.total_observados || 0)],
        ["Interconsultas abiertas", String(resumenClin.interconsultas_abiertas || 0)],
        ["Pendientes", String(resumenClin.total_pendientes || 0)],
        ["Avance", `${resumenClin.porcentaje_avance || 0}%`],
        ["Historias registradas", String(resumenClin.historias_registradas || 0)],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 64, 175] },
    });

    autoTable(doc, {
      startY: (doc.lastAutoTable?.finalY || 46) + 6,
      head: [["#", "Codigo", "Examen", "Estado", "Observacion", "Fecha ejecucion"]],
      body: detallesClin.map((it, idx) => [
        String(idx + 1),
        String(it.examen_codigo || ""),
        String(it.examen_descripcion || ""),
        String(it.estado_ejecucion || ""),
        String(it.observacion_ejecucion || ""),
        String(it.fecha_ejecucion || ""),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [2, 132, 199] },
    });

    const historiasBody = historiasClin.length > 0
      ? historiasClin.map((h, idx) => [
        String(idx + 1),
        String(h.motivo_evaluacion || ""),
        String(h.puesto_actual || ""),
        String(h.area_trabajo || ""),
        String(h.observaciones || ""),
      ])
      : [["-", "Sin historia registrada", "", "", ""]];

    autoTable(doc, {
      startY: (doc.lastAutoTable?.finalY || 46) + 6,
      head: [["#", "Motivo", "Puesto", "Area", "Observaciones"]],
      body: historiasBody,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 118, 110] },
    });

    const yFinal = (doc.lastAutoTable?.finalY || 46) + 8;
    doc.setFontSize(10);
    doc.text(`Aptitud final: ${cab.aptitud_final || "No consignada"}`, 14, yFinal);
    doc.text(`Restricciones: ${cab.restriccion_final || "Ninguna"}`, 14, yFinal + 6);
    doc.text(`Recomendaciones: ${cab.recomendacion_final || "Ninguna"}`, 14, yFinal + 12);
    doc.text(`Medico responsable: ${cab.medico_responsable || "No consignado"}`, 14, yFinal + 18);

    const safeCode = String(cab.codigo || `orden_${detalleModalData.id}`).replace(/[^A-Za-z0-9_-]/g, "_");
    doc.save(`historia_clinica_ocupacional_${safeCode}.pdf`);
    setMessage(`Historia clinica PDF generada: ${safeCode}`);
  };

  const onEditarHistoria = (row) => {
    setHistoriaEditingId(Number(row.id));
    setHistoriaError("");
    setHistoriaForm({
      motivo_evaluacion: row.motivo_evaluacion || "",
      puesto_actual: row.puesto_actual || "",
      area_trabajo: row.area_trabajo || "",
      tiempo_puesto_meses: row.tiempo_puesto_meses ?? "",
      observaciones: row.observaciones || "",
      antecedentes_laborales_json: normalizeHistoriaList(row.antecedentes_laborales_json),
      antecedentes_patologicos_json: normalizeHistoriaList(row.antecedentes_patologicos_json),
      habitos_json: normalizeHistoriaList(row.habitos_json),
    });
  };

  const onCancelarHistoria = () => {
    setHistoriaEditingId(0);
    setHistoriaError("");
    setHistoriaForm({
      motivo_evaluacion: "",
      puesto_actual: detalleModalData?.puesto_trabajo || "",
      area_trabajo: "",
      tiempo_puesto_meses: "",
      observaciones: "",
      antecedentes_laborales_json: [],
      antecedentes_patologicos_json: [],
      habitos_json: [],
    });
  };

  const onGuardarHistoria = async (e) => {
    e.preventDefault();
    if (!detalleModalData?.id) return;
    setHistoriaSaving(true);
    setHistoriaError("");
    try {
      await guardarHistoriaOcupacional({
        id: historiaEditingId || undefined,
        orden_id: detalleModalData.id,
        ...historiaForm,
      });
      await recargarDetalleModal(detalleModalData.id);
      onCancelarHistoria();
      setMessage(historiaEditingId ? "Historia ocupacional actualizada" : "Historia ocupacional registrada");
    } catch (err) {
      setHistoriaError(err.message || "No se pudo guardar historia ocupacional");
    } finally {
      setHistoriaSaving(false);
    }
  };

  const onAnularHistoria = async (row) => {
    if (!row?.id || !detalleModalData?.id) return;
    if (!window.confirm("Desea anular este registro de historia ocupacional?")) return;
    const motivo = window.prompt("Motivo de anulacion de la historia ocupacional:", row.anulado_motivo || "") || "";
    setHistoriaAnulandoId(Number(row.id));
    setHistoriaError("");
    try {
      await anularHistoriaOcupacional({ id: row.id, motivo });
      await recargarDetalleModal(detalleModalData.id);
      setMessage("Historia ocupacional anulada");
    } catch (err) {
      setHistoriaError(err.message || "No se pudo anular historia ocupacional");
    } finally {
      setHistoriaAnulandoId(0);
    }
  };

  const onGuardarAptitud = async () => {
    if (!detalleModalData?.id) return;
    if (!aptitudForm.aptitud) {
      setDetalleModalError("Seleccione aptitud final");
      return;
    }
    if (esAptitudConRestriccion(aptitudForm.aptitud) && !String(aptitudForm.restriccion || "").trim()) {
      setDetalleModalError("Ingrese las restricciones para la aptitud seleccionada");
      return;
    }
    if (!isIsoDateString(aptitudForm.certificadoFechaEvaluacion)) {
      setDetalleModalError("Ingrese una fecha de evaluacion valida para el certificado");
      return;
    }
    if (String(aptitudForm.certificadoFechaEmision || "").trim() !== "" && !isIsoDateString(aptitudForm.certificadoFechaEmision)) {
      setDetalleModalError("Ingrese una fecha de emision valida o deje el campo vacio");
      return;
    }
    setSavingAptitud(true);
    setDetalleModalError("");
    setError("");
    setMessage("");
    try {
      const aptitudGuardada = await guardarAptitudOrdenOcupacional({
        id: detalleModalData.id,
        aptitudFinal: aptitudForm.aptitud,
        restriccionFinal: aptitudForm.restriccion,
        recomendacionFinal: aptitudForm.recomendacion,
        medicoResponsableId: aptitudForm.medicoId,
        certificadoFechaEvaluacion: aptitudForm.certificadoFechaEvaluacion,
        certificadoFechaEmision: aptitudForm.certificadoFechaEmision,
      });
      await recargarDetalleModal(detalleModalData.id);
      await recargarListadoYResumen();
      setMessage(
        aptitudGuardada?.cerrada_al_guardar_aptitud
          ? `Aptitud final guardada y orden cerrada: ${formatAptitudLabel(aptitudForm.aptitud)}`
          : `Aptitud final guardada: ${formatAptitudLabel(aptitudForm.aptitud)}`
      );
    } catch (err) {
      setDetalleModalError(err.message || "No se pudo guardar aptitud final");
    } finally {
      setSavingAptitud(false);
    }
  };

  const onEmitirCertificado = async (ordenId) => {
    setCertificandoId(Number(ordenId));
    setError("");
    setMessage("");
    try {
      const det = await obtenerDetalleOrdenOcupacional(ordenId);
      if (String(det.estado) === "anulada") {
        throw new Error("No se puede emitir certificado para una orden anulada");
      }
      if (!String(det.aptitud_final || "").trim()) {
        throw new Error("Debe registrar aptitud final antes de emitir certificado");
      }

      const [jsPDFModule, configuracionClinica] = await Promise.all([
        import("jspdf"),
        fetchConfiguracionClinica(),
      ]);
      const jsPDF = jsPDFModule.default;
      const doc = new jsPDF({ unit: "mm", format: "a4" });

      const logoUrl = resolveAssetUrl(configuracionClinica?.logo_ocupacional_url || configuracionClinica?.logo_url || "");
      const logoSelloUrl = resolveAssetUrl(configuracionClinica?.logo_url || "");
      const firmaOrden = String(det.medico_firma_snapshot || "").trim();
      const firmaRaw = firmaOrden;
      const firmaUrl = /^(data:|https?:\/\/|blob:|uploads\/|\/uploads\/)/i.test(firmaRaw)
        ? resolveAssetUrl(firmaRaw)
        : "";

      const [logoDataUrl, firmaDataUrl, logoSelloDataUrl] = await Promise.all([
        logoUrl ? loadImageAsDataUrl(logoUrl).catch(() => "") : Promise.resolve(""),
        firmaUrl ? loadImageAsDataUrl(firmaUrl).catch(() => "") : Promise.resolve(""),
        logoSelloUrl ? loadImageAsDataUrl(logoSelloUrl).catch(() => "") : Promise.resolve(""),
      ]);
      const logoDocumentoDataUrl = logoDataUrl
        ? await cropImageWhitespaceDataUrl(logoDataUrl).catch(() => logoDataUrl)
        : "";
      const logoSelloDocumentoDataUrl = logoSelloDataUrl
        ? await cropImageWhitespaceDataUrl(logoSelloDataUrl).catch(() => logoSelloDataUrl)
        : "";

      const fechaEvaluacionIso = String(det.certificado_fecha_evaluacion || det.fecha_orden || "").trim();
      const fechaEmisionIso = String(det.certificado_fecha_emision || fechaEvaluacionIso || "").trim();
      const fechaEmisionTexto = formatIsoDateForCertificate(fechaEmisionIso);
      const medicoFirmaNombre = String(
        det.medico_nombre_snapshot
        || det.medico_responsable
        || "No consignado"
      );
      const especialidad = String(det.medico_especialidad_snapshot || "MEDICINA OCUPACIONAL").trim();
      const cmp = String(det.medico_cmp_snapshot || "").trim();
      const rne = String(det.medico_rne_snapshot || "").trim();
      const medicoActual = medicosCrud.find((medico) => Number(medico.id) === Number(det.medico_responsable_id)) || null;
      const rna = String(
        det.medico_rna_snapshot
        || det.medico_rna_vigente
        || medicoActual?.rna
        || ""
      ).trim();
      const tipoCodigo = String(det.tipo_codigo || "").trim().toUpperCase();
      const aptitud = normalizeAptitudKey(det.aptitud_final);
      const fechaEvaluacion = formatIsoDateForCertificate(fechaEvaluacionIso);
      const sexo = String(det.paciente_sexo || "-").trim().toUpperCase();
      const edad = det.paciente_edad === null || det.paciente_edad === undefined ? "-" : String(det.paciente_edad);
      const x = 16;
      const width = 178;
      const drawCell = (cellX, cellY, cellWidth, cellHeight, text, options = {}) => {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.25);
        doc.rect(cellX, cellY, cellWidth, cellHeight);
        doc.setFont("times", options.bold ? "bold" : "normal");
        doc.setFontSize(options.fontSize || 9);
        doc.setTextColor(0, 0, 0);
        const lines = doc.splitTextToSize(String(text || ""), Math.max(4, cellWidth - 3));
        const lineHeight = (options.fontSize || 9) * 0.38;
        const textHeight = lines.length * lineHeight;
        const textY = cellY + Math.max(3.2, (cellHeight - textHeight) / 2 + lineHeight * 0.78);
        const textX = options.center ? cellX + cellWidth / 2 : cellX + 1.5;
        doc.text(lines, textX, textY, { align: options.center ? "center" : "left" });
      };
      const mark = (selected) => selected ? "X" : "";

      doc.setDrawColor(147, 197, 253);
      doc.setLineWidth(0.8);
      doc.rect(10, 8, 190, 281);
      doc.setLineWidth(0.35);
      doc.rect(12, 10, 186, 277);

      if (logoDocumentoDataUrl) {
        const properties = doc.getImageProperties(logoDocumentoDataUrl);
        const ratio = properties.width / properties.height;
        const logoWidth = Math.min(125, 27 * ratio);
        const logoHeight = logoWidth / ratio;
        doc.addImage(
          logoDocumentoDataUrl,
          inferDataUrlImageFormat(logoDocumentoDataUrl),
          105 - logoWidth / 2,
          12 + (27 - logoHeight) / 2,
          logoWidth,
          logoHeight
        );
      } else {
        doc.setFont("times", "bold");
        doc.setFontSize(18);
        doc.text(String(configuracionClinica?.nombre_clinica || "CLINICA 2 DE MAYO"), 105, 25, { align: "center" });
      }

      doc.setFont("times", "bold");
      doc.setFontSize(11);
      doc.text("CERTIFICADO MEDICO OCUPACIONAL", 105, 43, { align: "center" });

      let y = 47;
      drawCell(x, y, width, 14, "CERTIFICA que el Sr. (a):", { bold: true, center: true, fontSize: 10 });
      y += 14;
      drawCell(x, y, 52, 14, "APELLIDOS Y NOMBRES", { bold: true });
      drawCell(x + 52, y, 126, 14, String(det.paciente_nombre_completo || "-"), { fontSize: 9.5 });
      y += 14;

      drawCell(x, y, 52, 10, "TIPO DE EVALUACION", { bold: true, fontSize: 8.2 });
      drawCell(x + 52, y, 42, 10, `OCUPACIONAL     ${mark(tipoCodigo === "PRE")}`, { center: true, fontSize: 8.4 });
      drawCell(x + 94, y, 42, 10, `PERIODICO     ${mark(tipoCodigo === "PER")}`, { center: true, fontSize: 8.4 });
      drawCell(x + 136, y, 42, 10, `RETIRO     ${mark(tipoCodigo === "POST")}`, { center: true, fontSize: 8.4 });
      y += 10;

      drawCell(x, y, 52, 9, "DOCUMENTO DE IDENTIDAD", { bold: true, fontSize: 7.8 });
      drawCell(x + 52, y, 48, 9, String(det.documento_numero || "-"), { center: true });
      drawCell(x + 100, y, 20, 9, "EDAD", { bold: true, center: true });
      drawCell(x + 120, y, 22, 9, `${edad} años`, { center: true });
      drawCell(x + 142, y, 18, 9, "SEXO", { bold: true, center: true });
      drawCell(x + 160, y, 18, 9, sexo, { center: true });
      y += 9;

      drawCell(x, y, 52, 9, "PUESTO AL QUE POSTULA O TRABAJA", { bold: true, fontSize: 7.2 });
      drawCell(x + 52, y, 126, 9, String(det.puesto_trabajo || "-"));
      y += 9;
      drawCell(x, y, 52, 9, "OCUPACION ACTUAL O ULTIMA OCUPACION", { bold: true, fontSize: 6.8 });
      drawCell(x + 52, y, 126, 9, String(det.puesto_trabajo || "-"));
      y += 9;

      drawCell(x, y, 52, 14, "HISTORIA CLINICA", { bold: true, center: true });
      drawCell(x + 52, y, 44, 14, String(det.paciente_historia_clinica || "-"), { center: true });
      drawCell(x + 96, y, 44, 14, "FECHA DE EVALUACION", { bold: true, center: true });
      drawCell(x + 140, y, 38, 14, fechaEvaluacion, { center: true });
      y += 14;

      drawCell(x, y, 42, 14, "EMPRESA", { bold: true, center: true });
      drawCell(x + 42, y, 136, 14, String(det.empresa || "-"), { fontSize: 9 });
      y += 14;
      drawCell(x, y, width, 14, `Conclusion segun protocolo ${String(det.protocolo_descripcion || "-")} estipulado`, { center: true, fontSize: 9 });
      y += 14;

      const aptitudeLabelWidth = 55;
      const aptitudeMarkWidth = 26;
      const restrictionsWidth = width - aptitudeLabelWidth - aptitudeMarkWidth;
      drawCell(x, y, aptitudeLabelWidth, 16, "APTO\n(para el puesto en el que trabaja o postula)", { bold: true, fontSize: 7.5 });
      drawCell(x + aptitudeLabelWidth, y, aptitudeMarkWidth, 16, mark(aptitud === "APTO"), { bold: true, center: true, fontSize: 10 });
      drawCell(x, y + 16, aptitudeLabelWidth, 16, "APTO CON RESTRICCION\n(para el puesto en el que trabaja o postula)", { bold: true, fontSize: 7 });
      drawCell(x + aptitudeLabelWidth, y + 16, aptitudeMarkWidth, 16, mark(aptitud === "APTO_CON_RESTRICCIONES"), { bold: true, center: true, fontSize: 10 });
      drawCell(x, y + 32, aptitudeLabelWidth, 16, "NO APTO\n(para el puesto en el que trabaja o postula)", { bold: true, fontSize: 7.5 });
      drawCell(x + aptitudeLabelWidth, y + 32, aptitudeMarkWidth, 16, mark(aptitud === "NO_APTO"), { bold: true, center: true, fontSize: 10 });
      drawCell(x + aptitudeLabelWidth + aptitudeMarkWidth, y, restrictionsWidth, 48, `Restricciones:\n${String(det.restriccion_final || "Ninguna")}`, { fontSize: 8 });
      y += 48;

      drawCell(x, y, width, 63, "");
      if (logoSelloDocumentoDataUrl) {
        const selloLogoProperties = doc.getImageProperties(logoSelloDocumentoDataUrl);
        const selloLogoRatio = selloLogoProperties.width / selloLogoProperties.height;
        const selloLogoWidth = Math.min(15, 14 * selloLogoRatio);
        const selloLogoHeight = selloLogoWidth / selloLogoRatio;
        doc.addImage(
          logoSelloDocumentoDataUrl,
          inferDataUrlImageFormat(logoSelloDocumentoDataUrl),
          68,
          y + 3 + (14 - selloLogoHeight) / 2,
          selloLogoWidth,
          selloLogoHeight
        );
      }
      doc.setFont("times", "bold");
      doc.setFontSize(8.5);
      doc.text("CLINICA DOS DE MAYO PUCALLPA", 86, y + 10);
      if (firmaDataUrl) {
        doc.addImage(
          firmaDataUrl,
          inferDataUrlImageFormat(firmaDataUrl),
          80,
          y + 10,
          50,
          20
        );
      }
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.25);
      doc.line(68, y + 26, 142, y + 26);
      doc.setFont("times", "normal");
      doc.setFontSize(8.5);
      doc.text(medicoFirmaNombre, 105, y + 33, { align: "center" });
      doc.setFont("times", "bold");
      doc.text(especialidad || "MEDICINA OCUPACIONAL", 105, y + 38, { align: "center" });
      doc.setFont("times", "normal");
      doc.setFontSize(7.5);
      const codigosProfesionales = [`CMP: ${cmp || "-"}`];
      if (rne) codigosProfesionales.push(`RNE: ${rne}`);
      if (rna) codigosProfesionales.push(`RNA: ${rna}`);
      doc.text(codigosProfesionales.join("     "), 105, y + 43, { align: "center" });
      doc.setFont("times", "bold");
      doc.setFontSize(9);
      doc.text("Sello y firma del medico que CERTIFICA", 105, y + 58, { align: "center" });
      y += 63;

      drawCell(x, y, 80, 10, `Fecha de emision: ${fechaEmisionTexto}`, { fontSize: 8.5 });
      drawCell(x + 80, y, 98, 10, "", { fontSize: 8.5 });
      doc.setFont("times", "bold");
      doc.setFontSize(6.5);
      doc.text("Segun referencia R.M. 312-2011", x + 1, y + 14);

      const safeCode = String(det.codigo || `orden_${ordenId}`).replace(/[^A-Za-z0-9_-]/g, "_");
      doc.save(`certificado_aptitud_${safeCode}.pdf`);

      try {
        await registrarEmisionCertificadoOrdenOcupacional({ id: Number(det.id || ordenId), formato: "pdf" });
      } catch (auditErr) {
        console.warn("No se pudo registrar auditoria de emision de certificado", auditErr);
      }

      if (detalleModalData?.id && Number(detalleModalData.id) === Number(det.id || ordenId)) {
        await recargarDetalleModal(detalleModalData.id);
      }
      await recargarListadoYResumen();
      setMessage(`Certificado emitido: ${safeCode}`);
    } catch (err) {
      setError(err.message || "No se pudo emitir certificado");
    } finally {
      setCertificandoId(0);
    }
  };

  const onFiltrarEventos = async () => {
    if (!detalleModalData?.id) {
      return;
    }
    setEventosLoading(true);
    setDetalleModalError("");
    try {
      const evs = await listarEventosOrdenOcupacional({
        ordenId: detalleModalData.id,
        tipo: eventosFiltros.tipo,
        fechaDesde: eventosFiltros.fechaDesde,
        fechaHasta: eventosFiltros.fechaHasta,
        limit: 200,
      });
      setEventosFiltrados(evs || []);
    } catch (err) {
      setDetalleModalError(err.message || "No se pudo filtrar bitacora");
    } finally {
      setEventosLoading(false);
    }
  };

  const onResetFiltrosEventos = () => {
    setEventosFiltros({ tipo: "", fechaDesde: "", fechaHasta: "" });
    setEventosFiltrados(detalleModalData?.eventos || []);
  };

  const exportEventosPdf = async () => {
    if (!detalleModalData) {
      return;
    }
    const jsPDF = (await import("jspdf")).default;
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(13);
    doc.text(`Bitacora de Orden ${detalleModalData.codigo}`, 14, 14);
    doc.setFontSize(10);
    doc.text(`Estado: ${detalleModalData.estado} | Avance: ${detalleModalData.total_completados || 0}/${detalleModalData.total_items || 0}`, 14, 21);
    autoTable(doc, {
      startY: 27,
      head: [["Fecha", "Tipo", "Descripcion", "Usuario"]],
      body: (eventosFiltrados || []).map((ev) => [
        String(ev.created_at || ""),
        String(ev.tipo_evento || ""),
        String(ev.descripcion || ""),
        String(ev.created_by ?? ""),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    });
    const safeCode = String(detalleModalData.codigo || "orden").replace(/[^A-Za-z0-9_-]/g, "_");
    doc.save(`bitacora_${safeCode}.pdf`);
  };

  const exportEventosExcel = async () => {
    if (!detalleModalData) {
      return;
    }
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet((eventosFiltrados || []).map((ev) => ({
      Fecha: ev.created_at || "",
      Tipo: ev.tipo_evento || "",
      Descripcion: ev.descripcion || "",
      Usuario: ev.created_by ?? "",
      Payload: ev.payload_json || "",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bitacora");
    const safeCode = String(detalleModalData.codigo || "orden").replace(/[^A-Za-z0-9_-]/g, "_");
    XLSX.writeFile(wb, `bitacora_${safeCode}.xlsx`);
  };

  const onGuardarDetalle = async (itemId) => {
    const form = detalleForms[itemId] || { estado: "pendiente", observacion: "" };
    if (!detalleModalData?.id) {
      return;
    }
    if (form.estado === "observado" && !String(form.observacion || "").trim()) {
      setDetalleModalError("Ingrese el motivo para marcar el examen como observado");
      return;
    }

    setSavingDetalleId(Number(itemId));
    setDetalleModalError("");
    setError("");
    setMessage("");
    try {
      await actualizarDetalleOrdenOcupacional({
        detalleId: itemId,
        estadoEjecucion: form.estado,
        observacionEjecucion: form.observacion,
      });
      await recargarDetalleModal(detalleModalData.id);
      await recargarListadoYResumen();
      setMessage(`Detalle actualizado (${itemId})`);
    } catch (err) {
      const msg = err.message || "No se pudo actualizar estado del examen";
      setDetalleModalError(msg);
      setError(msg);
    } finally {
      setSavingDetalleId(0);
    }
  };

  const onCrearInterconsulta = async (event) => {
    event.preventDefault();
    if (!detalleModalData?.id) return;
    if (Number(interconsultaForm.detalleId || 0) <= 0 || !interconsultaForm.especialidad.trim() || !interconsultaForm.motivo.trim()) {
      setInterconsultasError("Seleccione examen observado e ingrese especialidad y motivo");
      return;
    }
    setInterconsultaSavingKey("crear");
    setInterconsultasError("");
    try {
      await crearInterconsultaOcupacional({
        ordenId: detalleModalData.id,
        ordenDetalleId: interconsultaForm.detalleId,
        especialidad: interconsultaForm.especialidad,
        motivo: interconsultaForm.motivo,
        diagnosticoCie10: interconsultaForm.cie10,
        diagnosticoDescripcion: interconsultaForm.diagnostico,
        observaciones: interconsultaForm.observaciones,
      });
      setInterconsultaForm({ detalleId: 0, especialidad: "", motivo: "", cie10: "", diagnostico: "", observaciones: "" });
      await recargarInterconsultas(detalleModalData.id);
      setMessage("Interconsulta registrada");
    } catch (err) {
      setInterconsultasError(err.message || "No se pudo crear interconsulta");
    } finally {
      setInterconsultaSavingKey("");
    }
  };

  const onResponderInterconsulta = async (row) => {
    const form = interconsultaRespuestaForms[row.id] || {};
    if (!String(form.especialista || "").trim() || !String(form.respuesta || "").trim()) {
      setInterconsultasError("Ingrese especialista y respuesta de la interconsulta");
      return;
    }
    const key = `responder-${row.id}`;
    setInterconsultaSavingKey(key);
    setInterconsultasError("");
    try {
      await responderInterconsultaOcupacional({
        id: row.id,
        especialistaNombre: form.especialista,
        respuesta: form.respuesta,
        respuestaArchivo: form.archivo,
      });
      await recargarInterconsultas(detalleModalData.id);
      setMessage("Respuesta de interconsulta registrada");
    } catch (err) {
      setInterconsultasError(err.message || "No se pudo registrar respuesta");
    } finally {
      setInterconsultaSavingKey("");
    }
  };

  const onLevantarInterconsulta = async (row) => {
    const form = interconsultaLevantamientoForms[row.id] || {};
    if (!String(form.levantamiento || "").trim() || !String(form.recomendacion || "").trim() || Number(form.medicoId || 0) <= 0) {
      setInterconsultasError("Complete levantamiento, recomendacion y medico responsable");
      return;
    }
    const key = `levantar-${row.id}`;
    setInterconsultaSavingKey(key);
    setInterconsultasError("");
    try {
      await levantarInterconsultaOcupacional({
        id: row.id,
        levantamiento: form.levantamiento,
        recomendacion: form.recomendacion,
        resultadoLevantamiento: form.resultado,
        medicoId: form.medicoId,
      });
      await recargarDetalleModal(detalleModalData.id);
      await recargarListadoYResumen();
      setMessage("Observacion levantada; finalice nuevamente el resultado clinico");
    } catch (err) {
      setInterconsultasError(err.message || "No se pudo levantar observacion");
    } finally {
      setInterconsultaSavingKey("");
    }
  };

  const onAnularInterconsulta = async (row) => {
    const motivo = (window.prompt("Motivo de anulacion de la interconsulta:") || "").trim();
    if (!motivo) return;
    const key = `anular-${row.id}`;
    setInterconsultaSavingKey(key);
    setInterconsultasError("");
    try {
      await anularInterconsultaOcupacional(row.id, motivo);
      await recargarDetalleModal(detalleModalData.id);
      await recargarListadoYResumen();
      setMessage("Interconsulta anulada; el resultado clinico debe finalizarse nuevamente");
    } catch (err) {
      setInterconsultasError(err.message || "No se pudo anular interconsulta");
    } finally {
      setInterconsultaSavingKey("");
    }
  };

  const onImprimir = async (ordenId) => {
    setError("");
    try {
      const [det, configuracionClinica] = await Promise.all([
        obtenerDetalleOrdenOcupacional(ordenId),
        fetchConfiguracionClinica(),
      ]);
      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) {
        setError("No se pudo abrir ventana de impresion. Verifique bloqueador de popups.");
        return;
      }

      const routeGroups = buildRouteGroups(det.items);
      const vitals = buildRouteVitals(det);
      const logoUrl = resolveAssetUrl(configuracionClinica?.logo_ocupacional_url || configuracionClinica?.logo_url || "");
      const rowsHtml = routeGroups
        .map((group) => `
          <tr class="area-title">
            <td>${escapeRouteHtml(group.title)}</td>
            <td></td>
          </tr>
          ${group.items.map((item) => `
            <tr class="exam-row">
              <td>${escapeRouteHtml(item.examen_descripcion)}</td>
              <td></td>
            </tr>
          `).join("")}
        `)
        .join("");
      const vitalsHead = vitals.map((item) => `<th>${escapeRouteHtml(item.label)}</th>`).join("");
      const vitalsValues = vitals.map((item) => `<td>${escapeRouteHtml(item.value)}</td>`).join("");
      const protocoloEmpresa = `${String(det.protocolo_descripcion || "PROTOCOLO").toUpperCase()} - ${String(det.empresa || "").toUpperCase()}`;

      win.document.write(`
        <html>
          <head>
            <title>Hoja de ruta ${escapeRouteHtml(det.codigo)}</title>
            <style>
              @page { size: A4 portrait; margin: 10mm; }
              * { box-sizing: border-box; }
              body { font-family: Arial, sans-serif; color:#111; margin:0; font-size:10px; }
              .logo { width:90px; max-height:52px; object-fit:contain; margin-bottom:4px; }
              h1 { margin:0 0 10px; font-size:13px; text-align:center; color:#4c1d95; }
              .meta { width:100%; border-collapse:collapse; margin-bottom:5px; }
              .meta td { border:0; padding:2px 3px; font-size:9px; }
              .label { width:22%; font-weight:700; }
              table { width:100%; border-collapse:collapse; }
              .vitals { margin:4px 0 7px; table-layout:fixed; }
              .vitals th, .vitals td { border:1px solid #4c1d95; padding:3px 2px; text-align:center; }
              .vitals th, .route thead th { background:#5b21b6; color:#fff; font-weight:700; }
              .route { table-layout:fixed; font-size:9px; }
              .route th, .route td { border:1px solid #4c1d95; padding:3px 4px; }
              .route th:first-child, .route td:first-child { width:58%; }
              .route th:last-child, .route td:last-child { width:42%; }
              .area-title td { background:#ede9fe; color:#3b0764; font-weight:700; }
              .exam-row td { height:22px; vertical-align:top; }
            </style>
          </head>
          <body>
            ${logoUrl ? `<img class="logo" src="${escapeRouteHtml(logoUrl)}" alt="Logo">` : ""}
            <h1>${escapeRouteHtml(protocoloEmpresa)}</h1>
            <table class="meta">
              <tr><td class="label">APELLIDOS Y NOMBRES:</td><td colspan="3"><strong>${escapeRouteHtml(String(det.paciente_nombre_completo || "").toUpperCase())}</strong></td></tr>
              <tr><td class="label">CARGO:</td><td><strong>${escapeRouteHtml(String(det.puesto_trabajo || "").toUpperCase())}</strong></td><td class="label">AREA:</td><td><strong>${escapeRouteHtml(String(det.area_trabajo || "").toUpperCase())}</strong></td></tr>
              <tr><td class="label">FECHA:</td><td><strong>${escapeRouteHtml(formatRouteDate(det.fecha_orden))}</strong></td><td class="label">TIPO DE EVALUACION:</td><td><strong>${escapeRouteHtml(String(det.tipo_nombre || det.tipo_codigo || "").toUpperCase())}</strong></td></tr>
              <tr><td class="label">EDAD:</td><td><strong>${escapeRouteHtml(det.paciente_edad ?? "")}</strong></td><td class="label">ORDEN:</td><td><strong>${escapeRouteHtml(det.codigo)}</strong></td></tr>
            </table>
            <table class="vitals"><thead><tr>${vitalsHead}</tr></thead><tbody><tr>${vitalsValues}</tr></tbody></table>
            <table class="route">
              <thead>
                <tr><th>AREAS</th><th>CONTROL</th></tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </body>
        </html>
      `);
      win.document.close();
      const triggerPrint = () => {
        win.focus();
        win.print();
      };
      if (win.document.readyState === "complete") {
        win.setTimeout(triggerPrint, logoUrl ? 350 : 100);
      } else {
        win.onload = triggerPrint;
      }
    } catch (err) {
      setError(err.message || "No se pudo imprimir la orden");
    }
  };

  const onDescargarPdf = async (ordenId) => {
    setPdfId(Number(ordenId));
    setError("");
    setMessage("");
    try {
      const [det, configuracionClinica, jsPDFModule, autoTableModule] = await Promise.all([
        obtenerDetalleOrdenOcupacional(ordenId),
        fetchConfiguracionClinica(),
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const jsPDF = jsPDFModule.default;
      const autoTable = autoTableModule.default;
      const routeGroups = buildRouteGroups(det.items);
      const vitals = buildRouteVitals(det);
      const logoUrl = resolveAssetUrl(configuracionClinica?.logo_ocupacional_url || configuracionClinica?.logo_url || "");
      const logoRaw = logoUrl ? await loadImageAsDataUrl(logoUrl).catch(() => "") : "";
      const logoDataUrl = logoRaw ? await cropImageWhitespaceDataUrl(logoRaw).catch(() => logoRaw) : "";

      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      if (logoDataUrl) {
        const logoProps = doc.getImageProperties(logoDataUrl);
        const ratio = logoProps.width / logoProps.height;
        const logoWidth = Math.min(30, 18 * ratio);
        const logoHeight = logoWidth / ratio;
        doc.addImage(logoDataUrl, inferDataUrlImageFormat(logoDataUrl), 14, 8, logoWidth, logoHeight);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(76, 29, 149);
      doc.text(
        `${String(det.protocolo_descripcion || "PROTOCOLO").toUpperCase()} - ${String(det.empresa || "").toUpperCase()}`,
        105,
        17,
        { align: "center", maxWidth: 145 }
      );
      doc.setTextColor(15, 23, 42);

      autoTable(doc, {
        startY: 25,
        theme: "plain",
        body: [
          ["APELLIDOS Y NOMBRES:", String(det.paciente_nombre_completo || "").toUpperCase()],
          ["CARGO:", String(det.puesto_trabajo || "").toUpperCase()],
          ["AREA:", String(det.area_trabajo || "").toUpperCase()],
          ["FECHA:", formatRouteDate(det.fecha_orden)],
          ["TIPO DE EVALUACION:", String(det.tipo_nombre || det.tipo_codigo || "").toUpperCase()],
          ["EDAD:", String(det.paciente_edad ?? "")],
        ],
        styles: { fontSize: 7.5, cellPadding: 0.7, textColor: [15, 23, 42] },
        columnStyles: {
          0: { cellWidth: 36, fontStyle: "bold" },
          1: { cellWidth: 144 },
        },
        margin: { left: 15, right: 15 },
      });

      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY || 25) + 2,
        head: [vitals.map((item) => item.label)],
        body: [vitals.map((item) => String(item.value || ""))],
        theme: "grid",
        styles: { fontSize: 7, cellPadding: 1, halign: "center", lineColor: [76, 29, 149], lineWidth: 0.2 },
        headStyles: { fillColor: [91, 33, 182], textColor: [255, 255, 255], fontStyle: "bold" },
        margin: { left: 15, right: 15 },
      });

      const routeBody = [];
      routeGroups.forEach((group) => {
        routeBody.push([
          { content: group.title, styles: { fontStyle: "bold", fillColor: [237, 233, 254], textColor: [59, 7, 100] } },
          { content: "", styles: { fillColor: [237, 233, 254] } },
        ]);
        group.items.forEach((item) => {
          routeBody.push([String(item.examen_descripcion || ""), ""]);
        });
      });

      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY || 45) + 3,
        head: [["AREAS", "CONTROL"]],
        body: routeBody,
        theme: "grid",
        styles: {
          fontSize: 7.3,
          cellPadding: 1.2,
          minCellHeight: 6.5,
          valign: "middle",
          lineColor: [76, 29, 149],
          lineWidth: 0.2,
        },
        headStyles: { fillColor: [91, 33, 182], textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
        columnStyles: { 0: { cellWidth: 105 }, 1: { cellWidth: 75 } },
        margin: { left: 15, right: 15, bottom: 12 },
        rowPageBreak: "avoid",
      });

      const safeCode = String(det.codigo || `orden_${ordenId}`).replace(/[^A-Za-z0-9_-]/g, "_");
      doc.save(`hoja_ruta_${safeCode}.pdf`);
      setMessage(`Hoja de ruta generada: ${safeCode}`);
    } catch (err) {
      setError(err.message || "No se pudo generar PDF de la orden");
    } finally {
      setPdfId(0);
    }
  };

  const onAnular = async (row) => {
    if (!row || Number(row.id) <= 0) {
      return;
    }
    if (String(row.estado || "") === "anulada") {
      setError("La orden ya se encuentra anulada");
      return;
    }
    if (String(row.estado || "") === "completada") {
      setError("No se puede anular una orden completada");
      return;
    }
    if (String(row.estado || "") === "cerrada") {
      setError("No se puede anular una orden cerrada");
      return;
    }
    const motivo = (window.prompt(`Motivo de anulacion para ${row.codigo}:`) || "").trim();
    if (!motivo) {
      setError("Debe ingresar motivo de anulacion");
      return;
    }
    const ok = window.confirm(`Confirma anular la orden ${row.codigo}?`);
    if (!ok) {
      return;
    }

    setAnulandoId(Number(row.id));
    setError("");
    setMessage("");
    try {
      await anularOrdenOcupacional(row.id, motivo);
      setMessage(`Orden anulada: ${row.codigo}`);
      await recargarListadoYResumen();
    } catch (err) {
      setError(err.message || "No se pudo anular la orden");
    } finally {
      setAnulandoId(0);
    }
  };

  const onCerrarOrden = async (row) => {
    if (!row || Number(row.id) <= 0) {
      return;
    }
    if (String(row.estado || "") === "cerrada") {
      setError("La orden ya se encuentra cerrada");
      return;
    }
    if (String(row.estado || "") !== "completada") {
      setError("Solo se puede cerrar una orden en estado completada");
      return;
    }

    const ok = window.confirm(`Confirma cierre formal de la orden ${row.codigo}?`);
    if (!ok) {
      return;
    }

    setCerrandoId(Number(row.id));
    setError("");
    setMessage("");
    try {
      await cerrarOrdenOcupacional(row.id);
      setMessage(`Orden cerrada: ${row.codigo}`);
      await recargarListadoYResumen();
    } catch (err) {
      setError(err.message || "No se pudo cerrar la orden");
    } finally {
      setCerrandoId(0);
    }
  };

  const onEditarOrden = async (row) => {
    if (!row || Number(row.id) <= 0) return;
    if (String(row.estado || "") !== "emitida") {
      setError("Solo se puede editar una orden en estado emitida");
      return;
    }

    setEmpresaId(Number(row.empresa_id || 0));
    setTrabajadorId(Number(row.trabajador_id || 0));
    setTrabajadorSnapshot({
      id: Number(row.trabajador_id || 0),
      nombre_completo: String(row.paciente_nombre_completo || ""),
      documento_numero: String(row.documento_numero || ""),
      puesto_trabajo: String(row.puesto_trabajo || ""),
      empresa: String(row.empresa || ""),
    });
    setTrabajadorQ("");
    setTrabajadorQDebounced("");
    setTrabajadorOpen(false);
    setProtocoloId(Number(row.protocolo_id || 0));
    setTipoEvaluacionId(Number(row.tipo_evaluacion_id || 0));
    setFechaOrden(String(row.fecha_orden || todayIso()));
    setObservacion(String(row.observacion_orden || ""));
    setSubcontrataEmpresaId(Number(row.subcontrata_empresa_id || 0));
    setFacturarEmpresaId(Number(row.facturar_empresa_id || 0));
    setMedicoOrdenId(Number(row.medico_responsable_id || 0));
    setModoOrden(String(row.modo || "CONVALIDACION"));
    setGestanteOrden(Number(row.gestante || 0) === 1);
    setDocumentoOrden(String(row.documento || ""));
    setIndicaDr(String(row.indica_dr || ""));
    setPreview(null);
    setEditingOrderId(Number(row.id));
    setEditandoOrdenId(Number(row.id));
    setMessage(`Modo edicion activo para ${row.codigo}. Previsualice y luego guarde cambios.`);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onCancelarEdicionOrden = () => {
    setEditingOrderId(0);
    setEditandoOrdenId(0);
    setPreview(null);
    setMessage("Edicion cancelada");
  };

  const onEliminarOrden = async (row) => {
    if (!row || Number(row.id) <= 0) return;
    if (String(row.estado || "") !== "emitida") {
      setError("Solo se puede eliminar una orden en estado emitida");
      return;
    }

    const typed = (window.prompt(`Para eliminar ${row.codigo} escriba ELIMINAR:`) || "").trim().toUpperCase();
    if (typed !== "ELIMINAR") {
      setError("Confirmacion incorrecta. No se elimino la orden");
      return;
    }

    setEliminandoOrdenId(Number(row.id));
    setError("");
    setMessage("");
    try {
      await eliminarOrdenOcupacional(row.id);
      setMessage(`Orden eliminada: ${row.codigo}`);
      if (Number(selectedOrderId) === Number(row.id)) {
        setSelectedOrderId(0);
      }
      await recargarListadoYResumen();
    } catch (err) {
      setError(err.message || "No se pudo eliminar la orden");
    } finally {
      setEliminandoOrdenId(0);
    }
  };

  const exportReporteGlobalPdf = async () => {
    setExportandoGlobal(true);
    setError("");
    try {
      const dataset = await obtenerReporteOrdenesOcupacionales({
        empresaId: empresaFiltroId,
        estado: filtroEstado,
        tipo: filtroTipo,
        fechaDesde: filtroFechaDesde,
        fechaHasta: filtroFechaHasta,
        q: qDebounced,
        limit: 5000,
      });
      const jsPDF = (await import("jspdf")).default;
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF();
      doc.setFontSize(13);
      doc.text("Reporte Global de Ordenes Ocupacionales", 14, 14);
      doc.setFontSize(10);
      doc.text(`Total filas: ${dataset.length}`, 14, 21);
      autoTable(doc, {
        startY: 27,
        head: [["Codigo", "Fecha", "Estado", "Empresa", "Documento", "Tipo", "Avance", "Monto"]],
        body: dataset.map((r) => [
          r.codigo,
          r.fecha_orden,
          r.estado,
          r.empresa,
          r.documento_numero,
          r.tipo_codigo,
          `${r.total_completados || 0}/${r.total_items || 0}`,
          `S/ ${r.monto_total}`,
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [15, 23, 42] },
      });
      doc.save(`reporte_ordenes_ocupacionales_${Date.now()}.pdf`);
      setMessage(`Reporte PDF generado (${dataset.length} filas)`);
    } catch (err) {
      setError(err.message || "No se pudo exportar reporte PDF");
    } finally {
      setExportandoGlobal(false);
    }
  };

  const exportReporteGlobalExcel = async () => {
    setExportandoGlobal(true);
    setError("");
    try {
      const dataset = await obtenerReporteOrdenesOcupacionales({
        empresaId: empresaFiltroId,
        estado: filtroEstado,
        tipo: filtroTipo,
        fechaDesde: filtroFechaDesde,
        fechaHasta: filtroFechaHasta,
        q: qDebounced,
        limit: 5000,
      });
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(dataset.map((r) => ({
        Codigo: r.codigo,
        Fecha: r.fecha_orden,
        Estado: r.estado,
        Empresa: r.empresa,
        Documento: r.documento_numero,
        Puesto: r.puesto_trabajo,
        Protocolo: r.protocolo_descripcion,
        Tipo: r.tipo_codigo,
        Avance: `${r.total_completados || 0}/${r.total_items || 0}`,
        Monto: r.monto_total,
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ordenes");
      XLSX.writeFile(wb, `reporte_ordenes_ocupacionales_${Date.now()}.xlsx`);
      setMessage(`Reporte Excel generado (${dataset.length} filas)`);
    } catch (err) {
      setError(err.message || "No se pudo exportar reporte Excel");
    } finally {
      setExportandoGlobal(false);
    }
  };

  const totalPages = Number(meta.total_pages || 0);
  const aptitudEditable = Boolean(detalleModalData) && String(detalleModalData?.estado || "") !== "anulada";
  const aptitudCatalogoModal = useMemo(() => {
    const uniques = new Set(LEGACY_APTITUD_OPTIONS);
    const actual = String(aptitudForm.aptitud || "").trim();
    if (actual) uniques.add(actual);
    return Array.from(uniques);
  }, [aptitudForm.aptitud]);
  const totalExamenesDetalle = Number(detalleModalData?.total_items || detalleModalData?.items?.length || 0);
  const examenesFinalizadosDetalle = Number(detalleModalData?.total_completados || 0);
  const examenesObservadosDetalle = (detalleModalData?.items || []).filter((item) => item.estado_ejecucion === "observado").length;
  const interconsultasAbiertasDetalle = interconsultas.filter((row) => ["solicitada", "respondida"].includes(row.estado)).length;

  let motivoBloqueoAptitud = "";
  if (!aptitudEditable && detalleModalData) {
    if (examenesObservadosDetalle > 0) {
      motivoBloqueoAptitud = `Debe resolver ${examenesObservadosDetalle} examen(es) observado(s).`;
    } else if (interconsultasAbiertasDetalle > 0) {
      motivoBloqueoAptitud = `Debe levantar ${interconsultasAbiertasDetalle} interconsulta(s) pendiente(s).`;
    } else {
      const faltantes = Math.max(0, totalExamenesDetalle - examenesFinalizadosDetalle);
      motivoBloqueoAptitud = `Faltan ${faltantes} resultado(s) clinico(s) por finalizar (${examenesFinalizadosDetalle}/${totalExamenesDetalle}).`;
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Salud Ocupacional - Ordenes</h1>
        <p className="text-sm text-slate-600 mt-1">
          Ejecute el protocolo sobre un trabajador y genere la orden con examenes aplicables.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{editingOrderId > 0 ? "Editar orden ocupacional" : "Nueva orden ocupacional"}</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative" ref={empresaComboRef}>
            <div className="relative">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-9 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                value={empresaInputValue}
                onFocus={() => setEmpresaOpen(true)}
                onChange={(e) => {
                  setEmpresaQ(e.target.value);
                  setEmpresaOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    if (!empresaOpen) {
                      setEmpresaOpen(true);
                      return;
                    }
                    if (empresaOpciones.length === 0) return;
                    const lastIndex = empresaOpciones.length - 1;
                    if (e.key === "ArrowDown") {
                      setEmpresaActiveIndex((prev) => (prev < 0 ? 0 : Math.min(prev + 1, lastIndex)));
                    } else {
                      setEmpresaActiveIndex((prev) => (prev < 0 ? lastIndex : Math.max(prev - 1, 0)));
                    }
                    return;
                  }
                  if (e.key === "Enter") {
                    if (!empresaOpen) {
                      e.preventDefault();
                      setEmpresaOpen(true);
                      return;
                    }
                    e.preventDefault();
                    const index = empresaActiveIndex >= 0 ? empresaActiveIndex : 0;
                    const selected = empresaOpciones[index];
                    if (selected) {
                      seleccionarEmpresa(selected.id);
                    }
                    return;
                  }
                  if (e.key === "Escape" && empresaOpen) {
                    e.preventDefault();
                    setEmpresaOpen(false);
                    setEmpresaQ("");
                    setEmpresaActiveIndex(-1);
                  }
                }}
                placeholder="Buscar empresa por nombre o RUC"
                autoComplete="off"
                role="combobox"
                aria-expanded={empresaOpen}
                aria-haspopup="listbox"
                aria-label="Buscar empresa"
                aria-activedescendant={empresaActiveIndex >= 0 ? `empresa-opcion-${empresaActiveIndex}` : undefined}
              />
              {empresaId > 0 ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => {
                    seleccionarEmpresa(0);
                    setEmpresaOpen(true);
                    setEmpresaActiveIndex(0);
                  }}
                  aria-label="Limpiar empresa"
                >
                  ×
                </button>
              ) : null}
            </div>

            {empresaOpen ? (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                {empresasFiltradas.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-slate-500">No se encontraron empresas con ese criterio.</p>
                ) : (
                  <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
                    <li>
                      <button
                        id="empresa-opcion-0"
                        type="button"
                        className={`w-full px-3 py-2 text-left text-sm transition ${
                          empresaActiveIndex === 0
                            ? "bg-cyan-100 text-cyan-900"
                            : Number(empresaId) === 0
                              ? "bg-cyan-50 text-cyan-900"
                              : "hover:bg-slate-50 text-slate-700"
                        }`}
                        onClick={() => {
                          seleccionarEmpresa(0);
                        }}
                        onMouseEnter={() => setEmpresaActiveIndex(0)}
                        role="option"
                        aria-selected={Number(empresaId) === 0}
                      >
                        Seleccione empresa
                      </button>
                    </li>
                    {empresasFiltradas.map((e, index) => {
                      const selected = Number(e.id) === Number(empresaId);
                      const optionIndex = index + 1;
                      return (
                        <li key={e.id}>
                          <button
                            id={`empresa-opcion-${optionIndex}`}
                            type="button"
                            className={`w-full px-3 py-2 text-left text-sm transition ${
                              empresaActiveIndex === optionIndex
                                ? "bg-cyan-100 text-cyan-900"
                                : selected
                                  ? "bg-cyan-50 text-cyan-900"
                                  : "hover:bg-slate-50 text-slate-700"
                            }`}
                            onClick={() => {
                              seleccionarEmpresa(e.id);
                            }}
                            onMouseEnter={() => setEmpresaActiveIndex(optionIndex)}
                            role="option"
                            aria-selected={selected}
                          >
                            <p className="truncate font-medium">{e.razon_social}</p>
                            <p className="truncate text-xs text-slate-500">{e.ruc ? `RUC: ${e.ruc}` : "Sin RUC registrado"}</p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
                  Mostrando {empresasFiltradas.length} de {empresas.length} empresa(s).
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative" ref={trabajadorComboRef}>
            <div className="relative">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-9 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                value={trabajadorInputValue}
                onFocus={() => setTrabajadorOpen(true)}
                onChange={(e) => {
                  setTrabajadorQ(e.target.value);
                  setTrabajadorOpen(true);
                }}
                onKeyDown={(e) => {
                  if (!empresaId) return;
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    if (!trabajadorOpen) {
                      setTrabajadorOpen(true);
                      return;
                    }
                    if (trabajadorOpciones.length === 0) return;
                    const lastIndex = trabajadorOpciones.length - 1;
                    if (e.key === "ArrowDown") {
                      setTrabajadorActiveIndex((prev) => (prev < 0 ? 0 : Math.min(prev + 1, lastIndex)));
                    } else {
                      setTrabajadorActiveIndex((prev) => (prev < 0 ? lastIndex : Math.max(prev - 1, 0)));
                    }
                    return;
                  }
                  if (e.key === "Enter") {
                    if (!trabajadorOpen) {
                      e.preventDefault();
                      setTrabajadorOpen(true);
                      return;
                    }
                    e.preventDefault();
                    const index = trabajadorActiveIndex >= 0 ? trabajadorActiveIndex : 0;
                    const selected = trabajadorOpciones[index];
                    if (selected) {
                      seleccionarTrabajador(selected);
                    }
                    return;
                  }
                  if (e.key === "Escape" && trabajadorOpen) {
                    e.preventDefault();
                    setTrabajadorOpen(false);
                    setTrabajadorQ("");
                    setTrabajadorActiveIndex(-1);
                  }
                }}
                placeholder={empresaId > 0 ? "Buscar trabajador por nombre, apellido o DNI" : "Seleccione empresa primero"}
                disabled={!empresaId}
                autoComplete="off"
                role="combobox"
                aria-expanded={trabajadorOpen}
                aria-haspopup="listbox"
                aria-label="Buscar trabajador"
                aria-activedescendant={trabajadorActiveIndex >= 0 ? `trabajador-opcion-${trabajadorActiveIndex}` : undefined}
              />
              {trabajadorId > 0 ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => {
                    limpiarSeleccionTrabajador();
                    setTrabajadorOpen(true);
                    setTrabajadorActiveIndex(0);
                    setPreview(null);
                  }}
                  aria-label="Limpiar trabajador"
                >
                  ×
                </button>
              ) : null}
            </div>

            {trabajadorOpen ? (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                {!empresaId ? (
                  <p className="px-3 py-2 text-xs text-slate-500">Seleccione una empresa para buscar trabajadores.</p>
                ) : trabajadoresLoading ? (
                  <p className="px-3 py-2 text-xs text-slate-500">Buscando trabajadores...</p>
                ) : trabajadores.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-slate-500">No se encontraron trabajadores con ese criterio.</p>
                ) : (
                  <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
                    {trabajadorOpciones.map((t, index) => {
                      const selected = Number(t.id) === Number(trabajadorId);
                      return (
                        <li key={t.id}>
                          <button
                            id={`trabajador-opcion-${index}`}
                            type="button"
                            className={`w-full px-3 py-2 text-left text-sm transition ${
                              trabajadorActiveIndex === index
                                ? "bg-cyan-100 text-cyan-900"
                                : selected
                                  ? "bg-cyan-50 text-cyan-900"
                                  : "hover:bg-slate-50 text-slate-700"
                            }`}
                            onClick={() => {
                              seleccionarTrabajador(t);
                            }}
                            onMouseEnter={() => setTrabajadorActiveIndex(index)}
                            role="option"
                            aria-selected={selected}
                          >
                            <p className="truncate font-medium">{t.nombre_completo || "Paciente sin nombre"}</p>
                            <p className="truncate text-xs text-slate-500">
                              DNI: {t.documento_numero || "-"} | {t.puesto_trabajo || "Sin puesto"} | {t.empresa || "Sin empresa"}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {empresaId > 0 ? (
                  <div className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
                    Mostrando {trabajadores.length} de {trabajadoresMeta.total || 0} trabajador(es). Escriba para refinar por nombre, apellido o DNI.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={protocoloId}
            onChange={(e) => {
              setProtocoloId(Number(e.target.value));
              setPreview(null);
            }}
          >
            <option value={0}>Seleccione protocolo</option>
            {protocolos.map((p) => (
              <option key={p.id} value={p.id}>{p.descripcion}</option>
            ))}
          </select>

          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={tipoEvaluacionId}
            onChange={(e) => {
              setTipoEvaluacionId(Number(e.target.value));
              setPreview(null);
            }}
          >
            <option value={0}>Seleccione tipo</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.codigo} - {t.nombre}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input
            type="date"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={fechaOrden}
            onChange={(e) => setFechaOrden(e.target.value)}
          />
          <input
            className="md:col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Observacion (opcional)"
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={subcontrataEmpresaId}
            onChange={(e) => setSubcontrataEmpresaId(Number(e.target.value || 0))}
          >
            <option value={0}>Subcontrata (opcional)</option>
            {empresas.map((e) => (
              <option key={`sub-${e.id}`} value={e.id}>{e.razon_social}</option>
            ))}
          </select>

          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={facturarEmpresaId}
            onChange={(e) => setFacturarEmpresaId(Number(e.target.value || 0))}
          >
            <option value={0}>Facturar a (opcional)</option>
            {empresas.map((e) => (
              <option key={`fac-${e.id}`} value={e.id}>{e.razon_social}</option>
            ))}
          </select>

          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={medicoOrdenId}
            onChange={(e) => setMedicoOrdenId(Number(e.target.value || 0))}
          >
            {medicosCrud.length === 0 ? <option value={0}>Sin medicos con CMP y firma</option> : null}
            {medicosCrud.map((m) => (
              <option key={m.id} value={m.id}>
                {formatProfesionalName(m)} - CMP {m.cmp || m.nro_colegiatura}
              </option>
            ))}
          </select>

          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={modoOrden}
            onChange={(e) => setModoOrden(e.target.value)}
          >
            <option value="CONVALIDACION">CONVALIDACION</option>
            <option value="REVALIDACION">REVALIDACION</option>
            <option value="REEVALUACION">REEVALUACION</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Documento (opcional)"
            value={documentoOrden}
            onChange={(e) => setDocumentoOrden(e.target.value)}
          />
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Ind. Dr. (opcional)"
            value={indicaDr}
            onChange={(e) => setIndicaDr(e.target.value)}
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={gestanteOrden ? "1" : "0"}
            onChange={(e) => setGestanteOrden(e.target.value === "1")}
          >
            <option value="0">Gestante: NO</option>
            <option value="1">Gestante: SI</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPrevisualizar}
            disabled={!canPreview || previewLoading}
            className="rounded bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {previewLoading ? "Previsualizando..." : "Previsualizar examenes"}
          </button>
          <button
            type="button"
            onClick={onRegistrar}
            disabled={!preview || registrando}
            className="rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {registrando ? (editingOrderId > 0 ? "Guardando cambios..." : "Registrando...") : (editingOrderId > 0 ? "Guardar cambios" : "Registrar orden")}
          </button>
          {editingOrderId > 0 ? (
            <button
              type="button"
              onClick={onCancelarEdicionOrden}
              className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar edicion
            </button>
          ) : null}
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-600">{message}</p> : null}

        {preview ? (
          <div className="rounded border border-slate-200 p-3">
            <p className="text-xs text-slate-600 mb-2">
              Trabajador: <strong>{trabajadores.find((t) => Number(t.id) === Number(trabajadorId))?.nombre_completo || "Paciente sin nombre"}</strong> | DNI: <strong>{preview.trabajador?.documento_numero}</strong> | Protocolo: <strong>{preview.protocolo?.descripcion}</strong> | Tipo: <strong>{preview.tipo_evaluacion?.codigo}</strong>
            </p>
            <p className="text-xs text-slate-600 mb-2">
              Medico: <strong>{medicoOrden ? formatProfesionalName(medicoOrden) : (firmaDoctor || "-")}</strong> | Modo: <strong>{modoOrden || "-"}</strong> | Gestante: <strong>{gestanteOrden ? "SI" : "NO"}</strong>
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 pr-3">Codigo</th>
                    <th className="py-2 pr-3">Examen</th>
                    <th className="py-2 pr-3">Aplica</th>
                    <th className="py-2 pr-3">Motivo</th>
                    <th className="py-2 pr-3">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.items || []).map((it) => (
                    <tr key={`${it.catalogo_id}-${it.examen_id}`} className="border-b last:border-0">
                      <td className="py-2 pr-3">{it.codigo}</td>
                      <td className="py-2 pr-3">{it.descripcion}</td>
                      <td className="py-2 pr-3">
                        <span className={`rounded-full px-2 py-1 text-xs ${it.aplica ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                          {it.aplica ? "SI" : "NO"}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{it.motivo}</td>
                      <td className="py-2 pr-3">S/ {it.aplica ? it.monto : "0.00"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-slate-700">
              Total aplicable: <strong>S/ {preview.total || "0.00"}</strong> | Examenes aplicables: <strong>{preview.total_items_aplican || 0}</strong>
            </p>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Ordenes registradas</h2>
          <input
            className="ml-auto rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Buscar por codigo, documento o protocolo"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>

        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-7">
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={empresaFiltroId}
            onChange={(e) => {
              setEmpresaFiltroId(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={0}>Todas las empresas</option>
            {empresas.map((empresa) => (
              <option key={empresa.id} value={empresa.id}>{empresa.razon_social}</option>
            ))}
          </select>

          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={filtroEstado}
            onChange={(e) => {
              setFiltroEstado(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los estados</option>
            <option value="emitida">emitida</option>
            <option value="en_proceso">en_proceso</option>
            <option value="completada">completada</option>
            <option value="cerrada">cerrada</option>
            <option value="anulada">anulada</option>
          </select>

          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={filtroTipo}
            onChange={(e) => {
              setFiltroTipo(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los tipos</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.codigo}>{t.codigo}</option>
            ))}
          </select>

          <input
            type="date"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={filtroFechaDesde}
            onChange={(e) => {
              setFiltroFechaDesde(e.target.value);
              setPage(1);
            }}
          />

          <input
            type="date"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={filtroFechaHasta}
            onChange={(e) => {
              setFiltroFechaHasta(e.target.value);
              setPage(1);
            }}
          />

          <button
            type="button"
            className="rounded border border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
            onClick={exportReporteGlobalPdf}
            disabled={exportandoGlobal}
          >
            {exportandoGlobal ? "Exportando..." : "Reporte PDF"}
          </button>

          <button
            type="button"
            className="rounded border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            onClick={exportReporteGlobalExcel}
            disabled={exportandoGlobal}
          >
            {exportandoGlobal ? "Exportando..." : "Reporte Excel"}
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs">Total: <strong>{resumen?.total || 0}</strong></div>
          <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs">Emitida: <strong>{resumen?.emitida || 0}</strong></div>
          <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">En proceso: <strong>{resumen?.en_proceso || 0}</strong></div>
          <div className="rounded border border-blue-200 bg-blue-50 p-2 text-xs">Completada: <strong>{resumen?.completada || 0}</strong></div>
          <div className="rounded border border-slate-300 bg-slate-100 p-2 text-xs">Cerrada: <strong>{resumen?.cerrada || 0}</strong></div>
          <div className="rounded border border-red-200 bg-red-50 p-2 text-xs">Anulada: <strong>{resumen?.anulada || 0}</strong></div>
          <div className="rounded border border-cyan-200 bg-cyan-50 p-2 text-xs">Monto total: <strong>S/ {resumen?.monto_total || "0.00"}</strong></div>
        </div>

        {loading ? <p className="text-sm text-slate-500">Cargando ordenes...</p> : null}

        <section className="mb-3 border-y border-slate-200 bg-slate-50/80 px-3 py-3" aria-label="Acciones de la orden seleccionada">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-slate-500">Orden seleccionada</p>
              {selectedOrder ? (
                <p className="truncate text-sm font-semibold text-slate-900">
                  {selectedOrder.codigo} · {selectedOrder.paciente_nombre_completo || "Paciente sin nombre"}
                </p>
              ) : (
                <p className="text-sm text-slate-500">Seleccione una fila para habilitar las acciones.</p>
              )}
            </div>

            <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="toolbar" aria-label="Acciones contextuales">
              <ActionIconButton
                icon={FiUserCheck}
                label={ordenListaParaAptitud(selectedOrder) ? "Aptitud medica" : "Aptitud no disponible: complete resultados, observaciones e interconsultas"}
                disabled={!ordenListaParaAptitud(selectedOrder)}
                active={Boolean(selectedOrder?.aptitud_final)}
                onClick={() => onVerDetalle(selectedOrder.id, "aptitud")}
              />
              <ActionIconButton
                icon={FiFileText}
                label={selectedOrder?.certificado_emitido ? "Certificado emitido" : "Certificado con logo"}
                disabled={!selectedOrder || selectedOrder.estado === "anulada" || !String(selectedOrder.aptitud_final || "").trim() || certificandoId === selectedOrder.id}
                active={Boolean(selectedOrder?.certificado_emitido)}
                onClick={() => onEmitirCertificado(selectedOrder.id)}
              />
              <ActionIconButton
                icon={FiEye}
                label="Detalle clinico"
                disabled={!selectedOrder}
                onClick={() => onVerDetalle(selectedOrder.id)}
              />
              <ActionIconButton
                icon={FiClipboard}
                label="Hoja de ruta PDF"
                disabled={!selectedOrder || selectedOrder.estado === "anulada" || pdfId === selectedOrder.id}
                onClick={() => onDescargarPdf(selectedOrder.id)}
              />
              <ActionIconButton
                icon={FiPrinter}
                label="Imprimir hoja de ruta"
                disabled={!selectedOrder || selectedOrder.estado === "anulada"}
                onClick={() => onImprimir(selectedOrder.id)}
              />
              <ActionIconButton
                icon={FiActivity}
                label={selectedOrder?.triaje_detalle_id ? "Abrir Triaje" : "El protocolo no incluye Triaje"}
                disabled={!selectedOrder || Number(selectedOrder.triaje_detalle_id || 0) <= 0 || selectedOrder.estado === "anulada"}
                active={Boolean(selectedOrder?.triaje_finalizado)}
                onClick={() => onAbrirTriajeOrden(selectedOrder)}
              />
              <ActionIconButton
                icon={FiAlertCircle}
                label="Interconsultas"
                disabled={!selectedOrder}
                badge={selectedOrder?.interconsultas_abiertas || 0}
                active={Number(selectedOrder?.interconsultas_levantadas || 0) > 0}
                onClick={() => onVerDetalle(selectedOrder.id)}
              />
              <ActionIconButton icon={FiImage} label="Imagenes: integracion pendiente" disabled />
              <ActionIconButton
                icon={FiCheckCircle}
                label="Cerrar orden"
                disabled={!selectedOrder || selectedOrder.estado !== "completada" || cerrandoId === selectedOrder.id}
                onClick={() => onCerrarOrden(selectedOrder)}
              />
              <ActionIconButton
                icon={FiXCircle}
                label="Anular orden"
                disabled={!selectedOrder || ["anulada", "completada", "cerrada"].includes(selectedOrder.estado) || anulandoId === selectedOrder.id}
                onClick={() => onAnular(selectedOrder)}
              />
              <ActionIconButton
                icon={FiEdit2}
                label="Editar orden"
                disabled={!selectedOrder || selectedOrder.estado !== "emitida" || editandoOrdenId === selectedOrder.id}
                onClick={() => onEditarOrden(selectedOrder)}
              />
              <ActionIconButton
                icon={FiTrash2}
                label="Eliminar orden"
                disabled={!selectedOrder || selectedOrder.estado !== "emitida" || eliminandoOrdenId === selectedOrder.id}
                onClick={() => onEliminarOrden(selectedOrder)}
              />
              <ActionIconButton icon={FiMoreHorizontal} label="Mas acciones: proximamente" disabled />
            </div>
          </div>
        </section>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[1420px] text-xs">
            <thead>
              <tr className="border-b bg-slate-50 text-left font-semibold uppercase text-slate-500">
                <th className="w-10 px-2 py-2 text-center">#</th>
                <th className="min-w-44 px-2 py-2">Empresa</th>
                <th className="min-w-36 px-2 py-2">Puesto</th>
                <th className="min-w-52 px-2 py-2">Paciente</th>
                <th className="min-w-28 px-2 py-2">Tipo / orden</th>
                <th className="min-w-36 px-2 py-2">Aptitud</th>
                <th className="min-w-52 px-2 py-2">Restriccion</th>
                <th className="min-w-60 px-2 py-2">Observaciones</th>
                <th className="min-w-32 px-2 py-2">Levantamiento</th>
                <th className="min-w-32 px-2 py-2">Interconsultas</th>
                <th className="w-20 px-2 py-2 text-center">Imagenes</th>
                <th className="min-w-24 px-2 py-2">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, index) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  aria-selected={Number(selectedOrderId) === Number(r.id)}
                  className={`cursor-pointer border-b align-top outline-none transition-colors last:border-0 hover:bg-violet-50 focus:bg-violet-50 ${Number(selectedOrderId) === Number(r.id) ? "bg-violet-100/80 ring-1 ring-inset ring-violet-400" : ""}`}
                  onClick={() => setSelectedOrderId(Number(r.id))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedOrderId(Number(r.id));
                    }
                  }}
                >
                  <td className="px-2 py-3 text-center font-semibold text-slate-500">{(page - 1) * perPage + index + 1}</td>
                  <td className="px-2 py-3 font-medium text-slate-800">{r.empresa || "-"}</td>
                  <td className="px-2 py-3 text-slate-700">{r.puesto_trabajo || "-"}</td>
                  <td className="px-2 py-3">
                    <p className="font-semibold text-slate-800">{r.paciente_nombre_completo || "-"}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{r.documento_numero || "Sin documento"}</p>
                  </td>
                  <td className="px-2 py-3">
                    <p className="font-semibold text-slate-800">{r.tipo_codigo || "-"}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{r.codigo} · {Number(r.total_completados || 0)}/{Number(r.total_items || 0)}</p>
                  </td>
                  <td className="px-2 py-3">
                    <span className={`inline-flex rounded px-2 py-1 text-[11px] font-semibold ${aptitudBadgeClass(r.aptitud_final)}`}>
                      {formatAptitudLabel(r.aptitud_final)}
                    </span>
                  </td>
                  <td className="px-2 py-3 leading-5 text-slate-700" title={r.restriccion_final || ""}>{r.restriccion_final || "Sin restricciones"}</td>
                  <td className="px-2 py-3 leading-5 text-slate-700" title={textoObservacionesOrden(r)}>{textoObservacionesOrden(r)}</td>
                  <td className="px-2 py-3">
                    <span className={Number(r.levantamientos_no_favorables || 0) > 0 ? "font-semibold text-red-700" : Number(r.interconsultas_levantadas || 0) > 0 ? "font-semibold text-emerald-700" : "text-slate-500"}>
                      {resumenLevantamientoOrden(r)}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    {Number(r.total_interconsultas || 0) > 0 ? (
                      <span className={Number(r.interconsultas_abiertas || 0) > 0 ? "font-semibold text-amber-700" : "font-semibold text-emerald-700"}>
                        {r.interconsultas_abiertas > 0 ? `${r.interconsultas_abiertas} abierta(s)` : `${r.total_interconsultas} cerrada(s)`}
                      </span>
                    ) : <span className="text-slate-500">-</span>}
                  </td>
                  <td className="px-2 py-3 text-center text-slate-400" title="Integracion ocupacional de imagenes pendiente"><FiImage className="inline text-base" /></td>
                  <td className="px-2 py-3 text-slate-700">{r.fecha_orden || "-"}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={12}>No hay ordenes para mostrar.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 md:hidden">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`w-full border px-3 py-3 text-left ${Number(selectedOrderId) === Number(r.id) ? "border-violet-500 bg-violet-50" : "border-slate-200 bg-white"}`}
              onClick={() => setSelectedOrderId(Number(r.id))}
              aria-pressed={Number(selectedOrderId) === Number(r.id)}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{r.paciente_nombre_completo || "Paciente sin nombre"}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{r.codigo} · {r.documento_numero || "Sin documento"}</span>
                </span>
                <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-semibold ${aptitudBadgeClass(r.aptitud_final)}`}>
                  {formatAptitudLabel(r.aptitud_final)}
                </span>
              </span>
              <span className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <span><strong className="text-slate-500">Empresa:</strong> <span className="text-slate-800">{r.empresa || "-"}</span></span>
                <span><strong className="text-slate-500">Tipo:</strong> <span className="text-slate-800">{r.tipo_codigo || "-"}</span></span>
                <span><strong className="text-slate-500">Avance:</strong> <span className="text-slate-800">{Number(r.total_completados || 0)}/{Number(r.total_items || 0)}</span></span>
                <span><strong className="text-slate-500">Interconsultas:</strong> <span className="text-slate-800">{r.interconsultas_abiertas || 0} abierta(s)</span></span>
              </span>
              <span className="mt-3 block border-t border-slate-200 pt-2 text-xs text-slate-700">
                <strong>Restriccion:</strong> {r.restriccion_final || "Sin restricciones"}
              </span>
              <span className="mt-1 block text-xs text-slate-700">
                <strong>Observaciones:</strong> {textoObservacionesOrden(r)}
              </span>
            </button>
          ))}
          {!loading && rows.length === 0 ? <p className="py-3 text-sm text-slate-500">No hay ordenes para mostrar.</p> : null}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Total: {meta.total || 0} registros</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-xs disabled:opacity-50"
              disabled={loading || page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Anterior
            </button>
            <span className="text-xs text-slate-600">Pag. {page}/{Math.max(1, totalPages)}</span>
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-xs disabled:opacity-50"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {detalleModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
          <div className={`max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white p-4 shadow-xl ${detalleModalVista === "aptitud" ? "max-w-3xl" : "max-w-5xl"}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">{detalleModalVista === "aptitud" ? "Aptitud medica" : "Ejecucion de orden"}</h3>
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1 text-xs"
                onClick={() => setDetalleModalOpen(false)}
              >
                Cerrar
              </button>
            </div>

            {detalleModalLoading ? <p className="text-sm text-slate-500">Cargando detalle...</p> : null}
            {detalleModalError ? <p className="text-sm text-red-600">{detalleModalError}</p> : null}

            {detalleModalData ? (
              <>
                {detalleModalVista !== "aptitud" ? (
                  <>
                    <p className="mb-3 text-sm text-slate-700">
                      Orden: <strong>{detalleModalData.codigo}</strong> | Estado: <strong>{detalleModalData.estado}</strong> | Avance: <strong>{detalleModalData.total_completados || 0}/{detalleModalData.total_items || 0}</strong>
                    </p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-slate-500">
                            <th className="py-2 pr-3">Codigo</th>
                            <th className="py-2 pr-3">Examen</th>
                            <th className="py-2 pr-3">Estado</th>
                            <th className="py-2 pr-3">Observacion</th>
                            <th className="py-2 pr-3">F. ejecucion</th>
                            <th className="py-2 pr-3">Accion</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detalleModalData.items || []).map((it) => (
                            <tr key={it.id} className="border-b last:border-0 align-top">
                              <td className="py-2 pr-3">{it.examen_codigo}</td>
                              <td className="py-2 pr-3">{it.examen_descripcion}</td>
                              <td className="py-2 pr-3">
                                <select
                                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                                  value={detalleForms[it.id]?.estado || "pendiente"}
                                  onChange={(e) => setDetalleForms((prev) => ({
                                    ...prev,
                                    [it.id]: {
                                      ...(prev[it.id] || {}),
                                      estado: e.target.value,
                                    },
                                  }))}
                                  disabled={detalleModalData.estado === "anulada" || detalleModalData.estado === "cerrada" || it.estado_ejecucion === "realizado"}
                                >
                                  <option value="pendiente">pendiente</option>
                                  <option value="en_proceso">en_proceso</option>
                                  <option value="realizado" disabled>realizado (desde formato)</option>
                                  <option value="observado">observado</option>
                                </select>
                              </td>
                              <td className="py-2 pr-3">
                                <input
                                  className="w-56 rounded border border-slate-300 px-2 py-1 text-xs"
                                  value={detalleForms[it.id]?.observacion || ""}
                                  onChange={(e) => setDetalleForms((prev) => ({
                                    ...prev,
                                    [it.id]: {
                                      ...(prev[it.id] || {}),
                                      observacion: e.target.value,
                                    },
                                  }))}
                                  placeholder="Observacion"
                                  disabled={detalleModalData.estado === "anulada" || detalleModalData.estado === "cerrada" || it.estado_ejecucion === "realizado"}
                                />
                              </td>
                              <td className="py-2 pr-3 text-xs text-slate-600">{it.fecha_ejecucion || "-"}</td>
                              <td className="py-2 pr-3">
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                                    onClick={() => onAbrirFormatoClinico(it, detalleModalData.id)}
                                    disabled={detalleModalData.estado === "anulada" || detalleModalData.estado === "cerrada"}
                                  >
                                    Formato
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded border border-cyan-300 px-2 py-1 text-xs text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"
                                    onClick={() => onGuardarDetalle(it.id)}
                                    disabled={savingDetalleId === it.id || detalleModalData.estado === "anulada" || detalleModalData.estado === "cerrada" || it.estado_ejecucion === "realizado"}
                                  >
                                    {savingDetalleId === it.id ? "Guardando..." : "Guardar"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <section className="mt-4 border-y border-amber-200 bg-amber-50/40 py-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-3">
                    <h4 className="text-sm font-semibold text-amber-950">Observaciones e interconsultas</h4>
                    <span className="text-xs text-amber-800">
                      Abiertas: {interconsultas.filter((row) => ["solicitada", "respondida"].includes(row.estado)).length}
                    </span>
                  </div>
                  {interconsultasError ? <p className="mb-3 px-3 text-xs text-red-600">{interconsultasError}</p> : null}

                  <form onSubmit={onCrearInterconsulta} className="grid grid-cols-1 gap-2 px-3 md:grid-cols-2 xl:grid-cols-3">
                    <select
                      className="rounded border border-slate-300 px-2 py-1.5 text-xs"
                      value={interconsultaForm.detalleId}
                      onChange={(e) => setInterconsultaForm((prev) => ({ ...prev, detalleId: Number(e.target.value || 0) }))}
                      disabled={detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                    >
                      <option value={0}>Examen observado...</option>
                      {(detalleModalData.items || [])
                        .filter((item) => item.estado_ejecucion === "observado")
                        .filter((item) => !interconsultas.some((row) => Number(row.orden_detalle_id) === Number(item.id) && ["solicitada", "respondida"].includes(row.estado)))
                        .map((item) => (
                          <option key={item.id} value={item.id}>{item.examen_codigo} - {item.examen_descripcion}</option>
                        ))}
                    </select>
                    <input
                      className="rounded border border-slate-300 px-2 py-1.5 text-xs"
                      value={interconsultaForm.especialidad}
                      onChange={(e) => setInterconsultaForm((prev) => ({ ...prev, especialidad: e.target.value }))}
                      placeholder="Especialidad requerida"
                      disabled={detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                    />
                    <input
                      className="rounded border border-slate-300 px-2 py-1.5 text-xs"
                      value={interconsultaForm.cie10}
                      onChange={(e) => setInterconsultaForm((prev) => ({ ...prev, cie10: e.target.value }))}
                      placeholder="CIE-10 (opcional)"
                      disabled={detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                    />
                    <textarea
                      className="min-h-20 rounded border border-slate-300 px-2 py-1.5 text-xs md:col-span-2"
                      value={interconsultaForm.motivo}
                      onChange={(e) => setInterconsultaForm((prev) => ({ ...prev, motivo: e.target.value }))}
                      placeholder="Motivo de la interconsulta"
                      disabled={detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                    />
                    <textarea
                      className="min-h-20 rounded border border-slate-300 px-2 py-1.5 text-xs"
                      value={interconsultaForm.diagnostico}
                      onChange={(e) => setInterconsultaForm((prev) => ({ ...prev, diagnostico: e.target.value }))}
                      placeholder="Diagnostico o sospecha clinica"
                      disabled={detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                    />
                    <textarea
                      className="min-h-16 rounded border border-slate-300 px-2 py-1.5 text-xs md:col-span-2 xl:col-span-3"
                      value={interconsultaForm.observaciones}
                      onChange={(e) => setInterconsultaForm((prev) => ({ ...prev, observaciones: e.target.value }))}
                      placeholder="Observaciones adicionales (opcional)"
                      disabled={detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                    />
                    <div className="md:col-span-2 xl:col-span-3">
                      <button
                        type="submit"
                        className="rounded border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        disabled={interconsultaSavingKey === "crear" || detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                      >
                        {interconsultaSavingKey === "crear" ? "Registrando..." : "Crear interconsulta"}
                      </button>
                    </div>
                  </form>

                  <div className="mt-4 divide-y divide-amber-200 border-t border-amber-200">
                    {interconsultasLoading ? <p className="px-3 py-3 text-xs text-slate-500">Cargando interconsultas...</p> : null}
                    {!interconsultasLoading && interconsultas.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-slate-500">No hay interconsultas registradas.</p>
                    ) : null}
                    {interconsultas.map((row) => {
                      const respuestaForm = interconsultaRespuestaForms[row.id] || {};
                      const levantamientoForm = interconsultaLevantamientoForms[row.id] || {};
                      const estaAbierta = ["solicitada", "respondida"].includes(row.estado);
                      return (
                        <div key={row.id} className="px-3 py-4">
                          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{row.examen_codigo} - {row.especialidad}</p>
                              <p className="text-xs text-slate-600">{row.motivo}</p>
                              {row.diagnostico_cie10 || row.diagnostico_descripcion ? (
                                <p className="mt-1 text-xs text-slate-600">Diagnostico: {[row.diagnostico_cie10, row.diagnostico_descripcion].filter(Boolean).join(" - ")}</p>
                              ) : null}
                            </div>
                            <span className={`rounded px-2 py-1 text-[11px] font-semibold ${row.estado === "levantada" ? "bg-emerald-100 text-emerald-700" : row.estado === "anulada" ? "bg-slate-200 text-slate-600" : row.estado === "respondida" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"}`}>
                              {row.estado}
                            </span>
                          </div>

                          {estaAbierta ? (
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                              <input
                                className="rounded border border-slate-300 px-2 py-1.5 text-xs"
                                value={respuestaForm.especialista || ""}
                                onChange={(e) => setInterconsultaRespuestaForms((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] || {}), especialista: e.target.value } }))}
                                placeholder="Especialista que responde"
                              />
                              <input
                                type="file"
                                accept="application/pdf,.pdf"
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                onChange={(e) => setInterconsultaRespuestaForms((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] || {}), archivo: e.target.files?.[0] || null } }))}
                              />
                              <textarea
                                className="min-h-20 rounded border border-slate-300 px-2 py-1.5 text-xs md:col-span-2"
                                value={respuestaForm.respuesta || ""}
                                onChange={(e) => setInterconsultaRespuestaForms((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] || {}), respuesta: e.target.value } }))}
                                placeholder="Respuesta del especialista"
                              />
                              <div className="flex flex-wrap gap-2 md:col-span-2">
                                <button
                                  type="button"
                                  className="rounded border border-blue-300 bg-white px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                  onClick={() => onResponderInterconsulta(row)}
                                  disabled={interconsultaSavingKey === `responder-${row.id}`}
                                >
                                  {interconsultaSavingKey === `responder-${row.id}` ? "Guardando..." : row.estado === "respondida" ? "Actualizar respuesta" : "Registrar respuesta"}
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-red-300 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                                  onClick={() => onAnularInterconsulta(row)}
                                  disabled={interconsultaSavingKey === `anular-${row.id}`}
                                >
                                  Anular
                                </button>
                                {row.respuesta_documento ? (
                                  <a className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700" href={resolveAssetUrl(row.respuesta_documento)} target="_blank" rel="noreferrer">Ver PDF</a>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          {row.estado === "respondida" ? (
                            <div className="mt-3 grid grid-cols-1 gap-2 border-t border-amber-200 pt-3 md:grid-cols-2">
                              <textarea
                                className="min-h-20 rounded border border-slate-300 px-2 py-1.5 text-xs"
                                value={levantamientoForm.levantamiento || ""}
                                onChange={(e) => setInterconsultaLevantamientoForms((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] || {}), levantamiento: e.target.value } }))}
                                placeholder="Levantamiento de observacion"
                              />
                              <textarea
                                className="min-h-20 rounded border border-slate-300 px-2 py-1.5 text-xs"
                                value={levantamientoForm.recomendacion || ""}
                                onChange={(e) => setInterconsultaLevantamientoForms((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] || {}), recomendacion: e.target.value } }))}
                                placeholder="Recomendacion"
                              />
                              <select
                                className="rounded border border-slate-300 px-2 py-1.5 text-xs"
                                value={levantamientoForm.resultado || "FAVORABLE"}
                                onChange={(e) => setInterconsultaLevantamientoForms((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] || {}), resultado: e.target.value } }))}
                              >
                                <option value="FAVORABLE">FAVORABLE</option>
                                <option value="NO_FAVORABLE">NO FAVORABLE</option>
                              </select>
                              <select
                                className="rounded border border-slate-300 px-2 py-1.5 text-xs"
                                value={levantamientoForm.medicoId || 0}
                                onChange={(e) => setInterconsultaLevantamientoForms((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] || {}), medicoId: Number(e.target.value || 0) } }))}
                              >
                                <option value={0}>Medico responsable...</option>
                                {medicosCrud.map((medico) => (
                                  <option key={medico.id} value={medico.id}>{formatProfesionalName(medico)} - CMP {medico.cmp || medico.nro_colegiatura}</option>
                                ))}
                              </select>
                              <div className="md:col-span-2">
                                <button
                                  type="button"
                                  className="rounded border border-emerald-400 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                                  onClick={() => onLevantarInterconsulta(row)}
                                  disabled={interconsultaSavingKey === `levantar-${row.id}`}
                                >
                                  {interconsultaSavingKey === `levantar-${row.id}` ? "Levantando..." : "Registrar levantamiento"}
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {row.estado === "levantada" ? (
                            <div className="mt-2 text-xs text-emerald-800">
                              <p><strong>Resultado:</strong> {row.resultado_levantamiento}</p>
                              <p><strong>Levantamiento:</strong> {row.levantamiento}</p>
                              <p><strong>Recomendacion:</strong> {row.recomendacion}</p>
                              <p><strong>Medico:</strong> {row.medico_levantamiento_nombre_snapshot} - CMP {row.medico_levantamiento_cmp_snapshot}</p>
                            </div>
                          ) : null}
                          {row.estado === "anulada" ? <p className="text-xs text-slate-600">Motivo: {row.anulacion_motivo}</p> : null}
                        </div>
                      );
                    })}
                  </div>
                    </section>
                  </>
                ) : null}

                <div className={`${detalleModalVista === "aptitud" ? "mt-0" : "mt-4"} rounded border border-emerald-200 bg-emerald-50/40 p-3`}>
                  <h4 className="mb-2 text-sm font-semibold text-emerald-900">Aptitud final y certificado</h4>
                  {aptitudEditable ? (
                    <p className="mb-3 rounded border border-emerald-200 bg-emerald-100 px-2 py-1.5 text-xs text-emerald-900">
                      Puede seleccionar o actualizar la aptitud final sin restricciones de avance clinico.
                    </p>
                  ) : (
                    <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                      Aptitud bloqueada: la orden se encuentra anulada.
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <label htmlFor="aptitud-final-orden" className="mb-1 block text-xs text-slate-600">Aptitud final</label>
                      <select
                        id="aptitud-final-orden"
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        value={aptitudForm.aptitud}
                        onChange={(e) => setAptitudForm((prev) => ({ ...prev, aptitud: e.target.value }))}
                        disabled={!aptitudEditable || savingAptitud}
                      >
                        <option value="">Seleccione...</option>
                        {aptitudCatalogoModal.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-600">Restricciones</label>
                      <input
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        value={aptitudForm.restriccion}
                        onChange={(e) => setAptitudForm((prev) => ({ ...prev, restriccion: e.target.value }))}
                        placeholder="Restricciones"
                        disabled={!aptitudEditable || savingAptitud}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-600">Recomendaciones</label>
                      <input
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        value={aptitudForm.recomendacion}
                        onChange={(e) => setAptitudForm((prev) => ({ ...prev, recomendacion: e.target.value }))}
                        placeholder="Recomendaciones"
                        disabled={!aptitudEditable || savingAptitud}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-600">Fecha de evaluacion certificado</label>
                      <input
                        type="date"
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        value={aptitudForm.certificadoFechaEvaluacion}
                        onChange={(e) => setAptitudForm((prev) => ({ ...prev, certificadoFechaEvaluacion: e.target.value }))}
                        disabled={!aptitudEditable || savingAptitud}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-600">Fecha de emision certificado (opcional)</label>
                      <input
                        type="date"
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        value={aptitudForm.certificadoFechaEmision}
                        onChange={(e) => setAptitudForm((prev) => ({ ...prev, certificadoFechaEmision: e.target.value }))}
                        disabled={!aptitudEditable || savingAptitud}
                      />
                      <p className="mt-1 text-[11px] text-slate-500">Si no define emision, se usa la fecha de evaluacion.</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      onClick={onGuardarAptitud}
                      disabled={
                        !aptitudEditable
                        || savingAptitud
                        || !aptitudForm.aptitud
                      }
                    >
                      {savingAptitud ? "Guardando..." : (detalleModalData.aptitud_final ? "Actualizar aptitud" : "Guardar aptitud")}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                      onClick={() => onEmitirCertificado(detalleModalData.id)}
                      disabled={certificandoId === detalleModalData.id || detalleModalData.estado === "anulada" || !String(detalleModalData.aptitud_final || aptitudForm.aptitud || "").trim()}
                    >
                      {certificandoId === detalleModalData.id ? "Emitiendo..." : "Emitir certificado"}
                    </button>
                  </div>
                </div>

                {detalleModalVista !== "aptitud" ? (
                  <>
                <div className="mt-4 rounded border border-cyan-200 bg-cyan-50/40 p-3">
                  <h4 className="mb-2 text-sm font-semibold text-cyan-900">Historia ocupacional</h4>
                  <p className="mb-3 text-xs text-cyan-800">
                    Gestion de historia ocupacional por orden, manteniendo la logica legacy mientras la orden siga editable.
                  </p>

                  <div className="mb-3 border-y border-cyan-200 bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">Paciente</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {detalleModalData.paciente_nombre_completo || "Paciente sin nombre registrado"}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span><strong>Documento:</strong> {detalleModalData.documento_numero || "-"}</span>
                      <span><strong>HC:</strong> {detalleModalData.paciente_historia_clinica || "-"}</span>
                      <span><strong>Edad:</strong> {detalleModalData.paciente_edad ?? "-"}</span>
                      <span><strong>Sexo:</strong> {detalleModalData.paciente_sexo || "-"}</span>
                    </div>
                  </div>

                  <form onSubmit={onGuardarHistoria} className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      placeholder="Motivo de evaluacion"
                      value={historiaForm.motivo_evaluacion}
                      onChange={(e) => setHistoriaForm((prev) => ({ ...prev, motivo_evaluacion: e.target.value }))}
                      disabled={historiaSaving || detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                    />
                    <input
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      placeholder="Puesto actual"
                      value={historiaForm.puesto_actual}
                      onChange={(e) => setHistoriaForm((prev) => ({ ...prev, puesto_actual: e.target.value }))}
                      disabled={historiaSaving || detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                    />
                    <input
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      placeholder="Area de trabajo"
                      value={historiaForm.area_trabajo}
                      onChange={(e) => setHistoriaForm((prev) => ({ ...prev, area_trabajo: e.target.value }))}
                      disabled={historiaSaving || detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                    />
                    <input
                      type="number"
                      min={0}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      placeholder="Tiempo en puesto (meses)"
                      value={historiaForm.tiempo_puesto_meses}
                      onChange={(e) => setHistoriaForm((prev) => ({ ...prev, tiempo_puesto_meses: e.target.value }))}
                      disabled={historiaSaving || detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                    />
                    <textarea
                      className="rounded border border-slate-300 px-2 py-1 text-xs md:col-span-2"
                      rows={2}
                      placeholder="Observaciones"
                      value={historiaForm.observaciones}
                      onChange={(e) => setHistoriaForm((prev) => ({ ...prev, observaciones: e.target.value }))}
                      disabled={historiaSaving || detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                    />
                    <ListaClinicaEditable
                      title="Antecedentes laborales"
                      singular="Antecedente laboral"
                      value={historiaForm.antecedentes_laborales_json}
                      onChange={(value) => setHistoriaForm((prev) => ({ ...prev, antecedentes_laborales_json: value }))}
                      disabled={historiaSaving || detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                    />
                    <ListaClinicaEditable
                      title="Antecedentes patológicos"
                      singular="Antecedente patológico"
                      value={historiaForm.antecedentes_patologicos_json}
                      onChange={(value) => setHistoriaForm((prev) => ({ ...prev, antecedentes_patologicos_json: value }))}
                      disabled={historiaSaving || detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                    />
                    <div className="md:col-span-2">
                      <ListaClinicaEditable
                        title="Hábitos"
                        singular="Hábito"
                        value={historiaForm.habitos_json}
                        onChange={(value) => setHistoriaForm((prev) => ({ ...prev, habitos_json: value }))}
                        disabled={historiaSaving || detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                      />
                    </div>
                    <div className="md:col-span-2 flex flex-wrap gap-2">
                      <button
                        type="submit"
                        className="rounded border border-cyan-300 px-2 py-1 text-xs text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"
                        disabled={historiaSaving || detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                      >
                        {historiaSaving ? "Guardando..." : historiaEditingId ? "Actualizar historia" : "Registrar historia"}
                      </button>
                      {historiaEditingId ? (
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                          onClick={onCancelarHistoria}
                        >
                          Cancelar edicion
                        </button>
                      ) : null}
                    </div>
                  </form>

                  {historiaLoading ? <p className="mt-3 text-xs text-slate-500">Cargando historia ocupacional...</p> : null}
                  {historiaError ? <p className="mt-3 text-xs text-red-600">{historiaError}</p> : null}

                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                    {historiaRows.length === 0 && !historiaLoading ? (
                      <p className="text-xs text-slate-500">No hay historia ocupacional registrada para esta orden.</p>
                    ) : null}
                    {historiaRows.map((row) => (
                      <div key={row.id} className="rounded border border-cyan-100 bg-white p-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-slate-700">Registro #{row.id} - {row.created_at || ""}</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="rounded border border-blue-300 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                              onClick={() => onEditarHistoria(row)}
                              disabled={detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="rounded border border-red-300 px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 disabled:opacity-50"
                              onClick={() => onAnularHistoria(row)}
                              disabled={historiaAnulandoId === row.id || detalleModalData.estado === "cerrada" || detalleModalData.estado === "anulada"}
                            >
                              {historiaAnulandoId === row.id ? "Anulando..." : "Anular"}
                            </button>
                          </div>
                        </div>
                        <p className="mt-1 text-slate-600"><strong>Motivo:</strong> {row.motivo_evaluacion || "-"}</p>
                        <p className="text-slate-600"><strong>Puesto:</strong> {row.puesto_actual || "-"} | <strong>Area:</strong> {row.area_trabajo || "-"} | <strong>Meses:</strong> {row.tiempo_puesto_meses ?? "-"}</p>
                        <p className="text-slate-600"><strong>Observaciones:</strong> {row.observaciones || "-"}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded border border-indigo-200 bg-indigo-50/40 p-3">
                  <h4 className="mb-2 text-sm font-semibold text-indigo-900">Historia clinica ocupacional consolidada</h4>
                  <p className="mb-3 text-xs text-indigo-800">
                    Vista clinica resumida de la orden con avance de examenes, hallazgos operativos e historia ocupacional registrada.
                  </p>

                  <div className="mb-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                      onClick={onRecargarClinicaConsolidada}
                      disabled={clinicaLoading}
                    >
                      {clinicaLoading ? "Recargando..." : "Recargar consolidado"}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                      onClick={exportHistoriaClinicaPdf}
                      disabled={clinicaLoading || !detalleModalData?.id}
                    >
                      PDF clinico
                    </button>
                  </div>

                  {clinicaLoading ? <p className="text-xs text-slate-500">Cargando consolidado clinico...</p> : null}
                  {clinicaError ? <p className="text-xs text-red-600">{clinicaError}</p> : null}

                  {clinicaConsolidada?.resumen ? (
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                      <div className="rounded border border-slate-200 bg-white p-2 text-xs">Total: <strong>{clinicaConsolidada.resumen.total_items || 0}</strong></div>
                      <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs">Completados: <strong>{clinicaConsolidada.resumen.total_completados || 0}</strong></div>
                      <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">Observados: <strong>{clinicaConsolidada.resumen.total_observados || 0}</strong></div>
                      <div className="rounded border border-blue-200 bg-blue-50 p-2 text-xs">Interconsultas: <strong>{clinicaConsolidada.resumen.interconsultas_abiertas || 0}</strong></div>
                      <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs">Pendientes: <strong>{clinicaConsolidada.resumen.total_pendientes || 0}</strong></div>
                      <div className="rounded border border-cyan-200 bg-cyan-50 p-2 text-xs">Avance: <strong>{clinicaConsolidada.resumen.porcentaje_avance || 0}%</strong></div>
                      <div className="rounded border border-violet-200 bg-violet-50 p-2 text-xs">Historias: <strong>{clinicaConsolidada.resumen.historias_registradas || 0}</strong></div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 rounded border border-slate-200 p-3">
                  <h4 className="mb-2 text-sm font-semibold text-slate-800">Bitacora de eventos</h4>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <select
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      value={eventosFiltros.tipo}
                      onChange={(e) => setEventosFiltros((prev) => ({ ...prev, tipo: e.target.value }))}
                    >
                      <option value="">Todos los tipos</option>
                      <option value="orden_registrada">orden_registrada</option>
                      <option value="detalle_actualizado">detalle_actualizado</option>
                      <option value="orden_cerrada">orden_cerrada</option>
                      <option value="orden_anulada">orden_anulada</option>
                      <option value="aptitud_final_guardada">aptitud_final_guardada</option>
                      <option value="certificado_emitido">certificado_emitido</option>
                      <option value="resultado_pdf_emitido">resultado_pdf_emitido</option>
                      <option value="plantilla_guardada">plantilla_guardada</option>
                      <option value="plantilla_eliminada">plantilla_eliminada</option>
                    </select>
                    <input
                      type="date"
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      value={eventosFiltros.fechaDesde}
                      onChange={(e) => setEventosFiltros((prev) => ({ ...prev, fechaDesde: e.target.value }))}
                    />
                    <input
                      type="date"
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      value={eventosFiltros.fechaHasta}
                      onChange={(e) => setEventosFiltros((prev) => ({ ...prev, fechaHasta: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="rounded border border-cyan-300 px-2 py-1 text-xs text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"
                      onClick={onFiltrarEventos}
                      disabled={eventosLoading}
                    >
                      {eventosLoading ? "Filtrando..." : "Filtrar"}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                      onClick={onResetFiltrosEventos}
                    >
                      Limpiar
                    </button>
                    <button
                      type="button"
                      className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50"
                      onClick={exportEventosPdf}
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                      onClick={exportEventosExcel}
                    >
                      Excel
                    </button>
                  </div>
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {(eventosFiltrados || []).length === 0 ? (
                      <p className="text-xs text-slate-500">Sin eventos registrados.</p>
                    ) : (
                      (eventosFiltrados || []).map((ev) => (
                        <div key={ev.id} className="rounded border border-slate-100 bg-slate-50 p-2 text-xs">
                          <p className="font-medium text-slate-700">{ev.tipo_evento} - {ev.created_at || ""}</p>
                          <p className="text-slate-600">{ev.descripcion}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {formatoModalOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Formato clinico por examen</h3>
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1 text-xs"
                onClick={() => setFormatoModalOpen(false)}
              >
                Cerrar
              </button>
            </div>

            {formatoModalLoading ? <p className="text-sm text-slate-500">Cargando formato...</p> : null}
            {formatoModalError ? <p className="text-sm text-red-600">{formatoModalError}</p> : null}

            {!formatoModalLoading ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-600">
                  Examen: <strong>{formatoForm.examenCodigo}</strong> - {formatoForm.examenDescripcion}
                </p>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                    value={formatoForm.formatoCodigo}
                    onChange={(e) => setFormatoForm((prev) => ({ ...prev, formatoCodigo: e.target.value }))}
                    placeholder="Codigo formato"
                    disabled={formatoModalSaving}
                  />
                  <select
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                    value={formatoForm.estado}
                    onChange={(e) => setFormatoForm((prev) => ({ ...prev, estado: e.target.value }))}
                    disabled={formatoModalSaving}
                  >
                    <option value="borrador">borrador</option>
                    <option value="finalizado">finalizado</option>
                    <option value="anulado">anulado</option>
                  </select>
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                    value={formatoForm.observacion}
                    onChange={(e) => setFormatoForm((prev) => ({ ...prev, observacion: e.target.value }))}
                    placeholder="Observacion clinica"
                    disabled={formatoModalSaving}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                    onClick={onCargarPlantillaSugeridaFormato}
                    disabled={formatoModalSaving || formatoModalLoading || formatoPlantillaSaving}
                  >
                    Cargar plantilla sugerida
                  </button>
                  <p className="text-[11px] text-slate-500">La plantilla carga los campos clinicos correspondientes al examen.</p>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-xs md:col-span-2"
                    value={formatoPlantillaNombre}
                    onChange={(e) => setFormatoPlantillaNombre(e.target.value)}
                    placeholder="Nombre de plantilla"
                    disabled={formatoModalSaving || formatoModalLoading || formatoPlantillaSaving}
                  />
                  <select
                    className="rounded border border-slate-300 px-2 py-1 text-xs md:col-span-2"
                    value={formatoPlantillaSeleccionada}
                    onChange={(e) => setFormatoPlantillaSeleccionada(e.target.value)}
                    disabled={formatoModalSaving || formatoModalLoading || formatoPlantillaSaving}
                  >
                    {(formatoModalData?.plantillasDisponibles || []).map((tpl) => (
                      <option key={`${tpl.id || 0}-${tpl.codigo || "tpl"}`} value={String(tpl.id || 0)}>
                        {tpl.nombre || tpl.codigo || `Plantilla ${tpl.id || 0}`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    onClick={onAplicarPlantillaSeleccionada}
                    disabled={formatoModalSaving || formatoModalLoading || formatoPlantillaSaving}
                  >
                    Aplicar seleccionada
                  </button>
                  <button
                    type="button"
                    className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                    onClick={onGuardarPlantillaCatalogo}
                    disabled={formatoModalSaving || formatoModalLoading || formatoPlantillaSaving}
                  >
                    {formatoPlantillaSaving ? "Guardando..." : "Guardar como plantilla"}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                    onClick={onEliminarPlantillaCatalogo}
                    disabled={formatoModalSaving || formatoModalLoading || formatoPlantillaSaving || Number(formatoPlantillaSeleccionada || 0) <= 0}
                  >
                    Eliminar plantilla seleccionada
                  </button>
                  <p className="text-[11px] text-slate-500">Solo se eliminan plantillas guardadas en catalogo (no la sugerida del sistema).</p>
                </div>

                <FormatoClinicoCampos
                  templateCode={String(formatoModalData?.detalle?.template_code || "general_basico")}
                  datos={formatoForm.datos}
                  onChange={onFormatoDatoChange}
                  onAudiometriaChange={onFormatoAudiometriaChange}
                  onParametroChange={onFormatoParametroChange}
                  disabled={formatoModalSaving}
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-cyan-300 px-2 py-1 text-xs text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"
                    onClick={onGuardarFormatoClinico}
                    disabled={formatoModalSaving || formatoPdfGenerating}
                  >
                    {formatoModalSaving ? "Guardando..." : "Guardar formato"}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-400 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={onDescargarFormatoClinicoPdf}
                    disabled={formatoModalSaving || formatoPdfGenerating || String(formatoModalData?.data?.estado || "") !== "finalizado"}
                    title={String(formatoModalData?.data?.estado || "") === "finalizado" ? "Descargar resultado clinico" : "Finalice y guarde el resultado para generar su PDF"}
                  >
                    {formatoPdfGenerating ? "Generando PDF..." : "PDF del resultado"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
