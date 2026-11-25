import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "../../utils/apiClient";
import DisponibilidadHorasPanel from "./DisponibilidadHorasPanel";
import {
  DEFAULT_REEVALUACION,
  REEVALUACION_MAX_DIAS,
  REEVALUACION_MOTIVOS,
  addDaysYmd,
  formatReevaluacionCuando,
  limaYmd,
  reevaluacionEstadoClasses,
  reevaluacionEstadoLabel,
} from "../../utils/reevaluacion";

function horaHm(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
}

/**
 * Bloque "Reevaluación" de la HC: continuación de la MISMA atención (máx. 7 días).
 * `value` es el formulario (hc.reevaluacion) y `servidor` la fila real guardada en BD.
 */
export default function ReevaluacionHcCard({ value, onChange, servidor, readOnly, medicoId, consultaId, titulo = "🔄 Reevaluación", etiquetaActivar = "El paciente debe volver para reevaluación (revisar resultados o evolución)", historial = [] }) {
  const form = { ...DEFAULT_REEVALUACION, ...(value || {}) };
  const hoy = useMemo(() => limaYmd(), []);
  const abierta = Number(servidor?.abierta) === 1;
  const bloqueada = abierta && servidor?.estado !== "pendiente";
  const baseYmd = abierta && servidor?.created_at ? String(servidor.created_at).slice(0, 10) : hoy;
  const maxFecha = abierta && servidor?.fecha_limite ? String(servidor.fecha_limite).slice(0, 10) : addDaysYmd(baseYmd, REEVALUACION_MAX_DIAS);
  const deshabilitado = readOnly || bloqueada;

  const [disp, setDisp] = useState(null);
  const [dispLoading, setDispLoading] = useState(false);
  const [dispError, setDispError] = useState("");

  const update = (patch) => onChange({ ...form, ...patch });

  const cargarDisponibilidad = useCallback(async () => {
    if (!form.programar || form.sin_hora_fija || !form.fecha || Number(medicoId) <= 0) {
      setDisp(null);
      setDispError("");
      return;
    }
    setDispLoading(true);
    setDispError("");
    try {
      const params = new URLSearchParams({
        medico_id: String(medicoId),
        fecha: form.fecha,
        reevaluacion_origen_excluir: String(Number(consultaId) || 0),
      });
      const paramsVista = new URLSearchParams({
        vista: "disponibilidad",
        medico_id: String(medicoId),
        solo_activas: "1",
        fecha_desde: form.fecha,
        fecha_hasta: form.fecha,
        _t: String(Date.now()),
      });
      const [res, resVista] = await Promise.all([
        authFetch(`api_horarios_disponibles.php?${params.toString()}`, { cache: "no-store" }),
        authFetch(`api_consultas.php?${paramsVista.toString()}`, { cache: "no-store" }),
      ]);
      const [data, dataVista] = await Promise.all([res.json(), resVista.json()]);
      if (!data?.success) throw new Error(data?.error || "No se pudo consultar la disponibilidad.");
      const ocupadas = Array.from(new Set((Array.isArray(data.horarios_ocupados) ? data.horarios_ocupados : []).map(horaHm).filter(Boolean))).sort();
      setDisp({
        programadas: dataVista?.success && Array.isArray(dataVista.consultas) ? dataVista.consultas.length : 0,
        libres: (Array.isArray(data.horarios_disponibles) ? data.horarios_disponibles : [])
          .map((h) => horaHm(h?.hora))
          .filter((hm) => hm && !ocupadas.includes(hm)),
        ocupadas,
      });
    } catch (err) {
      setDisp(null);
      setDispError(err?.message || "No se pudo consultar la disponibilidad.");
    } finally {
      setDispLoading(false);
    }
  }, [consultaId, form.fecha, form.programar, form.sin_hora_fija, medicoId]);

  useEffect(() => {
    if (!form.programar || form.sin_hora_fija || !form.fecha) {
      setDisp(null);
      return undefined;
    }
    const timer = window.setTimeout(cargarDisponibilidad, 350);
    return () => window.clearTimeout(timer);
  }, [cargarDisponibilidad, form.fecha, form.programar, form.sin_hora_fija]);

  const horaSeleccionada = horaHm(form.hora);
  const horaOcupada = Boolean(disp && horaSeleccionada && disp.ocupadas.includes(horaSeleccionada));
  const atajos = [
    { label: "Hoy", dias: 0 },
    { label: "Mañana", dias: 1 },
    { label: "En 2 días", dias: 2 },
    { label: "En 3 días", dias: 3 },
  ];

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border-2 border-violet-200">
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
        <h2 className="text-lg font-bold text-violet-900">{titulo}</h2>
        <span className="text-xs text-violet-700">
          Continuación de esta misma atención (hasta {REEVALUACION_MAX_DIAS} días). Para un plazo mayor use «Próxima cita».
        </span>
        {servidor && (
          <span className={`ml-auto inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${reevaluacionEstadoClasses(servidor.estado)}`}>
            {reevaluacionEstadoLabel(servidor.estado)}
          </span>
        )}
      </div>

      {bloqueada && (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
          El paciente ya está en atención de reevaluación ({reevaluacionEstadoLabel(servidor.estado).toLowerCase()}); no se puede modificar desde aquí.
        </div>
      )}

      {!abierta && servidor && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Última reevaluación: {reevaluacionEstadoLabel(servidor.estado).toLowerCase()} ({formatReevaluacionCuando(servidor.fecha_sugerida, servidor.hora_sugerida, servidor.sin_hora_fija)})
          {servidor.motivo_cierre ? ` — ${servidor.motivo_cierre}` : ""}. Puede indicar una nueva.
        </div>
      )}

      <div className="space-y-4">
        <label
          className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-all ${
            form.programar ? "border-violet-400 bg-violet-50" : "border-slate-300 bg-white"
          } ${deshabilitado ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:border-violet-300"}`}
        >
          <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-md border-2 ${
                form.programar ? "border-violet-600 bg-violet-600 text-white" : "border-slate-400 bg-white"
              }`}
            >
              {form.programar ? "✓" : ""}
            </span>
            <span>{etiquetaActivar}</span>
          </div>
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${form.programar ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"}`}>
            {form.programar ? "Activado" : "Desactivado"}
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={!!form.programar}
            disabled={deshabilitado}
            onChange={(e) => update({ programar: e.target.checked, fecha: form.fecha || addDaysYmd(hoy, 1) })}
          />
        </label>

        {form.programar && (
          <>
            <div>
              <p className="mb-1 text-sm font-semibold text-slate-700">Plazo</p>
              <div className="flex flex-wrap items-center gap-2">
                {atajos.map((a) => {
                  const ymd = addDaysYmd(hoy, a.dias);
                  const activo = form.fecha === ymd;
                  return (
                    <button
                      key={a.label}
                      type="button"
                      disabled={deshabilitado || ymd > maxFecha}
                      onClick={() => update({ fecha: ymd })}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                        activo ? "border-violet-600 bg-violet-600 text-white" : "border-violet-300 bg-white text-violet-800 hover:bg-violet-50"
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
                <input
                  type="date"
                  className="rounded-lg border px-3 py-1.5 text-sm"
                  value={form.fecha}
                  min={abierta ? undefined : hoy}
                  max={maxFecha}
                  disabled={deshabilitado}
                  onChange={(e) => update({ fecha: e.target.value })}
                />
                {form.fecha && (
                  <span className="text-xs text-slate-500">{formatReevaluacionCuando(form.fecha, form.hora, form.sin_hora_fija)}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Hora</label>
                <input
                  type="time"
                  className="w-full rounded-lg border px-3 py-2 disabled:bg-slate-100"
                  value={form.sin_hora_fija ? "" : form.hora}
                  disabled={deshabilitado || form.sin_hora_fija}
                  onChange={(e) => update({ hora: e.target.value, sin_hora_fija: false })}
                />
                <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!form.sin_hora_fija}
                    disabled={deshabilitado}
                    onChange={(e) => update({ sin_hora_fija: e.target.checked, hora: e.target.checked ? "" : form.hora })}
                  />
                  Sin hora fija (durante el día)
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-slate-700">Motivo</label>
                <div className="mb-2 flex flex-wrap gap-3">
                  {REEVALUACION_MOTIVOS.map((m) => (
                    <label key={m.value} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="reevaluacion_tipo_motivo"
                        checked={form.tipo_motivo === m.value}
                        disabled={deshabilitado}
                        onChange={() => update({ tipo_motivo: m.value })}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  maxLength={255}
                  placeholder="Detalle breve (opcional): ej. resultados de hemograma y perfil lipídico"
                  value={form.motivo}
                  disabled={deshabilitado}
                  onChange={(e) => update({ motivo: e.target.value })}
                />
              </div>
            </div>

            {!form.sin_hora_fija && (
              <>
                <DisponibilidadHorasPanel
                  titulo="Disponibilidad del médico en la fecha elegida"
                  loading={dispLoading}
                  error={dispError}
                  data={disp}
                  seleccionada={horaSeleccionada}
                  onSelect={(hm) => update({ hora: hm, sin_hora_fija: false })}
                  onRefresh={cargarDisponibilidad}
                  disabled={deshabilitado}
                  refreshDisabled={!form.fecha}
                />
                {horaOcupada && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    La hora seleccionada figura ocupada. Elija una hora libre o marque «Sin hora fija»; el sistema no permitirá guardar un cruce.
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {Array.isArray(historial) && historial.length > 0 && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-700">Reevaluaciones realizadas</p>
          <div className="space-y-2">
            {[...historial].reverse().map((h, idx) => (
              <div key={`${h?.reevaluacion_id || "rv"}-${idx}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                <div className="font-semibold text-slate-800">
                  {String(h?.fecha || "")} {String(h?.hora || "")} · {h?.conducta_label || h?.conducta || "-"}
                  {h?.atendido_por ? ` · ${h.atendido_por}` : ""}
                </div>
                <div className="mt-0.5 whitespace-pre-line">{h?.evolucion}</div>
                {h?.ajustes ? <div className="mt-0.5 text-slate-500">Ajustes: {h.ajustes}</div> : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
