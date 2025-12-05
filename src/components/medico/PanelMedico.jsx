
import DisponibilidadFormMedico from "./DisponibilidadFormMedico";
import useDisponibilidadMedico from "../../hooks/useDisponibilidadMedico";
import Spinner from "../comunes/Spinner";
import { useEffect, useState, useCallback } from "react";
import { BASE_URL } from "../../config/config";
import Swal from 'sweetalert2';


function PanelMedico() {
    const medicoSession = JSON.parse(sessionStorage.getItem('medico') || 'null');
    const medicoId = medicoSession?.id;
    const { deleteDisponibilidad, saveDisponibilidad } = useDisponibilidadMedico(medicoId);

  // Eliminar disponibilidad y refrescar en tiempo real
  const handleDeleteDisponibilidad = async (id) => {
    await deleteDisponibilidad(id);
    fetchBloques();
  };
    // Estado para edición de bloque
    const [editModal, setEditModal] = useState({ open: false, bloque: null });

    // Función para abrir modal de edición
    const handleEditClick = (bloque) => {
      setEditModal({ open: true, bloque });
    };

    // Función para guardar cambios de edición
    const handleEditSave = async () => {
      if (!editModal.bloque) return;
      await saveDisponibilidad(editModal.bloque, editModal.bloque.id);
      setEditModal({ open: false, bloque: null });
      fetchBloques();
    };

    // Función para cambiar hora en modal
    const handleEditChange = (campo, valor) => {
      setEditModal(prev => ({
        ...prev,
        bloque: { ...prev.bloque, [campo]: valor }
      }));
    };
  // Obtener el id del médico autenticado desde sessionStorage (siempre actualizado)
  // ...existing code...
  const [bloquesGuardados, setBloquesGuardados] = useState([]);
  const [loading, setLoading] = useState(false);

  // Cargar bloques guardados al montar
  const fetchBloques = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${BASE_URL}api_disponibilidad_medicos.php?medico_id=${medicoId}`);
      const data = await response.json();
      setBloquesGuardados(data.disponibilidad || []);
    } catch {
      setBloquesGuardados([]);
    }
    setLoading(false);
  }, [medicoId]);

  useEffect(() => {
    fetchBloques();
  }, [fetchBloques]);

  // Guardar disponibilidad (enviar al backend)
  const handleSaveDisponibilidad = async (bloques) => {
    try {
      const response = await fetch(`${BASE_URL}api_disponibilidad_medicos.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medico_id: medicoId, bloques })
      });
      const data = await response.json();
      if (data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Disponibilidad guardada correctamente',
          showConfirmButton: false,
          timer: 1400
        });
        fetchBloques();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Error al guardar disponibilidad',
        });
      }
    } catch {
      Swal.fire({
        icon: 'error',
        title: 'Error de red o servidor',
      });
    }
  };

  // Agrupar bloques por fecha para visualización intuitiva
  const bloquesPorFecha = bloquesGuardados.reduce((acc, b) => {
    if (!acc[b.fecha]) acc[b.fecha] = [];
    acc[b.fecha].push(b);
    return acc;
  }, {});

  // Ordenar fechas descendente (última primero)
  const fechasOrdenadas = Object.keys(bloquesPorFecha).sort((a, b) => new Date(b) - new Date(a));

  // Formato de hora amigable
  const formatHora = (hora) => hora?.slice(0,5);

  // Función para verificar si una fecha ya pasó
  const esFechaPasada = (dateString) => {
    const hoy = new Date();
    const fechaComparar = new Date(dateString);
    // Comparar solo las fechas, ignorando la hora
    hoy.setHours(0, 0, 0, 0);
    fechaComparar.setHours(0, 0, 0, 0);
    return fechaComparar < hoy;
  };

  return (
    <div className="max-w-6xl mx-auto mt-6">
      <h1 className="text-2xl font-bold mb-8 text-center col-span-2">Panel del Médico</h1>
      <div className="flex flex-col md:flex-row gap-8">
  <div className="md:w-1/2 w-full">
    <DisponibilidadFormMedico onSave={handleSaveDisponibilidad} bloquesGuardados={bloquesGuardados} />
  </div>
  <div className="md:w-1/2 w-full max-h-[70vh] overflow-y-auto bg-white rounded-lg shadow-inner">
          <h2 className="font-bold text-lg mb-2 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Disponibilidad registrada
          </h2>
          {loading ? (
            <div className="text-center py-4"><Spinner message="Cargando disponibilidad registrada..." /></div>
          ) : (
            fechasOrdenadas.length === 0 ? (
              <div className="text-gray-500 text-center py-6">No hay bloques registrados aún.</div>
            ) : (
              <div className="space-y-6">
                {fechasOrdenadas.map(fecha => {
                  const fechaEsPasada = esFechaPasada(fecha);
                  // Ordenar los bloques por hora de inicio ascendente
                  const bloquesOrdenados = [...bloquesPorFecha[fecha]].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
                  return (
                    <div key={fecha} className={`rounded-lg shadow p-4 ${fechaEsPasada ? 'bg-gray-50 border-l-4 border-gray-400' : 'bg-blue-50'}`}>
                      <div className={`font-semibold mb-2 flex items-center gap-2 ${fechaEsPasada ? 'text-gray-600' : 'text-blue-700'}`}>
                        {fechaEsPasada ? (
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        ) : (
                          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        )}
                        {(() => {
                          const [y, m, d] = fecha.split('-');
                          return new Date(Number(y), Number(m)-1, Number(d)).toLocaleDateString();
                        })()}
                        {fechaEsPasada && (
                          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full ml-2">
                            Consulta pasada
                          </span>
                        )}
                      </div>
                      <table className={`min-w-full text-sm border rounded overflow-hidden ${fechaEsPasada ? 'opacity-70' : ''}`}>
                        <thead className={`${fechaEsPasada ? 'bg-gray-200' : 'bg-blue-100'}`}>
                          <tr>
                            <th className="px-2 py-1">Hora inicio</th>
                            <th className="px-2 py-1">Hora fin</th>
                            <th className="px-2 py-1 text-center">
                              {fechaEsPasada ? 'Historial' : 'Acciones'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {bloquesOrdenados.map(b => (
                            <tr key={b.id} className={`${fechaEsPasada ? 'hover:bg-gray-100' : 'hover:bg-blue-200'} transition group`}>
                              <td className="px-2 py-1 text-center font-mono text-green-700">{formatHora(b.hora_inicio)}</td>
                              <td className="px-2 py-1 text-center font-mono text-red-700">{formatHora(b.hora_fin)}</td>
                              <td className="px-2 py-1 text-center flex gap-1 justify-center">
                                {fechaEsPasada ? (
                                  <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">
                                    Finalizado
                                  </span>
                                ) : (
                                  <>
                                    <button
                                      title="Editar"
                                      onClick={() => handleEditClick(b)}
                                      className="text-blue-500 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 112.828 2.828L11.828 15H9v-2z" /></svg>
                                    </button>
                                    <button
                                      title="Eliminar"
                                      onClick={() => handleDeleteDisponibilidad(b.id)}
                                      className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                  </>
                                )}
                              </td>
                                  {/* Modal de edición de bloque */}
                                  {editModal.open && editModal.bloque && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
                                      <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] max-w-md relative">
                                        <button
                                          onClick={() => setEditModal({ open: false, bloque: null })}
                                          className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-xl font-bold"
                                          aria-label="Cerrar"
                                        >×</button>
                                        <div className="font-semibold mb-2 text-blue-700">Editar bloque de disponibilidad</div>
                                        <div className="flex flex-col gap-3">
                                          <label className="text-sm">Fecha: <span className="font-bold">{editModal.bloque.fecha}</span></label>
                                          <label className="text-sm">Hora inicio:
                                            <input type="time" value={editModal.bloque.hora_inicio.slice(0,5)} onChange={e => handleEditChange("hora_inicio", e.target.value + ":00")}
                                              className="border rounded px-2 py-1 ml-2" step="1800" />
                                          </label>
                                          <label className="text-sm">Hora fin:
                                            <input type="time" value={editModal.bloque.hora_fin.slice(0,5)} onChange={e => handleEditChange("hora_fin", e.target.value + ":00")}
                                              className="border rounded px-2 py-1 ml-2" step="1800" />
                                          </label>
                                        </div>
                                        <button onClick={handleEditSave} className="bg-blue-600 text-white px-4 py-2 rounded font-bold w-full mt-4">Guardar cambios</button>
                                      </div>
                                    </div>
                                  )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default PanelMedico;
