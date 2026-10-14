import React from "react";

const SEXO_LABELS = {
  M: "Masculino",
  F: "Femenino",
  Otro: "Otro",
};

function DatosBasicos({
  form,
  handleChange,
  dniLookup = { status: "idle", message: "", paciente: null, sugerencia: null },
  sexoOptions = ["M", "F", "Otro"],
  onBuscarReniec,
  onAplicarSugerencia,
  onCargarPacienteLocal,
}) {
  const esDni = String(form?.tipo_documento || "").toLowerCase() === "dni";
  const dniVal = String(form?.dni || "").trim();
  const estado = String(dniLookup?.status || "idle");
  const mensaje = String(dniLookup?.message || "").trim();
  const isChecking = estado === "checking";
  const mostrarEstadoDni = esDni && (dniVal.length >= 8 || isChecking || mensaje !== "");

  const estadoClassName =
    estado === "duplicate"
      ? "mt-2 rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-800 shadow-sm"
      : estado === "external"
      ? "mt-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-800 shadow-sm"
      : estado === "checking"
      ? "mt-2 rounded-lg border border-blue-300 bg-blue-50 p-2.5 text-xs text-blue-800 shadow-sm"
      : estado === "timeout" || estado === "error"
      ? "mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 shadow-sm"
      : estado === "not_found"
      ? "mt-2 rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-xs text-slate-800 shadow-sm"
      : "mt-2 rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-xs text-slate-700 shadow-sm";

  return (
    <div className="bg-white rounded-lg p-4 border border-blue-300">
      <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        Información Básica
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Tipo de documento y DNI */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de documento</label>
          <select
            name="tipo_documento"
            value={form.tipo_documento}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="dni">DNI</option>
            <option value="carnet_extranjeria">Carnet de extranjería</option>
            <option value="sin_documento">Sin documento</option>
          </select>

          <label className="block text-sm font-medium text-gray-700 mb-1">
            {form.tipo_documento === "dni"
              ? "DNI"
              : form.tipo_documento === "carnet_extranjeria"
              ? "Carnet de extranjería"
              : "DNI Provisional"}
          </label>

          {esDni ? (
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <input
                  name="dni"
                  value={form.dni}
                  onChange={handleChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (onBuscarReniec) onBuscarReniec(true);
                    }
                  }}
                  placeholder="Documento de identidad (8 dígitos)"
                  maxLength={8}
                  inputMode="numeric"
                  className="w-full border rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono tracking-wide"
                  autoFocus
                />
                {isChecking && (
                  <div className="absolute right-2.5 top-2.5 flex items-center pointer-events-none" title="Consultando RENIEC...">
                    <svg className="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => onBuscarReniec && onBuscarReniec(true)}
                disabled={dniVal.length !== 8 || isChecking}
                title="Buscar en RENIEC (o presiona Enter)"
                className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg text-sm shadow-sm transition-all duration-150 flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isChecking ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Buscando...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span>Buscar RENIEC</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <input
              name="dni"
              value={form.dni}
              onChange={handleChange}
              placeholder={form.tipo_documento === "carnet_extranjeria" ? "Carnet de extranjería (6 a 12 dígitos)" : "Se genera automáticamente"}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
              disabled={form.tipo_documento === "sin_documento"}
            />
          )}

          {mostrarEstadoDni && mensaje && (
            <div className={estadoClassName}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  {isChecking && (
                    <svg className="animate-spin h-3.5 w-3.5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {estado === "external" && (
                    <span className="text-emerald-700 font-bold">✓</span>
                  )}
                  {(estado === "duplicate" || estado === "timeout" || estado === "error") && (
                    <span className="text-amber-700 font-bold">⚠️</span>
                  )}
                  <span className="font-medium">{mensaje}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {estado === "external" && dniLookup?.sugerencia && (
                    <button
                      type="button"
                      onClick={() => onAplicarSugerencia && onAplicarSugerencia(dniLookup.sugerencia)}
                      className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 shadow-sm"
                      title="Volver a rellenar nombres y apellidos desde RENIEC"
                    >
                      Aplicar nombres RENIEC
                    </button>
                  )}

                  {estado === "duplicate" && dniLookup?.paciente && (
                    <button
                      type="button"
                      onClick={() => onCargarPacienteLocal && onCargarPacienteLocal(dniLookup.paciente)}
                      className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold text-[11px] hover:bg-rose-700 shadow-sm"
                      title="Cargar la ficha de este paciente existente"
                    >
                      Cargar datos de este paciente
                    </button>
                  )}

                  {(estado === "timeout" || estado === "error" || estado === "not_found") && (
                    <button
                      type="button"
                      onClick={() => onBuscarReniec && onBuscarReniec(true)}
                      disabled={isChecking}
                      className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold text-[11px] hover:bg-indigo-700 shadow-sm inline-flex items-center gap-1"
                      title="Reintentar búsqueda en RENIEC"
                    >
                      <span>🔄</span> Reintentar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Historia clínica */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Historia Clínica <span className="text-xs text-gray-500">(Se genera automáticamente si está vacío)</span></label>
          <input name="historia_clinica" value={form.historia_clinica} onChange={handleChange} placeholder="HC##### (opcional - se genera automáticamente)" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
        {/* Nombre y Apellido */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
          <input name="nombre" value={form.nombre} onChange={handleChange} placeholder="Nombres del paciente" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Apellido *</label>
          <input name="apellido" value={form.apellido} onChange={handleChange} placeholder="Apellidos del paciente" className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required />
        </div>
        {/* Sexo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sexo *</label>
          <select name="sexo" value={form.sexo} onChange={handleChange} className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            {sexoOptions.map((value) => (
              <option key={value} value={value}>{SEXO_LABELS[value] || value}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export default DatosBasicos;

