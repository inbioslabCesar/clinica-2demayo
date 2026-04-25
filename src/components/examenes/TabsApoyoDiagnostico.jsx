import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ResultadosLaboratorio from "./ResultadosLaboratorio";
import { BASE_URL } from "../../config/config";

// ── Tipos de imágenes diagnósticas ────────────────────────────────────────────
const TIPOS_IMAGEN = [
  { key: "rx",         label: "Rayos X",    emoji: "📸", color: "sky" },
  { key: "ecografia",  label: "Ecografía",  emoji: "🫀", color: "violet" },
  { key: "tomografia", label: "Tomografía", emoji: "🔬", color: "amber" },
];

const ESTADO_BADGE = {
  pendiente:  "bg-yellow-100 text-yellow-800",
  completado: "bg-green-100 text-green-800",
  cancelado:  "bg-red-100 text-red-600",
};

// ── Sub-panel para un tipo de imagen ─────────────────────────────────────────
function PanelImagen({ tipo, label, emoji, color, consultaId, navigateWithDraft }) {
  const [ordenes, setOrdenes]             = useState([]);
  const [loadingOrdenes, setLoadingOrdenes] = useState(false);

  const cargarOrdenes = useCallback(() => {
    if (!consultaId) return;
    setLoadingOrdenes(true);
    fetch(`${BASE_URL}api_ordenes_imagen.php?consulta_id=${consultaId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setOrdenes((d.ordenes || []).filter((o) => o.tipo === tipo));
      })
      .catch(() => {})
      .finally(() => setLoadingOrdenes(false));
  }, [consultaId, tipo]);

  useEffect(() => { cargarOrdenes(); }, [cargarOrdenes]);

  const handleCancelar = async (ordenId) => {
    await fetch(`${BASE_URL}api_ordenes_imagen.php`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancelar", orden_id: ordenId }),
    });
    cargarOrdenes();
  };

  const esPagada = (cot) => cot && (cot.estado === "completado" || cot.estado === "pagado");

  const cotizBadge = (ord) => {
    const cot = ord.cotizacion;
    if (!cot) return null;
    if (esPagada(cot)) return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">💰 Pagado</span>;
    return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">⏳ Pendiente pago · {cot.numero_comprobante}</span>;
  };

  const puedeVer = (ord) =>
    ord.estado === "completado" ||
    parseInt(ord.carga_anticipada) === 1 ||
    esPagada(ord.cotizacion);

  return (
    <div>
      {/* Botón navegar a SolicitudImagenPage */}
      <button
        type="button"
        onClick={() => navigateWithDraft(`/solicitud-imagen/${consultaId}/${tipo}`)}
        className={`mb-4 bg-${color}-600 text-white px-4 py-2 rounded hover:bg-${color}-700 transition text-sm font-semibold`}
      >
        {emoji} Solicitar {label}
      </button>

      {/* Lista de órdenes */}
      {loadingOrdenes && <p className="text-xs text-gray-400">Cargando...</p>}
      {!loadingOrdenes && ordenes.length === 0 && (
        <p className="text-sm text-gray-500">No hay solicitudes de {label} para esta consulta.</p>
      )}
      {ordenes.map((ord) => (
        <div key={ord.id} className="mb-3 border border-gray-200 rounded-xl p-3 bg-white shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg">{emoji}</span>
              <span className="font-semibold text-gray-700 text-sm">{label}</span>
              {ord.servicios_nombres?.length > 0 && (
                <span className="text-xs text-gray-500 font-normal">— {ord.servicios_nombres.join(" · ")}</span>
              )}
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${ESTADO_BADGE[ord.estado] || "bg-gray-100 text-gray-600"}`}>
                {ord.estado}
              </span>
              {parseInt(ord.carga_anticipada) === 1 && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⚡ Urgente</span>
              )}
              {cotizBadge(ord)}
            </div>
            <div className="flex gap-1.5">
              {puedeVer(ord) && (
                <button
                  type="button"
                  onClick={() => navigateWithDraft(`/visor-imagen/${ord.id}`)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1 rounded-lg font-semibold transition flex items-center gap-1"
                >
                  🖼️ Ver Imágenes
                </button>
              )}
              {ord.estado === "pendiente" && (
                <button
                  type="button"
                  onClick={() => handleCancelar(ord.id)}
                  className="text-xs text-red-400 hover:text-red-600 transition px-2 py-1 rounded border border-red-200 hover:border-red-400"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
          {ord.indicaciones && (
            <p className="text-xs text-gray-600 mt-1.5 pl-7">{ord.indicaciones}</p>
          )}
          <p className="text-[10px] text-gray-400 mt-1 pl-7">
            Solicitado: {new Date(ord.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
            {ord.archivos?.length > 0 && ` · ${ord.archivos.length} archivo(s) adjunto(s)`}
          </p>
        </div>
      ))}
    </div>
  );
}

const STORAGE_KEY = "apoyo_diagnostico_tab";

export default function TabsApoyoDiagnostico({ consultaId, pacienteId, resultadosLab, ordenesLab = [], onBeforeNavigate }) {
  const [tab, setTab] = useState(() => sessionStorage.getItem(STORAGE_KEY) || "laboratorio");

  const cambiarTab = (t) => {
    sessionStorage.setItem(STORAGE_KEY, t);
    setTab(t);
  };
  const [examenes, setExamenes] = useState([]);
  const navigate = useNavigate();

  const navigateWithDraft = (path) => {
    try {
      if (typeof onBeforeNavigate === "function") onBeforeNavigate();
    } catch {
      // No bloquear navegacion por errores de guardado local.
    }
    navigate(path);
  };

  // Cargar lista de exámenes para mapear IDs a nombres
  useEffect(() => {
    // Obtener catálogo de exámenes con credenciales (cookies de sesión)
    fetch(`${BASE_URL}api_examenes_laboratorio.php`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((data) => setExamenes(data.examenes || []))
      .catch((error) => console.error('Error al obtener exámenes:', error));
  }, []);

  // Mapa de id a nombre (dentro de la función, usando useMemo para eficiencia)
  const idToNombre = React.useMemo(() => {
    const map = {};
    for (const ex of examenes) {
      map[ex.id] = ex.nombre;
    }
    return map;
  }, [examenes]);

  const ordenesLabOrdenadas = React.useMemo(() => {
    if (!Array.isArray(ordenesLab) || ordenesLab.length === 0) return [];

    const resultadoFechaPorOrden = new Map();
    if (Array.isArray(resultadosLab)) {
      resultadosLab.forEach((r) => {
        const oid = Number(r?.orden_id || 0);
        if (!oid) return;
        const ts = r?.fecha ? new Date(r.fecha).getTime() : NaN;
        if (Number.isNaN(ts)) return;
        const previo = resultadoFechaPorOrden.get(oid);
        if (previo === undefined || ts > previo) {
          resultadoFechaPorOrden.set(oid, ts);
        }
      });
    }

    const getTs = (orden) => {
      const oid = Number(orden?.id || 0);
      const tsResultado = oid ? resultadoFechaPorOrden.get(oid) : undefined;
      if (tsResultado !== undefined) return tsResultado;
      const tsOrden = orden?.fecha ? new Date(orden.fecha).getTime() : NaN;
      return Number.isNaN(tsOrden) ? 0 : tsOrden;
    };

    return [...ordenesLab].sort((a, b) => getTs(a) - getTs(b));
  }, [ordenesLab, resultadosLab]);

  const hayResultadosRegistrados = React.useMemo(() => {
    if (!Array.isArray(resultadosLab) || resultadosLab.length === 0) return false;
    return resultadosLab.some((r) => {
      const val = r?.resultados;
      if (!val) return false;
      if (typeof val === 'string') return val.trim() !== '';
      if (typeof val === 'object') return Object.keys(val).length > 0;
      return true;
    });
  }, [resultadosLab]);

  const hayOrdenesCompletadas = React.useMemo(() => {
    if (!Array.isArray(ordenesLabOrdenadas) || ordenesLabOrdenadas.length === 0) return false;
    return ordenesLabOrdenadas.some((orden) => {
      const estadoVisual = String(orden?.estado_visual || orden?.estado || '').toLowerCase();
      return estadoVisual === 'completado' || Number(orden?.analisis_completos || 0) > 0;
    });
  }, [ordenesLabOrdenadas]);

  const puedeVerResultados = React.useMemo(() => {
    return hayResultadosRegistrados || hayOrdenesCompletadas;
  }, [hayResultadosRegistrados, hayOrdenesCompletadas]);

  const resultadosConDatoPorOrden = React.useMemo(() => {
    const map = new Map();
    if (!Array.isArray(resultadosLab)) return map;
    resultadosLab.forEach((r) => {
      const oid = Number(r?.orden_id || 0);
      if (!oid) return;
      const val = r?.resultados;
      const conDato = !!val && (
        (typeof val === 'string' && val.trim() !== '') ||
        (typeof val === 'object' && Object.keys(val).length > 0)
      );
      if (conDato) map.set(oid, true);
    });
    return map;
  }, [resultadosLab]);

  const sinOrdenIdEnResultados = React.useMemo(() => {
    if (!Array.isArray(resultadosLab) || resultadosLab.length === 0) return true;
    return resultadosLab.every((r) => Number(r?.orden_id || 0) <= 0);
  }, [resultadosLab]);

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-1 sm:gap-2 mb-2">
        <button type="button" onClick={() => cambiarTab("laboratorio")}
          className={`px-2 sm:px-3 py-1 rounded-t text-xs sm:text-sm ${tab === "laboratorio" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
          🧪 <span className="hidden sm:inline">Laboratorio</span><span className="sm:hidden">Lab</span>
        </button>
        <button type="button" onClick={() => cambiarTab("rx")}
          className={`px-2 sm:px-3 py-1 rounded-t text-xs sm:text-sm ${tab === "rx" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
          📸 <span className="hidden sm:inline">RX</span>
        </button>
        <button type="button" onClick={() => cambiarTab("ecografia")}
          className={`px-2 sm:px-3 py-1 rounded-t text-xs sm:text-sm ${tab === "ecografia" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
          🫀 <span className="hidden sm:inline">Ecografía</span><span className="sm:hidden">Eco</span>
        </button>
        <button type="button" onClick={() => cambiarTab("tomografia")}
          className={`px-2 sm:px-3 py-1 rounded-t text-xs sm:text-sm ${tab === "tomografia" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
          🔬 <span className="hidden sm:inline">Tomografía</span><span className="sm:hidden">TAC</span>
        </button>
      </div>
      <div className="border rounded-b bg-white p-3 overflow-hidden">
        {tab === "laboratorio" && (
          <>
            <button
              type="button"
              className="mb-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              onClick={() => navigateWithDraft(`/solicitud-laboratorio/${consultaId}`)}
            >
              Solicitar análisis de laboratorio
            </button>
            {/* Si no hay exámenes solicitados */}
            {(!ordenesLab || ordenesLab.length === 0) && (
              <div className="mb-3 p-2 bg-gray-50 border border-gray-200 rounded text-gray-600">
                No hay exámenes solicitados para esta consulta.
              </div>
            )}
            {/* Mostrar exámenes solicitados aunque no haya resultados */}
            {ordenesLabOrdenadas.length > 0 && (
              <div className="mb-3 p-2 bg-yellow-50 border border-yellow-300 rounded">
                <div className="font-semibold text-yellow-800 mb-1">Exámenes solicitados:</div>
                {ordenesLabOrdenadas.map((orden, idx) => (
                  <ul key={orden.id || idx} className="list-disc ml-5 text-sm">
                    {Array.isArray(orden.examenes) && orden.examenes.length > 0 ? (
                      orden.examenes.map((ex, i) => {
                        if (typeof ex === 'string' || typeof ex === 'number') {
                          return <li key={i}>{idToNombre[ex] || ex}</li>;
                        }
                        return <li key={i}>{ex.nombre || idToNombre[ex.id] || JSON.stringify(ex)}</li>;
                      })
                    ) : (
                      <li className="text-gray-500">Sin detalles de exámenes</li>
                    )}
                    <li className="text-xs text-gray-500">Estado: {(() => {
                      const estadoVisual = String(orden.estado_visual || orden.estado || 'pendiente').toLowerCase();
                      if (estadoVisual === 'completado') return 'completado';
                      if (Number(orden.analisis_completos || 0) > 0) return 'completado';
                      if (resultadosConDatoPorOrden.get(Number(orden.id || 0))) return 'completado';
                      // Legacy: resultados ligados por consulta_id sin orden_id.
                      if (hayResultadosRegistrados && sinOrdenIdEnResultados && ordenesLabOrdenadas.length === 1) {
                        return 'completado';
                      }
                      return estadoVisual || 'pendiente';
                    })()}</li>
                  </ul>
                ))}
                {/* Si hay exámenes pero aún no hay resultados */}
                {!hayResultadosRegistrados && !hayOrdenesCompletadas && (
                  <div className="mt-2 text-sm text-gray-500">Aún no hay resultados disponibles.</div>
                )}
              </div>
            )}
            {/* Botón para ver resultados si existen */}
            {puedeVerResultados && (
                <div className="mb-6 p-3 sm:p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base sm:text-lg font-semibold text-green-800">Resultados Disponibles</h3>
                      <p className="text-xs sm:text-sm text-green-600">Los resultados de laboratorio ya están listos</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-xl text-sm sm:text-base"
                    onClick={() => navigateWithDraft(`/resultados-laboratorio/${consultaId}`)}
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="hidden sm:inline">📋 Ver Resultados de Laboratorio</span>
                    <span className="sm:hidden">📋 Ver Resultados</span>
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            {/* Los resultados de laboratorio ya no se muestran aquí, solo en la página dedicada */}
          </>
        )}
        {tab === "rx" && (
          <PanelImagen tipo="rx" label="Rayos X" emoji="📸" color="sky" consultaId={consultaId} navigateWithDraft={navigateWithDraft} />
        )}
        {tab === "ecografia" && (
          <PanelImagen tipo="ecografia" label="Ecografía" emoji="🫀" color="violet" consultaId={consultaId} navigateWithDraft={navigateWithDraft} />
        )}
        {tab === "tomografia" && (
          <PanelImagen tipo="tomografia" label="Tomografía" emoji="🔬" color="amber" consultaId={consultaId} navigateWithDraft={navigateWithDraft} />
        )}
      </div>
    </div>
  );
}
