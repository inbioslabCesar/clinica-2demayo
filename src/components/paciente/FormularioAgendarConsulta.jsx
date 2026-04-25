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
  hora,
  setHora,
  horariosDisponibles,
  cargandoHorarios,
  handleSubmit,
  onCotizar,
  onAgregarCarrito,
  isEditingConsulta = false,
  isEditingCotizacion = false,
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
  const esTarifaCubiertaPorContrato = (tarifa) => String(coverageByTarifa[Number(tarifa?.id)]?.origen_cobro || "") === "contrato";

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
            className="border rounded px-3 py-2 w-full"
          >
            <option value="programada">Programada</option>
            <option value="espontanea">Espontánea</option>
          </select>
        </div>
        <label className="font-semibold mb-1">
          Médico
        </label>
        <MedicoTarifaSelector
          tarifas={tarifas}
          medicoId={medicoId}
          setMedicoId={setMedicoId}
          setHora={setHora}
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

        <label className="font-semibold mb-1" htmlFor="fecha-input">
          Fecha de la consulta
        </label>
        <input
          id="fecha-input"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="border rounded px-3 py-2 md:px-4 md:py-3 text-base md:text-lg"
          required
        />

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
              disabled={!medicoId || !fecha ? true : cargandoHorarios}
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
              onChange={(e) => setHora(e.target.value)}
              className="border rounded px-3 py-2 md:px-4 md:py-3 text-base md:text-lg"
              required
            />
          </>
        )}

        {isEditingConsulta ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onAgregarCarrito}
              disabled={processingAction !== ""}
              className="bg-violet-600 text-white rounded px-4 py-2 md:px-6 md:py-3 font-bold text-base md:text-lg disabled:opacity-60"
            >
              Agregar al carrito
            </button>
            <button
              type="submit"
              disabled={processingAction !== ""}
              className="bg-blue-700 text-white rounded px-4 py-2 md:px-6 md:py-3 font-bold text-base md:text-lg disabled:opacity-60"
            >
              {processingAction === "editar"
                ? "Actualizando..."
                : isEditingCotizacion
                ? "Actualizar cotización"
                : "Actualizar consulta"}
            </button>
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
                : isEditingCotizacion
                ? "Actualizar y cobrar"
                : "Registrar y cobrar"}
            </button>
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
