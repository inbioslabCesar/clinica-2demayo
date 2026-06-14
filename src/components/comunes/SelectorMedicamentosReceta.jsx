import { useEffect, useState } from "react";
import { authFetch } from "../../utils/apiClient";
import { calcularCantidadTotalReceta } from "../../utils/calcularCantidadReceta";

const emptyDetalle = {
  dosis: "",
  frecuenciaTipo: "intervalo_horas",
  frecuenciaValor: "8",
  frecuenciaHoras: "",
  duracionValor: "5",
  duracionUnidad: "dias",
  observaciones: "",
};

function parsePositiveInteger(value) {
  const num = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function parseFixedTimes(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(part))
    .filter((part, index, arr) => arr.indexOf(part) === index)
    .sort();
}

function buildFrequencyText({ frecuenciaTipo, frecuenciaValor, frecuenciaHoras }) {
  if (frecuenciaTipo === "intervalo_horas") {
    return `Cada ${frecuenciaValor} horas`;
  }
  if (frecuenciaTipo === "veces_dia") {
    return `${frecuenciaValor} veces al día`;
  }
  if (frecuenciaTipo === "horarios_fijos") {
    return `Horarios fijos: ${frecuenciaHoras.join(", ")}`;
  }
  return "Según indicación / PRN";
}

function buildDurationText({ duracionValor, duracionUnidad }) {
  if (duracionUnidad === "semanas") {
    return `${duracionValor} semana${duracionValor === 1 ? "" : "s"}`;
  }
  return `${duracionValor} día${duracionValor === 1 ? "" : "s"}`;
}

