import React from "react";

function TarifaModal({ mostrar, cerrarModal, tarifaEditando, nuevaTarifa, setNuevaTarifa, medicos, serviciosMedicos, generarDescripcion: propGenerarDescripcion, guardarTarifa }) {
  // Ya no se genera ni guarda descripcion final, solo se edita descripcion_base
  if (!mostrar) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg p-4 sm:p-10 w-full max-w-3xl mx-2 sm:mx-4 overflow-y-auto" style={{ maxHeight: "95vh" }}>
        <h2 className="text-xl font-bold mb-4">{tarifaEditando ? "Editar Tarifa" : "Nueva Tarifa"}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Servicio *</label>
            <select
              value={nuevaTarifa.servicio_tipo}
              onChange={(e) => setNuevaTarifa({ ...nuevaTarifa, servicio_tipo: e.target.value })}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {serviciosMedicos.map((tipo) => (
                <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Médico * {medicos.length === 0 && (<span className="text-gray-400">(Cargando...)</span>)}</label>
            <select
              value={nuevaTarifa.medico_id}
              onChange={(e) => {
                const medicoId = e.target.value;
                setNuevaTarifa({ ...nuevaTarifa, medico_id: medicoId });
              }}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={medicos.length === 0}
            >
              <option value="general">Tarifa General (Todos los médicos)</option>
              {medicos.map((medico) => (
                <option key={medico.id} value={medico.id}>
                  Dr(a). {medico.nombre} {medico.apellido || ""} - {medico.especialidad || "General"}
                </option>
              ))}
            </select>
            {medicos.length === 0 && (
              <div className="text-sm text-orange-600 mt-1">⚠️ No se pudieron cargar los médicos. Verifique la conexión.</div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción del Servicio *</label>
            <input
              type="text"
              value={nuevaTarifa.descripcion}
              onChange={(e) => setNuevaTarifa({ ...nuevaTarifa, descripcion: e.target.value })}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: RX de tórax, Ecografía abdominal, Consulta pediátrica, etc."
            />
            <div className="text-xs text-gray-500 mt-1">Solo ingresa el nombre del servicio, sin nombre ni especialidad del médico.</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Precio Particular * (S/)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={nuevaTarifa.precio_particular}
              onChange={(e) => setNuevaTarifa({ ...nuevaTarifa, precio_particular: e.target.value })}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">% para Médico</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={nuevaTarifa.porcentaje_medico}
                onChange={(e) => setNuevaTarifa({ ...nuevaTarifa, porcentaje_medico: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: 50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">% para Clínica</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={nuevaTarifa.porcentaje_clinica}
                onChange={(e) => setNuevaTarifa({ ...nuevaTarifa, porcentaje_clinica: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: 50"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto fijo para Médico (S/)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={nuevaTarifa.monto_medico}
                onChange={(e) => setNuevaTarifa({ ...nuevaTarifa, monto_medico: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: 50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto fijo para Clínica (S/)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={nuevaTarifa.monto_clinica}
                onChange={(e) => setNuevaTarifa({ ...nuevaTarifa, monto_clinica: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: 30"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio Seguro (S/) - Opcional</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={nuevaTarifa.precio_seguro}
                onChange={(e) => setNuevaTarifa({ ...nuevaTarifa, precio_seguro: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio Convenio (S/) - Opcional</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={nuevaTarifa.precio_convenio}
                onChange={(e) => setNuevaTarifa({ ...nuevaTarifa, precio_convenio: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {/* Campo activo eliminado */}
        </div>
        <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-4 mt-6">
          <button
            onClick={cerrarModal}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={guardarTarifa}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {tarifaEditando ? "Actualizar" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TarifaModal;
