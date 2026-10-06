
import DisponibilidadFormMedico from "./DisponibilidadFormMedico";
import useDisponibilidadMedico from "../../hooks/useDisponibilidadMedico";
import Spinner from "../comunes/Spinner";
import { useEffect, useState, useCallback } from "react";
import { useLocation, useParams } from "react-router-dom";
import { authFetch } from "../../utils/apiClient";
import Swal from 'sweetalert2';
import { formatProfesionalName } from "../../utils/profesionalDisplay";
import { fetchConfigSingleton, getCachedAgendaSlotMinutes } from "../../config/config";


function PanelMedico() {
  const { medicoId: medicoIdParam } = useParams();
  const location = useLocation();
  const medicoSession = JSON.parse(sessionStorage.getItem('medico') || 'null');
  const medicoDesdeNavegacion = location.state?.medico || null;
  const medicoId = Number(medicoIdParam) || medicoSession?.id;
  const [medicoObjetivo, setMedicoObjetivo] = useState(() => {
    if (medicoDesdeNavegacion && Number(medicoDesdeNavegacion.id) === Number(medicoId)) {
      return medicoDesdeNavegacion;
    }
    return Number(medicoIdParam) ? null : medicoSession;
  });
  const { deleteDisponibilidad, saveDisponibilidad } = useDisponibilidadMedico(medicoId);

  useEffect(() => {
    if (!medicoId || !Number(medicoIdParam)) return;
    if (medicoDesdeNavegacion && Number(medicoDesdeNavegacion.id) === Number(medicoId)) {
      setMedicoObjetivo(medicoDesdeNavegacion);
      return;
    }

    let cancelled = false;
    const fetchMedicoObjetivo = async () => {
      try {
        const res = await authFetch("api_medicos.php");
        const data = await res.json();
        const medico = (data.medicos || []).find((m) => Number(m.id) === Number(medicoId));
        if (!cancelled && medico) {
          setMedicoObjetivo(medico);
        }
      } catch {
        // Si falla, se mantiene visualización por id.
      }
    };

    fetchMedicoObjetivo();
    return () => {
      cancelled = true;
    };
  }, [medicoId, medicoIdParam, medicoDesdeNavegacion]);

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
  const [horasOcupadasPorFecha, setHorasOcupadasPorFecha] = useState({});
  const [duracionSlotMin, setDuracionSlotMin] = useState(() => {
    const cached = Number(getCachedAgendaSlotMinutes() || 30);
    return Number.isFinite(cached) && cached > 0 ? cached : 30;
  });

  // Cargar bloques guardados al montar
  const fetchBloques = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authFetch(`api_disponibilidad_medicos.php?medico_id=${medicoId}`);
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

  useEffect(() => {
    const fechas = Array.from(new Set((bloquesGuardados || []).map((b) => String(b?.fecha || "").slice(0, 10)).filter(Boolean))).sort();
    if (!medicoId || fechas.length === 0) {
      setHorasOcupadasPorFecha({});
      return;
    }

    let cancelled = false;
    let intervalId = null;

    const normalizeHourHm = (value) => {
      const txt = String(value || "").trim();
      const m = txt.match(/^(\d{1,2}):(\d{2})/);
      if (!m) return "";
      const h = Number(m[1]);
      const mm = Number(m[2]);
      if (!Number.isFinite(h) || !Number.isFinite(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return "";
      return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    };

    const cargarOcupados = async () => {
      const results = await Promise.all(fechas.map(async (fecha) => {
        try {
          const res = await authFetch(
            `api_horarios_disponibles.php?medico_id=${medicoId}&fecha=${encodeURIComponent(fecha)}&_t=${Date.now()}`,
            { cache: "no-store" }
          );
          const data = await res.json();
          const horas = Array.isArray(data?.horarios_ocupados)
            ? Array.from(new Set(data.horarios_ocupados.map((h) => normalizeHourHm(h)).filter(Boolean)))
            : [];
          return [fecha, horas];
        } catch {
          return [fecha, []];
        }
      }));

      if (cancelled) return;
      const next = {};
      results.forEach(([fecha, horas]) => {
        next[fecha] = horas;
      });
      setHorasOcupadasPorFecha(next);
    };

    void cargarOcupados();
    intervalId = window.setInterval(() => {
      void cargarOcupados();
    }, 20000);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [medicoId, bloquesGuardados]);

  useEffect(() => {
    let cancelled = false;
    fetchConfigSingleton()
      .catch(() => ({}))
      .finally(() => {
        if (cancelled) return;
        const cached = Number(getCachedAgendaSlotMinutes() || 30);
        setDuracionSlotMin(Number.isFinite(cached) && cached > 0 ? cached : 30);
      });

    const onConfigUpdated = (event) => {
      const raw = Number(event?.detail?.duracion_slot_min || getCachedAgendaSlotMinutes() || 30);
      setDuracionSlotMin(Number.isFinite(raw) && raw > 0 ? raw : 30);
    };

    window.addEventListener("clinica-config-updated", onConfigUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("clinica-config-updated", onConfigUpdated);
    };
  }, []);

  // Guardar disponibilidad (enviar al backend)
  const handleSaveDisponibilidad = async (bloques) => {
    try {
      const response = await authFetch("api_disponibilidad_medicos.php", {
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
  const stepSeconds = Math.max(300, Math.min(7200, Math.round(Number(duracionSlotMin || 30) * 60)));

  const calcularCuposBloque = (horaInicioRaw, horaFinRaw) => {
    const hhmmToMinutes = (value) => {
      const txt = String(value || "").trim();
      const m = txt.match(/^(\d{1,2}):(\d{2})/);
      if (!m) return null;
      const h = Number(m[1]);
      const mm = Number(m[2]);
      if (!Number.isFinite(h) || !Number.isFinite(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return null;
      return h * 60 + mm;
    };

    const start = hhmmToMinutes(horaInicioRaw);
    const end = hhmmToMinutes(horaFinRaw);
    const step = Math.max(5, Math.min(120, Math.round(Number(duracionSlotMin || 30))));
    if (start === null || end === null || end <= start) return 0;
    return Math.floor((end - start) / step);
  };

  const contarConsultasOcupadasEnBloque = (fechaRaw, horaInicioRaw, horaFinRaw) => {
    const fecha = String(fechaRaw || "").slice(0, 10);
    const hhmmToMinutes = (value) => {
      const txt = String(value || "").trim();
      const m = txt.match(/^(\d{1,2}):(\d{2})/);
      if (!m) return null;
      const h = Number(m[1]);
      const mm = Number(m[2]);
      if (!Number.isFinite(h) || !Number.isFinite(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return null;
      return h * 60 + mm;
    };

    const start = hhmmToMinutes(horaInicioRaw);
    const end = hhmmToMinutes(horaFinRaw);
    if (!fecha || start === null || end === null || end <= start) return 0;

    const ocupadosLista = Array.isArray(horasOcupadasPorFecha?.[fecha]) ? horasOcupadasPorFecha[fecha] : [];
    if (ocupadosLista.length === 0) return 0;
    const ocupadosSet = new Set(ocupadosLista);
    const step = Math.max(5, Math.min(120, Math.round(Number(duracionSlotMin || 30))));
    let count = 0;

    for (let min = start; min < end; min += step) {
      const hh = Math.floor(min / 60);
      const mm = min % 60;
      const hhmm = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      if (ocupadosSet.has(hhmm)) {
        count += 1;
      }
    }
    return count;
  };

  // Función para verificar si una fecha ya pasó
  const esFechaPasada = (dateString) => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    // Parsear como fecha LOCAL para evitar desplazamiento UTC en zonas negativas
    const [y, m, d] = dateString.split('-').map(Number);
    const fechaComparar = new Date(y, m - 1, d);
    return fechaComparar < hoy;
  };

  return (
    <div
      className="max-w-6xl mx-auto mt-6 p-4 rounded-2xl"
      style={{
        background: "linear-gradient(135deg, var(--color-primary-light) 0%, #ffffff 70%)",
      }}
    >
      <div
        className="mb-6 rounded-2xl p-5 text-white shadow-lg text-center col-span-2"
        style={{
          background: "linear-gradient(90deg, var(--color-primary) 0%, var(--color-secondary) 100%)",
        }}
      >
        <h1 className="text-2xl font-bold">{Number(medicoIdParam) ? 'Disponibilidad del medico' : 'Panel del Medico'}</h1>
        <p className="text-sm text-white/80 mt-1">
          {medicoObjetivo
            ? `${formatProfesionalName(medicoObjetivo)} · ID ${medicoObjetivo.id}`.trim()
            : `Medico ID ${medicoId}`}
        </p>
        <p className="text-xs text-white/90 mt-2">
          Tiempo por consulta configurado: <span className="font-semibold">{duracionSlotMin} min</span>
        </p>
      </div>
      <div className="flex flex-col md:flex-row gap-8">
  <div className="md:w-1/2 w-full">
    <DisponibilidadFormMedico
      onSave={handleSaveDisponibilidad}
      bloquesGuardados={bloquesGuardados}
      duracionSlotMin={duracionSlotMin}
    />
  </div>
  <div className="md:w-1/2 w-full max-h-[70vh] overflow-y-auto bg-white rounded-lg shadow-inner">
          <h2 className="font-bold text-lg mb-2 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Disponibilidad registrada
          </h2>
          <p className="text-xs text-blue-700 mb-3 px-1">
            Esta vista usa bloques de <span className="font-semibold">{duracionSlotMin} min por consulta</span>.
          </p>
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
                  const cuposTotalesFecha = bloquesOrdenados.reduce((acc, b) => (
                    acc + calcularCuposBloque(b.hora_inicio, b.hora_fin)
                  ), 0);
                  const cuposOcupadosFecha = bloquesOrdenados.reduce((acc, b) => (
                    acc + contarConsultasOcupadasEnBloque(fecha, b.hora_inicio, b.hora_fin)
                  ), 0);
                  const cuposLibresFecha = Math.max(0, cuposTotalesFecha - cuposOcupadosFecha);
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
                        <span className={`text-xs px-2 py-1 rounded-full ml-2 ${fechaEsPasada ? 'bg-gray-200 text-gray-700' : 'bg-indigo-100 text-indigo-700'}`}>
                          Cupos: {cuposLibresFecha} / {cuposTotalesFecha}
                        </span>
                      </div>
                      <table className={`min-w-full text-sm border rounded overflow-hidden ${fechaEsPasada ? 'opacity-70' : ''}`}>
                        <thead className={`${fechaEsPasada ? 'bg-gray-200' : 'bg-blue-100'}`}>
                          <tr>
                            <th className="px-2 py-1">Hora inicio</th>
                            <th className="px-2 py-1">Hora fin</th>
                            <th className="px-2 py-1 text-center">Cupos (libres / total)</th>
                            <th className="px-2 py-1 text-center">
                              {fechaEsPasada ? 'Historial' : 'Acciones'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {bloquesOrdenados.map(b => {
                            const cuposTotalesBloque = calcularCuposBloque(b.hora_inicio, b.hora_fin);
                            const cuposOcupadosBloque = contarConsultasOcupadasEnBloque(fecha, b.hora_inicio, b.hora_fin);
                            const cuposLibresBloque = Math.max(0, cuposTotalesBloque - cuposOcupadosBloque);
                            return (
                            <tr key={b.id} className={`${fechaEsPasada ? 'hover:bg-gray-100' : 'hover:bg-blue-200'} transition group`}>
                              <td className="px-2 py-1 text-center font-mono text-green-700">{formatHora(b.hora_inicio)}</td>
                              <td className="px-2 py-1 text-center font-mono text-red-700">{formatHora(b.hora_fin)}</td>
                              <td className="px-2 py-1 text-center font-semibold text-indigo-700">
                                {cuposLibresBloque} / {cuposTotalesBloque}
                              </td>
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
                                              className="border rounded px-2 py-1 ml-2" step={stepSeconds} />
                                          </label>
                                          <label className="text-sm">Hora fin:
                                            <input type="time" value={editModal.bloque.hora_fin.slice(0,5)} onChange={e => handleEditChange("hora_fin", e.target.value + ":00")}
                                              className="border rounded px-2 py-1 ml-2" step={stepSeconds} />
                                          </label>
                                        </div>
                                        <button onClick={handleEditSave} className="bg-blue-600 text-white px-4 py-2 rounded font-bold w-full mt-4">Guardar cambios</button>
                                      </div>
                                    </div>
                                  )}
                            </tr>
                          )})}
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
