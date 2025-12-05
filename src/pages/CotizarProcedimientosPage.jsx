import React, { useEffect, useState } from "react";
import { CobroModuloFinal } from "../components/cobro";
import { useParams, useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";

export default function CotizarProcedimientosPage() {
   
  const { pacienteId } = useParams();
  const navigate = useNavigate();
  const [procedimientos, setProcedimientos] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [cantidades, setCantidades] = useState({});
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [detallesCotizacion, setDetallesCotizacion] = useState([]);
  const [totalCotizacion, setTotalCotizacion] = useState(0);
  const [mensaje, setMensaje] = useState("");
  const [paciente, setPaciente] = useState(null);

   const [busqueda, setBusqueda] = useState("");
    // Filtrar procedimientos por búsqueda
    const procedimientosFiltrados = procedimientos.filter(proc => {
      const texto = `${proc.descripcion || proc.nombre}`.toLowerCase();
      return texto.includes(busqueda.toLowerCase());
    });

  useEffect(() => {
    fetch(`${BASE_URL}api_tarifas.php`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        // Filtrar procedimientos activos (aceptar singular y plural)
        const procedimientosList = (data.tarifas || []).filter(t => (t.servicio_tipo === "procedimiento" || t.servicio_tipo === "procedimientos") && t.activo === 1);
        setProcedimientos(procedimientosList);
      });
    // Obtener datos completos del paciente
    fetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.paciente) setPaciente(data.paciente);
      });
    // Limpiar selección y mensaje al entrar
    setSeleccionados([]);
    setCantidades({});
    setMostrarCobro(false);
    setMensaje("");
  }, [pacienteId]);

  const agregarSeleccion = (id) => {
    setSeleccionados(sel => sel.includes(id) ? sel : [...sel, id]);
    setCantidades(cant => ({ ...cant, [id]: 1 }));
  };
  const quitarSeleccion = (id) => {
    setSeleccionados(sel => sel.filter(pid => pid !== id));
    setCantidades(cant => {
      const nuevo = { ...cant };
      delete nuevo[id];
      return nuevo;
    });
  };
  const actualizarCantidad = (id, cantidad) => {
    setCantidades(cant => ({ ...cant, [id]: cantidad }));
  };
  const calcularTotal = () => {
    return seleccionados.reduce((total, pid) => {
      const proc = procedimientos.find(p => p.id === pid);
      const cantidad = cantidades[pid] || 1;
      return proc ? total + proc.precio_particular * cantidad : total;
    }, 0);
  };

  const cotizar = () => {
    if (seleccionados.length === 0) {
      setMensaje("Selecciona al menos un procedimiento.");
      return;
    }
    const detalles = seleccionados.map(pid => {
      const proc = procedimientos.find(p => p.id === pid);
      const cantidad = cantidades[pid] || 1;
      let descripcion = proc && proc.descripcion ? proc.descripcion : (proc && proc.nombre ? proc.nombre : "");
      // Si la descripción es 0, usar el nombre
      if (descripcion === 0 || descripcion === "0" || descripcion === null || descripcion === undefined) {
        descripcion = proc && proc.nombre ? proc.nombre : "";
      }
      return proc ? {
        servicio_tipo: "procedimiento",
        servicio_id: pid,
        descripcion,
        cantidad,
        precio_unitario: proc.precio_particular,
        subtotal: proc.precio_particular * cantidad
      } : null;
    }).filter(Boolean);
    setDetallesCotizacion(detalles);
    setTotalCotizacion(calcularTotal());
    setMostrarCobro(true);
  };

  return (
    <div className="max-w-7xl mx-auto p-10 bg-white rounded-xl shadow-lg mt-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🛠️</span>
          <h2 className="text-2xl font-bold text-blue-800">Cotización de Procedimientos</h2>
        </div>
        <button onClick={() => navigate('/seleccionar-servicio', { state: { pacienteId } })} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">Volver</button>
      </div>
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-gray-600"><b>ID Paciente:</b> {pacienteId}</div>
      </div>
      <div className="flex flex-col md:flex-row gap-8">
        <div className="flex-1 md:max-w-xl mx-auto">
          <div className="mb-4">
            <h4 className="font-semibold mb-2">Selecciona los procedimientos:</h4>
            <input
              type="text"
              placeholder="Buscar procedimiento..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="border px-3 py-2 rounded-lg w-full max-w-md mb-2"
            />
            {procedimientosFiltrados.length === 0 ? (
              <div className="text-center text-gray-500">No hay procedimientos para mostrar.</div>
            ) : (
              <div className="bg-white rounded-lg shadow border border-gray-200">
                <ul className="divide-y divide-gray-100">
                  {procedimientosFiltrados.map(proc => (
                    <li key={proc.id} className="flex items-center px-4 py-3 hover:bg-blue-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={seleccionados.includes(proc.id)}
                        onChange={() => seleccionados.includes(proc.id) ? quitarSeleccion(proc.id) : agregarSeleccion(proc.id)}
                        className="mr-3 accent-orange-600 w-5 h-5"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-800">{proc.descripcion || proc.nombre}</div>
                      </div>
                      <div className="font-bold text-green-700 text-lg">S/ {proc.precio_particular}</div>
                      {seleccionados.includes(proc.id) && (
                        <input
                          type="number"
                          min={1}
                          value={cantidades[proc.id] || 1}
                          onChange={e => actualizarCantidad(proc.id, Math.max(1, Number(e.target.value)))}
                          className="border rounded-lg px-2 w-16 bg-white ml-2"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        {/* Cotización en tiempo real en columna derecha */}
        <div className="w-full md:max-w-xl md:sticky md:top-8 h-fit">
          {seleccionados.length > 0 && !mostrarCobro && (
            <div className="mb-6">
              <h4 className="font-semibold text-gray-700 mb-2">Lista de Cotización</h4>
              <ul className="divide-y divide-gray-200 bg-gray-50 rounded-lg shadow p-4 max-h-80 overflow-y-auto">
                {seleccionados.map(pid => {
                  const proc = procedimientos.find(p => p.id === pid);
                  const cantidad = cantidades[pid] || 1;
                  return proc ? (
                    <li key={pid} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="font-medium text-gray-900">{proc.descripcion || proc.nombre}</span>
                      </div>
                      <div className="font-bold text-green-700 text-right">S/ {(proc.precio_particular * cantidad).toFixed(2)}</div>
                    </li>
                  ) : null;
                })}
              </ul>
              <div className="mt-4 text-lg font-bold text-right">
                Total: <span className="text-green-600">S/ {calcularTotal().toFixed(2)}</span>
              </div>
              <div className="flex gap-3 mt-4 justify-end">
                <button onClick={() => { setSeleccionados([]); setMensaje(""); }} className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200">Limpiar selección</button>
                <button onClick={cotizar} className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700">Cotizar</button>
              </div>
            </div>
          )}
          {mostrarCobro && (
            <CobroModuloFinal
              paciente={paciente}
              servicio={{ key: "procedimiento", label: "Procedimiento" }}
              detalles={detallesCotizacion}
              total={totalCotizacion}
              onCobroCompleto={() => {
                setMostrarCobro(false);
                setSeleccionados([]);
                setCantidades({});
                setMensaje("Cotización procesada correctamente.");
              }}
              onCancelar={() => setMostrarCobro(false)}
            />
          )}
        </div>
      </div>
      {mensaje && (
        <div className={`mt-6 text-center font-semibold ${mensaje.includes('correctamente') ? 'text-green-600' : 'text-red-600'}`}>{mensaje}</div>
      )}
    </div>
  );
}
