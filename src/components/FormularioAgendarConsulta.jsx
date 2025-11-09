import React from "react";

function FormularioAgendarConsulta({
  tipoConsulta,
  setTipoConsulta,
  medicos,
  medicoId,
  setMedicoId,
  fecha,
  setFecha,
  hora,
  setHora,
  horariosDisponibles,
  cargandoHorarios,
  handleSubmit,
  msg,
}) {
  return (
    <div className="w-full md:w-[700px] flex flex-col items-center md:pl-0">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 md:gap-4 mb-4 bg-white rounded-2xl shadow-xl border border-green-200 p-8 w-full max-w-2xl text-xs md:text-base"
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
        <label className="font-semibold mb-1" htmlFor="medico-select">
          Médico
        </label>
        <select
          id="medico-select"
          value={medicoId}
          onChange={(e) => {
            setMedicoId(e.target.value);
            setHora(""); // Resetear hora cuando cambia médico
          }}
          className="border rounded px-3 py-2 md:px-4 md:py-3 text-base md:text-lg"
          required
        >
          <option value="">Selecciona un médico</option>
          {medicos.map((medico) => (
            <option key={medico.id} value={medico.id}>
              {medico.nombre} {medico.apellido}
            </option>
          ))}
        </select>

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

        <button
          type="submit"
          className="bg-green-600 text-white rounded px-4 py-2 md:px-6 md:py-3 font-bold text-base md:text-lg"
        >
          Agendar Consulta
        </button>
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
