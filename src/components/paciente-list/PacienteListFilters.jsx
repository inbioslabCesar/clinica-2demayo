import React from "react";

function PacienteListFilters({ busqueda, setBusqueda, fechaDesde, setFechaDesde, fechaHasta, setFechaHasta, rowsPerPage, setRowsPerPage }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-4">
      {/* Buscador */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); }}
          placeholder="Buscar por historia clínica, nombre, apellido o DNI"
          className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        />
        {busqueda && (
          <button
            onClick={() => { setBusqueda(""); }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Filtros de fecha y paginación */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Filtro de fechas */}
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">Filtrar por fecha de registro:</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={e => setFechaDesde(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={e => setFechaHasta(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          {(fechaDesde || fechaHasta) && (
            <button
              onClick={() => { setFechaDesde(""); setFechaHasta(""); }}
              className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Limpiar filtros de fecha
            </button>
          )}
        </div>

        {/* Control de filas por página */}
        <div className="sm:w-48">
          <label className="block text-sm font-medium text-gray-700 mb-2">Registros por página:</label>
          <select
            value={rowsPerPage}
            onChange={e => setRowsPerPage(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value={5}>5 registros</option>
            <option value={10}>10 registros</option>
            <option value={25}>25 registros</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export default PacienteListFilters;
