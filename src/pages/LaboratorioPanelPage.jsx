
import React, { useState, useEffect } from "react";
import OrdenesLaboratorioList from "../laboratorio/OrdenesLaboratorioList";
import LlenarResultadosForm from "../laboratorio/LlenarResultadosForm";
import { BASE_URL } from "../config/config";

function LaboratorioPanelPage() {
  const [ordenSeleccionada, setOrdenSeleccionada] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [examenesDisponibles, setExamenesDisponibles] = useState([]);
  const [resultadosOrden, setResultadosOrden] = useState(null);

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
      const res = await fetch(BASE_URL + `api_get_resultados_laboratorio.php?orden_id=${orden.consulta_id}`);
      const data = await res.json();
      if (data.success && data.resultado) {
        setResultadosOrden(data.resultado.resultados);
        setOrdenSeleccionada({ ...orden, resultados: data.resultado.resultados });
        return;
      }
    }
    setResultadosOrden(null);
    setOrdenSeleccionada(orden);
  };

  const handleVolver = () => {
    setOrdenSeleccionada(null);
    setReloadKey(k => k + 1);
    setResultadosOrden(null);
  };

  const getExamenesNombres = (examenes) => {
    if (!Array.isArray(examenes)) return "";
    return examenes.map(ex => {
      const exObj = examenesDisponibles.find(e => e.id == ex);
      return exObj ? exObj.nombre : ex;
    }).join(", ");
  };

  return (
    <div className="p-4">
      {!ordenSeleccionada ? (
        <OrdenesLaboratorioList key={reloadKey} onSeleccionarOrden={handleSeleccionarOrden} />
      ) : (
        <div>
          <button onClick={handleVolver} className="mb-2 bg-gray-300 px-3 py-1 rounded">Volver a la lista</button>
          <div className="bg-white rounded shadow p-4">
            <h3 className="font-semibold mb-2">Llenar resultados para orden #{ordenSeleccionada.id}</h3>
            <div><b>Paciente:</b> {ordenSeleccionada.paciente_nombre} {ordenSeleccionada.paciente_apellido}</div>
            <div><b>Consulta ID:</b> {ordenSeleccionada.consulta_id}</div>
            <div><b>Exámenes solicitados:</b> {getExamenesNombres(ordenSeleccionada.examenes)}</div>
            <LlenarResultadosForm orden={ordenSeleccionada} onVolver={handleVolver} onGuardado={handleVolver} />
          </div>
        </div>
      )}
    </div>
  );
}

export default LaboratorioPanelPage;
