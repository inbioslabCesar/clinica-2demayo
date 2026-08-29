import React from "react";

function FiltrosTarifas({
  filtroServicio,
  setFiltroServicio,
  todosLosServicios,
  totalElementos,
  paginaActual,
  totalPaginas,
  filtroMedico,
  setFiltroMedico,
  filtroDescripcion,
  setFiltroDescripcion,
}) {
  return (
    <div className="mb-6 rounded-2xl border border-blue-100 bg-gradient-to-br from-white via-blue-50/40 to-cyan-50/30 p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          Filtros activos
        </span>
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          {totalElementos} tarifa{totalElementos !== 1 ? "s" : ""}
        </span>
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          Página {paginaActual} de {totalPaginas}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Filtrar por servicio
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M6 12h12m-8 5h4" />
              </svg>
            </span>
            <select
              value={filtroServicio}
              onChange={(e) => setFiltroServicio(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="todos">Todos los servicios</option>
              {todosLosServicios.map((tipo) => (
                <option key={tipo.value} value={tipo.value}>
                  {tipo.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="filtro-medico" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Buscar por medico
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.85-4.65a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
              </svg>
            </span>
            <input
              id="filtro-medico"
              type="text"
              value={filtroMedico}
              onChange={e => setFiltroMedico(e.target.value)}
              placeholder="Nombre o apellido del medico"
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {filtroMedico.trim() && (
              <button
                type="button"
                onClick={() => setFiltroMedico("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                aria-label="Limpiar busqueda"
                title="Limpiar"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="filtro-descripcion" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Buscar por descripcion
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h12M4 17h9" />
              </svg>
            </span>
            <input
              id="filtro-descripcion"
              type="text"
              value={filtroDescripcion}
              onChange={e => setFiltroDescripcion(e.target.value)}
              placeholder="Ej: consulta, nutricion, laparoscopia"
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {filtroDescripcion.trim() && (
              <button
                type="button"
                onClick={() => setFiltroDescripcion("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                aria-label="Limpiar descripcion"
                title="Limpiar"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FiltrosTarifas;
