import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listarOrdenesOcupacionalesPaginado,
  obtenerDetalleOrdenOcupacional,
  obtenerResultadoClinicoOcupacional,
  actualizarExamenDetalleOcupacional,
  guardarResultadoClinicoOcupacional,
} from "../api/ocupacionalApi";

const LAB_KEYWORDS = [
  "LABORATORIO",
  "HEMATO",
  "BIOQUIM",
  "TOXICO",
  "INMUNO",
  "UROANALISIS",
  "SEROLOG",
  "PARASITO",
  "MICROBIO",
  "GLUCOSA",
  "HEMOGRAMA",
  "PCR",
  "PERFIL",
  "ELISA",
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeTipo(tipo) {
  return String(tipo || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

function isTipoParametro(tipo) {
  const t = normalizeTipo(tipo || "Parámetro");
  if (!t) return true;
  return t === "parametro" || (t.startsWith("par") && t.includes("metro"));
}

function isTipoTextoLargo(tipo) {
  const t = normalizeTipo(tipo);
  return t === "textolargo" || (t.startsWith("texto") && t.includes("largo"));
}

function isTipoCampo(tipo) {
  return normalizeTipo(tipo) === "campo";
}

function isTipoTitulo(tipo) {
  const t = normalizeTipo(tipo);
  return t === "titulo" || t === "subtitulo" || t.startsWith("subtitul") || t.startsWith("titul");
}

function isLabItem(item) {
  const groupText = normalizeText(item?.examen_grupo);
  const subgroupText = normalizeText(item?.examen_subgrupo);
  const codeText = normalizeText(item?.examen_codigo);
  const descText = normalizeText(item?.examen_descripcion);
  const joined = `${groupText} ${subgroupText} ${codeText} ${descText}`;
  return LAB_KEYWORDS.some((keyword) => joined.includes(keyword));
}

function isLabDescription(descripcion) {
  const descText = normalizeText(descripcion);
  if (!descText) return false;
  return LAB_KEYWORDS.some((keyword) => descText.includes(keyword));
}

function normalizeNumber(value) {
  if (value === null || value === undefined) return Number.NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;

  let s = String(value).trim();
  if (!s) return Number.NaN;

  if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, "");
  } else {
    s = s.replace(/,/g, ".");
  }

  const match = s.match(/-?\d+(?:\.\d+)?/);
  if (!match) return Number.NaN;

  const n = parseFloat(match[0]);
  return Number.isFinite(n) ? n : Number.NaN;
}

function formatReferenceNumber(value) {
  const n = normalizeNumber(value);
  if (!Number.isFinite(n)) return String(value ?? "").trim();
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

function parseMinMaxFromText(texto) {
  if (!texto) return { min: null, max: null };

  let s = String(texto).trim();
  s = s.replace(/-?[1-9]\d{0,2}(?:,\d{3})+(\.\d+)?/g, (m) => m.replace(/,/g, ""));
  s = s.replace(/,/g, ".");
  s = s.replace(/^(?:N\s*:\s*|Normal\s*:\s*)/i, "");
  s = s.replace(/Rango(?:\s*de)?\s*referencia\s*:?/i, "");

  const mRango = s.match(/(-?\d[\d.,]*)\s*(?:-|–|—|a|hasta|entre|y)\s*(-?\d[\d.,]*)/i);
  if (mRango) {
    const min = normalizeNumber(mRango[1]);
    const max = normalizeNumber(mRango[2]);
    return {
      min: Number.isFinite(min) ? min : null,
      max: Number.isFinite(max) ? max : null,
    };
  }

  const mMin = s.match(/(?:>=|≥|>|desde|mayor\s*a?)\s*(-?\d[\d.,]*)/i);
  const mMax = s.match(/(?:<=|≤|<|hasta|menor\s*a?)\s*(-?\d[\d.,]*)/i);
  const min = mMin ? normalizeNumber(mMin[1]) : null;
  const max = mMax ? normalizeNumber(mMax[1]) : null;

  let finalMin = Number.isFinite(min) ? min : null;
  let finalMax = Number.isFinite(max) ? max : null;

  if (finalMin !== null && finalMax !== null && finalMin > finalMax) {
    const tmp = finalMin;
    finalMin = finalMax;
    finalMax = tmp;
  }

  return { min: finalMin, max: finalMax };
}

function hasMeaningfulValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeSexValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.startsWith("m")) return "masculino";
  if (normalized.startsWith("f")) return "femenino";
  return normalized;
}

function getApplicableReference(param, paciente) {
  if (!param || !Array.isArray(param.referencias) || param.referencias.length === 0) return null;

  const refs = param.referencias.filter((r) => r && typeof r === "object");
  if (refs.length === 0) return null;

  const { edad, sexo } = paciente || {};
  if (!Number.isFinite(edad) || !sexo) return refs[0] || null;

  const refMatch = refs.find((ref) => {
    const refSexo = normalizeSexValue(ref.sexo || "cualquiera");
    const refEdadMin = normalizeNumber(ref.edad_min);
    const refEdadMax = normalizeNumber(ref.edad_max);

    const sexoMatch = !refSexo || refSexo === "cualquiera" || refSexo === sexo;
    const edadMinOk = !Number.isFinite(refEdadMin) || edad >= refEdadMin;
    const edadMaxOk = !Number.isFinite(refEdadMax) || edad <= refEdadMax;

    return sexoMatch && edadMinOk && edadMaxOk;
  });

  return refMatch || refs[0] || null;
}

