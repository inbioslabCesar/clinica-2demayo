import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QuickAccessNav from "../components/comunes/QuickAccessNav";
import CotizadorRapido from "../components/cotizaciones/CotizadorRapido";
import { FiEye, FiSlash, FiDollarSign, FiEdit2, FiCamera, FiFileText, FiBookOpen, FiPrinter, FiMessageCircle } from "react-icons/fi";
import { authFetch } from "../utils/apiClient";
import { BASE_URL } from "../config/config";
import { evaluarRegistroPaciente, textoMotivosRegistroIncompleto } from "../utils/pacienteRegistroEstado";

const BRAND_CACHE_KEY = "detalle_cotizacion_brand_cache_v1";
const BRAND_CACHE_TTL_MS = 5 * 60 * 1000;
const COTIZACIONES_LIMIT_STORAGE_KEY = "cotizaciones_rows_limit_v1";
const MAX_HC_HYDRATION_PER_LOAD = 6;
const MAX_IMAGEN_HYDRATION_PER_LOAD = 4;
const HYDRATION_CONCURRENCY = 2;

function buildBrandFromConfig(cfg = {}) {
  const rawLogo = String(cfg.logo_url || "").trim();
  const logo = rawLogo
    ? (/^(https?:\/\/|data:|blob:)/i.test(rawLogo)
      ? rawLogo
      : `${String(BASE_URL || "").replace(/\/+$/, "")}/${rawLogo.replace(/^\/+/, "")}`)
    : "";

  return {
    nombre: String(cfg.nombre_clinica || "MI CLINICA").trim().toUpperCase(),
    logo,
    direccion: String(cfg.direccion || "").trim(),
    telefono: String(cfg.telefono || "").trim(),
    celular: String(cfg.celular || cfg.telefono_secundario || cfg.contacto_emergencias || "").trim(),
    ruc: String(cfg.ruc || "").trim(),
    slogan: String(cfg.slogan || "").trim(),
    slogan_color: String(cfg.slogan_color || "").trim(),
    nombre_color: String(cfg.nombre_color || "").trim(),
    email: String(cfg.email || "").trim(),
  };
}

function formatUserRole(roleRaw) {
  const role = String(roleRaw || "").trim().toLowerCase();
  if (!role) return "";
  if (role === "admin" || role === "administrador") return "Admin";
  if (role.includes("recep")) return "Recepcion";
  if (role.includes("caja") || role.includes("cajero")) return "Caja";
  if (role.includes("medico")) return "Medico";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

const SERVICIOS_IMAGEN = new Set(["rayosx", "ecografia", "tomografia"]);
function tieneServicioImagen(serviciosTipos) {
  return Array.isArray(serviciosTipos) && serviciosTipos.some((tipo) => SERVICIOS_IMAGEN.has(tipo));
}

function normalizarServicioTipo(value) {
  const base = String(value || "").toLowerCase().trim();
  if (!base) return "";
  if (base === "rayos_x" || base === "rayos x") return "rayosx";
  if (base === "operaciones") return "operacion";
  if (base === "procedimientos") return "procedimiento";
  if (base === "consulta_medica" || base === "consulta médica" || base === "consulta medica") return "consulta";
  return base;
}

function formatServicioCorrelativoDetalle(value) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  return raw.length > 28 ? `${raw.slice(0, 28).trim()}...` : raw;
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMetodoPagoLabel(value) {
  const v = String(value || "").toLowerCase().trim();
  if (!v || v === "sin_pago") return "Sin pago";
  if (v === "mixto") return "Mixto";
  if (v === "yape") return "Yape";
  if (v === "plin") return "Plin";
  if (v === "efectivo") return "Efectivo";
  if (v === "tarjeta") return "Tarjeta";
  if (v === "transferencia") return "Transferencia";
  if (v === "deposito") return "Deposito";
  if (v === "cheque") return "Cheque";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function formatDateShort(value) {
  if (!value) return "sin-fecha";
  return String(value).replace(/[^0-9-]/g, "").slice(0, 10) || "sin-fecha";
}

function formatCorrelativoFechaAtencion(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const ymd = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("es-PE");
  }

  return raw;
}

function formatHoraAtencion(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}:${match[2]}`;
  }

  const parsed = new Date(`1970-01-01T${raw}`);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  return raw;
}

function formatDateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
}

async function pauseMainThread() {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function mapInChunks(items, mapper, chunkSize = 500) {
  const source = Array.isArray(items) ? items : [];
  const safeChunkSize = Math.max(100, Number(chunkSize) || 500);
  const out = [];

  for (let i = 0; i < source.length; i += safeChunkSize) {
    const chunk = source.slice(i, i + safeChunkSize);
    for (const item of chunk) {
      out.push(mapper(item));
    }
    if (i + safeChunkSize < source.length) {
      await pauseMainThread();
    }
  }

  return out;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getVencimientoMeta(row) {
  const fechaVencimiento = String(row?.fecha_vencimiento || "").trim();
  const estado = String(row?.estado || "").toLowerCase();
  if (!fechaVencimiento || !["pendiente", "parcial", "informativo"].includes(estado)) return null;

  const vencimiento = new Date(fechaVencimiento);
  if (Number.isNaN(vencimiento.getTime())) return null;

  const ahora = new Date();
  if (ahora.getTime() > vencimiento.getTime()) {
    return {
      vencida: true,
      label: estado === "informativo" ? "Info vencida" : "Vencida",
      detail: `Venció: ${formatDateTime(fechaVencimiento)}`,
      className: "bg-red-100 text-red-700",
    };
  }

  const mismoDia = ahora.toDateString() === vencimiento.toDateString();
  if (mismoDia) {
    return {
      vencida: false,
      label: estado === "informativo" ? "Info vence hoy" : "Vence hoy",
      detail: `Vence: ${formatDateTime(fechaVencimiento)}`,
      className: "bg-amber-100 text-amber-700",
    };
  }

  return {
    vencida: false,
    label: estado === "informativo" ? "Info vigente" : "Vigente",
    detail: `Vence: ${formatDateTime(fechaVencimiento)}`,
    className: "bg-emerald-100 text-emerald-700",
  };
}

function normalizePhoneForWa(value) {
  const digits = String(value || "").replace(/\D+/g, "").trim();
  if (!digits) return "";
  if (digits.startsWith("51") && digits.length >= 11) return digits;
  if (digits.length === 9) return `51${digits}`;
  return digits;
}

function getUltimoPagoMeta(ultimoPagoAt) {
  const raw = String(ultimoPagoAt || "").trim();
  if (!raw) {
    return {
      label: "Sin pago",
      className: "bg-slate-100 text-slate-700",
      title: "Sin abonos registrados",
    };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return {
      label: raw,
      className: "bg-amber-100 text-amber-800",
      title: "Pago registrado",
    };
  }

  const hoy = formatDateInput(new Date());
  const fechaPago = formatDateInput(parsed);
  const esHoy = fechaPago === hoy;

  return {
    label: parsed.toLocaleString(),
    className: esHoy ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800",
    title: esHoy ? "Pagado hoy" : "Pagado en fecha distinta",
  };
}

// Constantes de estilo fuera del componente — referencia estable, nunca se recrean
const ACTION_BTN_BASE = "inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-transform hover:scale-105";
const THEME_GRADIENT = { backgroundImage: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)" };
const THEME_PRIMARY_SOFT = { backgroundColor: "var(--color-primary-light)", color: "var(--color-primary-dark)" };
const THEME_OUTLINE = { color: "var(--color-primary-dark)", borderColor: "var(--color-primary-light)" };
function stableHashString(value) {
  const input = String(value || "");
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getMedicoAccentColor(profesionalCabecera) {
  const nombre = String(profesionalCabecera || "").trim().toLowerCase();
  if (!nombre) return "#94a3b8";
  const hue = stableHashString(nombre) % 360;
  return `hsl(${hue} 72% 36%)`;
}

function getMedicoAccentSoftBg(profesionalCabecera) {
  const nombre = String(profesionalCabecera || "").trim().toLowerCase();
  if (!nombre) return "transparent";
  const hue = stableHashString(nombre) % 360;
  return `hsl(${hue} 88% 92%)`;
}

function badgeOrigen(value) {
  const v = String(value || "regular").toLowerCase();
  if (v === "contrato") return { cls: "bg-emerald-100 text-emerald-700", label: "Contrato" };
  if (v === "extra") return { cls: "bg-orange-100 text-orange-700", label: "Extra" };
  if (v === "mixto") return { cls: "bg-indigo-100 text-indigo-700", label: "Mixto" };
  return { cls: "bg-slate-100 text-slate-700", label: "Regular" };
}

function badgeOrigenVisual(row) {
  const observaciones = String(row?.observaciones || "").toLowerCase();
  if (observaciones.includes("paquetes/perfiles")) {
    if (observaciones.includes("perfil")) return { cls: "bg-fuchsia-100 text-fuchsia-700", label: "PERFIL" };
    return { cls: "bg-violet-100 text-violet-700", label: "PAQUETE" };
  }
  return badgeOrigen(row?.origen_cobro_resumen);
}

function resolverAnulacionDesdeHC(row, servicios = []) {
  const estado = String(row?.estado || "").toLowerCase().trim();
  if (estado !== "anulada") return { activa: false, detalle: "" };

  const referencia = String(row?.referencia_origen || "").trim();
  const observaciones = String(row?.observaciones || "").trim();
  const observacionesLower = observaciones.toLowerCase();
  const referenciaLower = referencia.toLowerCase();
  const sinServicios = !Array.isArray(servicios) || servicios.length === 0;

  const marcaExplicita = referenciaLower.includes("hc consulta") && referenciaLower.includes("cancelad");
  const marcaInferida = sinServicios && observacionesLower.includes("procedimientos desde consulta #");
  if (!marcaExplicita && !marcaInferida) {
    return { activa: false, detalle: "" };
  }

  const baseTexto = referencia || observaciones;
  const match = baseTexto.match(/consulta\s*#\s*(\d+)/i);
  const consultaId = match?.[1] ? Number(match[1]) : 0;
  const detalle = consultaId > 0 ? `Consulta #${consultaId}` : "Solicitud clínica";

  return { activa: true, detalle };
}

