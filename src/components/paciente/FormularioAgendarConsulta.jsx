import React from "react";
import MedicoTarifaSelector from "./MedicoTarifaSelector";

function FormularioAgendarConsulta({
  tipoConsulta,
  setTipoConsulta,
  tarifas,
  coverageByTarifa = {},
  medicoId,
  setMedicoId,
  fecha,
  setFecha,
  fechaHoy = "",
  bloquearCambioFecha = false,
  episodioFijo = null,
  hora,
  setHora,
  onHoraManualChange,
  horariosDisponibles,
  horasLibres = [],
  horasOcupadas = [],
  cargandoHorarios,
  handleSubmit,
  onCotizar,
  onAgregarCarrito,
  isEditingConsulta = false,
  isEditingCotizacion = false,
  isAdendaMode = false,
  precioReferenciaConsulta = null,
  processingAction = "",
  msg,
}) {
  const tarifaSeleccionada = Array.isArray(tarifas)
    ? tarifas.find((t) => String(t.medico_id) === String(medicoId))
    : null;
  const coberturaTarifa = coverageByTarifa[Number(tarifaSeleccionada?.id || 0)] || null;
  const tieneCoberturaContrato = String(coberturaTarifa?.origen_cobro || "") === "contrato";
  const precioBaseConsulta = Number(tarifaSeleccionada?.precio_particular || 0);
  const precioConsulta = tieneCoberturaContrato ? 0 : precioBaseConsulta;
  const precioReferenciaNum = Number(precioReferenciaConsulta);
  const mostrarComparativoAdenda =
    isAdendaMode &&
    !episodioFijo &&
    isEditingConsulta &&
    medicoId &&
    Number.isFinite(precioReferenciaNum) &&
    precioReferenciaNum >= 0;
  const diferenciaAdenda = mostrarComparativoAdenda ? Number((precioConsulta - precioReferenciaNum).toFixed(2)) : 0;

  return (
    <div className="w-full flex flex-col items-stretch">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 md:gap-4 mb-4 bg-white rounded-2xl shadow-xl border border-green-200 p-6 md:p-8 w-full text-xs md:text-base"
      >
        <div className="mb-4">
          <label className="block font-semibold mb-1">Tipo de Consulta:</label>
          <select
            value={tipoConsulta}
            onChange={(e) => setTipoConsulta(e.target.value)}
            disabled={Boolean(episodioFijo)}
            className="border rounded px-3 py-2 w-full"
          >
            <option value="programada">Programada</option>
            <option value="espontanea">Espontánea</option>
            <option value="reservada_sin_turno">Reservada sin turno</option>
          </select>
        </div>
        <label className="font-semibold mb-1">
          Médico
        </label>
        <MedicoTarifaSelector
          tarifas={tarifas}
          medicoId={medicoId}
          setMedicoId={setMedicoId}
          setHora={(valor) => setHora(episodioFijo ? episodioFijo.hora : valor)}
          coverageByTarifa={coverageByTarifa}
        />

        {medicoId ? (
          <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            <span className="font-semibold">Precio de la consulta:</span>{" "}
            {precioConsulta > 0 ? `S/ ${precioConsulta.toFixed(2)}` : "S/ 0.00"}
            {tieneCoberturaContrato ? (
              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                Cubierta hoy por contrato
              </span>
            ) : null}
          </div>
        ) : null}
        {mostrarComparativoAdenda ? (
          <div
            className={`rounded border px-3 py-2 text-sm ${
              diferenciaAdenda > 0
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : diferenciaAdenda < 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-slate-200 bg-slate-50 text-slate-800"
            }`}
          >
            <div className="font-semibold">Comparativo de cambio de médico</div>
            <div>Precio original: S/ {precioReferenciaNum.toFixed(2)}</div>
            <div>Precio nuevo: S/ {precioConsulta.toFixed(2)}</div>
            {diferenciaAdenda > 0 ? (
              <div>Diferencia por cobrar: S/ {diferenciaAdenda.toFixed(2)}</div>
            ) : diferenciaAdenda < 0 ? (
              <div>Reducción aplicada: S/ {Math.abs(diferenciaAdenda).toFixed(2)}</div>
            ) : (
              <div>Sin diferencia de precio.</div>
            )}
          </div>
        ) : null}

        <label className="font-semibold mb-1" htmlFor="fecha-input">
          Fecha de la consulta
        </label>
        <input
          id="fecha-input"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="border rounded px-3 py-2 md:px-4 md:py-3 text-base md:text-lg"
          min={bloquearCambioFecha && fechaHoy ? fechaHoy : undefined}
          max={bloquearCambioFecha && fechaHoy ? fechaHoy : undefined}
          disabled={bloquearCambioFecha || Boolean(episodioFijo)}
          required
        />
        {bloquearCambioFecha && !episodioFijo && (
          <div className="text-xs text-amber-700">
            En consulta espontánea la fecha es solo hoy ({fechaHoy}).
          </div>
        )}

        {tipoConsulta === "programada" ? (
          <>
            <label className="font-semibold mb-1" htmlFor="hora-select">
              Horario disponible
            </label>
            <select
              id="hora-select"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="border rounded px-3 py-2 md:px-4 md:py-3 text-base md:text-lg"
              required
              disabled={!medicoId || !fecha || Boolean(episodioFijo) ? true : cargandoHorarios}
            >
              <option value="">
                {cargandoHorarios
                  ? "Cargando horarios..."
                  : !medicoId || !fecha
                  ? "Selecciona médico y fecha primero"
                  : horariosDisponibles.length === 0
                  ? "No hay horarios disponibles"
                  : "Selecciona un horario"}
              </option>
              {episodioFijo && !horariosDisponibles.some((h) => String(h.hora || "").slice(0, 5) === episodioFijo.hora) && (
                <option value={episodioFijo.hora}>{episodioFijo.hora} - horario del episodio</option>
              )}
              {horariosDisponibles.map((horario) => (
                <option
                  key={`${horario.medico_id}-${horario.hora}`}
                  value={horario.hora}
                >
                  {horario.hora} - {horario.medico_nombre}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label className="font-semibold mb-1" htmlFor="hora-input">
              Hora de consulta
            </label>
            <input
              id="hora-input"
              type="time"
              value={hora}
              onChange={(e) => (typeof onHoraManualChange === "function" ? onHoraManualChange(e.target.value) : setHora(e.target.value))}
              className="border rounded px-3 py-2 md:px-4 md:py-3 text-base md:text-lg"
              required
            />
            {medicoId && fecha && (
              <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 space-y-1">
                <div className="font-semibold text-slate-800">Disponibilidad de referencia (para evitar cruces)</div>
                {cargandoHorarios ? (
                  <div className="text-slate-500">Consultando horas libres y ocupadas...</div>
                ) : (
                  <>
                    <div>
                      <span className="font-semibold">Horas libres:</span>{" "}
                      {Array.isArray(horasLibres) && horasLibres.length > 0 ? horasLibres.join(", ") : "sin horas libres"}
                    </div>
                    <div>
                      <span className="font-semibold">Horas ocupadas:</span>{" "}
                      {Array.isArray(horasOcupadas) && horasOcupadas.length > 0 ? horasOcupadas.join(", ") : "sin horas ocupadas"}
                    </div>
                    {!Array.isArray(horasLibres) || horasLibres.length === 0 ? (
                      <div className="text-amber-700">
                        No hay horario regular libre para esta fecha. Si el médico autoriza, puedes usar hora manual fuera de horario, evitando horas ocupadas.
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {isEditingConsulta ? (
          <div className={`grid grid-cols-1 ${isAdendaMode ? "md:grid-cols-3" : "md:grid-cols-2"} gap-2`}>
            <button
              type="button"
              onClick={onAgregarCarrito}
              disabled={processingAction !== ""}
              className="bg-violet-600 text-white rounded px-4 py-2 md:px-6 md:py-3 font-bold text-base md:text-lg disabled:opacity-60"
            >
              Agregar al carrito
            </button>
            <button
              type="button"
              onClick={onCotizar}
              disabled={processingAction !== ""}
              className={`${isAdendaMode ? "bg-blue-600" : "bg-blue-700"} text-white rounded px-4 py-2 md:px-6 md:py-3 font-bold text-base md:text-lg disabled:opacity-60`}
            >
              {processingAction === "editar"
                ? "Actualizando..."
                : episodioFijo
                ? "Actualizar cotización"
                : isAdendaMode
                ? "Guardar cambio sin cobro"
                : isEditingCotizacion
                ? "Actualizar cotización"
                : "Actualizar consulta"}
            </button>
            {isAdendaMode && (
              <button
                type="submit"
                disabled={processingAction !== ""}
                className="bg-green-600 text-white rounded px-4 py-2 md:px-6 md:py-3 font-bold text-base md:text-lg disabled:opacity-60"
              >
                {processingAction === "editar" || processingAction === "cobrar"
                  ? "Actualizando..."
                  : episodioFijo
                  ? "Actualizar y cobrar"
                  : "Guardar cambio y cobrar diferencia"}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onAgregarCarrito}
              disabled={processingAction !== ""}
              className="bg-violet-600 text-white rounded px-4 py-2 md:px-6 md:py-3 font-bold text-base md:text-lg disabled:opacity-60"
            >
              Agregar al carrito
            </button>
            <button
              type="button"
              onClick={onCotizar}
              disabled={processingAction !== ""}
              className="bg-blue-600 text-white rounded px-4 py-2 md:px-6 md:py-3 font-bold text-base md:text-lg disabled:opacity-60"
            >
              {processingAction === "cotizar"
                ? "Procesando..."
                : isAdendaMode
                ? "Guardar cambio sin cobro"
                : isEditingCotizacion
                ? "Actualizar cotización"
                : "Registrar cotización"}
            </button>
            <button
              type="submit"
              disabled={processingAction !== ""}
              className="bg-green-600 text-white rounded px-4 py-2 md:px-6 md:py-3 font-bold text-base md:text-lg disabled:opacity-60"
            >
              {processingAction === "cobrar"
                ? "Procesando..."
                : isAdendaMode
                ? "Guardar cambio y cobrar (si aplica)"
                : isEditingCotizacion
                ? "Actualizar y cobrar"
                : "Registrar y cobrar"}
            </button>
          </div>
        )}
        {isAdendaMode && !episodioFijo && (
          <div className="mt-1 text-xs text-slate-600">
            Si el cambio de médico genera diferencia, puedes cobrarla de inmediato; si no hay diferencia, solo se guarda el cambio.
          </div>
        )}
        {msg && (
          <div className="mt-2 text-base md:text-lg text-center text-green-700">
            {msg}
          </div>
        )}
      </form>
    </div>
  );
}

export default FormularioAgendarConsulta;
