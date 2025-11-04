import React from "react";

function Paginacion({
  paginaActual,
  totalPaginas,
  cambiarPagina,
  elementosPorPagina,
  cambiarElementosPorPagina,
}) {
  return (
    <div className="bg-white p-4 rounded-lg shadow mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
        <div className="flex items-center gap-4">
          <label className="font-medium text-gray-700 text-sm sm:text-base">
            Elementos por página:
          </label>
          <select
            value={elementosPorPagina}
            onChange={(e) => cambiarElementosPorPagina(parseInt(e.target.value))}
            className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
          </select>
        </div>
        {totalPaginas > 1 && (
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
            <button
              onClick={() => cambiarPagina(1)}
              disabled={paginaActual === 1}
              className="px-2 sm:px-3 py-1 text-xs sm:text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 whitespace-nowrap"
            >
              <span className="hidden sm:inline">Primera</span>
              <span className="sm:hidden">❮❮</span>
            </button>
            <button
              onClick={() => cambiarPagina(paginaActual - 1)}
              disabled={paginaActual === 1}
              className="px-2 sm:px-3 py-1 text-xs sm:text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              <span className="hidden sm:inline">Anterior</span>
              <span className="sm:hidden">❮</span>
            </button>
            <div className="hidden sm:flex items-center gap-2">
              {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                let pageNumber;
                if (totalPaginas <= 5) {
                  pageNumber = i + 1;
                } else {
                  const start = Math.max(
                    1,
                    Math.min(paginaActual - 2, totalPaginas - 4)
                  );
                  pageNumber = start + i;
                }
                return (
                  <button
                    key={pageNumber}
                    onClick={() => cambiarPagina(pageNumber)}
                    className={`px-3 py-1 text-sm border rounded ${
                      paginaActual === pageNumber
                        ? "bg-blue-500 text-white"
                        : "hover:bg-gray-100"
                    }`}
                  >
                    {pageNumber}
                  </button>
                );
              })}
            </div>
            <div className="flex sm:hidden items-center gap-1">
              {Array.from({ length: Math.min(3, totalPaginas) }, (_, i) => {
                let pageNumber;
                if (totalPaginas <= 3) {
                  pageNumber = i + 1;
                } else {
                  const start = Math.max(
                    1,
                    Math.min(paginaActual - 1, totalPaginas - 2)
                  );
                  pageNumber = start + i;
                }
                return (
                  <button
                    key={`mobile-${pageNumber}`}
                    onClick={() => cambiarPagina(pageNumber)}
                    className={`px-2 py-1 text-xs border rounded ${
                      paginaActual === pageNumber
                        ? "bg-blue-500 text-white"
                        : "hover:bg-gray-100"
                    }`}
                  >
                    {pageNumber}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => cambiarPagina(paginaActual + 1)}
              disabled={paginaActual === totalPaginas}
              className="px-2 sm:px-3 py-1 text-xs sm:text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              <span className="hidden sm:inline">Siguiente</span>
              <span className="sm:hidden">❯</span>
            </button>
            <button
              onClick={() => cambiarPagina(totalPaginas)}
              disabled={paginaActual === totalPaginas}
              className="px-2 sm:px-3 py-1 text-xs sm:text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 whitespace-nowrap"
            >
              <span className="hidden sm:inline">Última</span>
              <span className="sm:hidden">❯❯</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Paginacion;