function formatWithDecimals(value, decimales) {
  if (value === null || value === undefined || value === "") return "";
  const numVal = normalizeNumber(value);
  if (!Number.isFinite(numVal)) return String(value);

  if (decimales !== null && decimales !== undefined && decimales !== "" && !isNaN(parseInt(decimales, 10))) {
    const d = parseInt(decimales, 10);
    return Number(numVal).toLocaleString("en-US", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  }

  if (Number.isInteger(numVal)) {
    return Number(numVal).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return String(numVal);
}

function evalFormula(formula, valoresPorNombre, decimales = null) {
  if (!formula) return "";

  let expr = formula;
  const nombres = Object.keys(valoresPorNombre).sort((a, b) => b.length - a.length);
  for (const nombre of nombres) {
    const safeName = nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(safeName, "g");
    if (!regex.test(expr)) continue;

    const numVal = normalizeNumber(valoresPorNombre[nombre]);
    if (!Number.isFinite(numVal)) return "";
    expr = expr.replace(regex, String(numVal));
  }

  try {
    const normalizedExpr = String(expr).replace(/,/g, ".").replace(/\^/g, "**").trim();
    const allowedExpr = /^[0-9+\-*/().\s%eE*]*$/;
    if (!allowedExpr.test(normalizedExpr)) return "";

    const result = Function(`"use strict"; return (${normalizedExpr});`)();
    if (typeof result === "number" && Number.isFinite(result)) {
      return formatWithDecimals(result, decimales);
    }
    return "";
  } catch {
    return "";
  }
}

function getParameterStatus(param, valor, paciente) {
  let fueraDeRango = false;
  let min = null;
  let max = null;

  const referenciaAplicada = getApplicableReference(param, paciente);

  if (param && hasMeaningfulValue(param.min)) {
    const m = normalizeNumber(param.min);
    if (Number.isFinite(m)) min = m;
  } else if (param && hasMeaningfulValue(param.valor_min)) {
    const mAlt = normalizeNumber(param.valor_min);
    if (Number.isFinite(mAlt)) min = mAlt;
  } else if (referenciaAplicada) {
    const mRef = normalizeNumber(referenciaAplicada.valor_min);
    if (Number.isFinite(mRef)) min = mRef;
  }

  if (param && hasMeaningfulValue(param.max)) {
    const m = normalizeNumber(param.max);
    if (Number.isFinite(m)) max = m;
  } else if (param && hasMeaningfulValue(param.valor_max)) {
    const mAlt = normalizeNumber(param.valor_max);
    if (Number.isFinite(mAlt)) max = mAlt;
  } else if (referenciaAplicada) {
    const mRef = normalizeNumber(referenciaAplicada.valor_max);
    if (Number.isFinite(mRef)) max = mRef;
  }

  if ((min === null && max === null) && referenciaAplicada && referenciaAplicada.valor) {
    const fromText = parseMinMaxFromText(referenciaAplicada.valor);
    if (fromText.min !== null) min = fromText.min;
    if (fromText.max !== null) max = fromText.max;
  }

  const valorNum = normalizeNumber(valor);
  if (Number.isFinite(valorNum)) {
    if (min !== null && valorNum < min) fueraDeRango = true;
    if (max !== null && valorNum > max) fueraDeRango = true;
  }

  return { fueraDeRango, min, max, referenciaAplicada };
}

function badgeByExamStatus(item, resultado) {
  if (String(item?.estado_ejecucion || "") === "observado") {
    return { label: "Observado", className: "border-rose-200 bg-rose-50 text-rose-700" };
  }
  if (String(resultado?.estado || "") === "finalizado") {
    return { label: "Finalizado", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  if (resultado?.id || ["en_proceso", "realizado"].includes(String(item?.estado_ejecucion || ""))) {
    return { label: "En proceso", className: "border-amber-200 bg-amber-50 text-amber-800" };
  }
  return { label: "Pendiente", className: "border-slate-200 bg-slate-50 text-slate-700" };
}

function extractReadOnlyFlags(resultadoCtx) {
  const data = resultadoCtx?.data?.datos_json;
  if (!data || typeof data !== "object") {
    return { imprimir: true, alarmaActiva: false, alarmaDias: "" };
  }

  const imprimirRaw = data.imprimir_examen;
  const alarmaRaw = data.alarma_activa;
  const diasRaw = data.alarma_dias;

  const imprimir = imprimirRaw === undefined || imprimirRaw === null || imprimirRaw === ""
    ? true
    : (String(imprimirRaw).trim() === "1" || String(imprimirRaw).trim().toLowerCase() === "true");

  const alarmaActiva = alarmaRaw === undefined || alarmaRaw === null || alarmaRaw === ""
    ? false
    : (String(alarmaRaw).trim() === "1" || String(alarmaRaw).trim().toLowerCase() === "true");

  return {
    imprimir,
    alarmaActiva,
    alarmaDias: diasRaw === undefined || diasRaw === null ? "" : String(diasRaw),
  };
}

function cloneObject(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value || {}));
  }
}

function mergeDatosForPanel(datosGuardados, datosSugeridos) {
  const saved = (datosGuardados && typeof datosGuardados === "object") ? datosGuardados : null;
  const suggested = (datosSugeridos && typeof datosSugeridos === "object") ? datosSugeridos : null;

  const savedParams = Array.isArray(saved?.parametros) ? saved.parametros : [];
  const suggestedParams = Array.isArray(suggested?.parametros) ? suggested.parametros : [];

  let datosBase = saved || suggested || {};
  if (suggestedParams.length === 0) {
    return cloneObject(datosBase);
  }

  if (savedParams.length === 0) {
    return cloneObject({
      ...(suggested || {}),
      ...(saved || {}),
      parametros: suggestedParams,
    });
  }

  const usedSavedIdx = new Set();
  const findSavedFor = (paramSug) => {
    const sugNombre = String(paramSug?.nombre || "").trim().toLowerCase();
    const sugCodigo = String(paramSug?.codigo_interno || "").trim().toLowerCase();

    let foundIndex = -1;
    if (sugCodigo) {
      foundIndex = savedParams.findIndex((p) => String(p?.codigo_interno || "").trim().toLowerCase() === sugCodigo);
    }
    if (foundIndex < 0 && sugNombre) {
      foundIndex = savedParams.findIndex((p) => String(p?.nombre || "").trim().toLowerCase() === sugNombre);
    }
    if (foundIndex < 0) {
      return null;
    }
    usedSavedIdx.add(foundIndex);
    return savedParams[foundIndex];
  };

  const mergedParams = suggestedParams.map((paramSug) => {
    const savedParam = findSavedFor(paramSug);
    if (!savedParam || typeof savedParam !== "object") {
      return { ...paramSug };
    }
    return {
      ...paramSug,
      ...savedParam,
      valor: hasMeaningfulValue(savedParam.valor) ? savedParam.valor : (paramSug.valor ?? ""),
    };
  });

  const extras = savedParams.filter((p, idx) => !usedSavedIdx.has(idx) && p && typeof p === "object");
  return cloneObject({
    ...(suggested || {}),
    ...(saved || {}),
    parametros: [...mergedParams, ...extras],
  });
}

export default function OcupacionalLaboratorioReadOnlyPanel() {
  const ordenIdFromQuery = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search || "");
      return Number(params.get("orden_id") || 0);
    } catch {
      return 0;
    }
  }, []);

  const [query, setQuery] = useState("");
  const [queryDebounced, setQueryDebounced] = useState("");
  const [estado, setEstado] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [metaOrdenes, setMetaOrdenes] = useState({ page: 1, per_page: 10, total: 0, total_pages: 0 });

  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedOrdenId, setSelectedOrdenId] = useState(0);
  const [selectedOrden, setSelectedOrden] = useState(null);

  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleError, setDetalleError] = useState("");

  const [resultadosByDetalle, setResultadosByDetalle] = useState({});
  const [resultadosLoading, setResultadosLoading] = useState(false);
  const [resultadosError, setResultadosError] = useState("");
  const [resumenGlobal, setResumenGlobal] = useState({ hallazgos: "", conclusion: "" });
  const [draftByDetalle, setDraftByDetalle] = useState({});
  const [savingByDetalle, setSavingByDetalle] = useState({});
  const [saveMessageByDetalle, setSaveMessageByDetalle] = useState({});
  const [saveErrorByDetalle, setSaveErrorByDetalle] = useState({});
  const [refreshingByDetalle, setRefreshingByDetalle] = useState({});
  const [refreshMessageByDetalle, setRefreshMessageByDetalle] = useState({});
  const [refreshErrorByDetalle, setRefreshErrorByDetalle] = useState({});
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [saveGlobalMessage, setSaveGlobalMessage] = useState("");
  const [saveGlobalError, setSaveGlobalError] = useState("");
  const [mostrarFormulario, setMostrarFormulario] = useState(ordenIdFromQuery > 0);

  const mostrarListaOrdenes = ordenIdFromQuery <= 0;

  const detalleCacheRef = useRef(new Map());
  const resultadoCacheRef = useRef(new Map());

  const listaRequestRef = useRef(0);
  const detalleRequestRef = useRef(0);
  const resultadosRequestRef = useRef(0);
  const querySelectionAppliedRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setQueryDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [queryDebounced, estado, fechaDesde, fechaHasta, perPage]);

  const hydrateOrderWithLabs = useCallback((detail) => {
    const labItems = (Array.isArray(detail?.items) ? detail.items : []).filter(isLabItem);
    return {
      ...detail,
      items_lab: labItems,
    };
  }, []);

  const cargarOrdenes = useCallback(async () => {
    const requestId = ++listaRequestRef.current;
    setLoading(true);
    setError("");

    try {
      const result = await listarOrdenesOcupacionalesPaginado({
        q: queryDebounced,
        estado,
        fechaDesde,
        fechaHasta,
        page,
        perPage,
      });

      const rows = Array.isArray(result?.data) ? result.data : [];
      const enriched = rows.map((row) => {
        const estadoClinicoItems = Array.isArray(row?.estado_clinico_items) ? row.estado_clinico_items : [];
        const labItemsResumen = estadoClinicoItems.filter((item) => isLabDescription(item?.examen_descripcion));
        const totalLab = labItemsResumen.length;
        const totalLabFinalizados = labItemsResumen.filter((item) => {
          const estadoItem = String(item?.estado || "").trim().toLowerCase();
          return estadoItem === "realizado" || estadoItem === "finalizado";
        }).length;

        return {
          ...row,
          paciente_nombre_completo: String(row?.paciente_nombre_completo || "").trim(),
          items_lab_total: totalLab,
          items_lab_finalizados: totalLabFinalizados,
        };
      });

      if (requestId !== listaRequestRef.current) return;

      const filtered = enriched.filter((row) => Number(row?.items_lab_total || 0) > 0);
      setOrdenes(filtered);
      const metaPage = Number(result?.meta?.page || page);
      const metaPerPage = Number(result?.meta?.per_page || perPage);
      setMetaOrdenes({
        page: metaPage,
        per_page: metaPerPage,
        total: Number(result?.meta?.total || 0),
        total_pages: Number(result?.meta?.total_pages || 0),
      });
      if (metaPage !== page) {
        setPage(metaPage);
      }

      if (filtered.length === 0) {
        setSelectedOrdenId(0);
        setSelectedOrden(null);
        setResultadosByDetalle({});
        return;
      }

      if (!querySelectionAppliedRef.current && ordenIdFromQuery > 0) {
        const existsInList = filtered.some((item) => Number(item.id) === Number(ordenIdFromQuery));
        querySelectionAppliedRef.current = true;
        if (existsInList) {
          setSelectedOrdenId(Number(ordenIdFromQuery));
          return;
        }
      }

      const selectedStillExists = filtered.some((item) => Number(item.id) === Number(selectedOrdenId));
      if (selectedOrdenId > 0 && !selectedStillExists) {
        setSelectedOrdenId(0);
        setSelectedOrden(null);
      }
    } catch (err) {
      if (requestId !== listaRequestRef.current) return;
      setError(err.message || "No se pudo cargar la bandeja ocupacional de laboratorio");
      setOrdenes([]);
      setMetaOrdenes({ page: 1, per_page: perPage, total: 0, total_pages: 0 });
      setSelectedOrdenId(0);
      setSelectedOrden(null);
      setResultadosByDetalle({});
    } finally {
      if (requestId === listaRequestRef.current) setLoading(false);
    }
  }, [estado, fechaDesde, fechaHasta, ordenIdFromQuery, page, perPage, queryDebounced, selectedOrdenId]);

  useEffect(() => {
    cargarOrdenes();
  }, [cargarOrdenes]);

  const cargarDetalleOrden = useCallback(async (ordenId) => {
    const id = Number(ordenId || 0);
    if (id <= 0) return;

    const cached = detalleCacheRef.current.get(id);
    if (cached) {
      setSelectedOrden(cached);
      return;
    }

    const requestId = ++detalleRequestRef.current;
    setDetalleLoading(true);
    setDetalleError("");

    try {
      const detail = await obtenerDetalleOrdenOcupacional(id);
      if (requestId !== detalleRequestRef.current) return;

      const withLabs = hydrateOrderWithLabs(detail);
      detalleCacheRef.current.set(id, withLabs);
      setSelectedOrden(withLabs);
    } catch (err) {
      if (requestId !== detalleRequestRef.current) return;
      setSelectedOrden(null);
      setDetalleError(err.message || "No se pudo cargar el detalle de la orden");
    } finally {
      if (requestId === detalleRequestRef.current) setDetalleLoading(false);
    }
  }, [hydrateOrderWithLabs]);

  useEffect(() => {
    if (selectedOrdenId > 0) {
      cargarDetalleOrden(selectedOrdenId);
    }
  }, [cargarDetalleOrden, selectedOrdenId]);

  useEffect(() => {
    if (ordenIdFromQuery <= 0) return;
    let cancelled = false;

    const loadFromQuery = async () => {
      try {
        const detail = await obtenerDetalleOrdenOcupacional(ordenIdFromQuery);
        if (cancelled) return;
        const withLabs = hydrateOrderWithLabs(detail);
        detalleCacheRef.current.set(ordenIdFromQuery, withLabs);
        setSelectedOrdenId(ordenIdFromQuery);
        setSelectedOrden(withLabs);
        querySelectionAppliedRef.current = true;
      } catch {
        if (!cancelled) {
          querySelectionAppliedRef.current = true;
        }
      }
    };

    loadFromQuery();
    return () => {
      cancelled = true;
    };
  }, [hydrateOrderWithLabs, ordenIdFromQuery]);

  const cargarResultadosOrden = useCallback(async (orden) => {
    const items = Array.isArray(orden?.items_lab) ? orden.items_lab : [];
    if (items.length === 0) {
      setResultadosByDetalle({});
      return;
    }

    const requestId = ++resultadosRequestRef.current;
    setResultadosLoading(true);
    setResultadosError("");

    try {
      const snapshotEntries = await Promise.all(items.map(async (item) => {
        const detalleId = Number(item?.id || 0);
        if (detalleId <= 0) return null;

        const cached = resultadoCacheRef.current.get(detalleId);
        if (cached) {
          return [detalleId, cached];
        }

        try {
          const ctx = await obtenerResultadoClinicoOcupacional({ ordenDetalleId: detalleId });
          resultadoCacheRef.current.set(detalleId, ctx);
          return [detalleId, ctx];
        } catch {
          return [detalleId, null];
        }
      }));

      if (requestId !== resultadosRequestRef.current) return;

      const next = {};
      snapshotEntries.forEach((entry) => {
        if (!entry) return;
        next[entry[0]] = entry[1];
      });
      setResultadosByDetalle(next);
    } catch (err) {
      if (requestId !== resultadosRequestRef.current) return;
      setResultadosError(err.message || "No se pudieron cargar los resultados de la orden");
      setResultadosByDetalle({});
    } finally {
      if (requestId === resultadosRequestRef.current) setResultadosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedOrden) {
      cargarResultadosOrden(selectedOrden);
    }
  }, [cargarResultadosOrden, selectedOrden]);

  useEffect(() => {
    if (!selectedOrden || !Array.isArray(selectedOrden.items_lab)) return;
    setDraftByDetalle((prev) => {
      const next = { ...prev };
      selectedOrden.items_lab.forEach((item) => {
        const detalleId = Number(item?.id || 0);
        if (detalleId <= 0) return;
        const ctx = resultadosByDetalle[detalleId] || null;
        const merged = mergeDatosForPanel(ctx?.data?.datos_json, ctx?.plantillaSugerida);

        const current = next[detalleId];
        if (!current || typeof current !== "object") {
          next[detalleId] = merged;
          return;
        }

        const currentParams = Array.isArray(current.parametros) ? current.parametros : [];
        const mergedParams = Array.isArray(merged.parametros) ? merged.parametros : [];
        if (currentParams.length === 0 && mergedParams.length > 0) {
          next[detalleId] = {
            ...merged,
            ...current,
            parametros: mergedParams,
          };
        }
      });
      return next;
    });
  }, [selectedOrden, resultadosByDetalle]);

  useEffect(() => {
    if (!selectedOrden || !Array.isArray(selectedOrden.items_lab) || selectedOrden.items_lab.length === 0) {
      setResumenGlobal({ hallazgos: "", conclusion: "" });
      return;
    }

    let hallazgos = "";
    let conclusion = "";
    for (const item of selectedOrden.items_lab) {
      const detalleId = Number(item?.id || 0);
      if (detalleId <= 0) continue;
      const draft = draftByDetalle[detalleId];
      if (!draft || typeof draft !== "object") continue;
      if (!hallazgos && hasMeaningfulValue(draft.hallazgos)) {
        hallazgos = String(draft.hallazgos);
      }
      if (!conclusion && hasMeaningfulValue(draft.conclusion)) {
        conclusion = String(draft.conclusion);
      }
      if (hallazgos && conclusion) break;
    }
    setResumenGlobal({ hallazgos, conclusion });
  }, [selectedOrden, draftByDetalle]);

  const metricas = useMemo(() => {
    const totalOrdenes = ordenes.length;
    const totalExamenes = ordenes.reduce((acc, row) => acc + Number(row.items_lab_total || 0), 0);
    const totalFinalizados = ordenes.reduce((acc, row) => acc + Number(row.items_lab_finalizados || 0), 0);

    return {
      totalOrdenes,
      totalExamenes,
      totalFinalizados,
      pendientes: Math.max(0, totalExamenes - totalFinalizados),
    };
  }, [ordenes]);

  const pacienteContext = useMemo(() => ({
    edad: normalizeNumber(selectedOrden?.paciente_edad),
    sexo: normalizeSexValue(selectedOrden?.paciente_sexo),
  }), [selectedOrden?.paciente_edad, selectedOrden?.paciente_sexo]);

  const updateDraftDetalle = useCallback((detalleId, updater) => {
    const id = Number(detalleId || 0);
    if (id <= 0) return;
    setDraftByDetalle((prev) => {
      const current = (prev[id] && typeof prev[id] === "object") ? prev[id] : {};
      const nextValue = updater(cloneObject(current));
      return { ...prev, [id]: nextValue };
    });
    setSaveMessageByDetalle((prev) => ({ ...prev, [id]: "" }));
    setSaveErrorByDetalle((prev) => ({ ...prev, [id]: "" }));
  }, []);

  const saveDetalleResultado = useCallback(async (detalleId, formatoCodigo, estadoGuardar = "borrador") => {
    const id = Number(detalleId || 0);
    if (id <= 0) return;
    const datosJson = draftByDetalle[id] && typeof draftByDetalle[id] === "object" ? draftByDetalle[id] : {};
    setSavingByDetalle((prev) => ({ ...prev, [id]: true }));
    setSaveErrorByDetalle((prev) => ({ ...prev, [id]: "" }));
    setSaveMessageByDetalle((prev) => ({ ...prev, [id]: "" }));
    try {
      const saved = await guardarResultadoClinicoOcupacional({
        ordenDetalleId: id,
        formatoCodigo,
        datosJson,
        estado: estadoGuardar,
        observacion: "",
      });

      if (saved && typeof saved === "object") {
        const ctxPrev = resultadoCacheRef.current.get(id) || resultadosByDetalle[id] || {};
        const ctxNext = {
          ...ctxPrev,
          data: saved,
        };
        resultadoCacheRef.current.set(id, ctxNext);
        setResultadosByDetalle((prev) => ({ ...prev, [id]: ctxNext }));
      }

      setSaveMessageByDetalle((prev) => ({
        ...prev,
        [id]: estadoGuardar === "finalizado" ? "Resultado finalizado correctamente" : "Borrador guardado correctamente",
      }));
    } catch (err) {
      setSaveErrorByDetalle((prev) => ({ ...prev, [id]: err.message || "No se pudo guardar el resultado" }));
    } finally {
      setSavingByDetalle((prev) => ({ ...prev, [id]: false }));
    }
  }, [draftByDetalle, resultadosByDetalle]);

  const actualizarSoloEsteExamen = useCallback(async (item) => {
    const detalleId = Number(item?.id || 0);
    if (detalleId <= 0) return;

    setRefreshingByDetalle((prev) => ({ ...prev, [detalleId]: true }));
    setRefreshMessageByDetalle((prev) => ({ ...prev, [detalleId]: "" }));
    setRefreshErrorByDetalle((prev) => ({ ...prev, [detalleId]: "" }));

    try {
      const refreshed = await actualizarExamenDetalleOcupacional({ ordenDetalleId: detalleId });
      const examenDescripcionNueva = String(refreshed?.examen_descripcion || "").trim();

      if (examenDescripcionNueva !== "") {
        setSelectedOrden((prev) => {
          if (!prev || !Array.isArray(prev.items_lab)) return prev;
          const nextItems = prev.items_lab.map((it) => {
            if (Number(it?.id || 0) !== detalleId) return it;
            return { ...it, examen_descripcion: examenDescripcionNueva };
          });
          return { ...prev, items_lab: nextItems };
        });
      }

      const ctx = await obtenerResultadoClinicoOcupacional({ ordenDetalleId: detalleId });
      resultadoCacheRef.current.set(detalleId, ctx);
      setResultadosByDetalle((prev) => ({ ...prev, [detalleId]: ctx }));

      setDraftByDetalle((prev) => {
        const next = { ...prev };
        delete next[detalleId];
        return next;
      });

      setRefreshMessageByDetalle((prev) => ({ ...prev, [detalleId]: "Examen actualizado desde catálogo" }));
    } catch (err) {
      setRefreshErrorByDetalle((prev) => ({ ...prev, [detalleId]: err.message || "No se pudo actualizar este examen" }));
    } finally {
      setRefreshingByDetalle((prev) => ({ ...prev, [detalleId]: false }));
    }
  }, []);

  const updateResumenGlobal = useCallback((key, value) => {
    if (!selectedOrden || !Array.isArray(selectedOrden.items_lab)) return;

    setResumenGlobal((prev) => ({ ...prev, [key]: value }));
    setDraftByDetalle((prev) => {
      const next = { ...prev };
      for (const item of selectedOrden.items_lab) {
        const detalleId = Number(item?.id || 0);
        if (detalleId <= 0) continue;
        const current = (next[detalleId] && typeof next[detalleId] === "object") ? cloneObject(next[detalleId]) : {};
        current[key] = value;
        next[detalleId] = current;
      }
      return next;
    });
    setSaveGlobalMessage("");
    setSaveGlobalError("");
  }, [selectedOrden]);

  const saveFormularioGlobal = useCallback(async (estadoGuardar = "borrador") => {
    if (!selectedOrden || !Array.isArray(selectedOrden.items_lab) || selectedOrden.items_lab.length === 0) {
      return;
    }

    setSavingGlobal(true);
    setSaveGlobalMessage("");
    setSaveGlobalError("");

    try {
      const resumenHallazgos = String(resumenGlobal?.hallazgos || "").trim();
      const resumenConclusion = String(resumenGlobal?.conclusion || "").trim();
      const payloads = [];

      for (const item of selectedOrden.items_lab) {
        const detalleId = Number(item?.id || 0);
        if (detalleId <= 0) continue;

        const resultCtx = resultadosByDetalle[detalleId] || null;
        const formatoCodigo = String(resultCtx?.detalle?.formato_codigo || item?.examen_codigo || "formato_general").trim().toLowerCase();
        const mergedDatosBase = mergeDatosForPanel(resultCtx?.data?.datos_json, resultCtx?.plantillaSugerida);
        const draftActual = (draftByDetalle[detalleId] && typeof draftByDetalle[detalleId] === "object")
          ? draftByDetalle[detalleId]
          : null;
        const datosJsonBase = draftActual
          ? mergeDatosForPanel(draftActual, mergedDatosBase)
          : mergedDatosBase;

        const datosJson = {
          ...datosJsonBase,
          hallazgos: resumenHallazgos !== ""
            ? resumenHallazgos
            : (String(datosJsonBase?.hallazgos || "").trim() !== "" ? datosJsonBase.hallazgos : ""),
          conclusion: resumenConclusion !== ""
            ? resumenConclusion
            : (String(datosJsonBase?.conclusion || "").trim() !== "" ? datosJsonBase.conclusion : ""),
        };

        const parametrosBase = Array.isArray(datosJson?.parametros) ? datosJson.parametros : [];
        const valuesMap = new Map();
        parametrosBase.forEach((param) => {
          if (!param || typeof param !== "object") return;
          const nombre = String(param?.nombre || "").trim();
          const codigo = String(param?.codigo_interno || "").trim();
          const valor = String(param?.valor ?? "");
          if (nombre) valuesMap.set(nombre, valor);
          if (codigo && !valuesMap.has(codigo)) valuesMap.set(codigo, valor);
        });

        const parametros = parametrosBase.map((param) => {
          if (!param || typeof param !== "object") return param;
          if (!String(param?.formula || "").trim()) return param;

          const valorActual = String(param?.valor ?? "").trim();
          if (valorActual !== "") return param;

          const valorCalculado = evalFormula(param.formula, Object.fromEntries(valuesMap), param.decimales);
          if (String(valorCalculado || "").trim() === "") return param;

          const nombre = String(param?.nombre || "").trim();
          const codigo = String(param?.codigo_interno || "").trim();
          if (nombre) valuesMap.set(nombre, String(valorCalculado));
          if (codigo) valuesMap.set(codigo, String(valorCalculado));

          return {
            ...param,
            valor: String(valorCalculado),
          };
        });

        const datosJsonFinal = {
          ...datosJson,
          parametros,
        };

        payloads.push({
          detalleId,
          examName: String(item?.examen_descripcion || `Detalle #${detalleId}`),
          formatoCodigo,
          datosJson: datosJsonFinal,
        });
      }

      if (estadoGuardar === "finalizado") {
        for (const payload of payloads) {
          const conclusion = String(payload?.datosJson?.conclusion || "").trim();
          if (!conclusion) {
            throw new Error(`Falta conclusión en ${payload.examName}`);
          }

          const parametros = Array.isArray(payload?.datosJson?.parametros) ? payload.datosJson.parametros : [];
          const tieneParametro = parametros.some((param) => {
            if (!param || typeof param !== "object") return false;
            const nombre = String(param?.nombre || "").trim();
            const valor = String(param?.valor ?? "").trim();
            return nombre !== "" && valor !== "";
          });
          if (!tieneParametro) {
            throw new Error(`Registre al menos un parámetro con resultado en ${payload.examName}`);
          }
        }
      }

      for (const payload of payloads) {
        const saved = await guardarResultadoClinicoOcupacional({
          ordenDetalleId: payload.detalleId,
          formatoCodigo: payload.formatoCodigo,
          datosJson: payload.datosJson,
          estado: estadoGuardar,
          observacion: "",
        });

        if (saved && typeof saved === "object") {
          const ctxPrev = resultadoCacheRef.current.get(payload.detalleId) || resultadosByDetalle[payload.detalleId] || {};
          const ctxNext = {
            ...ctxPrev,
            data: saved,
          };
          resultadoCacheRef.current.set(payload.detalleId, ctxNext);
          setResultadosByDetalle((prev) => ({ ...prev, [payload.detalleId]: ctxNext }));
        }
      }

      setSaveGlobalMessage(
        estadoGuardar === "finalizado"
          ? "Formulario completo finalizado correctamente"
          : "Formulario completo guardado en borrador"
      );
    } catch (err) {
      setSaveGlobalError(err.message || "No se pudo guardar el formulario completo");
    } finally {
      setSavingGlobal(false);
    }
  }, [selectedOrden, resultadosByDetalle, draftByDetalle, resumenGlobal]);

  const abrirFormularioOrden = useCallback((ordenId) => {
    const id = Number(ordenId || 0);
    if (id <= 0) return;
    setSelectedOrdenId(id);
    setMostrarFormulario(true);
  }, []);

  const volverATablaOrdenes = useCallback(() => {
    if (ordenIdFromQuery > 0) return;
    setMostrarFormulario(false);
  }, [ordenIdFromQuery]);

  const renderParametro = (param, idx, valuesMap, examName, editable, onValueChange) => {
    if (!param || typeof param !== "object") return null;

    if (isTipoTitulo(param.tipo) && param.nombre && String(param.nombre).trim() !== "") {
      return (
        <div key={`title-${idx}-${param.nombre}`} className="md:col-span-2">
          <div
            className="rounded-lg px-3 py-2"
            style={{
              background: param.color_fondo || "#f3f4f6",
              color: param.color_texto || "#111827",
              fontWeight: param.negrita ? "bold" : "normal",
              fontStyle: param.cursiva ? "italic" : "normal",
              textAlign: param.alineacion || "left",
            }}
          >
            {param.nombre}
          </div>
        </div>
      );
    }

    if (isTipoTextoLargo(param.tipo) && param.nombre && String(param.nombre).trim() !== "") {
      const valor = valuesMap.get(String(param.nombre).trim()) || "";
      return (
        <div key={`text-${idx}-${param.nombre}`} className="md:col-span-2 space-y-2">
          <label className="block text-sm font-semibold text-gray-700">{param.nombre}</label>
          <textarea
            value={valor}
            onChange={(event) => onValueChange(event.target.value)}
            readOnly={!editable}
            rows={Number(param.rows) > 0 ? Number(param.rows) : 4}
            className={`w-full px-4 py-3 border-2 border-gray-300 rounded-lg ${editable ? "bg-white text-gray-800" : "bg-gray-50 text-gray-700"}`}
          />
        </div>
      );
    }

    if (isTipoCampo(param.tipo) && param.nombre && String(param.nombre).trim() !== "") {
      const valor = valuesMap.get(String(param.nombre).trim()) || "";
      const opcionesCampo = Array.isArray(param.opciones)
        ? param.opciones.filter((o) => String(o).trim() !== "")
        : [];

      return (
        <div key={`campo-${idx}-${param.nombre}`} className="space-y-2">
          <label className="block text-sm font-semibold text-gray-700">{param.nombre}</label>
          {opcionesCampo.length > 0 ? (
            <select
              value={valor}
              onChange={(event) => onValueChange(event.target.value)}
              disabled={!editable}
              className={`w-full px-4 py-3 border-2 border-gray-300 rounded-lg ${editable ? "bg-white text-gray-800" : "bg-gray-100 text-gray-700"}`}
            >
              <option value="">-- Sin dato --</option>
              {opcionesCampo.map((op, oi) => (
                <option key={oi} value={op}>{op}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={valor}
              onChange={(event) => onValueChange(event.target.value)}
              readOnly={!editable}
              className={`w-full px-4 py-3 border-2 border-gray-300 rounded-lg ${editable ? "bg-white text-gray-800" : "bg-gray-50 text-gray-700"}`}
            />
          )}
        </div>
      );
    }

    if (isTipoParametro(param.tipo) && param.nombre && String(param.nombre).trim() !== "") {
      const nombre = String(param.nombre).trim();
      const codigo = String(param.codigo_interno || "").trim();

      const rawByName = valuesMap.get(nombre) || "";
      const rawByCode = codigo ? (valuesMap.get(codigo) || "") : "";
      const baseValue = rawByCode || rawByName;

      const computedValue = param.formula
        ? evalFormula(param.formula, Object.fromEntries(valuesMap), param.decimales)
        : "";

      const valor = computedValue || baseValue;
      const isFormula = String(param.formula || "").trim() !== "";

      const { fueraDeRango, min, max, referenciaAplicada } = getParameterStatus(param, valor, pacienteContext);

      let referenciaTexto = null;
      if (min !== null || max !== null) {
        referenciaTexto = `Rango de referencia: ${min !== null ? formatReferenceNumber(min) : "∞"} - ${max !== null ? formatReferenceNumber(max) : "∞"}`;
      } else if (referenciaAplicada && referenciaAplicada.valor && String(referenciaAplicada.valor).trim() !== "") {
        referenciaTexto = `Referencia: ${referenciaAplicada.valor}`;
      } else if (String(param.referencia || "").trim() !== "") {
        referenciaTexto = `Referencia: ${param.referencia}`;
      }

      const displayName = /^item\s*\d+$/i.test(nombre) ? `${examName} — ${nombre}` : nombre;

      return (
        <div key={`param-${idx}-${nombre}`} className="space-y-2">
          <label className="block text-sm font-semibold text-gray-700">
            <div className="flex items-center gap-2 mb-1">
              <span>{displayName}</span>
              {isFormula ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  🧮 Calculado
                </span>
              ) : null}
            </div>
            {isFormula ? (
              <span className="text-xs text-blue-600 font-normal">Fórmula: {param.formula}</span>
            ) : null}
            {referenciaTexto ? (
              <div className="text-xs text-gray-500 mt-1">{referenciaTexto}</div>
            ) : null}
          </label>

          <div className="relative">
            <input
              type="text"
              value={valor}
              onChange={(event) => {
                if (isFormula || !editable) return;
                onValueChange(event.target.value);
              }}
              readOnly={isFormula || !editable}
              className={`w-full px-4 py-3 border-2 rounded-lg transition-all duration-200 ${
                fueraDeRango
                  ? "border-red-400 bg-red-50 text-red-700 font-semibold"
                  : isFormula
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : (editable ? "border-gray-300 bg-white text-gray-800" : "border-gray-300 bg-gray-50 text-gray-700")
              }`}
              placeholder="Sin dato"
            />
            {valor ? (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                {fueraDeRango ? (
                  <span className="text-red-500 font-bold">⚠️</span>
                ) : (
                  <span className="text-green-500 font-bold">✓</span>
                )}
              </div>
            ) : null}
          </div>

          {fueraDeRango && (min !== null || max !== null) ? (
            <div className="flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2 py-1 rounded-md">
              <span>⚠️</span>
              <span>Valor fuera del rango de referencia</span>
            </div>
          ) : null}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-cyan-100 bg-gradient-to-r from-cyan-50 to-blue-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Laboratorio ocupacional (solo protocolo)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Vista dedicada para laboratorista. Replica el flujo de secciones por examen del panel clínico, en modo lectura.
            </p>
          </div>
          {mostrarListaOrdenes && mostrarFormulario ? (
            <button
              type="button"
              onClick={volverATablaOrdenes}
              className="rounded-md border border-cyan-300 bg-white px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-50"
            >
              Volver a tabla ocupacional
            </button>
          ) : null}
        </div>
        {mostrarListaOrdenes ? (
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-2"><p className="text-[11px] text-slate-500">Órdenes con lab</p><p className="text-lg font-bold text-slate-900">{metricas.totalOrdenes}</p></div>
            <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-2"><p className="text-[11px] text-slate-500">Exámenes lab</p><p className="text-lg font-bold text-slate-900">{metricas.totalExamenes}</p></div>
            <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-2"><p className="text-[11px] text-slate-500">Finalizados</p><p className="text-lg font-bold text-emerald-700">{metricas.totalFinalizados}</p></div>
            <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-2"><p className="text-[11px] text-slate-500">Pendientes</p><p className="text-lg font-bold text-amber-700">{metricas.pendientes}</p></div>
          </div>
        ) : null}
      </div>

      {mostrarListaOrdenes ? (
        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(260px,1fr)_180px_160px_160px]">
            <input
              className="h-10 rounded border border-slate-300 px-3 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar código, documento o protocolo"
            />
            <select
              className="h-10 rounded border border-slate-300 px-3 text-sm"
              value={estado}
              onChange={(event) => setEstado(event.target.value)}
            >
              <option value="">Todos los estados</option>
              <option value="emitida">Emitida</option>
              <option value="en_proceso">En proceso</option>
              <option value="completada">Completada</option>
              <option value="cerrada">Cerrada</option>
              <option value="anulada">Anulada</option>
            </select>
            <input type="date" className="h-10 rounded border border-slate-300 px-3 text-sm" value={fechaDesde} onChange={(event) => setFechaDesde(event.target.value)} />
            <input type="date" className="h-10 rounded border border-slate-300 px-3 text-sm" value={fechaHasta} onChange={(event) => setFechaHasta(event.target.value)} />
          </div>
        </section>
      ) : null}

      {mostrarListaOrdenes && loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-cyan-700">
          Cargando bandeja ocupacional de laboratorio...
        </div>
      ) : null}
      {mostrarListaOrdenes && error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {mostrarListaOrdenes && !mostrarFormulario ? (
        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Órdenes ocupacionales con laboratorio</h3>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-600">Filas</label>
              <select
                className="h-8 rounded border border-slate-300 px-2 text-xs"
                value={perPage}
                onChange={(event) => setPerPage(Number(event.target.value) || 10)}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
            </div>
          </div>
          {ordenes.length === 0 && !loading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
              No hay órdenes con exámenes de laboratorio para los filtros actuales.
            </div>
          ) : null}

          {ordenes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-700">
                    <th className="px-3 py-2 font-semibold">Orden</th>
                    <th className="px-3 py-2 font-semibold">Paciente</th>
                    <th className="px-3 py-2 font-semibold">Empresa</th>
                    <th className="px-3 py-2 font-semibold">Protocolo</th>
                    <th className="px-3 py-2 font-semibold">Avance</th>
                    <th className="px-3 py-2 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenes.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.codigo || `Orden #${row.id}`}</td>
                      <td className="px-3 py-2 text-slate-700">{row.paciente_nombre_completo || row.documento_numero || "Paciente"}</td>
                      <td className="px-3 py-2 text-slate-600">{row.empresa || "-"}</td>
                      <td className="px-3 py-2 text-slate-600">{row.protocolo_descripcion || "Sin protocolo"}</td>
                      <td className="px-3 py-2">
                        <span className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                          {row.items_lab_finalizados}/{row.items_lab_total}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => abrirFormularioOrden(row.id)}
                          className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700"
                        >
                          Abrir formulario
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-600">
              Página {page} de {Math.max(1, Number(metaOrdenes.total_pages || 1))}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={loading || page <= 1}
                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(Math.max(1, Number(metaOrdenes.total_pages || 1)), prev + 1))}
                disabled={loading || page >= Math.max(1, Number(metaOrdenes.total_pages || 1))}
                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Siguiente
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {mostrarFormulario ? (
        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          {mostrarListaOrdenes ? (
            <div className="mb-3">
              <button
                type="button"
                onClick={volverATablaOrdenes}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                ← Volver a tabla de órdenes
              </button>
            </div>
          ) : null}
          <h3 className="text-sm font-semibold text-slate-800">Detalle de orden y secciones de exámenes</h3>

          {detalleLoading ? <p className="mt-3 text-sm text-cyan-700">Cargando detalle de orden...</p> : null}
          {detalleError ? <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{detalleError}</p> : null}

          {!detalleLoading && !selectedOrden ? (
            <p className="mt-3 text-sm text-slate-600">Seleccione una orden para ver los exámenes ocupacionales de laboratorio.</p>
          ) : null}

          {selectedOrden ? (
            <div className="mt-3 space-y-4">
              <div className="rounded-xl p-4 text-white" style={{ background: "linear-gradient(90deg, var(--color-primary) 0%, var(--color-secondary) 100%)" }}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                    <div className="text-white/80 text-xs">Orden</div>
                    <div className="text-lg font-bold leading-tight">{selectedOrden.codigo || `#${selectedOrden.id}`}</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 col-span-2 lg:col-span-1">
                    <div className="text-white/80 text-xs">Paciente</div>
                    <div className="text-lg font-bold leading-tight line-clamp-2">{selectedOrden.paciente_nombre_completo || "Paciente"}</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                    <div className="text-white/80 text-xs">Documento</div>
                    <div className="text-lg font-bold leading-tight">{selectedOrden.documento_numero || "-"}</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                    <div className="text-white/80 text-xs">Estado</div>
                    <div className="text-lg font-bold leading-tight">{selectedOrden.estado || "-"}</div>
                  </div>
                </div>
                <div className="mt-3 bg-white/10 backdrop-blur-sm rounded-lg p-3">
                  <div className="text-white/80 text-xs mb-1">Exámenes de laboratorio del protocolo</div>
                  <div className="text-sm leading-6">{(selectedOrden.items_lab || []).map((it) => it.examen_descripcion).filter(Boolean).join(", ") || "Sin exámenes"}</div>
                </div>
              </div>

              {resultadosLoading ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-cyan-700">
                  Cargando secciones de resultados...
                </div>
              ) : null}
              {resultadosError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {resultadosError}
                </div>
              ) : null}

              <div className="max-h-[720px] overflow-y-auto space-y-4 pr-1">
                {(selectedOrden.items_lab || []).map((item) => {
                  const detalleId = Number(item?.id || 0);
                  const resultCtx = resultadosByDetalle[detalleId] || null;
                  const resultData = resultCtx?.data || null;
                  const mergedDatos = mergeDatosForPanel(resultData?.datos_json, resultCtx?.plantillaSugerida);
                  const datosBase = (draftByDetalle[detalleId] && typeof draftByDetalle[detalleId] === "object")
                    ? draftByDetalle[detalleId]
                    : mergedDatos;

                  const examName = String(item?.examen_descripcion || "Examen de laboratorio");
                  const flags = extractReadOnlyFlags({ data: { datos_json: datosBase } });
                  const formatoCodigo = String(resultCtx?.detalle?.formato_codigo || item?.examen_codigo || "formato_general").trim().toLowerCase();
                  const saving = Boolean(savingByDetalle[detalleId]);
                  const refreshing = Boolean(refreshingByDetalle[detalleId]);

                  const rawParametros = Array.isArray(datosBase?.parametros) ? datosBase.parametros : [];
                  const parametros = rawParametros.filter((param) => param && typeof param === "object");

                  const valuesMap = new Map();
                  parametros.forEach((param) => {
                    const nombre = String(param?.nombre || "").trim();
                    const codigo = String(param?.codigo_interno || "").trim();
                    const valor = String(param?.valor ?? "");
                    if (nombre) valuesMap.set(nombre, valor);
                    if (codigo && !valuesMap.has(codigo)) valuesMap.set(codigo, valor);
                  });

                  const onParamValueChange = (paramIndex, nextValue) => {
                    updateDraftDetalle(detalleId, (current) => {
                      const seeded = mergeDatosForPanel(current, mergedDatos);
                      const next = { ...(seeded || {}) };
                      const list = Array.isArray(next.parametros) ? [...next.parametros] : [];
                      if (!list[paramIndex] || typeof list[paramIndex] !== "object") return next;
                      list[paramIndex] = { ...list[paramIndex], valor: nextValue };
                      next.parametros = list;
                      return next;
                    });
                  };

                  return (
                    <div key={detalleId || examName} className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                      <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">🧪</div>
                          <div>
                            <h4 className="text-lg font-bold text-gray-900">{examName}</h4>
                            <p className="text-sm text-gray-600">Lectura de resultado ocupacional</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => actualizarSoloEsteExamen(item)}
                            disabled={refreshing || saving}
                            className="rounded border border-cyan-300 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                            title="Actualizar solo este examen con la última configuración del catálogo"
                          >
                            {refreshing ? "Actualizando..." : "Actualizar examen"}
                          </button>
                          <span className={`rounded border px-2.5 py-1 text-xs font-semibold ${badgeByExamStatus(item, resultData).className}`}>
                            {badgeByExamStatus(item, resultData).label}
                          </span>
                        </div>
                      </div>

                      <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-2">
                        <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg px-3 py-2">
                          <input
                            type="checkbox"
                            checked={flags.imprimir}
                            onChange={(event) => {
                              updateDraftDetalle(detalleId, (current) => ({ ...current, imprimir_examen: event.target.checked ? "1" : "0" }));
                            }}
                            className="h-4 w-4"
                          />
                          <span>Imprimir este examen</span>
                        </label>
                        <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg px-3 py-2">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={flags.alarmaActiva}
                              onChange={(event) => {
                                updateDraftDetalle(detalleId, (current) => ({ ...current, alarma_activa: event.target.checked ? "1" : "0" }));
                              }}
                              className="h-4 w-4"
                            />
                            <span>Alarma</span>
                          </label>
                          <input
                            type="text"
                            value={flags.alarmaDias}
                            onChange={(event) => {
                              updateDraftDetalle(detalleId, (current) => ({ ...current, alarma_dias: event.target.value }));
                            }}
                            className="w-14 px-2 py-1 border border-gray-300 rounded bg-white text-gray-700"
                          />
                          <span className="text-xs text-gray-500">días</span>
                        </div>
                      </div>

                      {!flags.imprimir ? (
                        <div className="mb-4 px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
                          Este examen está marcado para no imprimirse.
                        </div>
                      ) : null}

                      {parametros.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {parametros.map((param, idx) => renderParametro(
                            param,
                            idx,
                            valuesMap,
                            examName,
                            true,
                            (nextValue) => onParamValueChange(idx, nextValue)
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
                          No hay parámetros estructurados para este examen en la plantilla ocupacional.
                        </div>
                      )}

                      {saveErrorByDetalle[detalleId] ? (
                        <div className="mt-3 text-xs text-rose-700">{saveErrorByDetalle[detalleId]}</div>
                      ) : null}
                      {refreshMessageByDetalle[detalleId] ? (
                        <div className="mt-2 text-xs text-cyan-700">{refreshMessageByDetalle[detalleId]}</div>
                      ) : null}
                      {refreshErrorByDetalle[detalleId] ? (
                        <div className="mt-2 text-xs text-rose-700">{refreshErrorByDetalle[detalleId]}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-800">Resumen global de la orden (al final)</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Este bloque se aplica a todos los exámenes de laboratorio de la orden para evitar cruces con el formato dinámico por examen.
                </p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">Hallazgos</p>
                    <textarea
                      className="w-full min-h-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                      value={String(resumenGlobal.hallazgos || "")}
                      onChange={(event) => updateResumenGlobal("hallazgos", event.target.value)}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">Conclusión</p>
                    <textarea
                      className="w-full min-h-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                      value={String(resumenGlobal.conclusion || "")}
                      onChange={(event) => updateResumenGlobal("conclusion", event.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
                    disabled={savingGlobal}
                    onClick={() => saveFormularioGlobal("borrador")}
                  >
                    {savingGlobal ? "Guardando..." : "Guardar borrador (todo)"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    disabled={savingGlobal}
                    onClick={() => saveFormularioGlobal("finalizado")}
                  >
                    {savingGlobal ? "Finalizando..." : "Finalizar formulario"}
                  </button>
                  {saveGlobalMessage ? (
                    <span className="text-xs text-emerald-700">{saveGlobalMessage}</span>
                  ) : null}
                  {saveGlobalError ? (
                    <span className="text-xs text-rose-700">{saveGlobalError}</span>
                  ) : null}
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                Modo edición: puede registrar resultados por examen desde este panel.
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
