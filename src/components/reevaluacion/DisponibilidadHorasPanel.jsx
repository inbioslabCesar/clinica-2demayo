/**
 * Panel de disponibilidad del médico para una fecha: contadores y horas libres / ocupadas.
 * `data` = { programadas, libres: ["HH:MM"], ocupadas: ["HH:MM"] } o null.
 */
export default function DisponibilidadHorasPanel({ titulo, loading, error, data, seleccionada, onSelect, onRefresh, disabled, refreshDisabled }) {
  const libres = Array.isArray(data?.libres) ? data.libres : [];
  const ocupadas = Array.isArray(data?.ocupadas) ? data.ocupadas : [];
  const sinHorario = Boolean(data) && libres.length === 0 && ocupadas.length === 0;

  return (
    <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-cyan-900">{titulo}</p>
          <p className="text-xs text-cyan-800">Solo se consulta la agenda del profesional asignado a esta HC en la fecha seleccionada.</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={disabled || loading || refreshDisabled}
          className="rounded-lg border border-cyan-300 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-900 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Consultando..." : "Actualizar disponibilidad"}
        </button>
      </div>

      {error && (
        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
      )}

      {data && (
        <>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-cyan-300 bg-white px-2.5 py-1 font-semibold text-cyan-900">
              Programadas: {Number(data.programadas || 0)}
            </span>
            <span className="rounded-full border border-emerald-300 bg-white px-2.5 py-1 font-semibold text-emerald-700">
              Libres: {libres.length}
            </span>
            <span className="rounded-full border border-rose-300 bg-white px-2.5 py-1 font-semibold text-rose-700">
              Ocupadas: {ocupadas.length}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">Horas libres</div>
              {libres.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {libres.map((hm) => (
                    <button
                      key={`disp-libre-${hm}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelect(hm)}
                      title="Seleccionar hora libre"
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed ${
                        seleccionada === hm
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      {hm}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-emerald-700">
                  {sinHorario
                    ? "El médico no tiene horario publicado ni citas para esta fecha. Puede indicar una hora manual (se tratará como adicional) o marcar «Sin hora fija»."
                    : "No hay horas libres para esta fecha."}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700">Horas ocupadas</div>
              {ocupadas.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {ocupadas.map((hm) => (
                    <span key={`disp-ocupada-${hm}`} className="rounded-full border border-rose-300 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700">
                      {hm}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-rose-700">No hay horas ocupadas para esta fecha.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
