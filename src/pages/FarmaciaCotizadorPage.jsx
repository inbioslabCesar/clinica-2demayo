import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaPlus, FaTimes } from "react-icons/fa";
import PacienteSearch from "../components/PacienteSearch";
import { BASE_URL } from "../config/config";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

export default function FarmaciaCotizadorPage() {
  const navigate = useNavigate();
  const params = useParams();
  // Estado para mostrar/ocultar el formulario manual
  const [mostrarManual, setMostrarManual] = useState(false);
  // Estado para mostrar/ocultar el formulario manual
  // Estado para saber si se intentó buscar paciente
  const [busquedaIntentada, setBusquedaIntentada] = useState(false);
  const MySwal = withReactContent(Swal);
  const [medicamentos, setMedicamentos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionados, setSeleccionados] = useState([]);
  const [cantidades, setCantidades] = useState({});
  const [tiposVenta, setTiposVenta] = useState({}); // { [id]: 'unidad' | 'caja' }
  const [unidadesPorCaja, setUnidadesPorCaja] = useState({}); // { [id]: unidades }
  // Si viene pacienteId en la URL, usarlo y no pedir datos manuales
  // Siempre usar el pacienteId de la URL si existe
  const pacienteId = params.pacienteId || null;
  const [pacienteDatos, setPacienteDatos] = useState(null); // {dni, nombre}
  const [manualDni, setManualDni] = useState("");
  const [manualNombres, setManualNombres] = useState("");
  const [manualApellidos, setManualApellidos] = useState("");
  const usuarioId = 1; // Cambia por el usuario actual
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    fetch(`${BASE_URL}api_medicamentos.php`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        setMedicamentos(data.medicamentos || data || []);
        // Inicializar unidades por caja si existe el campo
        const unidades = {};
        (data.medicamentos || data || []).forEach((m) => {
          unidades[m.id] = m.unidades_por_caja || 30; // default 30 si no existe
        });
        setUnidadesPorCaja(unidades);
      });
  }, []);

  useEffect(() => {
    // Si hay pacienteId en la URL, buscar datos del paciente SIEMPRE que cambie
    if (pacienteId) {
      fetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.paciente) {
            setPacienteDatos({
              dni: data.paciente.dni,
              nombre:
                (data.paciente.nombres || data.paciente.nombre || "") +
                " " +
                (data.paciente.apellidos || data.paciente.apellido || ""),
            });
          }
        });
    }
  }, [pacienteId]);

  // Calcular precio de venta
  const getPrecioVenta = (med) => {
    if (!med) return 0;
    const precio = Number(med.precio_compra || 0);
    const margen = Number(med.margen_ganancia || 0);
    return precio + (precio * margen) / 100;
  };

  const filtrarMedicamentos = medicamentos.filter(
    (m) =>
      m.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (m.codigo && m.codigo.toLowerCase().includes(busqueda.toLowerCase()))
  );

  const agregarSeleccion = (id) => {
    setSeleccionados((sel) => (sel.includes(id) ? sel : [...sel, id]));
    setCantidades((cant) => ({ ...cant, [id]: 1 }));
    setTiposVenta((tv) => ({ ...tv, [id]: "unidad" }));
  };

  const quitarSeleccion = (id) => {
    setSeleccionados((sel) => sel.filter((mid) => mid !== id));
    setCantidades((cant) => {
      const nuevo = { ...cant };
      delete nuevo[id];
      return nuevo;
    });
    setTiposVenta((tv) => {
      const nuevo = { ...tv };
      delete nuevo[id];
      return nuevo;
    });
  };

  const actualizarCantidad = (id, cantidad) => {
    setCantidades((cant) => ({ ...cant, [id]: cantidad }));
  };

  const actualizarTipoVenta = (id, tipo) => {
    setTiposVenta((tv) => ({ ...tv, [id]: tipo }));
    // Si cambia a caja, poner cantidad 1 por defecto
    if (tipo === "caja") setCantidades((cant) => ({ ...cant, [id]: 1 }));
  };

  const calcularTotal = () => {
    return seleccionados.reduce((total, mid) => {
      const med = medicamentos.find((m) => m.id === mid);
      const cantidad = cantidades[mid] || 1;
      const tipo = tiposVenta[mid] || "unidad";
      if (!med) return total;
      if (tipo === "caja") {
        return total + getPrecioVenta(med) * unidadesPorCaja[mid] * cantidad;
      } else {
        return total + getPrecioVenta(med) * cantidad;
      }
    }, 0);
  };

  const cotizar = () => {
    if (seleccionados.length === 0) {
      setMensaje("Selecciona al menos un medicamento para cotizar.");
      return;
    }
    // Validar paciente
    let pacientePayload = {};
    let nombrePaciente = "";
    if (pacienteId) {
      pacientePayload = { paciente_id: pacienteId };
      nombrePaciente = pacienteDatos ? pacienteDatos.nombre : "";
    } else if (manualDni && manualNombres && manualApellidos) {
      const nombreCompleto = `${manualNombres.trim()} ${manualApellidos.trim()}`;
      pacientePayload = {
        paciente_dni: manualDni,
        paciente_nombre: nombreCompleto,
      };
      nombrePaciente = nombreCompleto;
    } else {
      setMensaje("Debes ingresar el DNI, nombres y apellidos del paciente.");
      return;
    }
    // Construir detalles
    const detalles = seleccionados.map((mid) => {
      const med = medicamentos.find((m) => m.id === mid);
      const tipo = tiposVenta[mid] || "unidad";
      const cantidad = cantidades[mid] || 1;
      const precioVenta = getPrecioVenta(med);
      if (tipo === "caja") {
        return {
          medicamento_id: mid,
          descripcion: med?.nombre + " (Caja)" || "",
          cantidad: cantidad * unidadesPorCaja[mid],
          precio_unitario: precioVenta,
          subtotal: precioVenta * unidadesPorCaja[mid] * cantidad,
          tipo_venta: "caja",
          cajas: cantidad,
          unidades_por_caja: unidadesPorCaja[mid],
        };
      } else {
        return {
          medicamento_id: mid,
          descripcion: med?.nombre + " (Unidad)" || "",
          cantidad,
          precio_unitario: precioVenta,
          subtotal: precioVenta * cantidad,
          tipo_venta: "unidad",
          cajas: 0,
          unidades_por_caja: unidadesPorCaja[mid],
        };
      }
    });
    const payload = {
      ...pacientePayload,
      usuario_id: usuarioId,
      total: calcularTotal(),
      detalles,
      observaciones: "Cotización de medicamentos",
    };
    fetch(`${BASE_URL}api_cotizaciones_farmacia.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          MySwal.fire({
            title: "Venta registrada ✅",
            html: `<div style='font-family:monospace;text-align:left;max-width:320px;'>
              <h3 style='text-align:center;'>🏥 CLÍNICA 2 DE MAYO</h3>
              <hr>
              <p><strong>COMPROBANTE FARMACIA #${
                data.numero_comprobante
              }</strong></p>
              <p>Paciente: ${nombrePaciente}</p>
              <p>Fecha: ${new Date().toLocaleString("es-PE")}</p>
              <hr>
              <p><strong>DETALLE:</strong></p>
              ${detalles
                .map(
                  (d) =>
                    `<p>${d.descripcion} x${
                      d.cantidad
                    } .... S/ ${d.subtotal.toFixed(2)}</p>`
                )
                .join("")}
              <hr>
              <p><strong>TOTAL: S/ ${calcularTotal().toFixed(2)}</strong></p>
              <hr>
              <p style='text-align:center;font-size:12px;'>Gracias por su preferencia<br>Conserve este comprobante</p>
            </div>`,
            icon: "success",
            confirmButtonText: "Imprimir",
            showCancelButton: true,
            cancelButtonText: "Cerrar",
          }).then((result) => {
            if (result.isConfirmed) {
              const win = window.open("", "_blank");
              win.document
                .write(`<div style='font-family:monospace;text-align:left;max-width:320px;'>
                <h3 style='text-align:center;'>🏥 CLÍNICA 2 DE MAYO</h3>
                <hr>
                <p><strong>COMPROBANTE FARMACIA #${
                  data.numero_comprobante
                }</strong></p>
                <p>Paciente: ${nombrePaciente}</p>
                <p>Fecha: ${new Date().toLocaleString("es-PE")}</p>
                <hr>
                <p><strong>DETALLE:</strong></p>
                ${detalles
                  .map(
                    (d) =>
                      `<p>${d.descripcion} x${
                        d.cantidad
                      } .... S/ ${d.subtotal.toFixed(2)}</p>`
                  )
                  .join("")}
                <hr>
                <p><strong>TOTAL: S/ ${calcularTotal().toFixed(2)}</strong></p>
                <hr>
                <p style='text-align:center;font-size:12px;'>Gracias por su preferencia<br>Conserve este comprobante</p>
              </div>`);
              win.document.close();
              win.print();
            }
          });
          setSeleccionados([]);
          setCantidades({});
          setMensaje("");
        } else {
          setMensaje("Error al registrar la venta: " + (data.error || ""));
        }
      })
      .catch(() => setMensaje("Error de conexión al registrar la venta."));
  };

  return (
  <div className="max-w-6xl mx-auto p-6 bg-white rounded-2xl shadow-2xl mt-8 border border-blue-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-3xl font-bold text-blue-900 flex items-center gap-2">
          <span role="img" aria-label="medicamentos">💊</span>
          Cotizador de Medicamentos
        </h2>
        <button
          className="bg-blue-100 text-blue-800 px-4 py-2 rounded font-semibold border border-blue-300 hover:bg-blue-200 transition"
          onClick={() => {
            if (pacienteId) {
              navigate("/seleccionar-servicio", { state: { pacienteId } });
            } else {
              navigate("/seleccionar-servicio");
            }
          }}
        >
          ← Volver a Servicios
        </button>
      </div>
      {/* Buscador de paciente */}
      <div className="mb-4">
        {/* Solo mostrar el buscador de paciente si NO hay pacienteId en la URL (químico) */}
        {!params.pacienteId && (
          <PacienteSearch
            onPacienteEncontrado={(p) => {
              // pacienteId se toma de la URL, no se actualiza por estado
              setPacienteDatos({
                dni: p.dni,
                nombre: (
                  (p.nombres || p.nombre || "") +
                  " " +
                  (p.apellidos || p.apellido || "")
                ).trim(),
              });
              setManualDni("");
              setManualNombres("");
              setManualApellidos("");
              setBusquedaIntentada(true);
            }}
            onNoEncontrado={() => {
              // pacienteId se toma de la URL, no se actualiza por estado
              setPacienteDatos(null);
              setMostrarManual(true);
              setBusquedaIntentada(true);
            }}
            onNuevaBusqueda={() => {
              // pacienteId se toma de la URL, no se actualiza por estado
              setPacienteDatos(null);
              setMostrarManual(false);
              setBusquedaIntentada(false);
            }}
          />
        )}
        {/* Botón y formulario manual solo si NO hay pacienteId en la URL (químico) */}
        {!params.pacienteId && !pacienteId && !manualDni && !mostrarManual && busquedaIntentada && (
          <button
            className="mt-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 text-sm"
            onClick={() => setMostrarManual(true)}
          >
            Paciente no encontrado
          </button>
        )}
        {!params.pacienteId && mostrarManual && !pacienteId && (
          <div className="flex gap-2 items-center mt-2">
            <input
              type="text"
              value={manualDni}
              onChange={(e) => setManualDni(e.target.value)}
              placeholder="DNI"
              className="border px-2 py-1 rounded w-32"
            />
            <input
              type="text"
              value={manualNombres}
              onChange={(e) => setManualNombres(e.target.value)}
              placeholder="Nombres"
              className="border px-2 py-1 rounded w-40"
              required
            />
            <input
              type="text"
              value={manualApellidos}
              onChange={(e) => setManualApellidos(e.target.value)}
              placeholder="Apellidos"
              className="border px-2 py-1 rounded w-40"
              required
            />
          </div>
        )}
        {/* Mostrar paciente seleccionado */}
        {(pacienteId || manualDni) && (
          <div className="mt-2 p-2 bg-blue-50 rounded text-blue-800 text-sm">
            <span className="font-bold">Paciente:</span>{" "}
            {pacienteDatos
              ? `${pacienteDatos.nombre} (DNI: ${pacienteDatos.dni})`
              : `${manualNombres} ${manualApellidos} (DNI: ${manualDni})`}
          </div>
        )}
      </div>
      <div className="mb-4 flex gap-2 items-center">
        <span className="text-blue-700 text-xl">🔍</span>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar medicamento..."
          className="border px-3 py-2 rounded-lg w-full max-w-md focus:ring-2 focus:ring-blue-300"
        />
      </div>
      <div className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Columna izquierda: lista de medicamentos para cotizar */}
          <div className="col-span-1">
            {medicamentos.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No hay medicamentos registrados en el sistema.
              </div>
            ) : filtrarMedicamentos.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                Sin coincidencias para "{busqueda}".
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
              <ul className="divide-y divide-gray-100">
                {filtrarMedicamentos.map((med) => {
                  const unidadesCaja = unidadesPorCaja[med.id] || 30;
                  const stockUnidades = med.stock;
                  const stockCajas = Math.floor(stockUnidades / unidadesCaja);
                  return (
                    <li
                      key={med.id}
                      className="flex items-center gap-4 py-3 px-2 hover:bg-blue-50 rounded-lg transition-all"
                    >
                      <div className="flex-1">
                        <div className="font-semibold text-gray-800 flex items-center gap-2">
                          <span className="text-blue-600">🧪</span>
                          {med.nombre}
                        </div>
                        <div className="text-xs text-gray-500 flex gap-2 items-center">
                          <span>📦 {stockCajas} cajas</span>
                          <span>💊 {stockUnidades} unidades</span>
                          <span>
                            💲 S/ {getPrecioVenta(med).toFixed(2)} / unidad
                          </span>
                        </div>
                      </div>
                      {seleccionados.includes(med.id) ? (
                        <>
                          <select
                            value={tiposVenta[med.id] || "unidad"}
                            onChange={(e) =>
                              actualizarTipoVenta(med.id, e.target.value)
                            }
                            className="border rounded-lg px-2 py-1 mr-2 bg-white"
                          >
                            <option value="unidad">Unidad</option>
                            <option value="caja">Caja</option>
                          </select>
                          {tiposVenta[med.id] === "caja" ? (
                            <input
                              type="number"
                              min={1}
                              max={stockCajas}
                              value={cantidades[med.id] || 1}
                              onChange={(e) =>
                                actualizarCantidad(
                                  med.id,
                                  Math.max(
                                    1,
                                    Math.min(stockCajas, Number(e.target.value))
                                  )
                                )
                              }
                              className="border rounded-lg px-2 w-16 bg-white"
                            />
                          ) : (
                            <input
                              type="number"
                              min={1}
                              max={stockUnidades}
                              value={cantidades[med.id] || 1}
                              onChange={(e) =>
                                actualizarCantidad(
                                  med.id,
                                  Math.max(
                                    1,
                                    Math.min(
                                      stockUnidades,
                                      Number(e.target.value)
                                    )
                                  )
                                )
                              }
                              className="border rounded-lg px-2 w-16 bg-white"
                            />
                          )}
                          <button
                            onClick={() => quitarSeleccion(med.id)}
                            className="ml-2 w-10 h-10 flex items-center justify-center rounded-full bg-red-100 hover:bg-red-200 text-red-700 text-xl shadow transition"
                            aria-label="Quitar"
                          >
                            <FaTimes />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => agregarSeleccion(med.id)}
                          className="w-10 h-10 flex items-center justify-center rounded-full bg-green-100 hover:bg-green-200 text-green-700 text-xl shadow transition"
                          aria-label="Agregar"                        >
                          <FaPlus />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              </div>
            )}
          </div>
          {/* Columna derecha: resumen de cotización */}
          <div className="col-span-1 md:sticky md:top-24 md:ml-8">
            {seleccionados.length > 0 && (
              <div className="bg-blue-50 rounded-2xl p-6 border border-blue-200 shadow">
                <h4 className="font-semibold text-blue-700 mb-4 flex items-center gap-2">
                  <span>📝</span>Resumen de Cotización
                </h4>
                <div className="max-h-64 overflow-y-auto pr-2">
                  <ul className="divide-y divide-gray-100 mb-2">
                    {seleccionados.map((mid) => {
                      const med = medicamentos.find((m) => m.id === mid);
                      const tipo = tiposVenta[mid] || "unidad";
                      const cantidad = cantidades[mid] || 1;
                      const unidadesCaja = unidadesPorCaja[mid] || 30;
                      const precioVenta = getPrecioVenta(med);
                      if (tipo === "caja") {
                        return (
                          <li
                            key={mid}
                            className="py-2 flex justify-between items-center"
                          >
                            <span className="flex items-center gap-1">
                              <span>📦</span>
                              {med?.nombre} (Caja)
                            </span>
                            <span>
                              {cantidad} caja(s) x {unidadesCaja} unidades
                            </span>
                            <span className="font-bold text-green-700">
                              S/{" "}
                              {(precioVenta * unidadesCaja * cantidad).toFixed(
                                2
                              )}
                            </span>
                          </li>
                        );
                      } else {
                        return (
                          <li
                            key={mid}
                            className="py-2 flex justify-between items-center"
                          >
                            <span className="flex items-center gap-1">
                              <span>💊</span>
                              {med?.nombre} (Unidad)
                            </span>
                            <span>{cantidad} unidad(es)</span>
                            <span className="font-bold text-green-700">
                              S/ {(precioVenta * cantidad).toFixed(2)}
                            </span>
                          </li>
                        );
                      }
                    })}
                  </ul>
                </div>
                <div className="text-right text-xl font-bold text-blue-800 flex items-center gap-2">
                  Total: <span>💲</span> S/ {calcularTotal().toFixed(2)}
                </div>
                <button
                  onClick={cotizar}
                  className="mt-6 bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 text-lg"
                >
                  <span>🛒</span>Registrar Venta
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {mensaje && (
        <div
          className={`mt-4 text-center font-semibold ${
            mensaje.includes("registrada") ? "text-green-600" : "text-red-600"
          }`}
        >
          {mensaje}
        </div>
      )}
    </div>
  );
}
