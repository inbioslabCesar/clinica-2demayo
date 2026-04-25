import React, { useState, useRef, useEffect } from "react";

/**
 * Reemplaza el <select> nativo de médicos con un combobox con filtro en tiempo real.
 * Props: tarifas, medicoId, setMedicoId, setHora, coverageByTarifa
 */
function MedicoTarifaSelector({
  tarifas = [],
  medicoId,
  setMedicoId,
  setHora,
  coverageByTarifa = {},
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const esCubierta = (tarifa) =>
    String(coverageByTarifa[Number(tarifa?.id)]?.origen_cobro || "") === "contrato";

  const tarifaSeleccionada = tarifas.find(
    (t) => String(t.medico_id) === String(medicoId)
  );

  const labelSeleccionado = tarifaSeleccionada
    ? `${tarifaSeleccionada.medico_abreviatura_profesional || "Dr(a)."} ${tarifaSeleccionada.medico_nombre} ${tarifaSeleccionada.medico_apellido}`
    : "";

  const filtered = tarifas.filter((t) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const nombre = `${t.medico_nombre || ""} ${t.medico_apellido || ""}`.toLowerCase();
    const especialidad = (t.descripcion || "").toLowerCase();
    return nombre.includes(q) || especialidad.includes(q);
  });

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (tarifa) => {
    setMedicoId(tarifa.medico_id);
    setHora("");
    setQuery("");
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setMedicoId("");
    setHora("");
    setQuery("");
    setOpen(false);
  };

  const handleInputChange = (e) => {
    setQuery(e.target.value);
    setOpen(true);
  };

  const handleInputFocus = () => {
    setOpen(true);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* Input visible + botón limpiar/chevron */}
      <div className="flex items-center border rounded px-3 py-2 md:px-4 md:py-3 bg-white focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-blue-400 transition">
        <input
          type="text"
          placeholder={open ? "Buscar por nombre o especialidad..." : "Selecciona un médico"}
          value={open ? query : labelSeleccionado}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          className="flex-1 outline-none bg-transparent text-base md:text-lg placeholder-gray-400 min-w-0"
          autoComplete="off"
          aria-label="Buscar médico"
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
        />
        {medicoId && !open ? (
          <button
            type="button"
            onClick={handleClear}
            className="ml-2 text-gray-400 hover:text-red-500 text-base leading-none flex-shrink-0"
            aria-label="Limpiar selección"
          >
            ✕
          </button>
        ) : (
          <span className="ml-2 text-gray-400 pointer-events-none flex-shrink-0 text-sm">▾</span>
        )}
      </div>

      {/* Input oculto para validación nativa del formulario */}
      <input
        type="text"
        name="medico_id_hidden"
        value={medicoId}
        required
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="absolute opacity-0 pointer-events-none w-0 h-0"
      />

      {/* Dropdown */}
      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-72 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-400 italic">
              Sin resultados para &ldquo;{query}&rdquo;
            </li>
          ) : (
            filtered.map((tarifa, idx) => {
              const cubierta = esCubierta(tarifa);
              const precio = Number(tarifa.precio_particular || 0);
              const isSelected = String(tarifa.medico_id) === String(medicoId);

              return (
                <li
                  key={`${tarifa.medico_id}-${tarifa.tarifa_id || idx}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(tarifa)}
                  className={`flex items-center justify-between px-4 py-2.5 cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${
                    isSelected
                      ? "bg-blue-50 hover:bg-blue-100"
                      : "hover:bg-gray-50"
                  }`}
                >
                  {/* Columna izquierda: nombre + badge especialidad */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-semibold text-gray-800 truncate text-sm md:text-base leading-tight">
                      {tarifa.medico_abreviatura_profesional || "Dr(a)."}{" "}
                      {tarifa.medico_nombre} {tarifa.medico_apellido}
                    </span>
                    <span
                      className={`inline-block mt-1 text-xs rounded-full px-2 py-0.5 w-fit font-medium leading-none ${
                        cubierta
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {tarifa.descripcion}
                      {cubierta ? " · Contrato" : ""}
                    </span>
                  </div>

                  {/* Columna derecha: precio */}
                  <span
                    className={`ml-3 text-sm font-bold whitespace-nowrap flex-shrink-0 ${
                      cubierta ? "text-emerald-600" : "text-gray-700"
                    }`}
                  >
                    {cubierta ? "S/ 0.00" : precio > 0 ? `S/ ${precio.toFixed(2)}` : "—"}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

export default MedicoTarifaSelector;
