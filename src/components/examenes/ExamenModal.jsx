// Modal para crear/editar exámenes de laboratorio
import Modal from "../Modal";
import ExamenEditorForm from "../ExamenEditorForm";

export default function ExamenModal({ open, onClose, form, handleChange, handleValoresReferencialesChange, handleSubmit, editId }) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header del modal */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
              {editId ? "✏️" : "➕"}
            </div>
            <div>
              <h3 className="text-xl font-bold">
                {editId ? "Editar Examen" : "Nuevo Examen"}
              </h3>
              <p className="text-purple-100">
                {editId ? "Modifique los datos del examen" : "Complete la información del nuevo examen"}
              </p>
            </div>
          </div>
        </div>
        {/* Contenido del modal */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Información básica */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre del Examen *</label>
                <input name="nombre" value={form.nombre} onChange={handleChange} placeholder="Ej: Hemograma Completo" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Categoría</label>
                <input name="categoria" value={form.categoria} onChange={handleChange} placeholder="Ej: Hematología, Química Clínica, Serología, etc." className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Metodología</label>
                <input name="metodologia" value={form.metodologia} onChange={handleChange} placeholder="Ej: Citometría de flujo" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all" />
              </div>
            </div>
            {/* Parámetros y valores de referencia */}
            <div className="bg-gray-50 rounded-xl p-4">
              <label className="block text-sm font-semibold text-gray-700 mb-3">🧪 Parámetros y Valores de Referencia</label>
              <ExamenEditorForm initialData={form.valores_referenciales} onChange={handleValoresReferencialesChange} />
            </div>
            {/* Previsualización */}
            <div className="bg-blue-50 rounded-xl p-4">
              <label className="block text-sm font-semibold text-gray-700 mb-3">👁️ Previsualización del Formato de Resultados</label>
              <div className="bg-white border rounded-lg p-4 overflow-auto max-h-80">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gradient-to-r from-purple-100 to-indigo-100">
                      <th className="p-2 text-left font-semibold">Examen / Parámetro</th>
                      <th className="p-2 text-left font-semibold">Metodología</th>
                      <th className="p-2 text-left font-semibold">Resultado</th>
                      <th className="p-2 text-left font-semibold">Unidades</th>
                      <th className="p-2 text-left font-semibold">Valores de Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(form.valores_referenciales) && form.valores_referenciales.length > 0 ? (
                      form.valores_referenciales
                        .sort((a, b) => (a.orden || 0) - (b.orden || 0))
                        .map((item, idx) =>
                          item.tipo === "Subtítulo" ? (
                            <tr key={idx}>
                              <td
                                colSpan={5}
                                className={`py-2 px-2 ${item.negrita ? "font-bold" : "font-semibold"}`}
                                style={{
                                  background: item.color_fondo,
                                  color: item.color_texto,
                                  fontWeight: item.negrita ? "bold" : "normal",
                                }}
                              >
                                {item.nombre}
                              </td>
                            </tr>
                          ) : (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td
                                className="py-2 px-2"
                                style={{
                                  background: item.color_fondo,
                                  color: item.color_texto,
                                  fontWeight: item.negrita ? "bold" : "normal",
                                }}
                              >
                                {item.nombre}
                              </td>
                              <td className="py-2 px-2 text-center">{item.metodologia || ""}</td>
                              <td className="py-2 px-2 text-center text-gray-400">[Resultado]</td>
                              <td className="py-2 px-2 text-center">{item.unidad || ""}</td>
                              <td className="py-2 px-2 text-center">
                                {item.referencias && item.referencias.length > 0 ? (
                                  <ul className="list-none p-0 m-0">
                                    {item.referencias.map((ref, rIdx) => (
                                      <li key={rIdx}>
                                        <span className="text-gray-700">
                                          {ref.valor || ""}
                                          {(ref.valor_min || ref.valor_max) && (
                                            <>
                                              {" "}(
                                              {ref.valor_min ? ref.valor_min : "-"} - {ref.valor_max ? ref.valor_max : "-"})
                                            </>
                                          )}
                                        </span>
                                        {ref.desc && (
                                          <span className="text-gray-500 ml-1">({ref.desc})</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                          )
                        )
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center text-gray-400 py-4">Sin parámetros definidos</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Información adicional */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">💰 Precio Público (S/)</label>
                <input name="precio_publico" value={form.precio_publico} onChange={handleChange} placeholder="0.00" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all" type="number" min="0" step="0.01" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">🏥 Precio Convenio (S/)</label>
                <input name="precio_convenio" value={form.precio_convenio} onChange={handleChange} placeholder="0.00" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all" type="number" min="0" step="0.01" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">🧪 Tipo de Tubo</label>
                <input name="tipo_tubo" value={form.tipo_tubo} onChange={handleChange} placeholder="Ej: Tubo con EDTA" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">🧪 Tipo de Frasco</label>
                <input name="tipo_frasco" value={form.tipo_frasco} onChange={handleChange} placeholder="Ej: Frasco estéril" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">⏱️ Tiempo de Resultado</label>
                <input name="tiempo_resultado" value={form.tiempo_resultado} onChange={handleChange} placeholder="Ej: 2-4 horas" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">👤 Condición del Paciente</label>
                <input name="condicion_paciente" value={form.condicion_paciente} onChange={handleChange} placeholder="Ej: Ayuno 12h" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">📋 Preanalítica</label>
                <input name="preanalitica" value={form.preanalitica} onChange={handleChange} placeholder="Condiciones especiales" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all" />
              </div>
            </div>
            {/* Botones de acción */}
            <div className="flex flex-col sm:flex-row gap-4 justify-end pt-6 border-t border-gray-200">
              <button type="button" onClick={onClose} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium border border-gray-300">Cancelar</button>
              <button type="submit" className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium shadow-lg hover:shadow-xl transform hover:scale-105">
                {editId ? "💾 Actualizar Examen" : "✨ Crear Examen"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  );
}