export default function SelectorMedicamentosReceta({ receta, setReceta }) {
  const recetaArray = Array.isArray(receta) ? receta : [];
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [medicamentoSel, setMedicamentoSel] = useState(null);
  const [modoManual, setModoManual] = useState(false);
  const [manualNombre, setManualNombre] = useState("");
  const [detalle, setDetalle] = useState(emptyDetalle);

  useEffect(() => {
    if (busqueda.length < 2) {
      setResultados([]);
      return;
    }

    setLoading(true);
    authFetch(`api_medicamentos.php?busqueda=${encodeURIComponent(busqueda)}`)
      .then((res) => res.json())
      .then((data) => setResultados(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [busqueda]);

  const resetFormulario = () => {
    setMedicamentoSel(null);
    setModoManual(false);
    setManualNombre("");
    setDetalle(emptyDetalle);
    setBusqueda("");
    setResultados([]);
  };

  const agregarMedicamento = () => {
    const nombreManual = manualNombre.trim();
    if (!medicamentoSel && !modoManual) return;
    if (modoManual && !nombreManual) return;

    const duracionValor = parsePositiveInteger(detalle.duracionValor);
    if (!duracionValor) return;

    let frecuenciaValor = null;
    let frecuenciaHoras = [];

    if (detalle.frecuenciaTipo === "intervalo_horas" || detalle.frecuenciaTipo === "veces_dia") {
      const value = parsePositiveInteger(detalle.frecuenciaValor);
      if (!value) return;
      frecuenciaValor = value;
    }

    if (detalle.frecuenciaTipo === "horarios_fijos") {
      frecuenciaHoras = parseFixedTimes(detalle.frecuenciaHoras);
      if (frecuenciaHoras.length === 0) return;
    }

    const frecuencia = buildFrequencyText({
      frecuenciaTipo: detalle.frecuenciaTipo,
      frecuenciaValor,
      frecuenciaHoras,
    });

    const duracion = buildDurationText({
      duracionValor,
      duracionUnidad: detalle.duracionUnidad,
    });

    const cantidad_total = calcularCantidadTotalReceta({
      frecuencia_tipo: detalle.frecuenciaTipo,
      frecuencia_valor: frecuenciaValor,
      frecuencia_horas: frecuenciaHoras,
      duracion_valor: duracionValor,
      duracion_unidad: detalle.duracionUnidad
    });

    const nuevo = {
      codigo: modoManual ? `MANUAL-${Date.now()}` : medicamentoSel.codigo,
      nombre: modoManual ? nombreManual : medicamentoSel.nombre,
      presentacion: !modoManual ? (medicamentoSel.presentacion || "") : "",
      concentracion: !modoManual ? (medicamentoSel.concentracion || "") : "",
      laboratorio: !modoManual ? (medicamentoSel.laboratorio || "") : "",
      dosis: detalle.dosis,
      frecuencia,
      frecuencia_tipo: detalle.frecuenciaTipo,
      frecuencia_valor: frecuenciaValor,
      frecuencia_horas: frecuenciaHoras,
      duracion,
      duracion_valor: duracionValor,
      duracion_unidad: detalle.duracionUnidad,
      cantidad_total: cantidad_total,
      observaciones: detalle.observaciones,
      manual: modoManual,
      origen: modoManual ? "manual" : "catalogo",
    };

    setReceta((prev) => [nuevo, ...prev]);
    resetFormulario();
  };

  const eliminarMedicamento = (idxEliminar) => {
    setReceta((prev) => prev.filter((_, idx) => idx !== idxEliminar));
  };

  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold mb-2 mt-4">Receta médica</h3>

      <div className="mb-2 flex flex-col sm:flex-row gap-2 items-stretch">
        <input
          type="text"
          className="border rounded p-1 flex-1"
          placeholder="Buscar medicamento por nombre o código"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setMedicamentoSel(null);
            setModoManual(false);
            setManualNombre("");
          }}
        />
        {loading && <span className="text-xs text-gray-500">Buscando...</span>}
      </div>

      {!medicamentoSel && !modoManual && (
        <div className="mb-2">
          <button
            type="button"
            className="text-xs sm:text-sm bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded"
            onClick={() => {
              setModoManual(true);
              setMedicamentoSel(null);
              setResultados([]);
            }}
          >
            No encuentro el medicamento, agregar manualmente
          </button>
        </div>
      )}

      {resultados.length > 0 && !medicamentoSel && (
        <div className="border rounded bg-white shadow max-h-60 overflow-y-auto mb-2">
          {resultados.map((m) => (
            (() => {
              const stock = Number(m?.stock || 0);
              const sinStock = stock <= 0;
              return (
                <div
                  key={m.id || m.codigo}
                  className={`px-3 py-2 text-sm flex flex-col gap-1 ${sinStock ? "bg-red-50 text-gray-500 cursor-not-allowed" : "hover:bg-blue-100 cursor-pointer"}`}
                  onClick={() => {
                    if (sinStock) return;
                    setMedicamentoSel(m);
                    setModoManual(false);
                    setManualNombre("");
                  }}
                  title={sinStock ? "Sin stock en farmacia" : "Seleccionar medicamento"}
                  aria-disabled={sinStock}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {m.nombre} <span className="text-gray-500 text-xs">({m.codigo})</span>
                    </span>
                    {sinStock && (
                      <span className="text-[11px] font-semibold text-red-700 bg-red-100 border border-red-200 rounded px-2 py-0.5">
                        Sin Stock
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-700 ml-2 space-y-0.5">
                    {m.presentacion && (
                      <div><strong>Presentación:</strong> {m.presentacion}</div>
                    )}
                    {m.concentracion && (
                      <div><strong>Concentración:</strong> {m.concentracion}</div>
                    )}
                    {m.laboratorio && (
                      <div><strong>Laboratorio:</strong> {m.laboratorio}</div>
                    )}
                    {m.stock !== undefined && (
                      <div className={sinStock ? "text-red-600" : "text-green-600"}><strong>Stock:</strong> {stock}</div>
                    )}
                  </div>
                </div>
              );
            })()
          ))}
        </div>
      )}

      {(medicamentoSel || modoManual) && (
        <div className="border rounded p-3 bg-blue-50 mb-2 space-y-3">
          <div className="text-xs text-gray-600">
            {modoManual ? (
              <>
                <span className="font-semibold">Medicamento manual</span>
                <input
                  type="text"
                  className="border rounded p-1 w-full mt-2 font-normal text-sm"
                  placeholder="Nombre del medicamento"
                  value={manualNombre}
                  onChange={(e) => setManualNombre(e.target.value)}
                />
              </>
            ) : (
              <div className="space-y-0.5">
                <div className="font-semibold text-gray-800">{medicamentoSel.nombre}</div>
                <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                  {medicamentoSel.codigo && <span>Código: {medicamentoSel.codigo}</span>}
                  {medicamentoSel.presentacion && <span>•</span>}
                  {medicamentoSel.presentacion && <span>Pres: {medicamentoSel.presentacion}</span>}
                  {medicamentoSel.concentracion && <span>•</span>}
                  {medicamentoSel.concentracion && <span>Conc: {medicamentoSel.concentracion}</span>}
                  {medicamentoSel.laboratorio && <span>•</span>}
                  {medicamentoSel.laboratorio && <span>Lab: {medicamentoSel.laboratorio}</span>}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Dosis</label>
              <input
                type="text"
                className="border rounded p-2 w-full text-sm"
                placeholder="Ej: 500 mg o 1 ampolla"
                value={detalle.dosis}
                onChange={(e) => setDetalle((prev) => ({ ...prev, dosis: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Tipo de frecuencia</label>
              <select
                className="border rounded p-2 w-full text-sm"
                value={detalle.frecuenciaTipo}
                onChange={(e) => setDetalle((prev) => ({ ...prev, frecuenciaTipo: e.target.value }))}
              >
                <option value="intervalo_horas">Cada X horas</option>
                <option value="veces_dia">X veces al día</option>
                <option value="horarios_fijos">Horarios fijos</option>
                <option value="prn">PRN / según indicación</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(detalle.frecuenciaTipo === "intervalo_horas" || detalle.frecuenciaTipo === "veces_dia") && (
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">
                  {detalle.frecuenciaTipo === "intervalo_horas" ? "Intervalo en horas" : "Veces por día"}
                </label>
                <input
                  type="number"
                  min="1"
                  className="border rounded p-2 w-full text-sm"
                  value={detalle.frecuenciaValor}
                  onChange={(e) => setDetalle((prev) => ({ ...prev, frecuenciaValor: e.target.value }))}
                />
              </div>
            )}

            {detalle.frecuenciaTipo === "horarios_fijos" && (
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Horas fijas</label>
                <input
                  type="text"
                  className="border rounded p-2 w-full text-sm"
                  placeholder="Ej: 08:00, 20:00"
                  value={detalle.frecuenciaHoras}
                  onChange={(e) => setDetalle((prev) => ({ ...prev, frecuenciaHoras: e.target.value }))}
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Duración</label>
              <div className="flex gap-2 items-end">
                <input
                  type="number"
                  min="1"
                  className="border rounded p-2 flex-1 text-sm"
                  value={detalle.duracionValor}
                  onChange={(e) => setDetalle((prev) => ({ ...prev, duracionValor: e.target.value }))}
                />
                <select
                  className="border rounded p-2 text-sm"
                  value={detalle.duracionUnidad}
                  onChange={(e) => setDetalle((prev) => ({ ...prev, duracionUnidad: e.target.value }))}
                >
                  <option value="dias">Días</option>
                  <option value="semanas">Semanas</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-gray-500">
            <span className="font-medium text-gray-600">Vista previa:</span>{" "}
            {buildFrequencyText({
              frecuenciaTipo: detalle.frecuenciaTipo,
              frecuenciaValor: parsePositiveInteger(detalle.frecuenciaValor),
              frecuenciaHoras: parseFixedTimes(detalle.frecuenciaHoras),
            })}
            {" · "}
            {buildDurationText({
              duracionValor: Math.max(1, parsePositiveInteger(detalle.duracionValor) || 1),
              duracionUnidad: detalle.duracionUnidad,
            })}
          </div>

          <textarea
            className="border rounded p-2 w-full text-sm"
            placeholder="Observaciones clínicas (opcional)"
            value={detalle.observaciones}
            onChange={(e) => setDetalle((prev) => ({ ...prev, observaciones: e.target.value }))}
            rows={2}
          />

          <div className="flex gap-2">
            <button
              type="button"
              className="bg-blue-600 text-white px-3 py-2 rounded text-sm font-medium"
              onClick={agregarMedicamento}
            >
              Agregar a receta
            </button>
            <button
              type="button"
              className="bg-gray-400 text-white px-3 py-2 rounded text-sm font-medium"
              onClick={resetFormulario}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="mt-2">
        <h4 className="text-xs text-gray-600 font-medium mb-2">Medicamentos seleccionados:</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border rounded min-w-max">
            <thead>
              <tr className="bg-blue-100">
                <th className="px-2 py-1 whitespace-nowrap text-xs text-gray-700 font-semibold">Medicamento</th>
                <th className="px-2 py-1 whitespace-nowrap text-xs text-gray-700 font-semibold">Presentación</th>
                <th className="px-2 py-1 whitespace-nowrap text-xs text-gray-700 font-semibold">Concentración</th>
                <th className="px-2 py-1 whitespace-nowrap text-xs text-gray-700 font-semibold">Laboratorio</th>
                <th className="px-2 py-1 whitespace-nowrap text-xs text-gray-700 font-semibold">Dosis</th>
                <th className="px-2 py-1 whitespace-nowrap text-xs text-gray-700 font-semibold">Frecuencia</th>
                <th className="px-2 py-1 whitespace-nowrap text-xs text-gray-700 font-semibold">Duración</th>
                <th className="px-2 py-1 whitespace-nowrap text-xs text-gray-700 font-semibold">Cantidad Total</th>
                <th className="px-2 py-1 whitespace-nowrap text-xs text-gray-700 font-semibold">Observaciones</th>
                <th className="px-2 py-1 whitespace-nowrap w-16 text-xs text-gray-700 font-semibold">Quitar</th>
              </tr>
            </thead>
            <tbody>
              {recetaArray.length > 0 ? (
                recetaArray.map((m, idx) => (
                  <tr key={`${m.codigo || "sin-codigo"}-${idx}`}>
                    <td className="border px-2 py-1 max-w-xs">
                      <div className="truncate" title={`${m.nombre} (${m.codigo || "SIN-CODIGO"})`}>
                        {m.nombre} {m.codigo && <span className="text-gray-500">({m.codigo})</span>}
                      </div>
                    </td>
                    <td className="border px-2 py-1 whitespace-nowrap text-xs">{m.presentacion || "-"}</td>
                    <td className="border px-2 py-1 whitespace-nowrap text-xs">{m.concentracion || "-"}</td>
                    <td className="border px-2 py-1 whitespace-nowrap text-xs">{m.laboratorio || "-"}</td>
                    <td className="border px-2 py-1 whitespace-nowrap">{m.dosis}</td>
                    <td className="border px-2 py-1 whitespace-nowrap">{m.frecuencia}</td>
                    <td className="border px-2 py-1 whitespace-nowrap">{m.duracion}</td>
                    <td className="border px-2 py-1 whitespace-nowrap text-center font-semibold text-green-700">
                      {(() => {
                        const cant = m.cantidad_total || calcularCantidadTotalReceta({
                          frecuencia_tipo: m.frecuencia_tipo,
                          frecuencia_valor: m.frecuencia_valor,
                          frecuencia_horas: m.frecuencia_horas || [],
                          duracion_valor: m.duracion_valor,
                          duracion_unidad: m.duracion_unidad
                        });
                        return cant ? `${cant} unid.` : "-";
                      })()}
                    </td>
                    <td className="border px-2 py-1 max-w-xs truncate" title={m.observaciones}>{m.observaciones}</td>
                    <td className="border px-2 py-1 text-center">
                      <button
                        type="button"
                        className="text-red-600 hover:text-red-800 bg-red-100 hover:bg-red-200 rounded px-2 py-1 text-xs font-medium transition-colors"
                        onClick={() => eliminarMedicamento(idx)}
                        title="Eliminar medicamento"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="border px-2 py-1 text-center text-gray-500 italic" colSpan={10}>
                    No hay medicamentos seleccionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}