import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@fluentui/react";
import { BASE_URL } from "../../config/config";

const BADGE = {
  pendiente:    { label: "Pendiente",    bg: "bg-yellow-100", text: "text-yellow-800", icon: "Clock"     },
  en_ejecucion: { label: "En ejecución", bg: "bg-blue-100",   text: "text-blue-800",   icon: "Running"   },
  completado:   { label: "Completado",   bg: "bg-green-100",  text: "text-green-800",  icon: "CheckMark" },
  suspendido:   { label: "Suspendido",   bg: "bg-red-100",    text: "text-red-800",    icon: "Warning"   },
};

function EstadoBadge({ estado }) {
  const cfg = BADGE[estado] ?? BADGE.pendiente;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <Icon iconName={cfg.icon} className="text-xs" />
      {cfg.label}
    </span>
  );
}

export default function TratamientoDetalleModal({ tratamiento, onClose, onCambiarEstado, onRefrescarLista }) {
  const [notas, setNotas]         = useState(tratamiento.notas_enfermeria ?? "");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg]   = useState("");
  const [detalle, setDetalle] = useState(null);
  const [detalleLoading, setDetalleLoading] = useState(true);
  const [detalleError, setDetalleError] = useState("");
  const [detalleRefreshing, setDetalleRefreshing] = useState(false);
  const scrollRef = useRef(null);
  const detalleRef = useRef(null);

  if (!tratamiento) return null;

  const receta    = Array.isArray(tratamiento.receta_snapshot) ? tratamiento.receta_snapshot : [];
  const texto     = tratamiento.tratamiento_texto ?? "";
  const estado    = tratamiento.estado;
  const paciente  = `${tratamiento.paciente_nombre ?? ""} ${tratamiento.paciente_apellido ?? ""}`.trim();
  const medico    = `${tratamiento.medico_nombre ?? ""} ${tratamiento.medico_apellido ?? ""}`.trim();

  const formatFecha = (iso) => {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("es-PE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const getEstadoItem = (item) => {
    if (item?.completado_en) return "completado";
    if (item?.iniciado_en) return "en_ejecucion";
    return "pendiente";
  };

  const getEstadoItemClass = (estadoItem) => {
    if (estadoItem === "completado") return "bg-green-100 text-green-700";
    if (estadoItem === "en_ejecucion") return "bg-blue-100 text-blue-700";
    return "bg-yellow-100 text-yellow-700";
  };

  useEffect(() => {
    detalleRef.current = detalle;
  }, [detalle]);

  const cargarDetalle = useCallback(async ({ silent = false } = {}) => {
    const hadDetail = !!detalleRef.current;
    const previousScrollTop = scrollRef.current?.scrollTop ?? 0;

    if (silent && hadDetail) {
      setDetalleRefreshing(true);
    } else {
      setDetalleLoading(true);
      setDetalleError("");
    }

    try {
      const res = await fetch(
        BASE_URL + `api_tratamientos_ejecucion.php?tratamiento_id=${tratamiento.id}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "No se pudo cargar detalle multidia");
      }
      setDetalle(data);
      setDetalleError("");
      if (silent && hadDetail) {
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = previousScrollTop;
          }
        });
      }
    } catch (err) {
      if (silent && hadDetail) {
        setErrorMsg(err.message || "Error actualizando detalle multidia");
      } else {
        setDetalleError(err.message || "Error cargando detalle multidia");
        setDetalle(null);
      }
    } finally {
      setDetalleLoading(false);
      setDetalleRefreshing(false);
    }
  }, [tratamiento.id]);

  useEffect(() => {
    cargarDetalle();
  }, [cargarDetalle]);

  const handleAccion = async (nuevoEstado) => {
    setGuardando(true);
    setErrorMsg("");
    try {
      await onCambiarEstado(tratamiento.id, nuevoEstado, notas);
      if (typeof onRefrescarLista === "function") {
        onRefrescarLista();
      }
      onClose();
    } catch (err) {
      setErrorMsg(err.message ?? "Error al actualizar");
    } finally {
      setGuardando(false);
    }
  };

  const registrarEvento = async (ejecucionDiariaId, tipoEvento, cantidad = 1, dosisProgramadaId = null) => {
    setGuardando(true);
    setErrorMsg("");
    try {
      const res = await fetch(BASE_URL + "api_tratamientos_ejecucion.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "registrar_evento",
          ejecucion_diaria_id: ejecucionDiariaId,
          dosis_programada_id: dosisProgramadaId,
          tipo_evento: tipoEvento,
          cantidad,
          observacion: notas || "",
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "No se pudo registrar el evento");
      }
      await cargarDetalle({ silent: true });
      if (typeof onRefrescarLista === "function") {
        onRefrescarLista();
      }
    } catch (err) {
      setErrorMsg(err.message ?? "Error al registrar evento");
    } finally {
      setGuardando(false);
    }
  };

  const iniciarMedicamento = async (tratamientoItemId) => {
    setGuardando(true);
    setErrorMsg("");
    try {
      const res = await fetch(BASE_URL + "api_tratamientos_ejecucion.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "iniciar_item",
          tratamiento_id: tratamiento.id,
          tratamiento_item_id: tratamientoItemId,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "No se pudo iniciar el medicamento");
      }
      await cargarDetalle({ silent: true });
      if (typeof onRefrescarLista === "function") {
        onRefrescarLista();
      }
    } catch (err) {
      setErrorMsg(err.message || "Error al iniciar el medicamento");
    } finally {
      setGuardando(false);
    }
  };

  const detalleItems = Array.isArray(detalle?.items) ? detalle.items : [];
  const detalleDias = Array.isArray(detalle?.dias) ? detalle.dias : [];
  const detalleDosis = Array.isArray(detalle?.dosis_programadas) ? detalle.dosis_programadas : [];
  const detalleEventos = Array.isArray(detalle?.eventos) ? detalle.eventos : [];
  const resumen = detalle?.resumen ?? null;

  const diasPorItem = useMemo(() => {
    const map = new Map();
    for (const d of detalleDias) {
      const key = Number(d.tratamiento_item_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => Number(a.dia_nro) - Number(b.dia_nro));
    }
    return map;
  }, [detalleDias]);

  const dosisPorDia = useMemo(() => {
    const map = new Map();
    for (const d of detalleDosis) {
      const key = Number(d.ejecucion_diaria_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => new Date(a.fecha_hora_programada) - new Date(b.fecha_hora_programada));
    }
    return map;
  }, [detalleDosis]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div
          className="p-5 text-white flex items-center justify-between flex-shrink-0"
          style={{ background: "linear-gradient(90deg, var(--color-primary) 0%, var(--color-secondary) 100%)" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-white/20 rounded-xl">
              <Icon iconName="MedicationAdmin" className="text-xl text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Detalle del Tratamiento</h2>
              <p className="text-white/80 text-sm">Prescripción médica para administrar (v{tratamiento.version_num || 1})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
          >
            <Icon iconName="ChromeClose" className="text-white text-sm" />
          </button>
        </div>

        {/* Cuerpo scrollable */}
        <div ref={scrollRef} className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Info del paciente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 rounded-xl p-4">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Paciente</p>
              <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                <Icon iconName="Contact" className="text-blue-500" />
                {paciente || "-"}
              </p>
              {tratamiento.paciente_hc && (
                <p className="text-xs text-gray-500 mt-0.5">HC: {tratamiento.paciente_hc}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Médico tratante</p>
              <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                <Icon iconName="Health" className="text-indigo-500" />
                {medico || "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Fecha consulta</p>
              <p className="text-sm text-gray-700">
                {tratamiento.consulta_fecha
                  ? `${tratamiento.consulta_fecha.split("-").reverse().join("/")} ${String(tratamiento.consulta_hora ?? "").slice(0, 5)}`
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Estado</p>
              <EstadoBadge estado={estado} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Versión</p>
              <p className="text-sm text-gray-700">v{tratamiento.version_num || 1}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Origen</p>
              <p className="text-sm text-gray-700">
                {tratamiento.origen_tratamiento_id ? `Deriva de #${tratamiento.origen_tratamiento_id}` : 'Primera versión'}
              </p>
            </div>
          </div>

          {/* Indicaciones de tratamiento */}
          {texto && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Icon iconName="EditNote" className="text-blue-500" />
                Indicaciones del médico
              </h3>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-gray-800 whitespace-pre-wrap">
                {texto}
              </div>
            </div>
          )}

          {/* Resumen multidía */}
          {resumen && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-slate-700">{resumen.total_dias ?? 0}</div>
                <div className="text-xs text-slate-500">Total días</div>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-green-700">{resumen.dias_cerrados ?? 0}</div>
                <div className="text-xs text-green-600">Días cerrados</div>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-blue-700">{resumen.progreso_pct ?? 0}%</div>
                <div className="text-xs text-blue-600">Progreso</div>
              </div>
            </div>
          )}

          {/* Receta */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Icon iconName="Pill" className="text-indigo-500" />
              Receta médica
              <span className="ml-auto text-xs font-normal text-gray-400">
                {receta.length} medicamento{receta.length !== 1 ? "s" : ""}
              </span>
            </h3>

            {receta.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Sin medicamentos prescritos</p>
            ) : (
              <div className="space-y-3">
                {receta.map((med, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-xl p-4"
                  >
                    <div className="flex items-center justify-center w-8 h-8 bg-indigo-100 rounded-lg flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-indigo-600">{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm">
                        {med.nombre ?? med.codigo ?? `Medicamento ${idx + 1}`}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 mt-1.5">
                        {med.dosis && (
                          <span className="text-xs text-gray-600">
                            <span className="text-gray-400">Dosis: </span>{med.dosis}
                          </span>
                        )}
                        {med.frecuencia && (
                          <span className="text-xs text-gray-600">
                            <span className="text-gray-400">Frec: </span>{med.frecuencia}
                          </span>
                        )}
                        {med.duracion && (
                          <span className="text-xs text-gray-600">
                            <span className="text-gray-400">Duración: </span>{med.duracion}
                          </span>
                        )}
                      </div>
                      {med.observaciones && (
                        <p className="text-xs text-gray-500 mt-1 italic">{med.observaciones}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ejecución diaria multidía */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Icon iconName="Calendar" className="text-cyan-500" />
              Ejecución diaria
              {detalleRefreshing && (
                <span className="ml-auto text-[11px] font-normal text-cyan-600">Actualizando...</span>
              )}
            </h3>

            {detalleLoading ? (
              <p className="text-sm text-gray-500">Cargando plan diario...</p>
            ) : detalleError ? (
              <p className="text-sm text-red-600">{detalleError}</p>
            ) : detalleItems.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Este tratamiento aún no tiene plan diario generado.</p>
            ) : (
              <div className="space-y-3">
                {detalleItems.map((it) => {
                  const diasItem = diasPorItem.get(Number(it.id)) || [];
                  const estadoItem = getEstadoItem(it);
                  return (
                    <div key={it.id} className="border border-cyan-100 bg-cyan-50 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div>
                          <p className="font-semibold text-sm text-gray-800">
                            {it.medicamento_nombre || `Item ${it.item_idx}`}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${getEstadoItemClass(estadoItem)}`}>
                              {estadoItem === "completado" ? "Completado" : estadoItem === "en_ejecucion" ? "En ejecución" : "Pendiente"}
                            </span>
                            <span className="text-xs text-cyan-700">{diasItem.length} día(s)</span>
                            {it.iniciado_en && (
                              <span className="text-[11px] text-gray-500">Inicio: {formatFecha(it.iniciado_en)}</span>
                            )}
                          </div>
                        </div>
                        {estadoItem === "pendiente" && estado !== "suspendido" && (
                          <button
                            disabled={guardando}
                            onClick={() => iniciarMedicamento(it.id)}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            Iniciar este medicamento
                          </button>
                        )}
                      </div>
                      {estadoItem === "pendiente" ? (
                        <div className="rounded-lg border border-dashed border-cyan-200 bg-white/70 px-3 py-3 text-xs text-gray-600">
                          Este medicamento todavía no inicia. Cuando enfermería lo comience, desde aquí se calcularán sus días y horarios sin activar los demás medicamentos.
                        </div>
                      ) : (
                      <div className="space-y-2">
                        {diasItem.map((d) => {
                          const estadoDia = String(d.estado_dia || "pendiente");
                          const dosisDia = dosisPorDia.get(Number(d.id)) || [];
                          const chipClass =
                            estadoDia === "completo"
                              ? "bg-green-100 text-green-700"
                              : estadoDia === "parcial"
                              ? "bg-blue-100 text-blue-700"
                              : estadoDia === "omitido"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700";

                          return (
                            <div key={d.id} className="bg-white border border-cyan-100 rounded-lg p-2 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-gray-700">Día {d.dia_nro}</span>
                                <span className="text-gray-500">{d.fecha_programada}</span>
                                <span className={`px-2 py-0.5 rounded-full ${chipClass}`}>{estadoDia}</span>
                                <span className="text-gray-500">{d.dosis_administradas}/{d.dosis_planificadas} dosis</span>
                              </div>
                              {dosisDia.length > 0 ? (
                                <div className="mt-2 space-y-2">
                                  {dosisDia.map((dose) => {
                                    const doseState = String(dose.estado_dosis || "pendiente");
                                    const doseClass =
                                      doseState === "administrada"
                                        ? "bg-green-100 text-green-700"
                                        : doseState === "omitida"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-yellow-100 text-yellow-700";

                                    return (
                                      <div key={dose.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-medium text-slate-700">Dosis {dose.dosis_nro}</span>
                                          <span className="text-slate-500">{formatFecha(dose.fecha_hora_programada)}</span>
                                          <span className={`px-2 py-0.5 rounded-full ${doseClass}`}>{doseState}</span>
                                        </div>
                                        {doseState === "pendiente" && estado !== "suspendido" && (
                                          <div className="flex flex-wrap gap-2 mt-2">
                                            <button
                                              disabled={guardando}
                                              onClick={() => registrarEvento(d.id, "administrada", 1, dose.id)}
                                              className="px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
                                            >
                                              Administrar ahora
                                            </button>
                                            <button
                                              disabled={guardando}
                                              onClick={() => registrarEvento(d.id, "omitida", 0, dose.id)}
                                              className="px-2 py-1 rounded bg-orange-600 text-white disabled:opacity-50"
                                            >
                                              Omitir dosis
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="mt-2 text-[11px] text-gray-500">
                                  {it.iniciado_en
                                    ? "Este día no tiene dosis exactas programadas."
                                    : "Los horarios exactos se generarán cuando enfermería inicie este medicamento."}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timeline de eventos */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-2 text-sm flex items-center gap-2">
              <Icon iconName="History" className="text-slate-500" />
              Eventos recientes
            </h3>
            {detalleEventos.length === 0 ? (
              <p className="text-xs text-gray-400">Sin eventos registrados.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {detalleEventos.slice(0, 12).map((ev) => (
                  <div key={ev.id} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="font-semibold text-slate-700">{ev.tipo_evento}</span>
                      <span className="text-slate-500">{ev.fecha_hora_evento}</span>
                      <span className="text-slate-500">cant: {ev.cantidad}</span>
                    </div>
                    {ev.observacion && <p className="text-slate-600 mt-1">{ev.observacion}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notas de enfermería (solo si el estado lo permite) */}
          {(estado === "pendiente" || estado === "en_ejecucion") && (
            <div>
              <label className="block font-semibold text-gray-700 mb-2 text-sm flex items-center gap-2">
                <Icon iconName="EditNote" className="text-gray-500" />
                Notas de enfermería
                <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                rows={3}
                placeholder="Observaciones al administrar el tratamiento..."
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>
          )}

          {/* Notas previas (si el estado ya fue iniciado) */}
          {estado === "completado" && tratamiento.notas_enfermeria && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-2 text-sm flex items-center gap-2">
                <Icon iconName="EditNote" className="text-green-500" />
                Notas registradas
              </h3>
              <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap">
                {tratamiento.notas_enfermeria}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-center gap-2">
              <Icon iconName="ErrorBadge" className="text-red-500" />
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer con acciones */}
        <div className="flex-shrink-0 border-t border-gray-100 p-4 flex flex-wrap gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={guardando}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
          >
            Cerrar
          </button>

          {estado === "en_ejecucion" && (
            <>
              <button
                onClick={() => handleAccion("suspendido")}
                disabled={guardando}
                className="px-4 py-2 text-sm font-semibold text-orange-700 bg-orange-100 hover:bg-orange-200 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Icon iconName="Warning" className="text-orange-500 text-sm" />
                Suspender
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
