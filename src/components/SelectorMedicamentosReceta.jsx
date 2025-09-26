import { useState, useEffect } from "react";
import { BASE_URL } from "../config/config";

export default function SelectorMedicamentosReceta({ receta, setReceta }) {
  // Asegura que receta siempre sea array
  const recetaArray = Array.isArray(receta) ? receta : [];
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [medicamentoSel, setMedicamentoSel] = useState(null);
  const [detalle, setDetalle] = useState({
    dosis: "",
    frecuencia: "",
    duracion: "",
    observaciones: "",
  });

  useEffect(() => {
    if (busqueda.length < 2) {
      setResultados([]);
      return;
    }
    setLoading(true);
    fetch(
      `${BASE_URL}api_medicamentos.php?busqueda=${encodeURIComponent(
        busqueda
      )}`,
      { credentials: "include" }
    )
      .then((res) => res.json())
      .then((data) => setResultados(data))
      .finally(() => setLoading(false));
  }, [busqueda]);

  const agregarMedicamento = () => {
    if (!medicamentoSel) return;
    // Solo los campos clínicos relevantes
    const nuevo = {
      codigo: medicamentoSel.codigo,
      nombre: medicamentoSel.nombre,
      dosis: detalle.dosis,
      frecuencia: detalle.frecuencia,
      duracion: detalle.duracion,
      observaciones: detalle.observaciones,
    };
    setReceta((prev) => [nuevo, ...prev]);
    setMedicamentoSel(null);
    setDetalle({ dosis: "", frecuencia: "", duracion: "", observaciones: "" });
    setBusqueda("");
    setResultados([]);
  };

  const eliminarMedicamento = (codigo) => {
    setReceta((prev) => prev.filter((m) => m.codigo !== codigo));
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
          }}
        />
        {loading && <span className="text-xs text-gray-500">Buscando...</span>}
      </div>
      {resultados.length > 0 && !medicamentoSel && (
        <div className="border rounded bg-white shadow max-h-40 overflow-y-auto mb-2">
          {resultados.map((m) => (
            <div
              key={m.codigo}
              className="px-2 py-1 hover:bg-blue-100 cursor-pointer text-sm"
              onClick={() => setMedicamentoSel(m)}
            >
              {m.nombre} <span className="text-gray-500">({m.codigo})</span>
            </div>
          ))}
        </div>
      )}
      {medicamentoSel && (
        <div className="border rounded p-2 bg-blue-50 mb-2">
          <div className="font-semibold mb-1">
            {medicamentoSel.nombre}{" "}
            <span className="text-gray-500">({medicamentoSel.codigo})</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mb-1">
            <input
              type="text"
              className="border rounded p-1 flex-1"
              placeholder="Dosis (ej: 500mg)"
              value={detalle.dosis}
              onChange={(e) =>
                setDetalle((d) => ({ ...d, dosis: e.target.value }))
              }
            />
            <input
              type="text"
              className="border rounded p-1 flex-1"
              placeholder="Frecuencia (ej: cada 8h)"
              value={detalle.frecuencia}
              onChange={(e) =>
                setDetalle((d) => ({ ...d, frecuencia: e.target.value }))
              }
            />
            <input
              type="text"
              className="border rounded p-1 flex-1"
              placeholder="Duración (ej: 5 días)"
              value={detalle.duracion}
              onChange={(e) =>
                setDetalle((d) => ({ ...d, duracion: e.target.value }))
              }
            />
          </div>
          <textarea
            className="border rounded p-1 w-full mb-2"
            placeholder="Observaciones"
            value={detalle.observaciones}
            onChange={(e) =>
              setDetalle((d) => ({ ...d, observaciones: e.target.value }))
            }
            rows={2}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="bg-blue-600 text-white px-3 py-1 rounded"
              onClick={agregarMedicamento}
            >
              Agregar a receta
            </button>
            <button
              type="button"
              className="bg-gray-400 text-white px-3 py-1 rounded"
              onClick={() => setMedicamentoSel(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      <div className="mt-2">
        <h4 className="font-semibold mb-1">Medicamentos seleccionados:</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border rounded min-w-max">
            <thead>
              <tr className="bg-blue-100">
                <th className="px-2 py-1 whitespace-nowrap">Medicamento</th>
                <th className="px-2 py-1 whitespace-nowrap">Dosis</th>
                <th className="px-2 py-1 whitespace-nowrap">Frecuencia</th>
                <th className="px-2 py-1 whitespace-nowrap">Duración</th>
                <th className="px-2 py-1 whitespace-nowrap">Observaciones</th>
                <th className="px-2 py-1 whitespace-nowrap w-16">Quitar</th>
              </tr>
            </thead>
            <tbody>
              {recetaArray.length > 0 ? (
                recetaArray.map((m, idx) => (
                  <tr key={m.codigo + idx}>
                    <td className="border px-2 py-1 max-w-xs">
                      <div className="truncate" title={`${m.nombre} (${m.codigo})`}>
                        {m.nombre}{" "}
                        <span className="text-gray-500">({m.codigo})</span>
                      </div>
                    </td>
                    <td className="border px-2 py-1 whitespace-nowrap">{m.dosis}</td>
                    <td className="border px-2 py-1 whitespace-nowrap">{m.frecuencia}</td>
                    <td className="border px-2 py-1 whitespace-nowrap">{m.duracion}</td>
                    <td className="border px-2 py-1 max-w-xs truncate" title={m.observaciones}>{m.observaciones}</td>
                    <td className="border px-2 py-1 text-center">
                      <button
                        type="button"
                        className="text-red-600 hover:text-red-800 bg-red-100 hover:bg-red-200 rounded px-2 py-1 text-xs font-medium transition-colors"
                        onClick={() => eliminarMedicamento(m.codigo)}
                        title="Eliminar medicamento"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="border px-2 py-1 text-center text-gray-500 italic"
                    colSpan={6}
                  >
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
