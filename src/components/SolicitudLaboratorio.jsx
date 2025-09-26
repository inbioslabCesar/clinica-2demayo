import { useState, useEffect } from "react";
import { BASE_URL } from "../config/config";

import ExamenesSelector from "./ExamenesSelector";

export default function SolicitudLaboratorio({ consultaId }) {
  const [examenes, setExamenes] = useState([]);
  const [examenesDisponibles, setExamenesDisponibles] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setMsg("");
    try {
      const response = await fetch(BASE_URL + "api_ordenes_laboratorio.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consulta_id: consultaId, examenes }),
      });
      
      if (response.ok) {
        setMsg("Orden enviada correctamente");
        setExamenes([]);
        // Auto-limpiar mensaje después de 3 segundos
        setTimeout(() => setMsg(""), 3000);
      } else {
        throw new Error("Error al enviar la orden");
      }
    } catch {
      setMsg("Error al enviar la orden. Intente nuevamente.");
      setTimeout(() => setMsg(""), 5000);
    } finally {
      setGuardando(false);
    }
  };

  // Obtener todos los exámenes disponibles para mostrar nombres seleccionados
  useEffect(() => {
    fetch(BASE_URL + "api_examenes_laboratorio.php", { credentials: 'include' })
      .then(res => res.json())
      .then(data => setExamenesDisponibles(data.examenes || []));
  }, []);

  const seleccionados = examenesDisponibles.filter(ex => examenes.includes(ex.id));

  return (
    <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 border border-emerald-200 rounded-xl p-6 shadow-lg">
      {/* Encabezado con icono */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-md">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <h3 className="text-xl font-bold text-emerald-800">🔬 Solicitud de Análisis de Laboratorio</h3>
          <p className="text-sm text-emerald-600">Seleccione los exámenes requeridos para el diagnóstico</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Selector de exámenes con estilo mejorado */}
        <div className="bg-white rounded-lg border border-emerald-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <label className="font-semibold text-emerald-800">Exámenes Disponibles:</label>
          </div>
          <ExamenesSelector selected={examenes} setSelected={setExamenes} />
        </div>

        {/* Panel de exámenes seleccionados */}
        {examenes.length > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold text-blue-800">📋 Exámenes Seleccionados ({examenes.length})</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {seleccionados.map(ex => (
                <div key={ex.id} className="bg-white rounded-lg p-3 border border-blue-100 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-blue-900">{ex.nombre}</h4>
                      {(ex.condicion_paciente || ex.tiempo_resultado) && (
                        <div className="mt-1 space-y-1">
                          {ex.condicion_paciente && (
                            <div className="flex items-center gap-1">
                              <svg className="w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              <span className="text-xs text-amber-700 font-medium">{ex.condicion_paciente}</span>
                            </div>
                          )}
                          {ex.tiempo_resultado && (
                            <div className="flex items-center gap-1">
                              <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-xs text-gray-600">⏱️ {ex.tiempo_resultado}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Botón de envío y mensajes */}
        <div className="flex items-center justify-between">
          <button 
            type="submit" 
            className={`
              px-6 py-3 rounded-lg font-semibold text-white shadow-lg transition-all duration-200
              flex items-center gap-2 min-w-[140px] justify-center
              ${examenes.length === 0 || guardando
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 hover:shadow-xl transform hover:-translate-y-0.5'
              }
            `}
            disabled={guardando || examenes.length === 0}
          >
            {guardando ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                <span>Enviando...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                <span>Solicitar Exámenes</span>
              </>
            )}
          </button>

          {/* Contador de exámenes seleccionados */}
          <div className="text-sm text-emerald-700 font-medium">
            {examenes.length === 0 ? (
              <span className="text-gray-500">Ningún examen seleccionado</span>
            ) : (
              <span>✅ {examenes.length} examen{examenes.length !== 1 ? 'es' : ''} seleccionado{examenes.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        {/* Mensaje de confirmación o error */}
        {msg && (
          <div className={`
            rounded-lg p-4 border shadow-sm flex items-center gap-3
            ${msg.includes('correctamente') 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-800'
            }
          `}>
            {msg.includes('correctamente') ? (
              <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            )}
            <span className="font-semibold">{msg}</span>
          </div>
        )}
      </form>
    </div>
  );
}
