import { useState, useEffect } from "react";

export default function DiagnosticoCIE10Selector({ diagnosticos, setDiagnosticos }) {
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState([]);
  const [seleccion, setSeleccion] = useState(null);
  const [detalle, setDetalle] = useState({ tipo: "principal", observaciones: "" });
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (busqueda.length < 2) {
      setSugerencias([]);
      return;
    }

    setCargando(true);
    const buscarCodigos = async () => {
      try {
        const response = await fetch(`http://localhost/clinica-2demayo/api_cie10.php?buscar=${encodeURIComponent(busqueda)}&limite=15`);
        const data = await response.json();
        
        if (data.success) {
          setSugerencias(data.data);
        } else {
          console.error('Error en la búsqueda:', data.message);
          setSugerencias([]);
        }
      } catch (error) {
        console.error('Error al buscar códigos CIE10:', error);
        setSugerencias([]);
      } finally {
        setCargando(false);
      }
    };

    const timeoutId = setTimeout(buscarCodigos, 300); // Debounce de 300ms
    return () => clearTimeout(timeoutId);
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
        <div className="relative flex-1">
          <input
            type="text"
            className="border rounded p-2 w-full pr-10"
            placeholder="Buscar diagnóstico por nombre o código CIE10..."
            value={busqueda}
            onChange={e => {
              setBusqueda(e.target.value);
              setSeleccion(null);
            }}
          />
          {cargando && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            </div>
          )}
        </div>
      </div>
      {busqueda.length >= 2 && !cargando && sugerencias.length === 0 && (
        <div className="border rounded bg-yellow-50 p-3 mb-2 text-center">
          <div className="text-yellow-700">
            No se encontraron códigos CIE10 para "{busqueda}"
          </div>
          <div className="text-xs text-yellow-600 mt-1">
            Intenta con otros términos o códigos
          </div>
        </div>
      )}
      
      {sugerencias.length > 0 && !seleccion && (
        <div className="border rounded bg-white shadow-lg max-h-60 overflow-y-auto mb-2 z-10">
          {sugerencias.map(d => (
            <div
              key={d.id}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
              onClick={() => setSeleccion(d)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-semibold text-sm text-gray-900">{d.nombre}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    <span className="font-mono bg-gray-100 px-2 py-1 rounded mr-2">{d.codigo}</span>
                    {d.categoria && <span className="text-blue-600">{d.categoria}</span>}
                    {d.subcategoria && <span className="text-gray-500"> • {d.subcategoria}</span>}
                  </div>
                  {d.descripcion && (
                    <div className="text-xs text-gray-500 mt-1 line-clamp-2">{d.descripcion}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {seleccion && (
        <div className="border rounded p-3 bg-blue-50 mb-2">
          <div className="mb-2">
            <div className="font-semibold text-lg">{seleccion.nombre}</div>
            <div className="text-sm text-gray-600 mt-1">
              <span className="font-mono bg-blue-100 px-2 py-1 rounded mr-2">{seleccion.codigo}</span>
              {seleccion.categoria && <span className="text-blue-600">{seleccion.categoria}</span>}
              {seleccion.subcategoria && <span className="text-gray-500"> • {seleccion.subcategoria}</span>}
            </div>
            {seleccion.descripcion && (
              <div className="text-sm text-gray-700 mt-2 p-2 bg-white rounded border-l-4 border-blue-400">
                {seleccion.descripcion}
              </div>
            )}
          </div>
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
