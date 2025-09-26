import { useState, useEffect } from "react";

// Simulación: podrías reemplazar esto por un fetch a tu API de CIE10
const CIE10_LIST = [
  { codigo: "J18.9", nombre: "Neumonía, no especificada" },
  { codigo: "E11.9", nombre: "Diabetes mellitus tipo 2, no especificada" },
  { codigo: "I10", nombre: "Hipertensión esencial (primaria)" },
  { codigo: "A09", nombre: "Diarrea y gastroenteritis de presunto origen infeccioso" },
  // ...
];

export default function DiagnosticoCIE10Selector({ diagnosticos, setDiagnosticos }) {
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState([]);
  const [seleccion, setSeleccion] = useState(null);
  const [detalle, setDetalle] = useState({ tipo: "principal", observaciones: "" });

  useEffect(() => {
    if (busqueda.length < 2) {
      setSugerencias([]);
      return;
    }
    // Simular búsqueda local, reemplaza por fetch si tienes API
    const lower = busqueda.toLowerCase();
    setSugerencias(
      CIE10_LIST.filter(
        d => d.codigo.toLowerCase().includes(lower) || d.nombre.toLowerCase().includes(lower)
      ).slice(0, 10)
    );
  }, [busqueda]);

  const agregarDiagnostico = () => {
    if (!seleccion) return;
    setDiagnosticos(prev => [
      ...prev,
      {
        ...seleccion,
        ...detalle,
        fecha: new Date().toISOString().slice(0, 10)
      }
    ]);
    setSeleccion(null);
    setDetalle({ tipo: "secundario", observaciones: "" });
    setBusqueda("");
    setSugerencias([]);
  };

  const eliminarDiagnostico = (codigo) => {
    setDiagnosticos(prev => prev.filter(d => d.codigo !== codigo));
  };

  const cambiarTipo = (codigo, tipo) => {
    setDiagnosticos(prev => prev.map(d => d.codigo === codigo ? { ...d, tipo } : d));
  };

  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold mb-2 mt-4">Diagnóstico (CIE10)</h3>
      <div className="mb-2 flex flex-col sm:flex-row gap-2 items-stretch">
        <input
          type="text"
          className="border rounded p-1 flex-1"
          placeholder="Buscar diagnóstico por nombre o código"
          value={busqueda}
          onChange={e => {
            setBusqueda(e.target.value);
            setSeleccion(null);
          }}
        />
      </div>
      {sugerencias.length > 0 && !seleccion && (
        <div className="border rounded bg-white shadow max-h-40 overflow-y-auto mb-2">
          {sugerencias.map(d => (
            <div
              key={d.codigo}
              className="px-2 py-1 hover:bg-blue-100 cursor-pointer text-sm"
              onClick={() => setSeleccion(d)}
            >
              {d.nombre} <span className="text-gray-500">({d.codigo})</span>
            </div>
          ))}
        </div>
      )}
      {seleccion && (
        <div className="border rounded p-2 bg-blue-50 mb-2">
          <div className="font-semibold mb-1">{seleccion.nombre} <span className="text-gray-500">({seleccion.codigo})</span></div>
          <div className="flex flex-col sm:flex-row gap-2 mb-1">
            <select
              className="border rounded p-1"
              value={detalle.tipo}
              onChange={e => setDetalle(d => ({ ...d, tipo: e.target.value }))}
            >
              <option value="principal">Principal</option>
              <option value="secundario">Secundario</option>
            </select>
            <input
              type="text"
              className="border rounded p-1 flex-1"
              placeholder="Observaciones"
              value={detalle.observaciones}
              onChange={e => setDetalle(d => ({ ...d, observaciones: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button type="button" className="bg-blue-600 text-white px-3 py-1 rounded" onClick={agregarDiagnostico}>
              Agregar diagnóstico
            </button>
            <button type="button" className="bg-gray-400 text-white px-3 py-1 rounded" onClick={() => setSeleccion(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {diagnosticos.length > 0 && (
        <div className="mt-2">
          <h4 className="font-semibold mb-1">Diagnósticos agregados:</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border rounded min-w-max">
              <thead>
                <tr className="bg-blue-100">
                  <th className="px-2 py-1 whitespace-nowrap">Código</th>
                  <th className="px-2 py-1 whitespace-nowrap">Nombre</th>
                  <th className="px-2 py-1 whitespace-nowrap">Tipo</th>
                  <th className="px-2 py-1 whitespace-nowrap">Observaciones</th>
                  <th className="px-2 py-1 whitespace-nowrap">Fecha</th>
                  <th className="px-2 py-1 whitespace-nowrap w-16">Quitar</th>
                </tr>
              </thead>
              <tbody>
                {diagnosticos.map((d, idx) => (
                  <tr key={d.codigo + idx}>
                    <td className="border px-2 py-1 font-mono text-xs whitespace-nowrap">{d.codigo}</td>
                    <td className="border px-2 py-1 max-w-xs truncate" title={d.nombre}>{d.nombre}</td>
                    <td className="border px-2 py-1">
                      <select
                        className="border rounded p-1 text-xs w-full min-w-0"
                        value={d.tipo}
                        onChange={e => cambiarTipo(d.codigo, e.target.value)}
                      >
                        <option value="principal">Principal</option>
                        <option value="secundario">Secundario</option>
                      </select>
                    </td>
                    <td className="border px-2 py-1 max-w-xs truncate" title={d.observaciones}>{d.observaciones}</td>
                    <td className="border px-2 py-1 whitespace-nowrap">{d.fecha}</td>
                    <td className="border px-2 py-1 text-center">
                      <button 
                        type="button" 
                        className="text-red-600 hover:text-red-800 bg-red-100 hover:bg-red-200 rounded px-2 py-1 text-xs font-medium transition-colors"
                        onClick={() => eliminarDiagnostico(d.codigo)}
                        title="Eliminar diagnóstico"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
