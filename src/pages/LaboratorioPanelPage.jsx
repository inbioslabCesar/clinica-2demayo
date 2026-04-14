
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import OrdenesLaboratorioList from "../laboratorio/OrdenesLaboratorioList";
import LlenarResultadosForm from "../laboratorio/LlenarResultadosForm";
import { BASE_URL } from "../config/config";

function LaboratorioPanelPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("ordenes");
  const [ordenSeleccionada, setOrdenSeleccionada] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const deepLinkResolvedRef = useRef(false);
  const [examenesDisponibles, setExamenesDisponibles] = useState([]);
  const [resumenPanel, setResumenPanel] = useState({
    total: 0,
    pendientes: 0,
    completadas: 0,
    hoy: 0,
    vencidas: 0,
  });
  const [deepLinkInfo, setDeepLinkInfo] = useState(null);
  const backTo = new URLSearchParams(location.search).get('back_to') || '';

  useEffect(() => {
    fetch(BASE_URL + "api_examenes_laboratorio.php", {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setExamenesDisponibles(data.examenes || []));
  }, []);

  useEffect(() => {
    if (activeTab !== 'ordenes') return;

    fetch(BASE_URL + "api_ordenes_laboratorio.php?solo_visibles_panel=1", {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        const ordenes = data?.success && Array.isArray(data.ordenes) ? data.ordenes : [];
        const hoyTexto = new Date().toDateString();
        const resumen = {
          total: ordenes.length,
          pendientes: ordenes.filter(o => o.estado === 'pendiente').length,
          completadas: ordenes.filter(o => o.estado === 'completado').length,
          hoy: ordenes.filter(o => o.fecha && new Date(o.fecha).toDateString() === hoyTexto).length,
          vencidas: ordenes.filter(o => Number(o.alarmas_vencidas || 0) > 0).length,
        };
        setResumenPanel(resumen);
      })
      .catch(() => {
        setResumenPanel({ total: 0, pendientes: 0, completadas: 0, hoy: 0, vencidas: 0 });
      });
  }, [reloadKey, activeTab]);


  const handleSeleccionarOrden = useCallback(async (orden) => {
    try {
      const idBusqueda = orden.id;
      const res = await fetch(BASE_URL + `api_get_resultados_laboratorio.php?orden_id=${idBusqueda}`, {
        credentials: 'include'
      });
      const data = await res.json();

      if (data.success && data.resultado && data.resultado.resultados && typeof data.resultado.resultados === 'object') {
        setOrdenSeleccionada({ ...orden, resultados: data.resultado.resultados });
      } else {
        setOrdenSeleccionada(orden);
      }
    } catch {
      setOrdenSeleccionada(orden);
    }
    setActiveTab("procesar");
  }, []);

  useEffect(() => {
    if (deepLinkResolvedRef.current) return;

    const sp = new URLSearchParams(location.search);
    const ordenId = Number(sp.get('orden_id') || sp.get('order_id') || 0);
    const cotizacionId = Number(sp.get('cotizacion_id') || 0);
    const modo = String(sp.get('modo') || '').toLowerCase();
    if (ordenId <= 0 && cotizacionId <= 0) return;

    deepLinkResolvedRef.current = true;

    const resolverDesdeDeepLink = async () => {
      try {
        const res = await fetch(BASE_URL + "api_ordenes_laboratorio.php?solo_visibles_panel=1", {
          credentials: 'include'
        });
        const data = await res.json();
        const ordenes = data?.success && Array.isArray(data.ordenes) ? data.ordenes : [];

        let objetivo = null;
        if (ordenId > 0) {
          objetivo = ordenes.find((orden) => Number(orden.id) === ordenId) || null;
        }
        if (!objetivo && cotizacionId > 0) {
          objetivo = ordenes.find((orden) => Number(orden.cotizacion_id || 0) === cotizacionId && orden.estado !== 'cancelada') || null;
        }
        if (!objetivo && cotizacionId > 0) {
          objetivo = ordenes.find((orden) => Number(orden.cotizacion_id || 0) === cotizacionId) || null;
        }

        if (objetivo) {
          const estadoObjetivo = String(objetivo.estado_visual || objetivo.estado || '').toLowerCase();
          const esCompletada = estadoObjetivo === 'completado';

          if (modo === 'ver' && esCompletada) {
            setActiveTab('ordenes');
            setOrdenSeleccionada(null);
            setDeepLinkInfo({
              tipo: 'completada',
              ordenId: objetivo.id,
              cotizacionId: Number(objetivo.cotizacion_id || 0),
            });
          } else {
            setDeepLinkInfo(null);
            await handleSeleccionarOrden(objetivo);
          }
        }
      } catch {
        // Si falla el deep-link, el usuario puede seleccionar manualmente desde la lista.
      }
    };

    resolverDesdeDeepLink();
  }, [location.search, handleSeleccionarOrden]);

  const handleVolver = () => {
    if (backTo) {
      navigate(backTo);
      return;
    }
    setOrdenSeleccionada(null);
    setReloadKey(k => k + 1);
    setActiveTab("ordenes");
  };

  const handleGuardadoResultados = async (saveResponse) => {
    if (!ordenSeleccionada) return;

    if (backTo && saveResponse?.success) {
      navigate(backTo);
      return;
    }

    try {
      const idBusqueda = ordenSeleccionada.id;
      const res = await fetch(BASE_URL + `api_get_resultados_laboratorio.php?orden_id=${idBusqueda}`, {
        credentials: 'include'
      });
      const data = await res.json();

      setOrdenSeleccionada((prev) => ({
        ...(prev || ordenSeleccionada),
        estado: saveResponse?.estado || 'completado',
        resultados: data?.success && data?.resultado ? data.resultado.resultados : (prev?.resultados || {}),
      }));
      setReloadKey(k => k + 1);
    } catch {
      setOrdenSeleccionada((prev) => ({
        ...(prev || ordenSeleccionada),
        estado: saveResponse?.estado || prev?.estado || 'pendiente',
      }));
    }
  };

  const getExamenesNombres = (examenes) => {
    if (!examenes) return "";
    
    // Si examenes es un string, intentar parsearlo
    let examenesArray;
    if (typeof examenes === 'string') {
      try {
        examenesArray = JSON.parse(examenes);
      } catch {
        // Si no es JSON válido, dividir por comas
        examenesArray = examenes.split(',').map(s => s.trim()).filter(s => s);
      }
    } else if (Array.isArray(examenes)) {
      examenesArray = examenes;
    } else {
      return examenes.toString();
    }
    
    if (!Array.isArray(examenesArray)) return "";
    
    return examenesArray.map(ex => {
      // Si ex es un objeto con propiedad nombre
      if (typeof ex === 'object' && ex.nombre) {
        return ex.nombre;
      }
      // Si ex es un ID, buscar en examenesDisponibles
      const exObj = examenesDisponibles.find(e => e.id == ex);
      return exObj ? exObj.nombre : ex;
    }).join(", ");
  };

  const tabs = [
    {
      id: "ordenes",
      label: "Órdenes de Laboratorio",
      icon: "🧪",
      color: "from-purple-600 to-indigo-600"
    },
    {
      id: "procesar", 
      label: "Procesar Resultados",
      icon: "📊",
      color: "from-blue-600 to-cyan-600",
      disabled: !ordenSeleccionada
    }
  ];

  return (
    <div
      className="min-h-screen"
      style={{
        background: "linear-gradient(135deg, var(--color-primary-light) 0%, #ffffff 45%, #eef2ff 100%)",
      }}
    >
      {/* Header con gradiente */}
      <div
        className="text-white"
        style={{
          background: "linear-gradient(90deg, var(--color-primary) 0%, var(--color-secondary) 55%, var(--color-accent) 100%)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-xl">
                🔬
              </div>
              <div>
                <h1 className="text-xl font-bold">Panel de Laboratorio</h1>
                <p className="text-purple-100">Gestión de órdenes y resultados de laboratorio</p>
              </div>
            </div>

            {activeTab === 'ordenes' && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 w-full lg:w-auto lg:min-w-[520px]">
                <div className="rounded-lg bg-white/15 px-3 py-2">
                  <div className="text-[11px] text-white/80">Total</div>
                  <div className="text-lg font-bold leading-tight">{resumenPanel.total}</div>
                </div>
                <div className="rounded-lg bg-white/15 px-3 py-2">
                  <div className="text-[11px] text-white/80">Pendientes</div>
                  <div className="text-lg font-bold leading-tight">{resumenPanel.pendientes}</div>
                </div>
                <div className="rounded-lg bg-white/15 px-3 py-2">
                  <div className="text-[11px] text-white/80">Completadas</div>
                  <div className="text-lg font-bold leading-tight">{resumenPanel.completadas}</div>
                </div>
                <div className="rounded-lg bg-white/15 px-3 py-2">
                  <div className="text-[11px] text-white/80">Hoy</div>
                  <div className="text-lg font-bold leading-tight">{resumenPanel.hoy}</div>
                  <div className="text-[11px] text-white/80">🚨 {resumenPanel.vencidas}</div>
                </div>
              </div>
            )}
          </div>
          {/* Navegación por tabs */}
          <div className="flex gap-1 bg-white/10 backdrop-blur-sm rounded-lg p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-200 text-sm font-medium ${
                  activeTab === tab.id
                    ? "bg-white shadow-lg"
                    : tab.disabled
                    ? "text-white/60 cursor-not-allowed opacity-50"
                    : "text-white hover:bg-white/20"
                }`}
                style={activeTab === tab.id ? { color: "var(--color-primary)" } : undefined}
              >
                <span className="text-lg">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Contenido principal */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        {activeTab === 'ordenes' && deepLinkInfo?.tipo === 'completada' && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            La orden <strong>#{deepLinkInfo.ordenId}</strong> ya tiene resultados completos. Primero revisa la lista (vista intermedia) y luego usa <strong>Editar</strong> o <strong>Comparar</strong>.
          </div>
        )}

        {activeTab === "ordenes" && (
          <div className="bg-white/70 backdrop-blur-sm rounded-xl shadow-xl border border-white/20">
            <OrdenesLaboratorioList key={reloadKey} onSeleccionarOrden={handleSeleccionarOrden} />
          </div>
        )}

        {activeTab === "procesar" && ordenSeleccionada && (
          <div className="space-y-4">
            {/* Botón volver */}
            <button 
              onClick={handleVolver} 
              className="flex items-center gap-2 px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm hover:bg-white transition-colors border border-white/20 text-gray-700 hover:text-gray-900"
            >
              <span>←</span>
              <span>{backTo ? 'Volver' : 'Volver a órdenes'}</span>
            </button>

            {/* Información de la orden */}
            <div
              className="rounded-xl p-4 text-white"
              style={{ background: "linear-gradient(90deg, var(--color-primary) 0%, var(--color-secondary) 100%)" }}
            >
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                  <div className="text-white/80 text-xs">Orden</div>
                  <div className="text-lg font-bold leading-tight">#{ordenSeleccionada.id}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 col-span-2 lg:col-span-1">
                  <div className="text-white/80 text-xs">Paciente</div>
                  <div className="text-lg font-bold leading-tight line-clamp-2">
                    {ordenSeleccionada.paciente_nombre} {ordenSeleccionada.paciente_apellido}
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                  <div className="text-white/80 text-xs">Consulta ID</div>
                  <div className="text-lg font-bold leading-tight">{ordenSeleccionada.consulta_id || '-'}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                  <div className="text-white/80 text-xs">Estado</div>
                  <div className={`text-lg font-bold leading-tight ${
                    ordenSeleccionada.estado === 'completado'
                      ? 'text-green-300'
                      : ordenSeleccionada.estado === 'cancelada'
                      ? 'text-red-300'
                      : 'text-yellow-300'
                  }`}>
                    {ordenSeleccionada.estado === 'completado'
                      ? 'Completado'
                      : ordenSeleccionada.estado === 'cancelada'
                      ? 'Cancelada'
                      : 'Pendiente'}
                  </div>
                </div>
              </div>
              
              <div className="mt-3 bg-white/10 backdrop-blur-sm rounded-lg p-3">
                <div className="text-white/80 text-xs mb-1">Exámenes solicitados</div>
                <div className="text-sm leading-6 max-h-24 overflow-y-auto pr-1">{getExamenesNombres(ordenSeleccionada.examenes)}</div>
              </div>
            </div>

            {/* Formulario de resultados */}
            <div className="bg-white/70 backdrop-blur-sm rounded-xl shadow-xl border border-white/20 p-4">
              <LlenarResultadosForm key={ordenSeleccionada.id} orden={ordenSeleccionada} onVolver={handleVolver} onGuardado={handleGuardadoResultados} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LaboratorioPanelPage;
