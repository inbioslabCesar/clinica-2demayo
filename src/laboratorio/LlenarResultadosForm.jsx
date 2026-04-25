
import { useState, useEffect } from "react";
import { BASE_URL } from "../config/config";

function LlenarResultadosForm({ orden, onVolver, onGuardado }) {
  const [examenesDisponibles, setExamenesDisponibles] = useState([]);
  const [resultados, setResultados] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("success");
  const [archivosExternos, setArchivosExternos] = useState({});
  const [subiendoArchivo, setSubiendoArchivo] = useState({});
  const [subidosArchivo, setSubidosArchivo] = useState({});
  const [docExternos, setDocExternos] = useState([]);

  const pacienteId = orden?.paciente_id_ref || orden?.paciente_id;

  const cargarDocExternos = () => {
    if (!pacienteId || !orden?.id) return;
    fetch(`${BASE_URL}api_documentos_paciente.php?paciente_id=${pacienteId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.documentos) {
          // Prefer explicit order match, but keep cotizacion-linked fallback for historical uploads.
          const ordenIdStr = String(orden.id);
          const cotizacionId = Number(orden?.cotizacion_id || 0);
          setDocExternos(data.documentos.filter(d => {
            if (d.origen !== 'externo') return false;
            if (String(d.orden_id || '') === ordenIdStr) return true;
            return Number(d.orden_id || 0) === 0
              && cotizacionId > 0
              && Number(d.cotizacion_id || 0) === cotizacionId;
          }));
        }
      })
      .catch(() => {});
  };

  useEffect(() => { cargarDocExternos(); }, [orden?.id]);

  const normalizeTipo = (tipo) =>
    String(tipo || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z]/g, '');

  const isTipoParametro = (tipo) => {
    const t = normalizeTipo(tipo || 'Parámetro');
    if (!t) return true;
    return t === 'parametro' || (t.startsWith('par') && t.includes('metro'));
  };

  const isTipoTextoLargo = (tipo) => {
    const t = normalizeTipo(tipo);
    return t === 'textolargo' || (t.startsWith('texto') && t.includes('largo'));
  };

  const isTipoCampo = (tipo) => normalizeTipo(tipo) === 'campo';

  const isTipoTitulo = (tipo) => {
    const t = normalizeTipo(tipo);
    return t === 'titulo' || t === 'subtitulo' || t.startsWith('subtitul') || t.startsWith('titul');
  };

  const parseExamenesArray = (examenesRaw) => {
    if (typeof examenesRaw === 'string') {
      try {
        return JSON.parse(examenesRaw);
      } catch {
        return examenesRaw.split(',').map(s => s.trim()).filter(s => s);
      }
    }
    if (Array.isArray(examenesRaw)) return examenesRaw;
    if (examenesRaw) return [examenesRaw];
    return [];
  };

  const getExamenId = (examenItem) => (typeof examenItem === 'object' ? examenItem.id : examenItem);

  const normalizeExamName = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

  const printFlagKey = (examId) => `${examId}__imprimir_examen`;
  const alarmActiveKey = (examId) => `${examId}__alarma_activa`;
  const alarmDaysKey = (examId) => `${examId}__alarma_dias`;

  const parseSuggestedDaysFromTiempo = (tiempoRaw) => {
    const raw = String(tiempoRaw || '').trim();
    if (!raw) return null;

    const normalized = raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const dayMatch = normalized.match(/(\d+)\s*(dias?|d)\b/);
    if (dayMatch) {
      const days = parseInt(dayMatch[1], 10);
      return Number.isFinite(days) && days > 0 ? days : null;
    }

    const hourMatch = normalized.match(/(\d+)\s*(horas?|hrs?|h)\b/);
    if (hourMatch) {
      const hours = parseInt(hourMatch[1], 10);
      if (Number.isFinite(hours) && hours > 0) {
        return Math.max(1, Math.ceil(hours / 24));
      }
    }

    const numberMatch = normalized.match(/\b(\d+)\b/);
    if (numberMatch) {
      const fallback = parseInt(numberMatch[1], 10);
      return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
    }

    return null;
  };

  const isExamPrintable = (examId, source = resultados) => {
    const raw = source[printFlagKey(examId)];
    if (raw === undefined || raw === null || raw === '') return true;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw === 1;
    const normalized = String(raw).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'si' || normalized === 'sí';
  };

  const isExamAlarmActive = (examId, source = resultados) => {
    const raw = source[alarmActiveKey(examId)];
    if (raw === undefined || raw === null || raw === '') return false;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw === 1;
    const normalized = String(raw).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'si' || normalized === 'sí';
  };

  const getExamAlarmDays = (examId, source = resultados) => {
    const raw = source[alarmDaysKey(examId)];
    if (raw === undefined || raw === null) return '';
    const asText = String(raw).trim();
    return asText;
  };

  useEffect(() => {
    fetch(BASE_URL + "api_examenes_laboratorio.php", {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setExamenesDisponibles(data.examenes || []));
  }, []);

  useEffect(() => {
    if (!examenesDisponibles || examenesDisponibles.length === 0) return;
    const examenesArray = parseExamenesArray(orden.examenes);

    if (orden.resultados && typeof orden.resultados === 'object') {
      const preloaded = { ...orden.resultados };
      examenesArray.forEach(exItem => {
        const id = getExamenId(exItem);
        const exObj = examenesDisponibles.find(e => e.id == id);
        const exOrdenDetalle = Array.isArray(orden.examenes)
          ? orden.examenes.find(ex => (typeof ex === 'object' && ex.id == id))
          : null;
        const suggestedDays = parseSuggestedDaysFromTiempo(
          (exObj && exObj.tiempo_resultado) || (exOrdenDetalle && exOrdenDetalle.tiempo_resultado) || ''
        );

        if (!Object.prototype.hasOwnProperty.call(preloaded, printFlagKey(id))) {
          preloaded[printFlagKey(id)] = 1;
        }
        if (!Object.prototype.hasOwnProperty.call(preloaded, alarmActiveKey(id))) {
          preloaded[alarmActiveKey(id)] = 0;
        }
        if (!Object.prototype.hasOwnProperty.call(preloaded, alarmDaysKey(id))) {
          preloaded[alarmDaysKey(id)] = suggestedDays || '';
        }
      });
      setResultados(preloaded);
    } else {
      const res = {};
      
      examenesArray.forEach(exId => {
        // Si exId es un objeto con id, extraer el id
        const id = getExamenId(exId);
        res[printFlagKey(id)] = 1;
        res[alarmActiveKey(id)] = 0;
        const exObj = examenesDisponibles.find(e => e.id == id);
        // Fallback: usar parámetros adjuntos a la orden si el catálogo no los trae
        let exOrdenDetalle = null;
        if (Array.isArray(orden.examenes)) {
          exOrdenDetalle = orden.examenes.find(ex => (typeof ex === 'object' && ex.id == id)) || null;
        }
        res[alarmDaysKey(id)] = parseSuggestedDaysFromTiempo(
          (exObj && exObj.tiempo_resultado) || (exOrdenDetalle && exOrdenDetalle.tiempo_resultado) || ''
        ) || '';
        const paramsList = (exObj && Array.isArray(exObj.valores_referenciales) && exObj.valores_referenciales.length > 0)
          ? exObj.valores_referenciales
          : (exOrdenDetalle && Array.isArray(exOrdenDetalle.valores_referenciales) ? exOrdenDetalle.valores_referenciales : []);

        if (paramsList.length > 0) {
          paramsList.filter(p => p && typeof p === 'object').forEach(param => {
            if ((isTipoParametro(param.tipo) || isTipoTextoLargo(param.tipo) || isTipoCampo(param.tipo)) && param.nombre && param.nombre.trim() !== "") {
              res[`${id}__${param.nombre}`] = "";
            }
          });
        } else {
          // Sin parámetros definidos: usar campo libre
          res[`${id}`] = "";
        }
      });
      
      setResultados(res);
    }
  }, [orden?.id, examenesDisponibles]);

  // Normaliza valores numéricos desde entradas de texto (soporta coma decimal y unidades)
  function normalizeNumber(value) {
    // Cuando no haya número válido, retornar NaN en lugar de 0.
    // Esto evita que rangos vacíos se muestren como "0 - 0".
    if (value === null || value === undefined) return NaN;
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    let s = String(value).trim();
    // convertir coma decimal a punto
    s = s.replace(/,/g, ".");
    // extraer el primer número válido (soporta signo y decimales)
    const match = s.match(/-?\d+(?:\.\d+)?/);
    if (!match) return NaN;
    const n = parseFloat(match[0]);
    return Number.isFinite(n) ? n : NaN;
  }

  function normalizeSexValue(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normalized.startsWith('m')) return 'masculino';
    if (normalized.startsWith('f')) return 'femenino';
    return normalized;
  }

  function getPacienteContext() {
    return {
      edad: normalizeNumber(orden?.paciente_edad),
      sexo: normalizeSexValue(orden?.paciente_sexo),
    };
  }

  function getApplicableReference(param, paciente) {
    if (!param || !Array.isArray(param.referencias) || param.referencias.length === 0) return null;

    const refs = param.referencias.filter((r) => r && typeof r === 'object');
    if (refs.length === 0) return null;

    const { edad, sexo } = paciente || {};
    if (!Number.isFinite(edad) || !sexo) {
      return refs[0] || null;
    }

    const refMatch = refs.find((ref) => {
      const refSexo = normalizeSexValue(ref.sexo || 'cualquiera');
      const refEdadMin = normalizeNumber(ref.edad_min);
      const refEdadMax = normalizeNumber(ref.edad_max);
      const sexoMatch = !refSexo || refSexo === 'cualquiera' || refSexo === sexo;
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
      return Number(numVal).toFixed(parseInt(decimales, 10));
    }
    if (Number.isInteger(numVal)) return String(Math.trunc(numVal));
    return String(numVal);
  }

  function evalFormula(formula, valoresPorNombre, decimales = null) {
    if (!formula) return "";
    let expr = formula;
    const nombres = Object.keys(valoresPorNombre).sort((a, b) => b.length - a.length);
    nombres.forEach(nombre => {
      const rawVal = valoresPorNombre[nombre];
      const numVal = normalizeNumber(rawVal);
      // Escapar el nombre para usar en RegExp
      const safeName = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safeName, 'g');
      if (!regex.test(expr)) {
        return;
      }
      if (!Number.isFinite(numVal)) {
        expr = "";
        return;
      }
      expr = expr.replace(regex, numVal);
    });
    if (!expr || expr.trim() === "") return "";
    try {
      // Evaluador aritmetico seguro para formulas numericas basicas.
      // Soporta: + - * / % ^ parentesis y notacion cientifica.
      const normalizedExpr = String(expr)
        .replace(/,/g, '.')
        .replace(/\^/g, '**')
        .trim();

      const allowedExpr = /^[0-9+\-*/().\s%eE*]*$/;
      if (!allowedExpr.test(normalizedExpr)) return "";

      const result = Function(`"use strict"; return (${normalizedExpr});`)();
      if (typeof result === "number" && !isNaN(result)) {
        if (!Number.isFinite(result)) return "";
        return formatWithDecimals(result, decimales);
      }
      return result;
    } catch {
      return "";
    }
  }

  // Extrae min/max desde un texto de referencia (p.ej. "2.5-5.8", "2,5 – 5,8", "entre 2.5 y 5.8").
  function parseMinMaxFromText(texto) {
    if (!texto) return { min: null, max: null };
    let s = String(texto).trim();
    // normalizar separadores y coma decimal
    s = s.replace(/,/g, '.');
    // quitar etiquetas comunes
    s = s.replace(/^(?:N\s*:\s*|Normal\s*:\s*)/i, '');
    s = s.replace(/Rango(?:\s*de)?\s*referencia\s*:?/i, '');
    // patrón de rango "x - y" con distintos separadores
    const mRango = s.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|a|hasta|entre|y)\s*(-?\d+(?:\.\d+)?)/i);
    if (mRango) {
      const min = parseFloat(mRango[1]);
      const max = parseFloat(mRango[2]);
      return {
        min: Number.isFinite(min) ? min : null,
        max: Number.isFinite(max) ? max : null,
      };
    }
    // límites unilaterales
    const mMin = s.match(/(?:>=|≥|desde|mayor\s*a?)\s*(-?\d+(?:\.\d+)?)/i);
    const mMax = s.match(/(?:<=|≤|hasta|menor\s*a?)\s*(-?\d+(?:\.\d+)?)/i);
    const min = mMin ? parseFloat(mMin[1]) : null;
    const max = mMax ? parseFloat(mMax[1]) : null;
    return {
      min: Number.isFinite(min) ? min : null,
      max: Number.isFinite(max) ? max : null,
    };
  }

  const handleChange = (e) => {
    const nuevos = { ...resultados, [e.target.name]: e.target.value };
    setResultados(nuevos);
  };

  const handlePrintToggle = (examId, checked) => {
    setResultados(prev => ({
      ...prev,
      [printFlagKey(examId)]: checked ? 1 : 0,
    }));
  };

  const handleAlarmToggle = (examId, checked, suggestedDays = null) => {
    setResultados(prev => {
      const next = {
        ...prev,
        [alarmActiveKey(examId)]: checked ? 1 : 0,
      };

      if (!checked) {
        next[alarmDaysKey(examId)] = '';
      } else {
        const currentDays = String(prev[alarmDaysKey(examId)] ?? '').trim();
        if (!currentDays && suggestedDays && Number.isFinite(Number(suggestedDays)) && Number(suggestedDays) > 0) {
          next[alarmDaysKey(examId)] = String(parseInt(suggestedDays, 10));
        }
      }

      return next;
    });
  };

  const handleAlarmDaysChange = (examId, value) => {
    const digitsOnly = String(value || '').replace(/[^0-9]/g, '');
    setResultados(prev => ({
      ...prev,
      [alarmDaysKey(examId)]: digitsOnly,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setMsg("");

    try {
      // Antes de enviar, evaluar todas las fórmulas y asegurarnos de inyectar sus valores en el objeto `resultados`
      const examenesArray = parseExamenesArray(orden.examenes);
      const examIdsSet = new Set(
        examenesArray
          .map(getExamenId)
          .map(id => String(id))
          .filter(id => id !== "" && id !== "0")
      );
      const resultadosToSend = Object.fromEntries(
        Object.entries(resultados).filter(([key]) => {
          const keyText = String(key);
          const examPrefix = keyText.includes('__') ? keyText.split('__')[0] : keyText;
          return examIdsSet.has(examPrefix);
        })
      );

      // Para cada examen, buscar sus parámetros y calcular fórmulas si las tiene
      examenesArray.forEach(exId => {
        const id = getExamenId(exId);
        const exObj = examenesDisponibles.find(e => e.id == id);
        const exOrdenDetalle = Array.isArray(orden.examenes)
          ? orden.examenes.find(ex => (typeof ex === 'object' && ex.id == id))
          : null;
        const suggestedDays = parseSuggestedDaysFromTiempo(
          (exObj && exObj.tiempo_resultado) || (exOrdenDetalle && exOrdenDetalle.tiempo_resultado) || ''
        );

        if (!Object.prototype.hasOwnProperty.call(resultadosToSend, printFlagKey(id))) {
          resultadosToSend[printFlagKey(id)] = 1;
        }
        if (!Object.prototype.hasOwnProperty.call(resultadosToSend, alarmActiveKey(id))) {
          resultadosToSend[alarmActiveKey(id)] = 0;
        }
        if (!Object.prototype.hasOwnProperty.call(resultadosToSend, alarmDaysKey(id))) {
          resultadosToSend[alarmDaysKey(id)] = suggestedDays || '';
        }

        const alarmActive = isExamAlarmActive(id, resultadosToSend);
        const alarmDaysText = String(resultadosToSend[alarmDaysKey(id)] ?? '').trim();
        const alarmDaysNum = parseInt(alarmDaysText, 10);
        if (alarmActive && Number.isFinite(alarmDaysNum) && alarmDaysNum > 0) {
          resultadosToSend[alarmDaysKey(id)] = String(alarmDaysNum);
        } else if (alarmActive && suggestedDays) {
          resultadosToSend[alarmDaysKey(id)] = String(parseInt(suggestedDays, 10));
        } else {
          resultadosToSend[alarmDaysKey(id)] = '';
        }
        const paramsList = (exObj && Array.isArray(exObj.valores_referenciales) && exObj.valores_referenciales.length > 0)
          ? exObj.valores_referenciales
          : (exOrdenDetalle && Array.isArray(exOrdenDetalle.valores_referenciales) ? exOrdenDetalle.valores_referenciales : []);
        if (!Array.isArray(paramsList) || paramsList.length === 0) return;
        // construir mapa de valores por nombre para esta iteración (usar los valores ya calculados o ingresados)
        const valoresPorNombre = {};
        paramsList.filter(p => p && typeof p === 'object').forEach(param => {
          if (isTipoParametro(param.tipo) && param.nombre && param.nombre.trim() !== "") {
            valoresPorNombre[param.nombre] = resultadosToSend[`${id}__${param.nombre}`] || "";
          }
        });
        // evaluar y almacenar fórmulas
        paramsList.filter(p => p && typeof p === 'object').forEach(param => {
          if (isTipoParametro(param.tipo) && param.nombre && param.nombre.trim() !== "") {
            if (param.formula && param.formula.trim() !== "") {
              const computed = evalFormula(param.formula, valoresPorNombre, param.decimales);
              // actualizar tanto el mapa local como el objeto a enviar
              valoresPorNombre[param.nombre] = computed === null || computed === undefined ? "" : computed;
              resultadosToSend[`${id}__${param.nombre}`] = computed === null || computed === undefined ? "" : computed;
            }
          }
        });
      });

      const res = await fetch(BASE_URL + "api_resultados_laboratorio.php", {
        method: "POST",
        credentials: 'include',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orden_id: orden.id,
          consulta_id: orden.consulta_id || null,
          tipo_examen: "varios",
          resultados: resultadosToSend,
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        setMsg("✅ Resultados guardados correctamente");
        setMsgType("success");
        setTimeout(() => {
          onGuardado && onGuardado(data);
        }, 1000);
      } else {
        setMsg("❌ " + (data.error || "Error al guardar"));
        setMsgType("error");
      }
    } catch {
      setMsg("❌ Error de conexión");
      setMsgType("error");
    } finally {
      setGuardando(false);
    }
  };

  const getParameterStatus = (param, valor) => {
    let fueraDeRango = false;
    let min = null, max = null;

    const paciente = getPacienteContext();
    const referenciaAplicada = getApplicableReference(param, paciente);

    if (param && param.min !== null && param.min !== "") {
      const m = normalizeNumber(param.min);
      if (Number.isFinite(m)) min = m;
    } else if (referenciaAplicada) {
      const mRef = normalizeNumber(referenciaAplicada.valor_min);
      if (Number.isFinite(mRef)) min = mRef;
    }

    if (param && param.max !== null && param.max !== "") {
      const M = normalizeNumber(param.max);
      if (Number.isFinite(M)) max = M;
    } else if (referenciaAplicada) {
      const MRef = normalizeNumber(referenciaAplicada.valor_max);
      if (Number.isFinite(MRef)) max = MRef;
    }

    // Si no hay min/max numéricos, intentar parsear desde el texto de referencia
    if ((min === null && max === null) && referenciaAplicada && referenciaAplicada.valor) {
      const fromText = parseMinMaxFromText(referenciaAplicada.valor);
      if (fromText.min !== null) min = fromText.min;
      if (fromText.max !== null) max = fromText.max;
    }
    
    let valorNum = normalizeNumber(valor);
    if (Number.isFinite(valorNum)) {
      if (min !== null && valorNum < min) fueraDeRango = true;
      if (max !== null && valorNum > max) fueraDeRango = true;
    }

    return { fueraDeRango, min, max, referenciaAplicada };
  };

  const handleArchivoExamenChange = (examId, file) => {
    setArchivosExternos(prev => ({ ...prev, [examId]: file || null }));
    setSubidosArchivo(prev => ({ ...prev, [examId]: false }));
  };

  const handleSubirArchivoExamen = async (examId, examNombre) => {
    const archivo = archivosExternos[examId];
    if (!archivo || !pacienteId) return;
    setSubiendoArchivo(prev => ({ ...prev, [examId]: true }));
    try {
      const fd = new FormData();
      fd.append('paciente_id', pacienteId);
      fd.append('tipo', 'laboratorio');
      fd.append('titulo', examNombre + ' - Resultado Externo');
      fd.append('descripcion', 'Resultado procesado en laboratorio externo. Orden #' + orden.id);
      fd.append('orden_id', orden.id);
      fd.append('archivos[]', archivo);
      const res = await fetch(BASE_URL + 'api_documentos_paciente.php', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        setSubidosArchivo(prev => ({ ...prev, [examId]: true }));
        setArchivosExternos(prev => ({ ...prev, [examId]: null }));
        cargarDocExternos();
      } else {
        alert('Error al subir: ' + (data.error || 'Error desconocido'));
      }
    } catch {
      alert('Error de conexión al subir el archivo');
    } finally {
      setSubiendoArchivo(prev => ({ ...prev, [examId]: false }));
    }
  };

  const handleEliminarDocExamen = async (documentoId) => {
    if (!window.confirm('¿Eliminar este archivo?')) return;
    try {
      const res = await fetch(BASE_URL + 'api_documentos_paciente.php', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documento_id: documentoId }),
      });
      const data = await res.json();
      if (data.success) {
        cargarDocExternos();
      } else {
        alert('Error al eliminar: ' + (data.error || 'Error desconocido'));
      }
    } catch {
      alert('Error de conexión al eliminar');
    }
  };

  const renderUploadExamen = (id, examName) => {
    const archivo = archivosExternos[id];
    const subiendo = subiendoArchivo[id];
    const docsExamen = docExternos.filter(d => d.archivos && d.archivos.length > 0);
    const totalArchivos = docsExamen.reduce((acc, d) => acc + (d.archivos?.length || 0), 0);
    const yaSubido = totalArchivos > 0;

    return (
      <div className={`mt-4 pt-4 border-t ${yaSubido ? 'border-emerald-200' : 'border-dashed border-indigo-200'}`}>
        {/* Header de sección */}
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
            🏥 Lab. externo
          </span>
          <span className="text-xs text-gray-500">Resultado del laboratorio de referencia</span>
        </div>

        {/* Banner "ya cargado" */}
        {yaSubido && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
            <span className="text-emerald-600 text-base">✅</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-700">Archivo ya cargado</p>
              <p className="text-[11px] text-emerald-600">{totalArchivos} archivo{totalArchivos !== 1 ? 's' : ''} adjunto{totalArchivos !== 1 ? 's' : ''}</p>
            </div>
          </div>
        )}

        {/* Lista de archivos existentes */}
        {docsExamen.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {docsExamen.map(doc =>
              doc.archivos?.map(arch => (
                <div key={arch.id} className="flex items-center gap-1">
                  <a
                    href={arch.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-100 transition-colors min-w-0"
                  >
                    <span>{arch.mime_type === 'application/pdf' ? '📝' : '🖼️'}</span>
                    <span className="truncate font-medium">{arch.nombre_original}</span>
                    <span className="ml-auto text-emerald-500 flex-shrink-0 text-[10px]">↓ Ver</span>
                  </a>
                  <button
                    type="button"
                    title="Eliminar archivo"
                    onClick={() => handleEliminarDocExamen(doc.documento_id)}
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors text-sm font-bold"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Input para agregar/subir nuevo archivo */}
        <div className="flex items-center gap-2">
          <label className="cursor-pointer flex-1 flex items-center gap-2 px-3 py-2 text-xs border border-dashed border-indigo-300 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors min-w-0">
            <span>📁</span>
            <span className="text-gray-500 truncate">
              {archivo ? archivo.name : yaSubido ? 'Agregar otro archivo...' : 'Seleccionar PDF o imagen...'}
            </span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleArchivoExamenChange(id, e.target.files?.[0] || null)} />
          </label>
          {archivo && (
            <button
              type="button"
              disabled={subiendo}
              onClick={() => handleSubirArchivoExamen(id, examName)}
              className="flex-shrink-0 px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {subiendo ? '⏳ Subiendo...' : '⬆ Subir'}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header del formulario */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-lg">
            📊
          </div>
          <div>
            <h3 className="text-lg font-bold">Procesar Resultados de Laboratorio</h3>
            <p className="text-purple-100 text-sm">Complete los valores de cada examen solicitado</p>
          </div>
        </div>
      </div>

      {/* Formulario principal */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-4">
          <div className="max-h-[600px] overflow-y-auto space-y-4">
            {(() => {
              const examenesArray = parseExamenesArray(orden.examenes);
              
              return examenesArray.map(exId => {
                // Si exId es un objeto con id, extraer el id
                const id = getExamenId(exId);
                const exObj = examenesDisponibles.find(e => e.id == id);
                const exOrdenDetalle = Array.isArray(orden.examenes)
                  ? orden.examenes.find(ex => (typeof ex === 'object' && ex.id == id))
                  : null;
                const examNameFromOrder = (exOrdenDetalle && exOrdenDetalle.nombre) || (exObj && exObj.nombre) || '';

                const exObjResolved = (() => {
                  const byIdHasParams = exObj && Array.isArray(exObj.valores_referenciales) && exObj.valores_referenciales.length > 0;
                  if (byIdHasParams) return exObj;

                  const normalized = normalizeExamName(examNameFromOrder);
                  if (!normalized) return exObj;

                  const byNameWithParams = (examenesDisponibles || []).find((e) =>
                    normalizeExamName(e?.nombre) === normalized
                    && Array.isArray(e?.valores_referenciales)
                    && e.valores_referenciales.length > 0
                  );

                  return byNameWithParams || exObj;
                })();

                const suggestedAlarmDays = parseSuggestedDaysFromTiempo(
                  (exObjResolved && exObjResolved.tiempo_resultado) || (exOrdenDetalle && exOrdenDetalle.tiempo_resultado) || ''
                );
                const paramsList = (exObjResolved && Array.isArray(exObjResolved.valores_referenciales) && exObjResolved.valores_referenciales.length > 0)
                  ? exObjResolved.valores_referenciales
                  : (exOrdenDetalle && Array.isArray(exOrdenDetalle.valores_referenciales) ? exOrdenDetalle.valores_referenciales : []);
                const hasRenderableParams = (paramsList || []).some((param) => {
                  if (!param || typeof param !== 'object') return false;
                  const nombre = String(param.nombre || '').trim();
                  if (!nombre) return false;
                  return isTipoTitulo(param.tipo) || isTipoTextoLargo(param.tipo) || isTipoCampo(param.tipo) || isTipoParametro(param.tipo);
                });

                if (Array.isArray(paramsList) && paramsList.length > 0 && hasRenderableParams) {
                  // Construir un mapa nombre->valor para este examen usando la lista efectiva de parámetros
                  const valoresPorNombre = {};
                  paramsList.filter(p => p && typeof p === 'object').forEach(param => {
                    if (isTipoParametro(param.tipo) && param.nombre && param.nombre.trim() !== "") {
                      valoresPorNombre[param.nombre] = resultados[`${id}__${param.nombre}`] || "";
                    }
                  });
                  const examName = (exObjResolved && exObjResolved.nombre) || (exOrdenDetalle && exOrdenDetalle.nombre) || `Examen ${id}`;

                  return (
                    <div key={id} className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                      {/* Header del examen */}
                      <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                            🧪
                          </div>
                          <div>
                            <h4 className="text-lg font-bold text-gray-900">{examName}</h4>
                            <p className="text-sm text-gray-600">Complete todos los parámetros requeridos</p>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                          <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg px-3 py-2">
                            <input
                              type="checkbox"
                              checked={isExamPrintable(id)}
                              onChange={(e) => handlePrintToggle(id, e.target.checked)}
                              className="h-4 w-4"
                            />
                            <span>Imprimir este examen</span>
                          </label>
                          <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg px-3 py-2">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isExamAlarmActive(id)}
                                onChange={(e) => handleAlarmToggle(id, e.target.checked, suggestedAlarmDays)}
                                className="h-4 w-4"
                              />
                              <span>Alarma</span>
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={getExamAlarmDays(id)}
                              onChange={(e) => handleAlarmDaysChange(id, e.target.value)}
                              disabled={!isExamAlarmActive(id)}
                              className="w-14 px-2 py-1 border border-gray-300 rounded disabled:bg-gray-100 disabled:text-gray-400"
                              placeholder={suggestedAlarmDays ? String(suggestedAlarmDays) : 'días'}
                            />
                            <span className="text-xs text-gray-500">días</span>
                          </div>
                        </div>
                      </div>

                      {!isExamPrintable(id) && (
                        <div className="mb-4 px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
                          Este examen no se incluirá en el PDF.
                        </div>
                      )}

                      {/* Parámetros del examen */}
                      {isExamPrintable(id) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {(() => {
                            return (paramsList || []).filter(p => p && typeof p === 'object').map((param, idx) => {
                          if (isTipoTitulo(param.tipo) && param.nombre && param.nombre.trim() !== "") {
                            return (
                              <div key={`title-${idx}-${param.nombre}`} className="md:col-span-2">
                                <div
                                  className="rounded-lg px-3 py-2"
                                  style={{
                                    background: param.color_fondo || '#f3f4f6',
                                    color: param.color_texto || '#111827',
                                    fontWeight: param.negrita ? 'bold' : 'normal',
                                    fontStyle: param.cursiva ? 'italic' : 'normal',
                                    textAlign: param.alineacion || 'left',
                                  }}
                                >
                                  {param.nombre}
                                </div>
                              </div>
                            );
                          }

                          if (isTipoTextoLargo(param.tipo) && param.nombre && param.nombre.trim() !== "") {
                            const textoValue = resultados[`${id}__${param.nombre}`] || "";
                            return (
                              <div key={`text-${idx}-${param.nombre}`} className="md:col-span-2 space-y-2">
                                <label className="block text-sm font-semibold text-gray-700">
                                  {param.nombre}
                                </label>
                                <textarea
                                  name={`${id}__${param.nombre}`}
                                  value={textoValue}
                                  onChange={handleChange}
                                  rows={Number(param.rows) > 0 ? Number(param.rows) : 4}
                                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all duration-200"
                                  placeholder="Ingrese texto libre"
                                />
                              </div>
                            );
                          }

                          if (isTipoCampo(param.tipo) && param.nombre && param.nombre.trim() !== "") {
                            const fieldValue = resultados[`${id}__${param.nombre}`] || "";
                            const opcionesCampo = Array.isArray(param.opciones) ? param.opciones.filter(o => String(o).trim() !== "") : [];
                            return (
                              <div key={`campo-${idx}-${param.nombre}`} className="space-y-2">
                                <label className="block text-sm font-semibold text-gray-700">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span>{param.nombre}</span>
                                  </div>
                                  {param.metodologia && (
                                    <span className="text-xs text-gray-500 font-normal">Metodología: {param.metodologia}</span>
                                  )}
                                </label>
                                {opcionesCampo.length > 0 ? (
                                  <select
                                    name={`${id}__${param.nombre}`}
                                    value={fieldValue}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 border-2 rounded-lg transition-all duration-200 border-gray-300 bg-white hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                                  >
                                    <option value="">-- Seleccione --</option>
                                    {opcionesCampo.map((op, oi) => (
                                      <option key={oi} value={op}>{op}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    name={`${id}__${param.nombre}`}
                                    value={fieldValue}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 border-2 rounded-lg transition-all duration-200 border-gray-300 bg-white hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                                    placeholder="Ingrese el valor"
                                  />
                                )}
                              </div>
                            );
                          }

                          if (isTipoParametro(param.tipo) && param.nombre && param.nombre.trim() !== "") {
                            const tieneFormula = param.formula && param.formula.trim() !== "";
                            let valor = resultados[`${id}__${param.nombre}`] || "";

                            // Nombre a mostrar: si viene como "Item 1" y este examen solo tiene un parámetro,
                            // mostrar el nombre del examen para una mejor UX, manteniendo la clave original.
                            const parametrosValidos = (paramsList || []).filter(p => p && typeof p === 'object' && isTipoParametro(p.tipo) && p.nombre && p.nombre.trim() !== "");
                            const defaults = parametrosValidos.filter(p => /^item\s*\d+$/i.test((p.nombre || '').trim()));
                            const isDefaultItem = /^item\s*\d+$/i.test((param.nombre || '').trim());
                            const defaultIndex = isDefaultItem ? defaults.findIndex(p => p === param) : -1;
                            const displayName = isDefaultItem
                              ? (defaults.length <= 1 ? examName : `${examName} — Parámetro ${defaultIndex + 1}`)
                              : param.nombre;
                            
                            if (tieneFormula) {
                              valor = evalFormula(param.formula, valoresPorNombre, param.decimales);
                            }
                            
                            if (typeof valor === 'number' && isNaN(valor)) valor = "";
                            if (valor === undefined || valor === null) valor = "";

                            const { fueraDeRango, min, max, referenciaAplicada } = getParameterStatus(param, valor);
                            // Texto de referencia a mostrar: soporta rango (min/max) o valor textual
                            let referenciaTexto = null;
                            if (min !== null || max !== null) {
                              referenciaTexto = `Rango de referencia: ${min !== null ? min : '∞'} - ${max !== null ? max : '∞'}`;
                            } else if (referenciaAplicada && referenciaAplicada.valor && String(referenciaAplicada.valor).trim() !== '') {
                                referenciaTexto = `Referencia: ${referenciaAplicada.valor}`;
                              }


                            return (
                              <div key={`param-${idx}-${param.nombre}`} className="space-y-2">
                                <label className="block text-sm font-semibold text-gray-700">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span>{displayName}</span>
                                    {tieneFormula && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        🧮 Calculado
                                      </span>
                                    )}
                                  </div>
                                  {tieneFormula && (
                                    <span className="text-xs text-blue-600 font-normal">
                                      Fórmula: {param.formula}
                                    </span>
                                  )}
                                  {referenciaTexto && (
                                    <div className="text-xs text-gray-500 mt-1">{referenciaTexto}</div>
                                  )}
                                </label>
                                
                                <div className="relative">
                                  {(() => {
                                    const opcionesParam = Array.isArray(param.opciones) ? param.opciones.filter(o => String(o).trim() !== '') : [];
                                    if (!tieneFormula && opcionesParam.length > 0) {
                                      return (
                                        <select
                                          name={`${id}__${param.nombre}`}
                                          value={valor}
                                          onChange={handleChange}
                                          className="w-full px-4 py-3 border-2 rounded-lg transition-all duration-200 border-gray-300 bg-white hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                                        >
                                          <option value="">-- Seleccione --</option>
                                          {opcionesParam.map((op, oi) => (
                                            <option key={oi} value={op}>{op}</option>
                                          ))}
                                        </select>
                                      );
                                    }
                                    return (
                                      <input
                                        type="text"
                                        name={`${id}__${param.nombre}`}
                                        value={valor}
                                        onChange={tieneFormula ? undefined : handleChange}
                                        readOnly={tieneFormula}
                                        className={`w-full px-4 py-3 border-2 rounded-lg transition-all duration-200 ${
                                          fueraDeRango
                                            ? 'border-red-400 bg-red-50 text-red-700 font-semibold focus:ring-2 focus:ring-red-500'
                                            : tieneFormula
                                            ? 'border-blue-200 bg-blue-50 text-blue-800 cursor-not-allowed'
                                            : 'border-gray-300 bg-white hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-200'
                                        }`}
                                        placeholder={tieneFormula ? "Valor calculado automáticamente" : "Ingrese el valor"}
                                      />
                                    );
                                  })()}
                                  
                                  {/* Indicador de estado */}
                                  {valor && !tieneFormula && (
                                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                                      {fueraDeRango ? (
                                        <span className="text-red-500 font-bold">⚠️</span>
                                      ) : (
                                        <span className="text-green-500 font-bold">✓</span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Mensaje de fuera de rango */}
                                {fueraDeRango && (min !== null || max !== null) && (
                                  <div className="flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2 py-1 rounded-md">
                                    <span>⚠️</span>
                                    <span>Valor fuera del rango de referencia</span>
                                  </div>
                                )}
                              </div>
                            );
                          }
                            return null;
                          });
                          })()}
                        </div>
                      )}
                      {exOrdenDetalle?.derivado && renderUploadExamen(id, examName)}
                    </div>
                  );
                } else if (exObjResolved) {
                  // Examen sin parámetros definidos
                  return (
                    <div key={id} className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                            🧪
                          </div>
                          <h4 className="text-lg font-bold text-gray-900">{exObjResolved.nombre}</h4>
                        </div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                          <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg px-3 py-2">
                            <input
                              type="checkbox"
                              checked={isExamPrintable(id)}
                              onChange={(e) => handlePrintToggle(id, e.target.checked)}
                              className="h-4 w-4"
                            />
                            <span>Imprimir este examen</span>
                          </label>
                          <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg px-3 py-2">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isExamAlarmActive(id)}
                                onChange={(e) => handleAlarmToggle(id, e.target.checked, parseSuggestedDaysFromTiempo(exObjResolved?.tiempo_resultado || ''))}
                                className="h-4 w-4"
                              />
                              <span>Alarma</span>
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={getExamAlarmDays(id)}
                              onChange={(e) => handleAlarmDaysChange(id, e.target.value)}
                              disabled={!isExamAlarmActive(id)}
                              className="w-14 px-2 py-1 border border-gray-300 rounded disabled:bg-gray-100 disabled:text-gray-400"
                              placeholder={parseSuggestedDaysFromTiempo(exObjResolved?.tiempo_resultado || '') ? String(parseSuggestedDaysFromTiempo(exObjResolved?.tiempo_resultado || '')) : 'días'}
                            />
                            <span className="text-xs text-gray-500">días</span>
                          </div>
                        </div>
                      </div>

                      {!isExamPrintable(id) && (
                        <div className="mb-4 px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
                          Este examen no se incluirá en el PDF.
                        </div>
                      )}

                      {isExamPrintable(id) && (
                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-gray-700">
                            Resultado del examen
                          </label>
                          <textarea
                            name={`${id}`}
                            value={resultados[`${id}`] || ""}
                            onChange={handleChange}
                            rows={4}
                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all duration-200"
                            placeholder="Ingrese el resultado completo del examen..."
                          />
                        </div>
                      )}
                      {exOrdenDetalle?.derivado && renderUploadExamen(id, exObjResolved.nombre)}
                    </div>
                  );
                }
                return null;
              });
            })()}
          </div>
        </div>        {/* Botones de acción */}
        <div className="flex flex-col sm:flex-row gap-4 justify-end">
          <button 
            type="button" 
            onClick={onVolver} 
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium border border-gray-300"
          >
            ← Cancelar
          </button>
          <button 
            type="submit" 
            disabled={guardando}
            className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {guardando ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Guardando...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span>💾</span>
                Guardar Resultados
              </span>
            )}
          </button>
        </div>

        {/* Mensaje de estado */}
        {msg && (
          <div className={`p-4 rounded-lg border ${
            msgType === "success"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}>
            <div className="flex items-center gap-2 font-medium">
              {msg}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

export default LlenarResultadosForm;
