import React from "react";

function TarifasTable({ tarifas, obtenerLabelServicio, abrirModal, eliminarTarifa, medicos }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Servicio</th>
              <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Médico</th>
              <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Particular</th>
              <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Seguro</th>
              <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Convenio</th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tarifas.map((tarifa) => (
              <tr
                key={tarifa.id}
                className={`hover:bg-gray-50 transition-all ${tarifa.activo !== 1 ? "opacity-60 bg-yellow-50" : ""}`}
              >
                <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-col sm:flex-row sm:items-center">
                    <div className="flex items-center mb-1 sm:mb-0">
                      <span className="text-lg mr-2">🏥</span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {obtenerLabelServicio(tarifa.servicio_tipo)}
                      </span>
                      {tarifa.activo !== 1 && (
                        <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-200 text-yellow-900 flex items-center gap-1">
                          <span role="img" aria-label="inactivo">⚠️</span> Inactiva
                        </span>
                      )}
                    </div>
                    {/* Eliminado: No mostrar fuente farmacia/laboratorio */}
                    <div className="sm:hidden mt-2 text-sm font-medium text-gray-900">{tarifa.descripcion}</div>
                  </div>
                </td>
                <td className="hidden sm:table-cell px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">
                    {(() => {
                      const medico = medicos && tarifa.medico_id ? medicos.find(m => m.id === parseInt(tarifa.medico_id)) : null;
                      if (medico) {
                        const nombreCompleto = [medico.nombre, medico.apellido].filter(Boolean).join(" ").replace(/\s+/g, ' ').trim();
                        const especialidad = medico.especialidad ? ` - ${medico.especialidad}` : "";
                        return `Dr(a). ${nombreCompleto}${especialidad}`;
                      }
                      return "General";
                    })()}
                  </div>
                </td>
                <td className="hidden sm:table-cell px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">
                    {tarifa.descripcion}
                  </div>
                </td>
                <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <div className="font-medium">S/ {parseFloat(tarifa.precio_particular).toFixed(2)}</div>
                  <div className="block lg:hidden text-xs text-gray-500 mt-1">
                    {tarifa.precio_seguro && (
                      <div>Seguro: S/ {parseFloat(tarifa.precio_seguro).toFixed(2)}</div>
                    )}
                    {tarifa.precio_convenio && (
                      <div>Convenio: S/ {parseFloat(tarifa.precio_convenio).toFixed(2)}</div>
                    )}
                  </div>
                </td>
                <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {tarifa.precio_seguro ? `S/ ${parseFloat(tarifa.precio_seguro).toFixed(2)}` : "-"}
                </td>
                <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {tarifa.precio_convenio ? `S/ ${parseFloat(tarifa.precio_convenio).toFixed(2)}` : "-"}
                </td>
                {/* Estado eliminado */}
                <td className="px-3 md:px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex flex-col sm:flex-row sm:space-x-2 space-y-1 sm:space-y-0">
                    {/* Estado eliminado */}
                    <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-2">
                      <button
                        onClick={() => abrirModal(tarifa)}
                        className="text-blue-600 hover:text-blue-900 px-2 py-1 bg-blue-100 rounded text-xs sm:text-sm"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => eliminarTarifa(tarifa.id, tarifa.descripcion)}
                        className="text-red-600 hover:text-red-900 px-2 py-1 bg-red-100 rounded text-xs sm:text-sm"
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tarifas.length === 0 && (
        <div className="text-center py-8 text-gray-500">No hay tarifas registradas para este filtro</div>
      )}
    </div>
  );
}

export default TarifasTable;