function resolverSolicitudDesdeHC(row) {
  const referencia = String(row?.referencia_origen || "").trim();
  const observaciones = String(row?.observaciones || "").trim();
  const marcaSolicitudTexto = tieneMarcaSolicitudHCDesdeTexto(row);

  const consultaOrigenConfiable = extraerConsultaOrigenIdConfiable(row);
  const servicios = parseServiciosTipos(row?.servicios_tipos || "");
  const esConsultaPura = servicios.length === 1 && servicios.includes("consulta");
  const marcaVinculoConfiableNoConsulta = consultaOrigenConfiable > 0 && !esConsultaPura;

  if (!marcaSolicitudTexto && !marcaVinculoConfiableNoConsulta) {
    return { activa: false, detalle: "" };
  }

  const baseTexto = `${referencia} ${observaciones}`.trim();
  const match = baseTexto.match(/consulta\s*#\s*(\d+)/i);
  const consultaId = match?.[1] ? Number(match[1]) : consultaOrigenConfiable;
  const detalle = consultaId > 0 ? `Consulta #${consultaId}` : "Solicitud clínica";

  return { activa: true, detalle };
}

function esCotizacionHcProximaProgramada(row) {
  if (Number(row?.es_hc_proxima_programada || 0) === 1) return true;

  const referencia = String(row?.referencia_origen || "").toLowerCase();
  const observaciones = String(row?.observaciones || "").toLowerCase();
  const estado = String(row?.estado || "").toLowerCase().trim();

  if (referencia.includes("hc_proxima") || referencia.includes("próxima cita") || referencia.includes("proxima cita")) {
    return true;
  }

  if (observaciones.includes("próxima cita") || observaciones.includes("proxima cita")) {
    return true;
  }

  return estado === "control" && Number(row?.consulta_es_control || 0) === 1;
}

function tieneMarcaSolicitudHCDesdeTexto(row) {
  const referenciaLower = String(row?.referencia_origen || "").toLowerCase().trim();
  const observacionesLower = String(row?.observaciones || "").toLowerCase().trim();

  return (
    referenciaLower.includes("hc consulta")
    || referenciaLower.includes("desde hc")
    || referenciaLower.includes("historia clinica")
    || referenciaLower.includes("historia clínica")
    || observacionesLower.includes("desde consulta #")
    || observacionesLower.includes("procedimientos desde consulta #")
    || observacionesLower.includes("solicitud hc")
  );
}

function extraerConsultaOrigenIdExplicita(row) {
  const referencia = String(row?.referencia_origen || "").trim();
  const observaciones = String(row?.observaciones || "").trim();
  const baseTexto = `${referencia} ${observaciones}`.trim();
  const match = baseTexto.match(/consulta\s*#\s*(\d+)/i);
  return match?.[1] ? Number(match[1]) : 0;
}

function extraerConsultaOrigenIdConfiable(row) {
  const explicita = extraerConsultaOrigenIdExplicita(row);
  if (explicita > 0) return explicita;

  const consultaRefId = Number(row?.consulta_ref_id || 0);
  if (consultaRefId <= 0) return 0;

  // Solo confiar en consulta_ref_id cuando viene con metadata de consulta real
  // (evita enlaces débiles inferidos por fallback de paciente).
  const correlativo = Number(row?.consulta_ref_correlativo_dia_medico || 0);
  const fechaRef = String(row?.consulta_ref_fecha || "").trim();
  if (correlativo > 0 || /^\d{4}-\d{2}-\d{2}$/.test(fechaRef)) {
    return consultaRefId;
  }

  // En cotizaciones directas mixtas (consulta + otros servicios),
  // consulta_ref_id suele ser válido aunque no llegue metadata auxiliar.
  const servicios = parseServiciosTipos(row?.servicios_tipos || "");
  if (servicios.includes("consulta")) {
    return consultaRefId;
  }

  // Históricos: permitir vínculo cuando existe marca textual de solicitud desde HC.
  if (tieneMarcaSolicitudHCDesdeTexto(row)) {
    return consultaRefId;
  }

  return 0;
}

function parseCotizacionTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return Number.NaN;

  const ymdhms = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (ymdhms) {
    const year = Number(ymdhms[1]);
    const month = Number(ymdhms[2]);
    const day = Number(ymdhms[3]);
    const hour = Number(ymdhms[4]);
    const minute = Number(ymdhms[5]);
    const second = Number(ymdhms[6] || 0);
    const tsLocal = new Date(year, month - 1, day, hour, minute, second).getTime();
    return Number.isNaN(tsLocal) ? Number.NaN : tsLocal;
  }

  const ts = Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T"));
  return Number.isNaN(ts) ? Number.NaN : ts;
}

function parseConsultaRefDayTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return Number.NaN;
  const ymd = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return Number.NaN;

  const [year, month, day] = ymd.split("-").map((v) => Number(v));
  const tsLocal = new Date(year, month - 1, day, 0, 0, 0).getTime();
  return Number.isNaN(tsLocal) ? Number.NaN : tsLocal;
}

function origenConsultaNoFuturo(row) {
  const cotTs = parseCotizacionTimestamp(row?.fecha);
  const consultaTs = parseConsultaRefDayTimestamp(row?.consulta_ref_fecha);
  if (!Number.isFinite(cotTs) || !Number.isFinite(consultaTs)) return true;
  return consultaTs <= cotTs;
}

function parseServiciosTipos(rawValue) {
  return Array.from(new Set(
    String(rawValue || "")
      .split(",")
      .map(normalizarServicioTipo)
      .filter(Boolean)
  ));
}

function resolverEstadoGrupoCotizacion(items) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return "pendiente";

  if (rows.length === 1) {
    return String(rows[0]?.estado || "pendiente").toLowerCase();
  }

  const total = rows.reduce((acc, row) => acc + Number(row?.total || 0), 0);
  const totalPagado = rows.reduce((acc, row) => acc + Number(row?.total_pagado || 0), 0);
  const saldo = rows.reduce((acc, row) => acc + Number(row?.saldo_pendiente || 0), 0);
  const esControlHc = rows.some((row) => (
    Number(row?.es_hc_proxima_programada || 0) === 1
    || Number(row?.consulta_es_control || 0) === 1
  ));

  const estados = rows.map((row) => String(row?.estado || "").toLowerCase());
  if (estados.length > 0 && estados.every((estado) => estado === "anulada")) return "anulada";
  if (esControlHc && saldo <= 0.00001 && total <= 0.00001 && totalPagado <= 0.00001) return "control";
  if (saldo <= 0.00001 && total > 0) return "pagado";
  if (totalPagado > 0.00001) return "parcial";
  if (estados.includes("informativo") && total <= 0.00001) return "informativo";

  return "pendiente";
}

function agruparFilasOperativasPorEpisodio(rows) {
  const source = Array.isArray(rows) ? rows : [];
  if (source.length === 0) return [];

  const grupos = new Map();
  source.forEach((row) => {
    const rowId = Number(row?.id || 0);
    if (rowId <= 0) return;

    const padre = Number(row?.cotizacion_padre_id || 0);
    const rootId = padre > 0 ? padre : rowId;
    if (!grupos.has(rootId)) grupos.set(rootId, []);
    grupos.get(rootId).push(row);
  });

  const grouped = [];
  grupos.forEach((items, rootId) => {
    if (!Array.isArray(items) || items.length === 0) return;

    const conRaiz = items.find((row) => Number(row?.id || 0) === Number(rootId));
    const base = conRaiz || items.slice().sort((a, b) => Number(a?.id || 0) - Number(b?.id || 0))[0];
    const idsGrupo = Array.from(new Set(items.map((row) => Number(row?.id || 0)).filter((id) => id > 0))).sort((a, b) => a - b);

    const serviciosUnicos = Array.from(new Set(
      items
        .flatMap((row) => String(row?.servicios_tipos || "").split(",").map(normalizarServicioTipo))
        .filter(Boolean)
    ));

    const ultimoPago = items
      .map((row) => String(row?.ultimo_pago_at || "").trim())
      .filter(Boolean)
      .sort((a, b) => String(b).localeCompare(String(a)))[0] || "";

    const total = items.reduce((acc, row) => acc + Number(row?.total || 0), 0);
    const totalPagado = items.reduce((acc, row) => acc + Number(row?.total_pagado || 0), 0);
    const saldo = items.reduce((acc, row) => acc + Number(row?.saldo_pendiente || 0), 0);
    const esHcProximaProgramada = items.some((row) => Number(row?.es_hc_proxima_programada || 0) === 1) ? 1 : 0;
    const consultaEsControl = items.some((row) => Number(row?.consulta_es_control || 0) === 1) ? 1 : 0;
    const estadoGrupo = resolverEstadoGrupoCotizacion(items);
    const grupoIncluyePagadas = items.some((row) => ["pagado", "completado", "control", "contrato"].includes(String(row?.estado || "").toLowerCase()));

    grouped.push({
      ...base,
      id: Number(base?.id || rootId),
      episodio_id: Number(rootId),
      cotizacion_ids_grupo: idsGrupo,
      adendas_count: Math.max(0, idsGrupo.length - 1),
      es_grupo_episodio: idsGrupo.length > 1 ? 1 : 0,
      grupo_incluye_pagadas: grupoIncluyePagadas ? 1 : 0,
      total,
      total_pagado: totalPagado,
      saldo_pendiente: saldo,
      es_hc_proxima_programada: esHcProximaProgramada,
      consulta_es_control: consultaEsControl,
      estado: estadoGrupo,
      ultimo_pago_at: ultimoPago || base?.ultimo_pago_at || "",
      servicios_tipos: serviciosUnicos.join(","),
      pagado_con_descuento: items.some((row) => Number(row?.pagado_con_descuento || 0) === 1) ? 1 : 0,
      referencia_origen: [
        String(base?.referencia_origen || "").trim(),
        idsGrupo.length > 1 ? `Grupo episodio: ${idsGrupo.map((id) => `#${id}`).join(", ")}` : "",
      ].filter(Boolean).join(" | "),
    });
  });

  return grouped.sort((a, b) => {
    const fa = parseCotizacionTimestamp(a?.fecha);
    const fb = parseCotizacionTimestamp(b?.fecha);
    if (Number.isFinite(fa) && Number.isFinite(fb) && fb !== fa) return fb - fa;
    return Number(b?.episodio_id || b?.id || 0) - Number(a?.episodio_id || a?.id || 0);
  });
}

function construirRelacionPorCotizacion(rows) {
  const lista = Array.isArray(rows) ? rows : [];
  const grupos = new Map();

  lista.forEach((row) => {
    const cotizacionId = Number(row?.id || 0);
    const consultaOrigenId = extraerConsultaOrigenIdConfiable(row);
    if (cotizacionId <= 0 || consultaOrigenId <= 0) return;

    const servicios = parseServiciosTipos(row?.servicios_tipos || "");
    const origenExplicito = extraerConsultaOrigenIdExplicita(row) > 0;
    const requiereGuardiaNoFuturo = !servicios.includes("consulta") && !origenExplicito;
    if (requiereGuardiaNoFuturo && !origenConsultaNoFuturo(row)) return;

    if (!grupos.has(consultaOrigenId)) {
      grupos.set(consultaOrigenId, []);
    }

    const fechaTs = parseCotizacionTimestamp(row?.fecha);
    grupos.get(consultaOrigenId).push({
      cotizacionId,
      servicios,
      fechaTs,
    });
  });

  const out = {};
  const basePorConsulta = new Map();

  grupos.forEach((items, consultaOrigenId) => {
    if (!Array.isArray(items) || items.length === 0) return;

    const conConsulta = items.filter((item) => item.servicios.includes("consulta"));
    const base = (conConsulta.length > 0 ? conConsulta : items)
      .slice()
      .sort((a, b) => {
        const aTs = Number.isFinite(a.fechaTs) ? a.fechaTs : Number.POSITIVE_INFINITY;
        const bTs = Number.isFinite(b.fechaTs) ? b.fechaTs : Number.POSITIVE_INFINITY;
        if (aTs !== bTs) return aTs - bTs;
        return a.cotizacionId - b.cotizacionId;
      })[0];

    const baseCotizacionId = Number(base?.cotizacionId || 0);
    if (baseCotizacionId <= 0) return;

    basePorConsulta.set(consultaOrigenId, baseCotizacionId);
  });

  grupos.forEach((items, consultaOrigenId) => {
    const baseCotizacionId = Number(basePorConsulta.get(consultaOrigenId) || 0);
    if (baseCotizacionId <= 0 || !Array.isArray(items)) return;

    items.forEach((item) => {
      const cotizacionId = Number(item?.cotizacionId || 0);
      if (cotizacionId <= 0) return;
      out[cotizacionId] = {
        consultaOrigenId,
        baseCotizacionId,
        tipo: cotizacionId === baseCotizacionId ? "base" : "derivada",
      };
    });
  });

  return out;
}

function normalizarMetodoPagoResumen(value) {
  const v = String(value || "").toLowerCase().trim();
  if (!v) return "sin_pago";
  if (["tarjeta_debito", "tarjeta_credito", "visa", "mastercard"].includes(v)) return "tarjeta";
  if (["transferencia_bancaria", "transferencia bancaria"].includes(v)) return "transferencia";
  if (["efectivo", "yape", "plin", "transferencia", "tarjeta", "deposito", "cheque", "mixto", "sin_pago", "otros"].includes(v)) return v;
  return "otros";
}

function badgeMetodoPago(row) {
  const listaRaw = String(row?.metodos_pago_resumen || "").trim();
  const lista = listaRaw
    ? Array.from(new Set(
      listaRaw
        .split(",")
        .map((item) => normalizarMetodoPagoResumen(item))
        .filter((item) => item && item !== "sin_pago")
    ))
    : [];

  let resumen = normalizarMetodoPagoResumen(row?.metodo_pago_resumen || "");
  if (!row?.metodo_pago_resumen && lista.length > 0) {
    resumen = lista.length > 1 ? "mixto" : lista[0];
  }

  const map = {
    sin_pago: { cls: "bg-slate-100 text-slate-700", label: "Sin pago" },
    efectivo: { cls: "bg-emerald-100 text-emerald-700", label: "Efectivo" },
    yape: { cls: "bg-fuchsia-100 text-fuchsia-700", label: "Yape" },
    plin: { cls: "bg-sky-100 text-sky-700", label: "Plin" },
    transferencia: { cls: "bg-indigo-100 text-indigo-700", label: "Transferencia" },
    tarjeta: { cls: "bg-cyan-100 text-cyan-700", label: "Tarjeta" },
    deposito: { cls: "bg-teal-100 text-teal-700", label: "Deposito" },
    cheque: { cls: "bg-amber-100 text-amber-700", label: "Cheque" },
    mixto: { cls: "bg-violet-100 text-violet-700", label: "Mixto" },
    otros: { cls: "bg-gray-100 text-gray-700", label: "Otro" },
  };

  const base = map[resumen] || map.otros;
  const title = lista.length > 0
    ? `Pago registrado: ${lista.join(" + ")}`
    : (resumen === "sin_pago" ? "Sin abonos registrados" : `Pago registrado: ${base.label}`);

  return { ...base, title };
}

