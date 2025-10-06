import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";

export default function CotizarRayosXPage() {
  const { pacienteId } = useParams();
  const navigate = useNavigate();
  const [paciente, setPaciente] = useState(null);
  const [tarifas, setTarifas] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [cantidades, setCantidades] = useState({});
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    // Obtener datos del paciente
    fetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.paciente) setPaciente(data.paciente);
      });
    // Obtener tarifas de rayos x
    fetch(`${BASE_URL}api_tarifas.php`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        const rayosxTarifas = (data.tarifas || []).filter(t => t.servicio_tipo === "rayosx");
        setTarifas(rayosxTarifas);
      });
  }, [pacienteId]);

  const agregarSeleccion = (id) => {
    setSeleccionados(sel => sel.includes(id) ? sel : [...sel, id]);
    setCantidades(cant => ({ ...cant, [id]: 1 }));
  };
  const quitarSeleccion = (id) => {
    setSeleccionados(sel => sel.filter(mid => mid !== id));
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
    return seleccionados.reduce((total, tid) => {
      const tarifa = tarifas.find(t => t.id === tid);
      const cantidad = cantidades[tid] || 1;
      return tarifa ? total + tarifa.precio_particular * cantidad : total;
    }, 0);
  };

  const cotizar = () => {
    if (seleccionados.length === 0) {
      setMensaje("Selecciona al menos un estudio de Rayos X.");
      return;
    }
    // Aquí iría el registro de la cotización/venta (adaptar según backend)
    setMensaje("Cotización registrada. Total: S/ " + calcularTotal().toFixed(2));
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-2xl shadow-2xl mt-8 border border-blue-100">
      <button
        onClick={() => navigate('/seleccionar-servicio', { state: { pacienteId } })}
        className="mb-4 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 font-semibold"
      >← Volver</button>
      <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
        <span role="img" aria-label="rayosx">🩻</span> Cotizador de Rayos X
      </h2>
      {paciente && (
        <div className="mb-4 p-2 bg-blue-50 rounded text-blue-800 text-sm">
          <span className="font-bold">Paciente:</span> {paciente.nombres || paciente.nombre} {paciente.apellidos || paciente.apellido} (DNI: {paciente.dni})
        </div>
      )}
      <div className="mb-4">
        <div className="font-bold mb-2">Estudios disponibles:</div>
        {tarifas.length === 0 ? (
          <div className="text-gray-500">No hay estudios de Rayos X registrados.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {tarifas.map(tarifa => (
              <li key={tarifa.id} className="flex items-center gap-4 py-3 px-2 hover:bg-blue-50 rounded-lg transition-all">
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">{tarifa.descripcion || tarifa.nombre}</div>
                  <div className="text-xs text-gray-500">Precio: S/ {tarifa.precio_particular}</div>
                </div>
                {seleccionados.includes(tarifa.id) ? (
                  <>
                    <input
                      type="number"
                      min={1}
                      value={cantidades[tarifa.id] || 1}
                      onChange={e => actualizarCantidad(tarifa.id, Math.max(1, Number(e.target.value)))}
                      className="border rounded-lg px-2 w-16 bg-white"
                    />
                    <button
                      onClick={() => quitarSeleccion(tarifa.id)}
                      className="ml-2 w-10 h-10 flex items-center justify-center rounded-full bg-red-100 hover:bg-red-200 text-red-700 text-xl shadow transition"
                      aria-label="Quitar"
                    >✕</button>
                  </>
                ) : (
                  <button
                    onClick={() => agregarSeleccion(tarifa.id)}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-green-100 hover:bg-green-200 text-green-700 text-xl shadow transition"
                    aria-label="Agregar"
                  >+</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {seleccionados.length > 0 && (
        <div className="bg-blue-50 rounded-2xl p-6 border border-blue-200 shadow mb-4">
          <h4 className="font-semibold text-blue-700 mb-4 flex items-center gap-2">
            <span>📝</span>Resumen de Cotización
          </h4>
          <ul className="divide-y divide-gray-100 mb-2">
            {seleccionados.map(tid => {
              const tarifa = tarifas.find(t => t.id === tid);
              const cantidad = cantidades[tid] || 1;
              return tarifa ? (
                <li key={tid} className="py-2 flex justify-between items-center">
                  <span>{tarifa.descripcion || tarifa.nombre}</span>
                  <span>{cantidad} estudio(s)</span>
                  <span className="font-bold text-green-700">S/ {(tarifa.precio_particular * cantidad).toFixed(2)}</span>
                </li>
              ) : null;
            })}
          </ul>
          <div className="text-right text-xl font-bold text-blue-800 flex items-center gap-2">
            Total: <span>💲</span> S/ {calcularTotal().toFixed(2)}
          </div>
          <button
            onClick={cotizar}
            className="mt-6 bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 text-lg"
          >
            <span>🛒</span>Registrar Cotización
          </button>
        </div>
      )}
      {mensaje && (
        <div className="mt-4 text-center font-semibold text-green-600">
          {mensaje}
        </div>
      )}
    </div>
  );
}
