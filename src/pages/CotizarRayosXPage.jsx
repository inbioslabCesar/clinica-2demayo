import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { useParams, useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";
import CobroModuloFinal from "../components/CobroModuloFinal";

export default function CotizarRayosXPage() {
  const [busqueda, setBusqueda] = useState("");
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [detallesCotizacion, setDetallesCotizacion] = useState([]);
  const [totalCotizacion, setTotalCotizacion] = useState(0);
  const MySwal = withReactContent(Swal);
  const { pacienteId } = useParams();
  const navigate = useNavigate();
  const [paciente, setPaciente] = useState(null);
  const [tarifas, setTarifas] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [cantidades, setCantidades] = useState({});
  const [mensaje, setMensaje] = useState("");

  // Filtrar tarifas por búsqueda
  const tarifasFiltradas = tarifas.filter(tarifa => {
    const texto = `${tarifa.descripcion || tarifa.nombre}`.toLowerCase();
    let medico = null;
    if (tarifa && tarifa.medico_id) {
      medico = medicos.find(m => m.id === tarifa.medico_id);
    }
    const doctor = medico ? `${medico.nombres || medico.nombre} ${medico.apellidos || medico.apellido}`.toLowerCase() : "sin doctor";
    return (
      texto.includes(busqueda.toLowerCase()) ||
      doctor.includes(busqueda.toLowerCase())
    );
  });

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
    // Obtener lista de médicos
    fetch(`${BASE_URL}api_medicos.php`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        setMedicos(data.medicos || []);
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

  const cotizar = async () => {
    if (seleccionados.length === 0) {
      setMensaje("Selecciona al menos un estudio de Rayos X.");
      return;
    }
    // Construir detalles para el Módulo de Cobros
    const detalles = seleccionados.map(tid => {
      const tarifa = tarifas.find(t => t.id === tid);
      const cantidad = cantidades[tid] || 1;
      // Buscar el médico por medico_id
      let medico = null;
      if (tarifa && tarifa.medico_id) {
        medico = medicos.find(m => m.id === tarifa.medico_id);
      }
      return tarifa ? {
        servicio_tipo: "rayosx",
        servicio_id: tid,
        descripcion: tarifa.descripcion || tarifa.nombre,
        cantidad,
        precio_unitario: tarifa.precio_particular,
        subtotal: tarifa.precio_particular * cantidad,
        medico_nombre: medico ? `${medico.nombres || medico.nombre} ${medico.apellidos || medico.apellido}` : "Sin doctor"
      } : null;
    }).filter(Boolean);
    setDetallesCotizacion(detalles);
    setTotalCotizacion(calcularTotal());
    setMostrarCobro(true);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl shadow-2xl mt-8 border border-blue-100">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="mb-4 max-h-[500px] overflow-y-auto">
          <div className="font-bold mb-2 flex flex-col gap-2">
            <span>Estudios disponibles:</span>
            <input
              type="text"
              placeholder="Buscar estudio, descripción o doctor..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="border px-3 py-2 rounded-lg w-full max-w-md"
            />
          </div>
          {tarifas.length === 0 ? (
            <div className="text-gray-500">No hay estudios de Rayos X registrados.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tarifasFiltradas.map(tarifa => {
                let medico = null;
                if (tarifa && tarifa.medico_id) {
                  medico = medicos.find(m => m.id === tarifa.medico_id);
                }
                return (
                  <li key={tarifa.id} className="flex items-center gap-4 py-3 px-2 hover:bg-blue-50 rounded-lg transition-all">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800">{tarifa.descripcion || tarifa.nombre}</div>
                      <div className="text-xs text-gray-500">Precio: S/ {tarifa.precio_particular}</div>
                      <div className="text-xs text-blue-700 mt-1">Doctor: {medico ? `${medico.nombres || medico.nombre} ${medico.apellidos || medico.apellido}` : "Sin doctor"}</div>
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
                );
              })}
            </ul>
          )}
        </div>
        {/* Columna derecha: resumen de cotización y módulo de cobros */}
        <div className="w-full md:w-96 md:sticky md:top-8 h-fit">
          {seleccionados.length > 0 && !mostrarCobro && (
            <div className="mb-6">
              <h4 className="font-semibold text-blue-700 mb-4 flex items-center gap-2">
                <span>📝</span>Resumen de Cotización
              </h4>
              <ul className="divide-y divide-gray-100 mb-2 bg-gray-50 rounded-lg shadow p-4 max-h-80 overflow-y-auto">
                {seleccionados.map(tid => {
                  const tarifa = tarifas.find(t => t.id === tid);
                  const cantidad = cantidades[tid] || 1;
                  return tarifa ? (
                    <li key={tid} className="py-2 flex flex-col md:flex-row justify-between items-center gap-2">
                      <span className="w-full md:w-1/2">{tarifa.descripcion || tarifa.nombre}</span>
                      <span className="w-full md:w-1/4">{cantidad} estudio(s)</span>
                      <span className="font-bold text-green-700 w-full md:w-1/4">S/ {(tarifa.precio_particular * cantidad).toFixed(2)}</span>
                    </li>
                  ) : null;
                })}
              </ul>
              <div className="mt-4 text-lg font-bold text-right">
                Total: <span className="text-green-600">S/ {calcularTotal().toFixed(2)}</span>
              </div>
              <div className="flex gap-3 mt-4 justify-end">
                <button onClick={() => { setSeleccionados([]); setMensaje(""); }} className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200">Limpiar selección</button>
                <button onClick={cotizar} className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700">Registrar Cotización</button>
              </div>
            </div>
          )}
          {mostrarCobro && (
            <CobroModuloFinal
              paciente={paciente}
              servicio={{ key: "rayosx", label: "Rayos X" }}
              detalles={detallesCotizacion}
              total={totalCotizacion}
              onCobroCompleto={() => {
                setMostrarCobro(false);
                setSeleccionados([]);
                setCantidades({});
                setMensaje("Cobro procesado correctamente.");
              }}
              onCancelar={() => setMostrarCobro(false)}
            />
          )}
        </div>
      </div>
      {mensaje && (
        <div className="mt-4 text-center font-semibold text-green-600">
          {mensaje}
        </div>
      )}
    </div>
  );
}