// ─── Fila de cotización memoizada ──────────────────────────────────────────────
// Solo re-renderiza cuando cambian los datos de la fila o los callbacks
const CotizacionRow = memo(function CotizacionRow({ row, onCobrar, onAnular, onNavigate, onPrintTicket, onSendWhatsApp, onToggleAnticipado, badgeEstado, labelEstado, anticipadoInfo, canAutorizarAnticipado, correlativoFechaAtencion, correlativosServicios, relacionSolicitud }) {
  const hcProximaProgramada = useMemo(() => esCotizacionHcProximaProgramada(row), [row]);
  const estadoRow = useMemo(() => {
    const estadoBase = String(row.estado || "").toLowerCase();
    const total = Number(row?.total || 0);
    const saldo = Number(row?.saldo_pendiente || 0);
    const pagado = Number(row?.total_pagado || 0);
    if (hcProximaProgramada && total <= 0.00001 && saldo <= 0.00001 && pagado <= 0.00001) {
      return "control";
    }
    return estadoBase;
  }, [hcProximaProgramada, row?.estado, row?.saldo_pendiente, row?.total, row?.total_pagado]);
  const numeroComprobante = String(row.numero_comprobante || "").trim();
  const vencimientoMeta = useMemo(() => getVencimientoMeta(row), [row]);
  const cotizacionVencida = Boolean(vencimientoMeta?.vencida);
  const esParticular = Number(row.paciente_id || 0) <= 0;
  const registroEval = useMemo(() => evaluarRegistroPaciente(row), [row]);
  const registroIncompleto = Boolean(Number(row?.registro_incompleto || 0) === 1 || registroEval.incompleto);
  const registroIncompletoTooltip = useMemo(
    () => textoMotivosRegistroIncompleto(registroEval.motivos),
    [registroEval.motivos]
  );
  const profesionalCabeceraRaw = String(row.profesional_cabecera || "").trim();
  const responsableClinico = String(row.responsable_clinico || profesionalCabeceraRaw || "").trim();
  const responsableLaboratorio = String(row.responsable_laboratorio || "").trim();
  const responsableFarmaciaArea = String(row.responsable_farmacia_area || "").trim();
  const profesionalesCount = Number(row.profesionales_count || (responsableClinico ? 1 : 0));
  const profesionalesExtra = Math.max(0, profesionalesCount - 1);
  const medicoAccentColor = useMemo(() => getMedicoAccentColor(responsableClinico), [responsableClinico]);
  const medicoAccentSoftBg = useMemo(() => getMedicoAccentSoftBg(responsableClinico), [responsableClinico]);
  const usuarioCotizoNombre = String(row.usuario_nombre || "-").trim() || "-";
  const usuarioCotizoRol = String(row.usuario_rol || row.rol_responsable || "").toLowerCase();
  const usuarioCotizoEsMedico = usuarioCotizoRol.includes("medico");
  const ultimoPagoMeta = useMemo(() => getUltimoPagoMeta(row.ultimo_pago_at), [row.ultimo_pago_at]);
  const correlativosServiciosList = useMemo(() => {
    if (!Array.isArray(correlativosServicios)) return [];
    return correlativosServicios
      .map((item) => ({
        servicio_tipo: normalizarServicioTipo(item?.servicio_tipo || ""),
        servicio_descripcion: formatServicioCorrelativoDetalle(item?.servicio_descripcion || ""),
        correlativo: Number(item?.correlativo || 0),
        fecha_atencion: String(item?.fecha_atencion || "").trim(),
        hora_atencion: String(item?.hora_atencion || "").trim(),
        unidad_token: String(item?.unidad_token || "").trim(),
      }))
      .filter((item) => item.servicio_tipo && item.correlativo > 0)
      .sort((a, b) => a.correlativo - b.correlativo);
  }, [correlativosServicios]);

  const citaProgramadaTexto = useMemo(() => {
    const consultaProgramada = correlativosServiciosList.find((item) => (
      item.servicio_tipo === "consulta" && String(item.fecha_atencion || "").trim() !== ""
    ));

    const primerEvento = consultaProgramada || correlativosServiciosList.find((item) => (
      String(item.fecha_atencion || "").trim() !== ""
    ));

    const fechaBase = String(primerEvento?.fecha_atencion || correlativoFechaAtencion || "").trim();
    if (!fechaBase) return "";

    const fechaTxt = formatCorrelativoFechaAtencion(fechaBase);
    const horaTxt = formatHoraAtencion(primerEvento?.hora_atencion || "");
    return horaTxt ? `Cita: ${fechaTxt} ${horaTxt}` : `Cita: ${fechaTxt}`;
  }, [correlativosServiciosList, correlativoFechaAtencion]);

  const servicios = useMemo(() => parseServiciosTipos(row.servicios_tipos || ""), [row.servicios_tipos]);

  const cotizacionPagada = ["pagado", "completado", "control", "contrato"].includes(estadoRow);
  const esGrupoEpisodio = Number(row?.es_grupo_episodio || 0) === 1 || Number(row?.adendas_count || 0) > 0;
  const grupoIncluyePagadas = Number(row?.grupo_incluye_pagadas || 0) === 1;
  const bloquearEdicionPorGrupoPagado = esGrupoEpisodio && grupoIncluyePagadas;
  const edicionBloqueada = cotizacionPagada || bloquearEdicionPorGrupoPagado;
  const tieneResultadosLaboratorio = Number(row.lab_completado) === 1 && servicios.includes("laboratorio");
  const puedeGestionarLaboratorioDesdeCotizacion = cotizacionPagada && servicios.includes("laboratorio") && Number(row.paciente_id || 0) > 0;
  const puedeAbrirLaboratorio = puedeGestionarLaboratorioDesdeCotizacion || tieneResultadosLaboratorio;
  const ordenLaboratorioId = Number(row.orden_laboratorio_id || 0);
  const ordenQuery = ordenLaboratorioId > 0 ? `&orden_id=${ordenLaboratorioId}` : "";
  const laboratorioUrl = `/documentos-paciente/${row.paciente_id}?cotizacion_id=${row.id}${ordenQuery}&back_to=/cotizaciones`;
  const laboratorioTitulo = tieneResultadosLaboratorio ? "Ver resultados de laboratorio" : "Gestionar resultados de laboratorio";
  const origen = useMemo(() => badgeOrigenVisual(row), [row]);
  const pagoBadge = useMemo(() => badgeMetodoPago(row), [row]);
  const contratosIds = String(row.contratos_ids_resumen || "").trim();
  const anulacionDesdeHC = useMemo(() => resolverAnulacionDesdeHC(row, servicios), [row, servicios]);
  const solicitudDesdeHC = useMemo(() => resolverSolicitudDesdeHC(row), [row]);
  const anticipadoActivo = Number(anticipadoInfo?.habilitacion_anticipada_activa || 0) === 1;
  const anticipadoEstado = String(anticipadoInfo?.estado_resumen || '').toLowerCase();
  const anticipadoMotivo = String(anticipadoInfo?.motivo || '').trim();
  const tieneVinculoOperativoExplicito = Number(anticipadoInfo?.vinculo_anticipado_valido || 0) === 1;
  const puedeGestionarAnticipado = canAutorizarAnticipado && tieneVinculoOperativoExplicito;

  // Handler HC separado con useCallback para evitar función anónima nueva en cada render
  const handleVerHC = useCallback(async (event) => {
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();

    let consultaId = Number(row.consulta_ref_id || 0);
    if (consultaId <= 0) {
      try {
        const resRef = await authFetch(
          `api_cotizaciones.php?cotizacion_id=${Number(row.id)}&_t=${Date.now()}`,
          { cache: "no-store" }
        );
        const dataRef = await resRef.json();
        consultaId = Number(dataRef?.cotizacion?.consulta_ref_id || 0);
        if (consultaId <= 0) {
          const detalleConsulta = Array.isArray(dataRef?.cotizacion?.detalles)
            ? dataRef.cotizacion.detalles.find((detalle) => (
              String(detalle?.servicio_tipo || '').trim().toLowerCase() === 'consulta'
              && Number(detalle?.consulta_id || 0) > 0
            ))
            : null;
          consultaId = Number(detalleConsulta?.consulta_id || 0);
        }
        if (consultaId <= 0) {
          const resConsulta = await authFetch(
            `api_consultas.php?cotizacion_id=${Number(row.id)}&_t=${Date.now()}`,
            { cache: 'no-store' }
          );
          const dataConsulta = await resConsulta.json();
          const consultaResuelta = Array.isArray(dataConsulta?.consultas) ? dataConsulta.consultas[0] : null;
          consultaId = Number(consultaResuelta?.id || 0);
        }
      } catch {
        consultaId = 0;
      }
    }
    if (consultaId > 0) {
      let consultaPacienteId = 0;
      try {
        const resValid = await authFetch(`api_consultas.php?consulta_id=${consultaId}&vista=hc_fast&_t=${Date.now()}`, {
          cache: 'no-store',
        });
        const dataValid = await resValid.json();
        const consultaValid = Array.isArray(dataValid?.consultas) ? dataValid.consultas[0] : null;
        consultaPacienteId = Number(consultaValid?.paciente_id || 0);
      } catch {
        consultaPacienteId = 0;
      }

      const pacienteFilaId = Number(row.paciente_id || 0);
      if (consultaPacienteId > 0 && pacienteFilaId > 0 && consultaPacienteId !== pacienteFilaId) {
        await Swal.fire({
          icon: 'warning',
          title: 'Vínculo clínico inconsistente',
          text: `La cotización #${Number(row.id)} apunta a una consulta de otro paciente (consulta #${consultaId}). Se bloqueó la apertura para evitar mezclar historias clínicas.`,
          confirmButtonText: 'Aceptar',
        });
        return;
      }

      onNavigate(`/historia-clinica-lectura/${row.paciente_id}/${consultaId}?back_to=/cotizaciones`);
    } else {
      await Swal.fire({
        icon: 'warning',
        title: 'No se encontró la consulta asociada',
        text: 'Esta cotización no tiene una atención clínica vinculada para abrir la HC en modo lectura.',
        confirmButtonText: 'Aceptar',
      });
    }
  }, [row.id, row.paciente_id, row.consulta_ref_id, onNavigate]);

  return (
    <tr
      className="border-t align-top"
      style={responsableClinico ? { borderLeft: `3px solid ${medicoAccentColor}` } : undefined}
    >
      <td className="px-3 py-2 font-semibold">
        <div>#{row.id}</div>
        {Number(row?.adendas_count || 0) > 0 && (
          <div className="text-[11px] text-indigo-700">+{Number(row.adendas_count)} adenda(s)</div>
        )}
        {numeroComprobante && (
          <div className="text-xs font-mono text-indigo-700">{numeroComprobante}</div>
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{row.fecha}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span
          className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold ${ultimoPagoMeta.className}`}
          title={ultimoPagoMeta.title}
        >
          {ultimoPagoMeta.label}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium">{row.nombre} {row.apellido}</div>
          {esParticular && (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-100 text-orange-700">
              Particular
            </span>
          )}
          {registroIncompleto && (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800" title={registroIncompletoTooltip}>
              Registro incompleto
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500">DNI: {row.dni || "-"} | HC: {row.historia_clinica || "-"}</div>
      </td>
      <td className="px-3 py-2">
        <span
          className={usuarioCotizoEsMedico ? "font-semibold" : undefined}
          style={usuarioCotizoEsMedico ? { color: medicoAccentColor } : undefined}
        >
          {usuarioCotizoNombre}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col items-start gap-1">
          {responsableClinico ? (
            <div className="inline-flex flex-wrap items-center gap-1 px-2 py-0.5 rounded-md" style={{ backgroundColor: medicoAccentSoftBg }}>
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: medicoAccentColor }}
                title={`Color asignado a ${responsableClinico}`}
              />
              <span className="font-semibold" style={{ color: medicoAccentColor }}>
                Clínico: {responsableClinico}
              </span>
              {profesionalesExtra > 0 && (
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-100 text-indigo-700"
                  title={`Esta atención incluye ${profesionalesCount} profesionales clínicos`}
                >
                  +{profesionalesExtra}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-500">Responsable: -</span>
          )}

          {responsableLaboratorio && (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
              Lab: {responsableLaboratorio}
            </span>
          )}

          {responsableFarmaciaArea && (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
              Farmacia: {responsableFarmaciaArea}
            </span>
          )}
          </div>
      </td>
      <td className="px-3 py-2 text-xs text-slate-600">
        <div className="flex flex-col gap-1 items-start">
          <span>{String(row.referencia_origen || "").trim() || "-"}</span>
          {relacionSolicitud?.baseCotizacionId > 0 && (
            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${relacionSolicitud.tipo === 'base' ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'}`}>
              {relacionSolicitud.tipo === 'base'
                ? `Base #${Number(relacionSolicitud.baseCotizacionId)}`
                : `Derivada de #${Number(relacionSolicitud.baseCotizacionId)}`}
            </span>
          )}
          {solicitudDesdeHC.activa && (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-100 text-cyan-800">
              Solicitud HC{relacionSolicitud?.baseCotizacionId > 0 && relacionSolicitud.tipo === 'derivada'
                ? ` · Derivada de #${Number(relacionSolicitud.baseCotizacionId)}`
                : ''}
            </span>
          )}
          {hcProximaProgramada && (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
              Próxima cita HC
            </span>
          )}
          {citaProgramadaTexto && (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
              {citaProgramadaTexto}
            </span>
          )}
          {anulacionDesdeHC.activa && (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-700">
              Anulada desde HC · {anulacionDesdeHC.detalle}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {servicios.length === 0 ? <span className="text-gray-400">-</span> : servicios.map((s) => (
            <span
              key={`${row.id}-${s}`}
              className="text-xs px-2 py-1 rounded"
              style={THEME_PRIMARY_SOFT}
              title="Servicio cotizado"
            >
              {estadoRow === "anulada" ? `${s} (anulada)` : s}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1 items-start">
          <span className={`px-2 py-1 rounded text-xs font-semibold ${origen.cls}`}>{origen.label}</span>
          {anulacionDesdeHC.activa && (
            <span className="px-2 py-1 rounded text-xs font-semibold bg-rose-100 text-rose-700">
              HC cancelada
            </span>
          )}
          {contratosIds && (
            <span className="text-[11px] text-slate-500">Contrato(s): {contratosIds}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right font-semibold">S/ {Number(row.total || 0).toFixed(2)}</td>
      <td className="px-3 py-2 text-right font-semibold">S/ {Number(row.saldo_pendiente ?? 0).toFixed(2)}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col items-start gap-1">
          <span className={`px-2 py-1 rounded text-xs font-semibold ${badgeEstado(estadoRow, row.pagado_con_descuento)}`}>
            {labelEstado({ ...row, estado: estadoRow })}
          </span>
          {vencimientoMeta && (
            <span
              className={`px-2 py-1 rounded text-xs font-semibold ${vencimientoMeta.className}`}
              title={vencimientoMeta.detail}
            >
              {vencimientoMeta.label}
            </span>
          )}
          {anticipadoActivo && (
            <span
              className="px-2 py-1 rounded text-xs font-semibold bg-orange-100 text-orange-800"
              title={anticipadoMotivo ? `Habilitación anticipada: ${anticipadoMotivo}` : 'Habilitación anticipada activa'}
            >
              Anticipado autorizado
            </span>
          )}
          {!anticipadoActivo && anticipadoEstado === 'revocado' && (
            <span className="px-2 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-600" title="Habilitación anticipada revocada">
              Anticipado revocado
            </span>
          )}
          {!anticipadoActivo && anticipadoEstado === 'expirada' && (
            <span className="px-2 py-1 rounded text-xs font-semibold bg-rose-100 text-rose-700" title="La habilitación anticipada venció">
              Anticipado vencido
            </span>
          )}
          {!anticipadoActivo && anticipadoEstado === 'regularizado' && (
            <span className="px-2 py-1 rounded text-xs font-semibold bg-emerald-100 text-emerald-800" title="Se habilitó de forma anticipada y luego quedó regularizado por pago">
              Anticipado regularizado
            </span>
          )}
          {!tieneVinculoOperativoExplicito && (estadoRow === 'pendiente' || estadoRow === 'parcial') && (
            <span
              className="px-2 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-600"
              title="Esta cotización no tiene vínculo operativo médico explícito, por eso no aplica habilitación anticipada"
            >
              Sin vínculo operativo
            </span>
          )}
          <span
            className={`lg:hidden px-2 py-1 rounded text-xs font-semibold ${pagoBadge.cls}`}
            title={pagoBadge.title}
          >
            Pago: {pagoBadge.label}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 hidden lg:table-cell">
        <span
          className={`px-2 py-1 rounded text-xs font-semibold ${pagoBadge.cls}`}
          title={pagoBadge.title}
        >
          {pagoBadge.label}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-2">
          {(() => {
            const idsGrupo = Array.isArray(row?.cotizacion_ids_grupo)
              ? row.cotizacion_ids_grupo.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
              : [];
            const detalleQuery = idsGrupo.length > 1 ? `?grupo=${idsGrupo.join(",")}` : "";
            return (
              <button
                onClick={() => onNavigate(`/cotizaciones/${row.id}/detalle${detalleQuery}`)}
                className={ACTION_BTN_BASE}
                style={THEME_OUTLINE}
                title={idsGrupo.length > 1 ? "Ver detalle consolidado del episodio" : "Ver detalle"}
                aria-label="Ver detalle"
              >
                <FiEye className="text-sm" />
              </button>
            );
          })()}
          {estadoRow === "informativo" && (
            <button
              onClick={() => onPrintTicket(row)}
              className={`${ACTION_BTN_BASE} bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200`}
              title="Emitir ticket"
              aria-label="Emitir ticket"
            >
              <FiPrinter className="text-sm" />
            </button>
          )}
          <button
            onClick={() => onSendWhatsApp(row)}
            className={`${ACTION_BTN_BASE} bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200`}
            title="Enviar resumen por WhatsApp"
            aria-label="Enviar resumen por WhatsApp"
          >
            <FiMessageCircle className="text-sm" />
          </button>
          {puedeAbrirLaboratorio && (
            <button
              onClick={() => onNavigate(laboratorioUrl)}
              className={`${ACTION_BTN_BASE} ${tieneResultadosLaboratorio ? 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200'}`}
              title={laboratorioTitulo}
              aria-label={laboratorioTitulo}
            >
              <FiFileText className="text-sm" />
            </button>
          )}
          {Number(row.paciente_id || 0) > 0 && servicios.includes('consulta') && (
            <button
              onClick={handleVerHC}
              className={`${ACTION_BTN_BASE} bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-200`}
              title="Ver Historia Clínica"
              aria-label="Ver Historia Clínica"
            >
              <FiBookOpen className="text-sm" />
            </button>
          )}
          {["pagado", "completado", "control", "contrato"].includes(estadoRow) && tieneServicioImagen(servicios) && (
            <button
              onClick={() => onNavigate(`/imagenes-paciente/${row.paciente_id}?cotizacion_id=${row.id}`)}
              className={`${ACTION_BTN_BASE} bg-sky-100 text-sky-700 border-sky-200 hover:bg-sky-200`}
              title="Subir / ver imágenes"
              aria-label="Subir / ver imágenes"
            >
              <FiCamera className="text-sm" />
            </button>
          )}
          {(estadoRow === "pendiente" || estadoRow === "parcial") && (
            <button
              disabled={cotizacionVencida}
              onClick={() => onCobrar(row)}
              className={`${ACTION_BTN_BASE} ${cotizacionVencida ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'}`}
              title={cotizacionVencida ? 'Cotización vencida' : 'Cobrar (unificado si aplica)'}
              aria-label="Cobrar"
            >
              <FiDollarSign className="text-sm" />
            </button>
          )}
          {registroIncompleto && Number(row.paciente_id || 0) > 0 && (
            <button
              onClick={() => onNavigate("/pacientes", {
                state: {
                  openEditPacienteId: Number(row.paciente_id || 0),
                  backTo: "/cotizaciones?filtro_hc=solo_incompleto",
                  sourceCotizacionId: Number(row.id || 0),
                },
              })}
              className={`${ACTION_BTN_BASE} bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200`}
              title="Completar ficha de paciente"
              aria-label="Completar ficha de paciente"
            >
              <span className="text-[10px] font-bold">Ficha</span>
            </button>
          )}
          {canAutorizarAnticipado && (estadoRow === "pendiente" || estadoRow === "parcial") && (
            <button
              disabled={!puedeGestionarAnticipado}
              onClick={() => onToggleAnticipado(row)}
              className={`${ACTION_BTN_BASE} ${!puedeGestionarAnticipado ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60' : (anticipadoActivo ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200' : 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200')}`}
              title={
                !puedeGestionarAnticipado
                  ? 'Sin vínculo operativo explícito: no se puede habilitar anticipado'
                  : (anticipadoActivo ? 'Revocar habilitación anticipada' : 'Habilitar atención anticipada')
              }
              aria-label={
                !puedeGestionarAnticipado
                  ? 'Sin vínculo operativo explícito'
                  : (anticipadoActivo ? 'Revocar habilitación anticipada' : 'Habilitar atención anticipada')
              }
            >
              <span className="text-sm font-bold">⚡</span>
            </button>
          )}
          {estadoRow !== "anulada" && (
            <button
              // Edicion deshabilitada para cotizaciones pagadas y episodios agrupados con pagos.
              disabled={edicionBloqueada}
              onClick={() => {
                if (edicionBloqueada) return;
                const pacienteId = Number(row?.paciente_id || 0);
                const nombre = String(row?.nombre || "").trim();
                const apellido = String(row?.apellido || "").trim();
                const dni = String(row?.dni || "").trim();
                const pacienteTemporal = pacienteId <= 0
                  ? {
                      nombre: [nombre, apellido].filter(Boolean).join(" ").trim() || "Particular",
                      apellido: "",
                      dni,
                    }
                  : null;

                onNavigate(
                  `/seleccionar-servicio?paciente_id=${pacienteId}&cotizacion_id=${row.id}&back_to=/cotizaciones&modo=editar`,
                  {
                    state: {
                      pacienteId,
                      cotizacionId: Number(row?.id || 0),
                      backTo: "/cotizaciones",
                      modo: "editar",
                      ...(pacienteTemporal ? { pacienteTemporal } : {}),
                    },
                  }
                );
              }}
              className={`${ACTION_BTN_BASE} ${edicionBloqueada ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50' : ''}`}
              style={edicionBloqueada ? {} : THEME_OUTLINE}
              title={
                cotizacionPagada
                  ? 'No se puede editar una cotización pagada'
                  : (bloquearEdicionPorGrupoPagado
                    ? 'Este episodio agrupado incluye cotizaciones pagadas. Gestiona cambios como adenda desde la atención vigente.'
                    : 'Editar cotización')
              }
              aria-label="Editar cotización"
            >
              <FiEdit2 className="text-sm" />
            </button>
          )}
          {estadoRow !== "anulada" && (
            <button
              onClick={() => onAnular(row)}
              className={`${ACTION_BTN_BASE} bg-red-100 text-red-700 border-red-200 hover:bg-red-200`}
              title="Anular"
              aria-label="Anular"
            >
              <FiSlash className="text-sm" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

export default function CotizacionesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const autoAnularRef = useRef(false);
  const abortRef = useRef(null);
  const anticipadoFetchIdRef = useRef(0);
  const anticipadoIdsKeyRef = useRef("");
  const initialLimit = (() => {
    try {
      const stored = Number(window.localStorage.getItem(COTIZACIONES_LIMIT_STORAGE_KEY) || 10);
      return [10, 20, 50].includes(stored) ? stored : 10;
    } catch {
      return 10;
    }
  })();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialLimit);
  const [clinicBrand, setClinicBrand] = useState({
    nombre: "MI CLINICA",
    logo: "",
    direccion: "",
    telefono: "",
    celular: "",
    ruc: "",
    slogan: "",
    slogan_color: "",
    nombre_color: "",
    email: "",
  });

  const [qInput, setQInput] = useState("");
  const [estadoInput, setEstadoInput] = useState("");
  const [fechaInicioInput, setFechaInicioInput] = useState("");
  const [fechaFinInput, setFechaFinInput] = useState("");
  const [filtroSolicitudHC, setFiltroSolicitudHC] = useState("todas");
  const [rolReporte, setRolReporte] = useState("todos");
  const [usuarioReporte, setUsuarioReporte] = useState("");
  const [usuariosCatalogo, setUsuariosCatalogo] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [filtrosAplicados, setFiltrosAplicados] = useState({
    q: "",
    estado: "",
    fechaInicio: "",
    fechaFin: "",
  });
  
  const [anticipadoByCotizacion, setAnticipadoByCotizacion] = useState({});
  const [canAutorizarAnticipado, setCanAutorizarAnticipado] = useState(false);
  const [correlativoByConsultaId, setCorrelativoByConsultaId] = useState({});
  const [correlativoImagenByCotizacionId, setCorrelativoImagenByCotizacionId] = useState({});
  const [correlativosImagenDetalleByCotizacionId, setCorrelativosImagenDetalleByCotizacionId] = useState({});
  const [correlativoFechaByConsultaId, setCorrelativoFechaByConsultaId] = useState({});
  const [correlativoFechaImagenByCotizacionId, setCorrelativoFechaImagenByCotizacionId] = useState({});


  const cargarEstadosAnticipados = useCallback(async (rowsInput, options = {}) => {
    const force = Boolean(options?.force);
    const fetchId = ++anticipadoFetchIdRef.current;
    const ids = Array.from(new Set((rowsInput || []).map((row) => Number(row?.id || 0)).filter((id) => id > 0)));
    const idsKey = ids.join(",");
    if (ids.length === 0) {
      if (fetchId !== anticipadoFetchIdRef.current) return;
      anticipadoIdsKeyRef.current = "";
      setAnticipadoByCotizacion({});
      setCanAutorizarAnticipado(false);
      return;
    }
    if (!force && idsKey === anticipadoIdsKeyRef.current) {
      return;
    }

    anticipadoIdsKeyRef.current = idsKey;

    try {
      const res = await authFetch(`api_consultas.php?vista=anticipada&cotizacion_ids=${ids.join(',')}&_t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (fetchId !== anticipadoFetchIdRef.current) return;
      if (!data?.success) {
        setAnticipadoByCotizacion({});
        setCanAutorizarAnticipado(false);
        return;
      }
      setAnticipadoByCotizacion(data?.estados && typeof data.estados === 'object' ? data.estados : {});
      setCanAutorizarAnticipado(Boolean(data?.puede_autorizar));
    } catch {
      if (fetchId !== anticipadoFetchIdRef.current) return;
      setAnticipadoByCotizacion({});
      setCanAutorizarAnticipado(false);
    }
  }, []);

  const cargar = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      params.set("include_detalles", "0");
      if (filtrosAplicados.q.trim()) params.set("q", filtrosAplicados.q.trim());
      if (filtrosAplicados.estado) params.set("estado", filtrosAplicados.estado);
      if (filtrosAplicados.fechaInicio && filtrosAplicados.fechaFin) {
        params.set("fecha_inicio", filtrosAplicados.fechaInicio);
        params.set("fecha_fin", filtrosAplicados.fechaFin);
      }
      if (filtroSolicitudHC === "solo_incompleto") {
        params.set("registro_incompleto", "1");
      }

      const res = await authFetch(`api_cotizaciones.php?${params.toString()}&_t=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo cargar cotizaciones");
      }
      const rowsData = Array.isArray(data.cotizaciones) ? data.cotizaciones : [];
      setRows(rowsData);
      setTotal(Number(data.total || 0));
      void cargarEstadosAnticipados(rowsData);
    } catch (error) {
      if (error?.name === "AbortError") return;
      Swal.fire("Error", error?.message || "No se pudo cargar la lista", "error");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [cargarEstadosAnticipados, filtroSolicitudHC, filtrosAplicados, limit, page]);

  const toggleAnticipado = useCallback(async (row) => {
    const cotizacionId = Number(row?.id || 0);
    if (cotizacionId <= 0) return;

    const info = anticipadoByCotizacion[String(cotizacionId)] || anticipadoByCotizacion[cotizacionId] || {};
    const activo = Number(info?.habilitacion_anticipada_activa || 0) === 1;

    let payload = {
      accion: activo ? 'revocar_anticipado' : 'habilitar_anticipado',
      cotizacion_id: cotizacionId,
    };

    if (activo) {
      const confirm = await Swal.fire({
        icon: 'warning',
        title: 'Revocar habilitación anticipada',
        text: 'La atención volverá a quedar bloqueada por pago pendiente.',
        showCancelButton: true,
        confirmButtonText: 'Revocar',
        cancelButtonText: 'Cancelar',
      });
      if (!confirm.isConfirmed) return;
    } else {
      const { value: motivo } = await Swal.fire({
        title: 'Habilitar atención anticipada',
        input: 'text',
        inputLabel: 'Motivo obligatorio',
        inputPlaceholder: 'Ej: Urgencia clínica, completar procedimiento previo al cobro',
        showCancelButton: true,
        confirmButtonText: 'Habilitar',
        cancelButtonText: 'Cancelar',
        inputValidator: (value) => {
          if (!value || !value.trim()) return 'El motivo es obligatorio';
          if (value.trim().length < 5) return 'Mínimo 5 caracteres';
          return undefined;
        },
      });
      if (!motivo) return;
      payload = {
        ...payload,
        motivo: motivo.trim(),
        vence_horas: 24,
      };
    }

    try {
      const res = await authFetch('api_consultas.php', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || 'No se pudo actualizar habilitación anticipada');
      }
      await cargarEstadosAnticipados(rows, { force: true });
      await Swal.fire('Listo', activo ? 'Habilitación anticipada revocada' : 'Habilitación anticipada activada', 'success');
    } catch (error) {
      await Swal.fire('Error', error?.message || 'No se pudo actualizar habilitación anticipada', 'error');
    }
  }, [anticipadoByCotizacion, cargarEstadosAnticipados, rows]);

  const abrirCobro = useCallback(async (row) => {
    const baseId = Number(row?.id || 0);
    if (baseId <= 0) return;

    let ids = Array.from(new Set((Array.isArray(row?.cotizacion_ids_grupo) ? row.cotizacion_ids_grupo : [baseId])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)));
    if (ids.length === 0) ids = [baseId];
    try {
      const res = await authFetch(`api_cotizaciones.php?accion=sugerir_grupo_cobro&cotizacion_id=${baseId}&_t=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.success && Array.isArray(data.ids)) {
        const sugeridos = Array.from(new Set(data.ids.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)));
        if (sugeridos.length > 0) {
          ids = sugeridos;
        }
      }
    } catch {
      ids = [baseId];
    }

    const targetId = Number(ids[0] || baseId);
    const query = ids.length > 1 ? `?ids=${ids.join(",")}` : "";
    navigate(`/cobrar-cotizacion/${targetId}${query}`);
  }, [navigate]);



  useEffect(() => {
    cargar();
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [cargar]);

  useEffect(() => {
    const out = {};
    const outFecha = {};

    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const consultaId = Number(row?.consulta_ref_id || 0);
      if (consultaId <= 0) return;

      const correlativoDirecto = Number(row?.consulta_ref_correlativo_dia_medico || 0);
      const fechaDirecta = String(row?.consulta_ref_fecha || "").trim();
      if (correlativoDirecto > 0) {
        out[consultaId] = correlativoDirecto;
        if (fechaDirecta) outFecha[consultaId] = fechaDirecta;
        return;
      }

      const correlativosServiciosApi = Array.isArray(row?.correlativos_operativos_servicios)
        ? row.correlativos_operativos_servicios
        : [];
      const itemConsulta = correlativosServiciosApi
        .map((item) => ({
          servicio_tipo: normalizarServicioTipo(item?.servicio_tipo || ""),
          correlativo: Number(item?.correlativo || 0),
          fecha_atencion: String(item?.fecha_atencion || "").trim(),
        }))
        .filter((item) => item.servicio_tipo === "consulta" && item.correlativo > 0)
        .sort((a, b) => a.correlativo - b.correlativo)[0];

      if (itemConsulta) {
        out[consultaId] = itemConsulta.correlativo;
        if (itemConsulta.fecha_atencion) outFecha[consultaId] = itemConsulta.fecha_atencion;
      }
    });

    setCorrelativoByConsultaId(out);
    setCorrelativoFechaByConsultaId(outFecha);
  }, [rows]);

  useEffect(() => {
    const out = {};
    const outDetalle = {};
    const outFecha = {};

    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const cotizacionId = Number(row?.id || 0);
      if (cotizacionId <= 0) return;

      const correlativosServiciosApi = Array.isArray(row?.correlativos_operativos_servicios)
        ? row.correlativos_operativos_servicios
        : [];

      const candidatos = correlativosServiciosApi
        .map((item) => ({
          servicio_tipo: normalizarServicioTipo(item?.servicio_tipo || ""),
          correlativo: Number(item?.correlativo || 0),
          fecha: String(item?.fecha_atencion || "").trim(),
          hora: String(item?.hora_atencion || "").trim(),
          id: Number(item?.agenda_id || item?.cotizacion_detalle_id || 0),
          unidad_token: String(item?.unidad_token || "").trim(),
        }))
        .filter((item) => SERVICIOS_IMAGEN.has(item.servicio_tipo) && item.correlativo > 0)
        .sort((a, b) => {
          if (a.correlativo !== b.correlativo) return a.correlativo - b.correlativo;
          const fa = (a.fecha || "").slice(0, 10);
          const fb = (b.fecha || "").slice(0, 10);
          if (fa !== fb) return fa.localeCompare(fb);
          const ha = (a.hora || "").slice(0, 5);
          const hb = (b.hora || "").slice(0, 5);
          if (ha !== hb) return ha.localeCompare(hb);
          return a.id - b.id;
        });

      if (candidatos.length > 0) {
        out[cotizacionId] = candidatos[0].correlativo;
        outFecha[cotizacionId] = candidatos[0].fecha;
        outDetalle[cotizacionId] = candidatos;
      }
    });

    setCorrelativoImagenByCotizacionId(out);
    setCorrelativosImagenDetalleByCotizacionId(outDetalle);
    setCorrelativoFechaImagenByCotizacionId(outFecha);
  }, [rows]);

  useEffect(() => {
    let mounted = true;

    const applyCachedBrand = () => {
      try {
        const raw = sessionStorage.getItem(BRAND_CACHE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        const ts = Number(parsed?.ts || 0);
        const payload = parsed?.data;
        if (!payload || !ts || (Date.now() - ts) > BRAND_CACHE_TTL_MS) {
          sessionStorage.removeItem(BRAND_CACHE_KEY);
          return false;
        }
        if (mounted) setClinicBrand(payload);
        return true;
      } catch {
        return false;
      }
    };

    if (applyCachedBrand()) {
      return () => {
        mounted = false;
      };
    }

    authFetch("api_get_configuracion.php", { method: "GET", cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!mounted || !data?.success) return;
        const brand = buildBrandFromConfig(data.data || {});
        setClinicBrand(brand);
        try {
          sessionStorage.setItem(BRAND_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: brand }));
        } catch {
          // Ignore cache write issues
        }
      })
      .catch(() => {
        // keep defaults
      });

    return () => {
      mounted = false;
    };
  }, []);

  const rowsVisibles = useMemo(() => {
    const base = Array.isArray(rows) ? rows : [];
    if (filtroSolicitudHC === "solo_hc") {
      return base.filter((row) => resolverSolicitudDesdeHC(row).activa);
    }
    if (filtroSolicitudHC === "solo_incompleto") {
      return base.filter((row) => {
        const apiFlag = Number(row?.registro_incompleto || 0) === 1;
        if (apiFlag) return true;
        return evaluarRegistroPaciente(row).incompleto;
      });
    }
    return base;
  }, [rows, filtroSolicitudHC]);

  const rowsOperativos = useMemo(() => agruparFilasOperativasPorEpisodio(rowsVisibles), [rowsVisibles]);

  const relacionSolicitudByCotizacion = useMemo(() => construirRelacionPorCotizacion(rowsOperativos), [rowsOperativos]);

  useEffect(() => {
    if (rolReporte === "todos") {
      return undefined;
    }
    if (Array.isArray(usuariosCatalogo) && usuariosCatalogo.length > 0) {
      return undefined;
    }

    let mounted = true;

    const cargarUsuarios = async () => {
      try {
        const res = await authFetch(`api_usuarios.php?_t=${Date.now()}`, { cache: "no-store" });
        const data = await res.json();
        if (!mounted) return;
        const rows = Array.isArray(data) ? data : [];
        const activos = rows.filter((u) => Number(u?.activo ?? 1) === 1);
        setUsuariosCatalogo(activos);
      } catch {
        if (!mounted) return;
        setUsuariosCatalogo([]);
      }
    };

    cargarUsuarios();
    return () => {
      mounted = false;
    };
  }, [rolReporte, usuariosCatalogo]);

  const usuariosFiltradosReporte = useMemo(() => {
    const rol = String(rolReporte || "todos").toLowerCase();
    if (rol === "todos") return [];

    return usuariosCatalogo.filter((u) => {
      const r = String(u?.rol || "").toLowerCase().trim();
      if (rol === "admin") return r === "admin" || r === "administrador";
      if (rol === "recepcion") return r.includes("recep");
      return false;
    });
  }, [rolReporte, usuariosCatalogo]);

  useEffect(() => {
    if (rolReporte === "todos") {
      if (usuarioReporte !== "") setUsuarioReporte("");
      return;
    }

    if (!usuarioReporte) return;
    const stillExists = usuariosFiltradosReporte.some((u) => String(u.id) === String(usuarioReporte));
    if (!stillExists) {
      setUsuarioReporte("");
    }
  }, [rolReporte, usuarioReporte, usuariosFiltradosReporte]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  useEffect(() => {
    const nextQ = String(qInput || "");
    const appliedQ = String(filtrosAplicados.q || "");
    if (nextQ === appliedQ) return undefined;

    const trimmed = nextQ.trim();
    if (trimmed !== "" && trimmed.length < 3) return undefined;

    const timer = setTimeout(() => {
      setPage(1);
      setFiltrosAplicados((prev) => {
        if (String(prev.q || "") === nextQ) return prev;
        return {
          ...prev,
          q: nextQ,
        };
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [qInput, filtrosAplicados.q]);

  const filtrar = () => {
    const next = {
      q: qInput,
      estado: estadoInput,
      fechaInicio: fechaInicioInput,
      fechaFin: fechaFinInput,
    };

    const unchanged = (
      String(filtrosAplicados.q || "") === String(next.q || "")
      && String(filtrosAplicados.estado || "") === String(next.estado || "")
      && String(filtrosAplicados.fechaInicio || "") === String(next.fechaInicio || "")
      && String(filtrosAplicados.fechaFin || "") === String(next.fechaFin || "")
    );

    if (page !== 1) setPage(1);
    if (!unchanged) {
      setFiltrosAplicados(next);
    }
  };

  const aplicarRangoDias = (dias) => {
    const fin = new Date();
    const inicio = new Date(fin);
    inicio.setDate(fin.getDate() - (dias - 1));

    const inicioStr = formatDateInput(inicio);
    const finStr = formatDateInput(fin);

    setFechaInicioInput(inicioStr);
    setFechaFinInput(finStr);
    setPage(1);
    setFiltrosAplicados((prev) => ({
      ...prev,
      fechaInicio: inicioStr,
      fechaFin: finStr,
    }));
  };

  const mostrarTodo = () => {
    setFechaInicioInput("");
    setFechaFinInput("");
    setPage(1);
    setFiltrosAplicados((prev) => ({
      ...prev,
      fechaInicio: "",
      fechaFin: "",
    }));
  };

  const limpiarFiltros = () => {
    setQInput("");
    setEstadoInput("");
    setFechaInicioInput("");
    setFechaFinInput("");
    setFiltroSolicitudHC("todas");
    setPage(1);
    setFiltrosAplicados({
      q: "",
      estado: "",
      fechaInicio: "",
      fechaFin: "",
    });
  };

  const construirParamsReporte = useCallback(() => {
    const params = new URLSearchParams();
    params.set("accion", "reporte_atenciones_detallado");

    const q = String(qInput || filtrosAplicados.q || "").trim();
    const estado = String(estadoInput || filtrosAplicados.estado || "").trim();
    let fechaInicio = String(fechaInicioInput || filtrosAplicados.fechaInicio || "").trim();
    let fechaFin = String(fechaFinInput || filtrosAplicados.fechaFin || "").trim();

    if (fechaInicio && !fechaFin) fechaFin = fechaInicio;
    if (fechaFin && !fechaInicio) fechaInicio = fechaFin;

    if (q) params.set("q", q);
    if (estado) params.set("estado", estado);
    if (fechaInicio && fechaFin) {
      params.set("fecha_inicio", fechaInicio);
      params.set("fecha_fin", fechaFin);
    }
    params.set("rol", rolReporte || "todos");
    if (rolReporte !== "todos" && String(usuarioReporte || "").trim() !== "") {
      params.set("usuario_id", String(usuarioReporte));
    }

    return params;
  }, [estadoInput, fechaFinInput, fechaInicioInput, filtrosAplicados.estado, filtrosAplicados.fechaFin, filtrosAplicados.fechaInicio, filtrosAplicados.q, qInput, rolReporte, usuarioReporte]);

  const obtenerReporteAtenciones = useCallback(async ({ expandirMetodosPago = true } = {}) => {
    const params = construirParamsReporte();
    params.set("expandir_metodos_pago", expandirMetodosPago ? "1" : "0");
    const res = await authFetch(`api_cotizaciones.php?${params.toString()}&_t=${Date.now()}`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!data?.success) {
      throw new Error(data?.error || "No se pudo generar el reporte");
    }
    return data;
  }, [construirParamsReporte]);

  const exportarExcelAtenciones = useCallback(async () => {
    setExporting(true);
    try {
      const data = await obtenerReporteAtenciones({ expandirMetodosPago: false });
      const detalle = Array.isArray(data?.detalle) ? data.detalle : [];
      const resumen = Array.isArray(data?.resumen_por_rol) ? data.resumen_por_rol : [];
      const filtros = data?.filtros || {};
      const usuarioSeleccionado = usuariosCatalogo.find((u) => String(u.id) === String(filtros.usuario_id || ""));
      const usuarioNombre = String(usuarioSeleccionado?.nombre || "").trim();

      if (detalle.length === 0) {
        await Swal.fire(
          "Sin filas para exportar",
          `No hay atenciones para el filtro seleccionado. Rol: ${filtros.rol || "todos"} | Usuario: ${usuarioNombre || (filtros.usuario_id ? `ID ${filtros.usuario_id}` : "todos")} | Rango: ${filtros.fecha_inicio || "-"} a ${filtros.fecha_fin || "-"}`,
          "info"
        );
        return;
      }

      const wb = XLSX.utils.book_new();

      const resumenRows = await mapInChunks(resumen, (row) => ({
        Rol: row.rol || "-",
        Cotizaciones: Number(row.cantidad_cotizaciones || 0),
        "Total cotizado": Number(row.total_cotizado || 0),
        "Total pagado": Number(row.total_pagado || 0),
        Saldo: Number(row.saldo_pendiente || 0),
      }), 300);

      const detalleRows = await mapInChunks(detalle, (row) => ({
        Fecha: row.fecha ? new Date(row.fecha).toLocaleString("es-PE") : "-",
        "ID cotizacion": row.cotizacion_id,
        Estado: row.estado || "-",
        Paciente: row.paciente || "-",
        DNI: row.dni || "-",
        HC: row.historia_clinica || "-",
        Rol: row.rol_responsable || "-",
        "Usuario responsable": row.usuario_responsable || "-",
        "Tipo servicio": row.servicio_tipo || "-",
        Servicio: row.servicio_descripcion || "-",
        Cantidad: Number(row.cantidad || 0),
        "Precio unitario": Number(row.precio_unitario || 0),
        "Subtotal servicio": Number(row.subtotal_servicio || 0),
        "Pago resumen": formatMetodoPagoLabel(row.tipo_pago_resumen),
        "Tipo de pago": formatMetodoPagoLabel(row.tipo_pago),
        "Monto tipo pago": Number(row.monto_tipo_pago || 0),
        "Total cotizacion": Number(row.total_cotizacion || 0),
        "Total pagado": Number(row.total_pagado || 0),
        "Saldo pendiente": Number(row.saldo_pendiente || 0),
      }), 500);

      const wsFiltros = XLSX.utils.aoa_to_sheet([
        ["Filtro", "Valor"],
        ["Fecha inicio", filtros.fecha_inicio || ""],
        ["Fecha fin", filtros.fecha_fin || ""],
        ["Rol", filtros.rol || "todos"],
        ["Usuario", usuarioNombre || (filtros.usuario_id ? `ID ${filtros.usuario_id}` : "todos")],
        ["Estado", filtros.estado || "todos"],
        ["Busqueda", filtros.q || ""],
      ]);
      const wsResumen = XLSX.utils.json_to_sheet(resumenRows.length ? resumenRows : [{ Rol: "Sin datos" }]);
      const wsDetalle = XLSX.utils.json_to_sheet(detalleRows.length ? detalleRows : [{ Estado: "Sin datos" }]);

      // Excel abre la primera hoja del libro; ponemos Detalle primero para mostrar filas al abrir.
      XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle");
      XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
      XLSX.utils.book_append_sheet(wb, wsFiltros, "Filtros");

      const fechaEtiqueta = `${formatDateShort(filtros.fecha_inicio)}_a_${formatDateShort(filtros.fecha_fin)}`;
      const rolEtiqueta = String(filtros.rol || "todos").toLowerCase();
      XLSX.writeFile(wb, `reporte_atenciones_${rolEtiqueta}_${fechaEtiqueta}.xlsx`);
    } catch (error) {
      Swal.fire("Error", error?.message || "No se pudo exportar a Excel", "error");
    } finally {
      setExporting(false);
    }
  }, [obtenerReporteAtenciones, usuariosCatalogo]);

  const exportarPdfAtenciones = useCallback(async () => {
    setExporting(true);
    try {
      const data = await obtenerReporteAtenciones({ expandirMetodosPago: false });
      const detalle = Array.isArray(data?.detalle) ? data.detalle : [];
      const resumen = Array.isArray(data?.resumen_por_rol) ? data.resumen_por_rol : [];
      const filtros = data?.filtros || {};
      const usuarioSeleccionado = usuariosCatalogo.find((u) => String(u.id) === String(filtros.usuario_id || ""));
      const usuarioNombre = String(usuarioSeleccionado?.nombre || "").trim();

      if (detalle.length === 0) {
        await Swal.fire(
          "Sin filas para exportar",
          `No hay atenciones para el filtro seleccionado. Rol: ${filtros.rol || "todos"} | Usuario: ${usuarioNombre || (filtros.usuario_id ? `ID ${filtros.usuario_id}` : "todos")} | Rango: ${filtros.fecha_inicio || "-"} a ${filtros.fecha_fin || "-"}`,
          "info"
        );
        return;
      }

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(13);
      doc.text("Reporte de Atenciones por Rol", 40, 34);
      doc.setFontSize(9);
      doc.text(
        `Rango: ${filtros.fecha_inicio || "-"} a ${filtros.fecha_fin || "-"} | Rol: ${filtros.rol || "todos"} | Usuario: ${usuarioNombre || (filtros.usuario_id ? `ID ${filtros.usuario_id}` : "todos")} | Estado: ${filtros.estado || "todos"}`,
        40,
        52
      );

      const resumenBody = await mapInChunks(
        (resumen.length ? resumen : [{ rol: "Sin datos", cantidad_cotizaciones: 0, total_cotizado: 0, total_pagado: 0, saldo_pendiente: 0 }]),
        (row) => ([
          row.rol || "-",
          Number(row.cantidad_cotizaciones || 0),
          `S/ ${Number(row.total_cotizado || 0).toFixed(2)}`,
          `S/ ${Number(row.total_pagado || 0).toFixed(2)}`,
          `S/ ${Number(row.saldo_pendiente || 0).toFixed(2)}`,
        ]),
        300
      );

      autoTable(doc, {
        startY: 62,
        head: [["Rol", "Cotizaciones", "Total cotizado", "Total pagado", "Saldo"]],
        body: resumenBody,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [35, 88, 175] },
      });

      const detalleBody = await mapInChunks(
        (detalle.length ? detalle : [{ fecha: "", cotizacion_id: "", paciente: "Sin datos", rol_responsable: "", usuario_responsable: "", servicio_descripcion: "", subtotal_servicio: 0, tipo_pago: "sin_pago", monto_tipo_pago: 0, total_cotizacion: 0, saldo_pendiente: 0 }]),
        (row) => ([
          row.fecha ? new Date(row.fecha).toLocaleString("es-PE") : "-",
          `#${row.cotizacion_id || "-"}`,
          row.paciente || "-",
          row.rol_responsable || "-",
          row.usuario_responsable || "-",
          row.servicio_descripcion || "-",
          `S/ ${Number(row.subtotal_servicio || 0).toFixed(2)}`,
          formatMetodoPagoLabel(row.tipo_pago),
          `S/ ${Number(row.monto_tipo_pago || 0).toFixed(2)}`,
          `S/ ${Number(row.total_cotizacion || 0).toFixed(2)}`,
          `S/ ${Number(row.saldo_pendiente || 0).toFixed(2)}`,
        ]),
        500
      );

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 12,
        head: [["Fecha", "Cot", "Paciente", "Rol", "Usuario", "Servicio", "Subtotal", "Pago", "Monto pago", "Total", "Saldo"]],
        body: detalleBody,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [31, 41, 55] },
      });

      const fechaEtiqueta = `${formatDateShort(filtros.fecha_inicio)}_a_${formatDateShort(filtros.fecha_fin)}`;
      const rolEtiqueta = String(filtros.rol || "todos").toLowerCase();
      doc.save(`reporte_atenciones_${rolEtiqueta}_${fechaEtiqueta}.pdf`);
    } catch (error) {
      Swal.fire("Error", error?.message || "No se pudo exportar a PDF", "error");
    } finally {
      setExporting(false);
    }
  }, [obtenerReporteAtenciones, usuariosCatalogo]);

  const badgeEstado = (value, pagadoConDescuento = 0) => {
    const st = String(value || "").toLowerCase();
    if (st === "pagado" && Number(pagadoConDescuento || 0) === 1) return "bg-emerald-100 text-emerald-800";
    if (st === "pagado") return "bg-green-100 text-green-700";
    if (st === "parcial") return "bg-amber-100 text-amber-700";
    if (st === "informativo") return "bg-slate-100 text-slate-700";
    if (st === "control" || st === "contrato") return "bg-sky-100 text-sky-700";
    if (st === "anulada") return "bg-red-100 text-red-700";
    return "bg-blue-100 text-blue-700";
  };

  const labelEstado = (row) => {
    const st = String(row?.estado || "").toLowerCase();
    if (st === "pagado" && Number(row?.pagado_con_descuento || 0) === 1) return "pagado con descuento";
    if (st === "informativo") return "informativo";
    return row?.estado;
  };

  const anularCotizacion = useCallback(async (cotizacion) => {
    const { value: motivo } = await Swal.fire({
      title: `Anular cotización #${cotizacion.id}`,
      input: "text",
      inputLabel: "Motivo de anulación",
      inputPlaceholder: "Escribe el motivo",
      showCancelButton: true,
      confirmButtonText: "Anular",
      cancelButtonText: "Cancelar",
      inputValidator: (value) => {
        if (!value || !value.trim()) return "Motivo obligatorio";
        if (value.trim().length < 4) return "Mínimo 4 caracteres";
        return undefined;
      },
    });

    if (!motivo) return;

    try {
      const res = await authFetch("api_cotizaciones.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "anular",
          cotizacion_id: Number(cotizacion.id),
          motivo: motivo.trim(),
        }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo anular");
      Swal.fire("Listo", "Cotización anulada", "success");
      await cargar();
    } catch (error) {
      Swal.fire("Error", error?.message || "No se pudo anular", "error");
    }
  }, [cargar]);

  const imprimirTicketDirecto = useCallback(async (row) => {
    try {
      const cotizacionId = Number(row?.id || 0);
      if (cotizacionId <= 0) return;

      const res = await authFetch(`api_cotizaciones.php?cotizacion_id=${cotizacionId}&_t=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data?.success || !data?.cotizacion) {
        throw new Error(data?.error || "No se pudo obtener la cotización para imprimir.");
      }

      const cot = data.cotizacion;
      const detalles = Array.isArray(cot.detalles) ? cot.detalles : [];
      const fecha = cot?.fecha ? new Date(cot.fecha).toLocaleString("es-PE") : formatDateTime(row.fecha || "-");
      const numeroComprobante = String(cot.numero_comprobante || row.numero_comprobante || `Q${String(cotizacionId).padStart(6, "0")}`);
      const nombrePaciente = `${String(row?.nombre || "").trim()} ${String(row?.apellido || "").trim()}`.trim() || "Particular";
      const dni = String(row?.dni || "-").trim() || "-";
      const hc = String(row?.historia_clinica || "-").trim() || "-";
      const usuarioCotizoNombre = String(cot?.usuario_nombre || row?.usuario_nombre || "Sistema").trim() || "Sistema";
      const usuarioCotizoRol = formatUserRole(cot?.usuario_rol || row?.usuario_rol || "");
      const usuarioCotizoLabel = usuarioCotizoRol
        ? `${usuarioCotizoNombre} (${usuarioCotizoRol})`
        : usuarioCotizoNombre;

      const detallesHtml = detalles.length > 0
        ? detalles.map((d) => {
            const desc = escapeHtml(String(d?.descripcion || "Servicio"));
            const cantidad = Number(d?.cantidad || 1);
            const subtotal = Number(d?.subtotal || 0).toFixed(2);
            return `<div style="display:flex;justify-content:space-between;gap:8px;margin:2px 0;"><span>${desc} x${cantidad}</span><strong>S/ ${subtotal}</strong></div>`;
          }).join("")
        : `<div style="margin:2px 0;">Sin ítems</div>`;

      const total = Number(cot.total || row.total || 0).toFixed(2);
      const pagado = Number(cot.total_pagado || 0).toFixed(2);
      const saldo = Number(cot.saldo_pendiente || row.saldo_pendiente || 0).toFixed(2);

      const sloganHtml = clinicBrand.slogan
        ? `<p style="margin:2px 0;text-align:center;font-style:italic;font-size:11px;${clinicBrand.slogan_color ? `color:${escapeHtml(clinicBrand.slogan_color)};` : ""}">${escapeHtml(clinicBrand.slogan)}</p>`
        : "";
      const emailHtml = clinicBrand.email
        ? `<p style="margin:2px 0;text-align:center;">${escapeHtml(clinicBrand.email)}</p>`
        : "";
      const contactoLinea = [
        clinicBrand.telefono ? `Tel: ${escapeHtml(clinicBrand.telefono)}` : "",
        clinicBrand.celular ? `Cel: ${escapeHtml(clinicBrand.celular)}` : "",
      ].filter(Boolean).join(" | ");

      const toMoney = (value) => `S/ ${Number(value || 0).toFixed(2)}`;

      const ticketCss = `
        <style>
          * { box-sizing: border-box; }
          .ticket-80 {
            width: 100%;
            max-width: 320px;
            margin: 0 auto;
            padding: 8px 10px;
            font-family: "Courier New", "Lucida Console", monospace;
            font-size: 11px;
            line-height: 1.2;
            color: #111827;
            font-weight: 700;
          }
          .ticket-80 .t-center { text-align: center; }
          .ticket-80 .t-logo { max-height: 50px; max-width: 170px; object-fit: contain; margin: 0 auto 4px; display: block; image-rendering: -webkit-optimize-contrast; filter: contrast(1.15) saturate(1.05); }
          .ticket-80 .t-clinic { margin: 2px 0; font-size: 13px; font-weight: 800; letter-spacing: 0.2px; }
          .ticket-80 .t-line { margin: 1px 0; font-weight: 700; }
          .ticket-80 .t-title { margin: 6px 0 2px; font-weight: 800; text-transform: uppercase; text-align: center; }
          .ticket-80 .t-hr { border: 0; border-top: 1px dashed #6b7280; margin: 6px 0; }
          .ticket-80 .t-meta { margin: 1px 0; font-weight: 700; }
          .ticket-80 .t-section { margin: 6px 0 3px; font-weight: 800; text-transform: uppercase; }
          .ticket-80 .t-row { display:flex; justify-content:space-between; align-items:baseline; gap:6px; margin:1px 0; }
          .ticket-80 .t-item { margin: 2px 0 4px; }
          .ticket-80 .t-desc { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .ticket-80 .t-amount { white-space: nowrap; font-weight: 700; }
          .ticket-80 .t-total { font-size: 12px; font-weight: 700; }
          .ticket-80 .t-note { margin-top: 6px; text-align: center; font-size: 10px; color: #111827; font-weight: 700; }
          @media print {
            @page { size: 80mm auto; margin: 2mm; }
            html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .ticket-80 {
              width: 76mm;
              max-width: 76mm;
              margin: 0;
              padding: 2.5mm;
              font-size: 10.5px;
              line-height: 1.15;
            }
            .ticket-80 .t-clinic { font-size: 12px; }
            .ticket-80 .t-logo { max-height: 42px; margin-bottom: 3px; }
            .ticket-80 .t-total { font-size: 11.5px; }
          }
        </style>`;

      const ticketBody = `
        <div class="ticket-80">
          <div class="t-center">
            ${clinicBrand.logo ? `<img src="${escapeHtml(clinicBrand.logo)}" alt="Logo clinica" class="t-logo" />` : ""}
            <div class="t-clinic"${clinicBrand.nombre_color ? ` style="color:${escapeHtml(clinicBrand.nombre_color)};"` : ""}>${escapeHtml(clinicBrand.nombre || "MI CLINICA")}</div>
            ${sloganHtml ? `<div class="t-line">${sloganHtml.replace(/<\/?p[^>]*>/g, "")}</div>` : ""}
            ${clinicBrand.direccion ? `<div class="t-line">${escapeHtml(clinicBrand.direccion)}</div>` : ""}
            ${contactoLinea ? `<div class="t-line">${contactoLinea}</div>` : ""}
            ${emailHtml ? `<div class="t-line">${emailHtml.replace(/<\/?p[^>]*>/g, "")}</div>` : ""}
            ${clinicBrand.ruc ? `<div class="t-line">RUC: ${escapeHtml(clinicBrand.ruc)}</div>` : ""}
          </div>
          <div class="t-title">Comprobante de cotizacion</div>
          <hr class="t-hr" />
          <div class="t-meta"><strong>Nro:</strong> ${escapeHtml(numeroComprobante)}</div>
          <div class="t-meta"><strong>Cotizacion:</strong> #${cotizacionId}</div>
          <div class="t-meta"><strong>Fecha:</strong> ${escapeHtml(fecha)}</div>
          <div class="t-meta"><strong>Paciente:</strong> ${escapeHtml(nombrePaciente)}</div>
          <div class="t-meta"><strong>DNI:</strong> ${escapeHtml(dni)}</div>
          <div class="t-meta"><strong>H.C.:</strong> ${escapeHtml(hc)}</div>
          <div class="t-meta"><strong>Cotizado por:</strong> ${escapeHtml(usuarioCotizoLabel)}</div>
          <hr class="t-hr" />
          <div class="t-section">Detalle</div>
          ${detallesHtml}
          <hr class="t-hr" />
          <div class="t-row t-total"><div class="t-desc">Total neto</div><div class="t-amount">${toMoney(total)}</div></div>
          <div class="t-row"><div class="t-desc">Pagado</div><div class="t-amount">${toMoney(pagado)}</div></div>
          <div class="t-row"><div class="t-desc">Saldo</div><div class="t-amount">${toMoney(saldo)}</div></div>
          <hr class="t-hr" />
          <div class="t-note">Gracias por su preferencia</div>
          <div class="t-note" style="margin-top:2px;">Conserve este ticket</div>
        </div>`;

      const modal = await Swal.fire({
        title: "",
        html: `${ticketCss}${ticketBody}`,
        showCancelButton: true,
        confirmButtonText: "Imprimir",
        cancelButtonText: "Cerrar",
        width: 420,
      });

      if (!modal.isConfirmed) return;

      const win = window.open("", "_blank", "width=420,height=700");
      if (!win) {
        Swal.fire("Atención", "No se pudo abrir la ventana de impresión. Revisa el bloqueador de ventanas.", "warning");
        return;
      }

      win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ticket Cotizacion</title>${ticketCss}</head><body>${ticketBody}</body></html>`);
      win.document.close();

      const doPrint = () => {
        try {
          win.focus();
          win.print();
        } catch {
          // noop
        }
      };

      const waitImagesAndPrint = () => {
        try {
          const images = Array.from(win.document.images || []);
          if (images.length === 0) {
            setTimeout(doPrint, 80);
            return;
          }
          let pending = images.filter((img) => !img.complete);
          if (pending.length === 0) {
            setTimeout(doPrint, 80);
            return;
          }
          let printed = false;
          const finish = () => {
            if (printed) return;
            printed = true;
            setTimeout(doPrint, 100);
          };
          const onImgDone = () => {
            pending = pending.filter((img) => !img.complete);
            if (pending.length === 0) finish();
          };
          pending.forEach((img) => {
            img.addEventListener("load", onImgDone, { once: true });
            img.addEventListener("error", onImgDone, { once: true });
          });
          setTimeout(finish, 1200);
        } catch {
          setTimeout(doPrint, 100);
        }
      };

      if (win.document.readyState === "complete") {
        waitImagesAndPrint();
      } else {
        win.addEventListener("load", waitImagesAndPrint, { once: true });
        setTimeout(waitImagesAndPrint, 250);
      }
    } catch (error) {
      Swal.fire("Error", error?.message || "No se pudo imprimir el ticket.", "error");
    }
  }, [clinicBrand]);

  const compartirPorWhatsApp = useCallback(async (row) => {
    try {
      const cotizacionId = Number(row?.id || 0);
      if (cotizacionId <= 0) return;

      const resShare = await authFetch("api_cotizacion_whatsapp_link.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cotizacion_id: cotizacionId, ttl_hours: 24, max_uses: 20 }),
      });
      const dataShare = await resShare.json();
      if (!dataShare?.success || !dataShare?.pdf_url) {
        throw new Error(dataShare?.error || "No se pudo crear enlace de PDF para compartir");
      }
      const pdfUrl = String(dataShare.pdf_url || "").trim();
      const pdfUrlFallback = String(dataShare.pdf_url_fallback || "").trim();
      const venceToken = String(dataShare.expires_at || "").trim();

      const res = await authFetch(`api_cotizaciones.php?cotizacion_id=${cotizacionId}&_t=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data?.success || !data?.cotizacion) {
        throw new Error(data?.error || "No se pudo obtener la cotizacion");
      }

      const cot = data.cotizacion;
      const detalles = Array.isArray(cot?.detalles) ? cot.detalles : [];
      const serviciosTxt = detalles.length > 0
        ? detalles.map((d) => `- ${String(d?.descripcion || "Servicio")} x${Number(d?.cantidad || 1)} = S/ ${Number(d?.subtotal || 0).toFixed(2)}`).join("\n")
        : "- Sin items";
      const total = Number(cot?.total || row?.total || 0).toFixed(2);
      const vence = String(cot?.fecha_vencimiento || row?.fecha_vencimiento || "").trim();
      const paciente = `${String(row?.nombre || "").trim()} ${String(row?.apellido || "").trim()}`.trim() || "Particular";
      const numero = String(cot?.numero_comprobante || row?.numero_comprobante || `Q${String(cotizacionId).padStart(6, "0")}`);
      const resumenBase = [
        `${clinicBrand.nombre || "CLINICA"}`,
        `Cotizacion ${numero}`,
        `Paciente: ${paciente}`,
        `Detalles:`,
        serviciosTxt,
        `Total: S/ ${total}`,
        vence ? `Vigencia: ${formatDateTime(vence)}` : "",
        venceToken ? `Enlace PDF valido hasta: ${formatDateTime(venceToken)}` : "",
      ].filter(Boolean).join("\n");

      const { value: numeroDestinoRaw } = await Swal.fire({
        title: "Compartir por WhatsApp",
        input: "text",
        inputLabel: "Numero destino (opcional)",
        inputPlaceholder: "Ej: 987654321 o 51987654321",
        inputValue: String(row?.telefono || "").trim(),
        showCancelButton: true,
        confirmButtonText: "Abrir WhatsApp",
        cancelButtonText: "Copiar resumen",
      });

      const numeroDestino = normalizePhoneForWa(numeroDestinoRaw || row?.telefono || "");
      const bloquePdf = pdfUrlFallback && pdfUrlFallback !== pdfUrl
        ? `${pdfUrl}\n${pdfUrlFallback}`
        : pdfUrl;
      const mensaje = `${resumenBase}\n\nPDF:\n${bloquePdf}`;

      if (!numeroDestino) {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(resumenBase);
        }
        await Swal.fire("Resumen copiado", "No se indico numero. Se copio el resumen para pegar en WhatsApp.", "success");
        return;
      }

      const waUrl = `https://wa.me/${numeroDestino}?text=${encodeURIComponent(mensaje)}`;
      const opened = window.open(waUrl, "_blank");
      if (!opened) {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(mensaje);
        }
        await Swal.fire("Atencion", "No se pudo abrir WhatsApp. Se copio el texto al portapapeles.", "warning");
      }
    } catch (error) {
      Swal.fire("Error", error?.message || "No se pudo compartir por WhatsApp", "error");
    }
  }, [clinicBrand]);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const accion = String(sp.get("accion") || "").toLowerCase();
    const cotizacionId = Number(sp.get("cotizacion_id") || 0);
    if (accion !== "anular" || !cotizacionId || autoAnularRef.current || loading) return;

    autoAnularRef.current = true;

    // Limpiar la URL inmediatamente para que un refresh no vuelva a disparar el dialog
    navigate("/cotizaciones", { replace: true });

    const ejecutarAnulacion = async () => {
      let cotizacionObjetivo = rows.find((r) => Number(r.id) === cotizacionId) || null;

      if (!cotizacionObjetivo) {
        try {
          const res = await authFetch(`api_cotizaciones.php?cotizacion_id=${cotizacionId}`);
          const data = await res.json();
          if (data?.success && data?.cotizacion) {
            cotizacionObjetivo = data.cotizacion;
          }
        } catch {
          // mantener null para manejar abajo
        }
      }

      if (!cotizacionObjetivo) {
        Swal.fire("Atención", `No se encontró la cotización #${cotizacionId}.`, "warning");
        return;
      }

      if (String(cotizacionObjetivo.estado || "").toLowerCase() === "anulada") {
        Swal.fire("Info", `La cotización #${cotizacionId} ya está anulada.`, "info");
        return;
      }

      await anularCotizacion(cotizacionObjetivo);
    };

    ejecutarAnulacion();
  }, [location.search, loading, rows, anularCotizacion, navigate]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COTIZACIONES_LIMIT_STORAGE_KEY, String(limit));
    } catch {
      // Si localStorage no está disponible, se mantiene en memoria.
    }
  }, [limit]);

  return (
    <div className="max-w-full mx-auto p-4 md:p-8">
      <div className="bg-white rounded-xl shadow border border-gray-200 p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h2 className="text-2xl font-bold" style={{ color: "var(--color-primary-dark)" }}>Atenciones</h2>
          <div className="text-sm text-gray-600">Total registros: <b>{total}</b> · Filas operativas visibles: <b>{rowsOperativos.length}</b></div>
        </div>

        <QuickAccessNav keys={["pacientes", "recordatorios", "reporteCaja"]} />

        <CotizadorRapido />

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Buscar paciente, DNI, HC, ID o código Q"
            className="border rounded px-3 py-2 md:col-span-2"
          />
          <select
            value={estadoInput}
            onChange={(e) => setEstadoInput(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="parcial">Parcial</option>
            <option value="pagado">Pagado</option>
            <option value="informativo">Informativo</option>
            <option value="anulada">Anulada</option>
          </select>
          <input
            type="date"
            value={fechaInicioInput}
            onChange={(e) => setFechaInicioInput(e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="date"
            value={fechaFinInput}
            onChange={(e) => setFechaFinInput(e.target.value)}
            className="border rounded px-3 py-2"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <select
            value={filtroSolicitudHC}
            onChange={(e) => setFiltroSolicitudHC(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="todas">Solicitud: Todas</option>
            <option value="solo_hc">Solicitud: Solo desde HC</option>
            <option value="solo_incompleto">Solo registro incompleto</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <select
            value={rolReporte}
            onChange={(e) => setRolReporte(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="todos">Rol: Todos</option>
            <option value="admin">Rol: Admin</option>
            <option value="recepcion">Rol: Recepcion</option>
          </select>
          <select
            value={usuarioReporte}
            onChange={(e) => setUsuarioReporte(e.target.value)}
            className="border rounded px-3 py-2"
            disabled={rolReporte === "todos"}
          >
            <option value="">{rolReporte === "todos" ? "Usuario: seleccione rol" : "Usuario: todos"}</option>
            {usuariosFiltradosReporte.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </select>
          <button
            onClick={exportarExcelAtenciones}
            disabled={exporting}
            className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {exporting ? "Exportando..." : "Exportar Excel"}
          </button>
          <button
            onClick={exportarPdfAtenciones}
            disabled={exporting}
            className="px-4 py-2 rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {exporting ? "Exportando..." : "Exportar PDF"}
          </button>
          <div className="text-xs text-gray-500 flex items-center">
            Usa un dia (misma fecha) o rango desde/hasta.
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => aplicarRangoDias(1)}
            className="px-3 py-1 rounded"
            style={THEME_PRIMARY_SOFT}
          >
            Hoy
          </button>
          <button
            onClick={() => aplicarRangoDias(7)}
            className="px-3 py-1 rounded"
            style={THEME_PRIMARY_SOFT}
          >
            Ultimos 7 dias
          </button>
          <button
            onClick={() => aplicarRangoDias(30)}
            className="px-3 py-1 rounded"
            style={THEME_PRIMARY_SOFT}
          >
            Ultimos 30 dias
          </button>
          <button
            onClick={mostrarTodo}
            className="bg-gray-100 text-gray-700 px-3 py-1 rounded hover:bg-gray-200"
          >
            Todo
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={filtrar} className="text-white px-4 py-2 rounded" style={THEME_GRADIENT}>Filtrar</button>
          <button onClick={limpiarFiltros} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">Limpiar</button>
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Ultimo pago</th>
                <th className="px-3 py-2 text-left">Paciente</th>
                <th className="px-3 py-2 text-left">Quién cotizó</th>
                <th className="px-3 py-2 text-left">Responsable</th>
                <th className="px-3 py-2 text-left">Referencia origen</th>
                <th className="px-3 py-2 text-left">Servicios</th>
                <th className="px-3 py-2 text-left">Origen/Contrato</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left hidden lg:table-cell">Pago</th>
                <th className="px-3 py-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={14} className="px-3 py-8 text-center text-gray-500">Cargando...</td>
                </tr>
              ) : rowsOperativos.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-3 py-8 text-center text-gray-500">Sin resultados</td>
                </tr>
              ) : rowsOperativos.map((row) => (
                (() => {
                  const serviciosRow = String(row?.servicios_tipos || "")
                    .split(",")
                    .map(normalizarServicioTipo)
                    .filter(Boolean);
                  const incluyeConsulta = serviciosRow.includes("consulta");
                  const incluyeImagen = tieneServicioImagen(serviciosRow);
                  const correlativoConsulta = correlativoByConsultaId[Number(row?.consulta_ref_id || 0)] || null;
                  const correlativoImagen = correlativoImagenByCotizacionId[Number(row?.id || 0)] || null;
                  const correlativoFila = incluyeConsulta ? correlativoConsulta : (incluyeImagen ? correlativoImagen : null);
                  const correlativoFechaAtencion = incluyeConsulta
                    ? (correlativoFechaByConsultaId[Number(row?.consulta_ref_id || 0)] || "")
                    : (incluyeImagen ? (correlativoFechaImagenByCotizacionId[Number(row?.id || 0)] || "") : "");
                  const correlativosServiciosApi = Array.isArray(row?.correlativos_operativos_servicios)
                    ? row.correlativos_operativos_servicios
                    : [];
                  const correlativosServicios = correlativosServiciosApi
                    .map((item) => ({
                      servicio_tipo: normalizarServicioTipo(item?.servicio_tipo || ""),
                      servicio_descripcion: String(item?.servicio_descripcion || "").trim(),
                      correlativo: Number(item?.correlativo || 0),
                      fecha_atencion: String(item?.fecha_atencion || "").trim(),
                      hora_atencion: String(item?.hora_atencion || "").trim(),
                      unidad_token: String(item?.unidad_token || "").trim(),
                    }))
                    .filter((item) => item.servicio_tipo && item.correlativo > 0)
                    .sort((a, b) => a.correlativo - b.correlativo);
                  if (correlativosServicios.length === 0 && Number(correlativoFila || 0) > 0) {
                    correlativosServicios.push({
                      servicio_tipo: incluyeConsulta ? "consulta" : (incluyeImagen ? "imagenologia" : "servicio"),
                      servicio_descripcion: "",
                      correlativo: Number(correlativoFila || 0),
                      fecha_atencion: String(correlativoFechaAtencion || "").trim(),
                      hora_atencion: "",
                      unidad_token: "",
                    });
                  }
                  return (
                  <CotizacionRow
                    key={`${row.id}-${row.episodio_id || row.id}`}
                    row={row}
                    onCobrar={abrirCobro}
                    onAnular={anularCotizacion}
                    onNavigate={navigate}
                    onPrintTicket={imprimirTicketDirecto}
                    onSendWhatsApp={compartirPorWhatsApp}
                    onToggleAnticipado={toggleAnticipado}
                    badgeEstado={badgeEstado}
                    labelEstado={labelEstado}
                    anticipadoInfo={anticipadoByCotizacion[String(row.id)] || anticipadoByCotizacion[row.id] || null}
                    canAutorizarAnticipado={canAutorizarAnticipado}
                    correlativoFechaAtencion={correlativoFechaAtencion}
                    correlativosServicios={correlativosServicios}
                    relacionSolicitud={relacionSolicitudByCotizacion[Number(row?.id || 0)] || null}
                  />
                  );
                })()
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
          <div className="text-sm text-gray-600">Página {page} de {totalPages}</div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
            >
              Siguiente
            </button>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="border rounded px-2 py-1"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
