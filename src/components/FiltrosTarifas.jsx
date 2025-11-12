import React from "react";

function FiltrosTarifas({
  filtroServicio,
  setFiltroServicio,
  todosLosServicios,
  totalElementos,
  paginaActual,
  totalPaginas,
  filtroMedico,
  setFiltroMedico
}) {
  return (
    <div className="bg-white p-4 rounded-lg shadow mb-6">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-4">
          <label className="font-medium text-gray-700">
            Filtrar por servicio:
          </label>
          <select
            value={filtroServicio}
            onChange={(e) => setFiltroServicio(e.target.value)}
            className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Todos los servicios</option>
            {todosLosServicios.map((tipo) => (
              <option key={tipo.value} value={tipo.value}>
                {tipo.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="filtro-medico" className="font-medium text-gray-700">Buscar por médico:</label>
          <input
            id="filtro-medico"
            type="text"
            value={filtroMedico}
            onChange={e => setFiltroMedico(e.target.value)}
            placeholder="Nombre o apellido del médico"
            className="border rounded px-3 py-2 w-48 text-base"
          />
        </div>
        <span className="text-gray-600">
          ({totalElementos} tarifa{totalElementos !== 1 ? "s" : ""} - Página {paginaActual} de {totalPaginas})
        </span>
      </div>
    </div>
  );
}

export default FiltrosTarifas;
