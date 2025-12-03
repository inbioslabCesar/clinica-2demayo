import React, { useEffect, useState } from "react";
import { CobroModuloFinal } from "../components/cobro";
import { useParams, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { BASE_URL } from "../config/config";

export default function CotizarOperacionPage() {
    const [medicos, setMedicos] = useState([]);
  
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [detallesCotizacion, setDetallesCotizacion] = useState([]);
  const [totalCotizacion, setTotalCotizacion] = useState(0);
  const { pacienteId } = useParams();
  const navigate = useNavigate();
  const [paciente, setPaciente] = useState(null);
  const [tarifas, setTarifas] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [cantidades, setCantidades] = useState({});
  const [mensaje, setMensaje] = useState("");

    const [busqueda, setBusqueda] = useState("");
    // Filtrar tarifas por búsqueda (nombre/descripción y médico)
    const tarifasFiltradas = tarifas.filter(tarifa => {
      const texto = `${tarifa.descripcion || tarifa.nombre}`.toLowerCase();
      let medico = null;
      if (tarifa && tarifa.medico_id) {
        medico = medicos.find(m => m.id === tarifa.medico_id);
      }
      const doctor = medico ? `${medico.nombres || medico.nombre} ${medico.apellidos || medico.apellido}`.toLowerCase() : "sin doctor";
      const filtro = busqueda.toLowerCase();
      return texto.includes(filtro) || doctor.includes(filtro);
    });

  useEffect(() => {
    fetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.paciente) setPaciente(data.paciente);
      });
    fetch(`${BASE_URL}api_tarifas.php`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        const operTarifas = (data.tarifas || []).filter(t => t.servicio_tipo === "operacion");
        setTarifas(operTarifas);
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
      setMensaje("Selecciona al menos una operación/cirugía.");
      return;
    }
    // Construir detalles para el Módulo de Cobros, incluyendo medico_id y especialidad
    const detalles = seleccionados.map(tid => {
      const tarifa = tarifas.find(t => t.id === tid);
      const cantidad = cantidades[tid] || 1;
      let nombreOperacion = (tarifa && tarifa.descripcion && tarifa.descripcion !== "0") ? tarifa.descripcion : (tarifa && tarifa.nombre && tarifa.nombre !== "0" ? tarifa.nombre : "Operación sin nombre");
      let descripcion = nombreOperacion;
      // Buscar el nombre del médico
      let medico_nombre = "";
      if (tarifa && tarifa.medico_id) {
        const medico = medicos.find(m => m.id === tarifa.medico_id);
        if (medico) {
          medico_nombre = `${medico.nombres || medico.nombre} ${medico.apellidos || medico.apellido}`;
        }
      }
      return tarifa ? {
        servicio_tipo: "operacion",
        servicio_id: tid,
        descripcion,
        cantidad,
        precio_unitario: tarifa.precio_particular,
        subtotal: tarifa.precio_particular * cantidad,
        medico_id: tarifa.medico_id || "",
        medico_nombre,
        especialidad: tarifa.especialidad || ""
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
        <span role="img" aria-label="operacion">🩼</span> Cotizador de Operaciones/Cirugías Mayores
      </h2>
      {paciente && (
        <div className="mb-4 p-2 bg-blue-50 rounded text-blue-800 text-sm">
          <span className="font-bold">Paciente:</span> {paciente.nombres || paciente.nombre} {paciente.apellidos || paciente.apellido} (DNI: {paciente.dni})
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="mb-4 max-h-[500px] overflow-y-auto">
          <div className="font-bold mb-2 flex flex-col gap-2">
            <span>Operaciones/Cirugías disponibles:</span>
            <input
              type="text"
              placeholder="Buscar operación/cirugía..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="border px-3 py-2 rounded-lg w-full max-w-md"
            />
          </div>
          {tarifasFiltradas.length === 0 ? (
            <div className="text-gray-500">No hay operaciones/cirugías registradas.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tarifasFiltradas.map(tarifa => (
                <li key={tarifa.id} className="flex items-center gap-4 py-3 px-2 hover:bg-blue-50 rounded-lg transition-all">
                  <div className="flex-1">
                    <div className="font-semibold text-gray-800">{tarifa.descripcion || tarifa.nombre}</div>
                    <div className="text-xs text-gray-500">Precio: S/ {tarifa.precio_particular}</div>
                    <div className="text-xs text-blue-700 mt-1">
                      Doctor: {(() => {
                        if (tarifa.medico_id) {
                          const medico = medicos.find(m => m.id === tarifa.medico_id);
                          if (medico) {
                            return `${medico.nombres || medico.nombre} ${medico.apellidos || medico.apellido}`;
                          }
                        }
                        return "Sin doctor";
                      })()}
                    </div>
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
          !mostrarCobro && (
            <div className="bg-blue-50 rounded-2xl p-6 border border-blue-200 shadow mb-4 max-h-[500px] overflow-y-auto">
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
          )
        )}

      {mostrarCobro && paciente && (
        <CobroModuloFinal
          paciente={paciente}
          servicio={{ key: "operacion", label: "Operaciones/Cirugías Mayores" }}
          detalles={detallesCotizacion}
          total={totalCotizacion}
          onCobroCompleto={() => {
            setMostrarCobro(false);
            setMensaje("Cotización procesada correctamente.");
          }}
          onCancelar={() => setMostrarCobro(false)}
        />
      )}
      </div>
      {mensaje && (
        <div className="mt-4 text-center font-semibold text-green-600">
          {mensaje}
        </div>
      )}
    </div>
  );
}
