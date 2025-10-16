
import { useState, useEffect } from "react";
import OrdenesLaboratorioList from "../laboratorio/OrdenesLaboratorioList";
import LlenarResultadosForm from "../laboratorio/LlenarResultadosForm";
import { BASE_URL } from "../config/config";

function LaboratorioPanelPage() {
  const [activeTab, setActiveTab] = useState("ordenes");
  const [ordenSeleccionada, setOrdenSeleccionada] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [examenesDisponibles, setExamenesDisponibles] = useState([]);

  useEffect(() => {
    fetch(BASE_URL + "api_examenes_laboratorio.php", {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setExamenesDisponibles(data.examenes || []));
  }, []);

  const handleSeleccionarOrden = async (orden) => {
    // Si la orden está completada, buscar resultados
    if (orden.estado === 'completado') {
      // Usar consulta_id si existe, sino id de la orden
      const idBusqueda = orden.consulta_id ? orden.consulta_id : orden.id;
      const res = await fetch(BASE_URL + `api_get_resultados_laboratorio.php?orden_id=${idBusqueda}`);
      const data = await res.json();
      if (data.success && data.resultado) {
        setOrdenSeleccionada({ ...orden, resultados: data.resultado.resultados });
        setActiveTab("procesar");
        return;
      }
    }
    setOrdenSeleccionada(orden);
    setActiveTab("procesar");
  };

  const handleVolver = () => {
    setOrdenSeleccionada(null);
    setReloadKey(k => k + 1);
    setActiveTab("ordenes");
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50">
      {/* Header con gradiente */}
      <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-2xl">
              🔬
            </div>
            <div>
              <h1 className="text-2xl font-bold">Panel de Laboratorio</h1>
              <p className="text-purple-100">Gestión de órdenes y resultados de laboratorio</p>
            </div>
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
                    ? "bg-white text-purple-600 shadow-lg"
                    : tab.disabled
                    ? "text-purple-200 cursor-not-allowed opacity-50"
                    : "text-white hover:bg-white/20"
                }`}
              >
                <span className="text-lg">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "ordenes" && (
          <div className="bg-white/70 backdrop-blur-sm rounded-xl shadow-xl border border-white/20">
            <OrdenesLaboratorioList key={reloadKey} onSeleccionarOrden={handleSeleccionarOrden} />
          </div>
        )}

        {activeTab === "procesar" && ordenSeleccionada && (
          <div className="space-y-6">
            {/* Botón volver */}
            <button 
              onClick={handleVolver} 
              className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-lg shadow-md hover:bg-white transition-colors border border-white/20 text-gray-700 hover:text-gray-900"
            >
              <span>←</span>
              <span>Volver a órdenes</span>
            </button>

            {/* Información de la orden */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-6 text-white">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-purple-200 text-sm">Orden</div>
                  <div className="text-xl font-bold">#{ordenSeleccionada.id}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-purple-200 text-sm">Paciente</div>
                  <div className="text-xl font-bold">
                    {ordenSeleccionada.paciente_nombre} {ordenSeleccionada.paciente_apellido}
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-purple-200 text-sm">Consulta ID</div>
                  <div className="text-xl font-bold">{ordenSeleccionada.consulta_id}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-purple-200 text-sm">Estado</div>
                  <div className={`text-xl font-bold ${
                    ordenSeleccionada.estado === 'completado' ? 'text-green-300' : 'text-yellow-300'
                  }`}>
                    {ordenSeleccionada.estado === 'completado' ? 'Completado' : 'Pendiente'}
                  </div>
                </div>
              </div>
              
              <div className="mt-4 bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="text-purple-200 text-sm mb-2">Exámenes solicitados</div>
                <div className="text-lg">{getExamenesNombres(ordenSeleccionada.examenes)}</div>
              </div>
            </div>

            {/* Formulario de resultados */}
            <div className="bg-white/70 backdrop-blur-sm rounded-xl shadow-xl border border-white/20 p-6">
              <LlenarResultadosForm orden={ordenSeleccionada} onVolver={handleVolver} onGuardado={handleVolver} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LaboratorioPanelPage;
