
import React, { useEffect, useState } from "react";
import AperturaCajaForm from "./AperturaCajaForm";
import Modal from "./Modal";

export default function CajaAdminDashboard() {
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cajaAbierta, setCajaAbierta] = useState(false);
  const [usuario, setUsuario] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Función para cargar resumen (reutilizable)
  const fetchResumen = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api_resumen_diario.php", {
        credentials: "include",
      });
      const data = await resp.json();
      if (data.success) {
        setResumen(data);
        setError("");
        setCajaAbierta(data.caja_abierta === true || data.caja_abierta === 1);
      } else {
        setError(data.error || "Error al cargar resumen");
      }
    } catch (e) {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const usuarioSession = JSON.parse(sessionStorage.getItem("usuario") || "{}");
    setUsuario(usuarioSession);
    fetchResumen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  if (loading)
    return <div className="p-8 text-center">Cargando resumen...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!resumen) return null;


  return (
  <div className="max-w-7xl mx-auto p-8 bg-white rounded-xl shadow-lg">
      <div className="mb-8 flex justify-center gap-4">
        {!cajaAbierta && usuario && (
          <button
            className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700"
            onClick={() => setShowModal(true)}
          >
            Abrir Caja
          </button>
        )}
        {cajaAbierta && usuario && (
          <button
            className="bg-red-600 text-white px-6 py-2 rounded shadow hover:bg-red-700"
            onClick={() => window.location.href = "/contabilidad/cerrar-caja"}
          >
            Cerrar Caja
          </button>
        )}
        {/* Botón para ir a egresos */}
        <button
          className="bg-orange-500 text-white px-6 py-2 rounded shadow hover:bg-orange-600"
          onClick={() => window.location.href = "/contabilidad/egresos"}
        >
          Ir a Egresos
        </button>
      </div>
          <Modal open={showModal} onClose={() => setShowModal(false)}>
            <div className="p-4">
              <h3 className="text-lg font-bold text-blue-800 mb-4">Apertura de Caja</h3>
              <AperturaCajaForm
                usuario={usuario}
                onApertura={async () => {
                  setShowModal(false);
                  await fetchResumen();
                }}
              />
            </div>
          </Modal>

          {/* Resumen Diario de Caja */}
          <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-8 shadow mb-8">
            <h2 className="text-2xl font-bold text-purple-800 mb-6">
              Resumen Diario de Caja
            </h2>
            <div className="mb-6">
              <span className="text-lg font-semibold text-gray-700">Fecha:</span>{" "}
              {resumen.fecha}
            </div>
            <div className="mb-6">
              <span className="text-lg font-semibold text-blue-700">
                Monto de apertura de caja:
              </span>{" "}
              S/ {resumen.monto_apertura ? resumen.monto_apertura.toFixed(2) : "0.00"}
            </div>
            <div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Ingreso total */}
              <div className="rounded-xl shadow bg-white border-t-4 border-yellow-400 p-4 flex flex-col items-start gap-2">
                <div className="flex items-center gap-2">
                  <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" fill="#fbbf24"/><rect x="8" y="8" width="8" height="8" rx="2" fill="#fff"/></svg>
                  <span className="font-bold text-yellow-700 text-md">INGRESO TOTAL DEL DÍA</span>
                </div>
                <div className="text-3xl font-extrabold text-yellow-600">S/ {resumen.total.toFixed(2)}</div>
                <div className="text-xs text-yellow-600 flex items-center gap-1">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2" fill="#fbbf24"/></svg>
                  Todos los ingresos del día
                </div>
              </div>
              {/* Egreso por honorarios médicos */}
              <div className="rounded-xl shadow bg-white border-t-4 border-red-400 p-4 flex flex-col items-start gap-2">
                <div className="flex items-center gap-2">
                  <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" fill="#ef4444"/><rect x="8" y="8" width="8" height="8" rx="2" fill="#fff"/></svg>
                  <span className="font-bold text-red-700 text-md">EGRESO HONORARIOS MÉDICOS</span>
                </div>
                <div className="text-3xl font-extrabold text-red-600">S/ {resumen.egreso_honorarios ? resumen.egreso_honorarios.toFixed(2) : "0.00"}</div>
                <div className="text-xs text-red-600 flex items-center gap-1">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2" fill="#ef4444"/></svg>
                  Pagos de honorarios médicos
                </div>
              </div>
            </div>
            {/* ...existing code... (Cards modernas para tipo de ingreso y servicio) */}
            {/* Cards modernas para tipo de ingreso */}
            <div className="mb-8">
              <h3 className="text-lg font-bold text-blue-700 mb-4">Ingresos por Tipo de Pago</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {resumen.por_pago && resumen.por_pago.length > 0 ? (
                  resumen.por_pago.map((pago, idx) => {
                    let color = "green";
                    let icon = (
                      <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="2" fill="#22c55e"/><rect x="7" y="11" width="10" height="2" rx="1" fill="#fff"/></svg>
                    );
                    if ((pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("tarjeta")) {
                      color = "blue";
                      icon = (
                        <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="2" fill="#3b82f6"/><rect x="7" y="11" width="10" height="2" rx="1" fill="#fff"/></svg>
                      );
                    } else if ((pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("yape") || (pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("plin") || (pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("transfer")) {
                      color = "purple";
                      icon = (
                        <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2" fill="#a855f7"/><rect x="9" y="7" width="6" height="2" rx="1" fill="#fff"/></svg>
                      );
                    }
                    return (
                      <div key={idx} className={`rounded-xl shadow bg-white border-t-4 border-${color}-400 p-4 flex flex-col items-start gap-2`}>
                        <div className="flex items-center gap-2">
                          {icon}
                          <span className={`font-bold text-${color}-700 text-md`}>{(pago.metodo_pago || pago.tipo_pago).toUpperCase()}</span>
                        </div>
                        <div className={`text-2xl font-extrabold text-${color}-600`}>S/ {parseFloat(pago.total_pago).toFixed(2)}</div>
                        <div className={`text-xs text-${color}-600 flex items-center gap-1`}>
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2" fill={`#${color === 'green' ? '22c55e' : color === 'blue' ? '3b82f6' : 'a855f7'}`}/></svg>
                          {/* Removed desc variable */}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-4 text-gray-500">No hay ingresos registrados</div>
                )}
              </div>
            </div>
            {/* Cards modernas para tipo de servicio */}
            <div className="mb-8">
              <h3 className="text-lg font-bold text-purple-700 mb-4">Ingresos por Tipo de Servicio</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {resumen.por_servicio && resumen.por_servicio.length > 0 ? (
                  resumen.por_servicio.map((serv, idx) => {
                    let color = "purple";
                    let icon = (
                      <svg width="32" height="32" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" fill="#a855f7" />
                        <text x="12" y="16" textAnchor="middle" fontSize="10" fill="#fff">{serv.tipo_ingreso[0]}</text>
                      </svg>
                    );
                    if (serv.tipo_ingreso.toLowerCase().includes("consulta")) {
                      color = "blue";
                      icon = (
                        <svg width="32" height="32" fill="none" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" fill="#3b82f6" />
                          <text x="12" y="16" textAnchor="middle" fontSize="10" fill="#fff">C</text>
                        </svg>
                      );
                    } else if (serv.tipo_ingreso.toLowerCase().includes("laboratorio")) {
                      color = "green";
                      icon = (
                        <svg width="32" height="32" fill="none" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" fill="#22c55e" />
                          <text x="12" y="16" textAnchor="middle" fontSize="10" fill="#fff">L</text>
                        </svg>
                      );
                    } else if (serv.tipo_ingreso.toLowerCase().includes("farmacia")) {
                      color = "yellow";
                      icon = (
                        <svg width="32" height="32" fill="none" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" fill="#fbbf24" />
                          <text x="12" y="16" textAnchor="middle" fontSize="10" fill="#fff">F</text>
                        </svg>
                      );
                    }
                    return (
                      <div key={idx} className={`rounded-xl shadow bg-white border-t-4 border-${color}-400 p-4 flex flex-col items-start gap-2`}>
                        <div className="flex items-center gap-2">
                          {icon}
                          <span className={`font-bold text-${color}-700 text-md`}>{serv.tipo_ingreso.toUpperCase()}</span>
                        </div>
                        <div className={`text-2xl font-extrabold text-${color}-600`}>S/ {parseFloat(serv.total_servicio).toFixed(2)}</div>
                        <div className={`text-xs text-${color}-600 flex items-center gap-1`}>
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                            <circle cx="8" cy="8" r="6" fill={`#${color === 'purple' ? 'a855f7' : color === 'blue' ? '3b82f6' : color === 'green' ? '22c55e' : 'fbbf24'}`} />
                          </svg>
                          {/* Removed desc variable */}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-4 text-gray-500">No hay ingresos registrados</div>
                )}
              </div>
            </div>
          </div>
          {/* ...existing code... (Cards de Recepcionistas) */}
          {usuario && usuario.rol === "administrador" && (
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-orange-700 mb-6">
                Cajas del Día por Recepcionista
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(() => {
                  const cajasRecep = resumen.cajas_resumen
                    ? resumen.cajas_resumen.filter(caja => {
                        const rol = (caja.rol || caja.usuario_rol || caja.user_rol || "").toString().toLowerCase();
                        return rol.includes("recepcionista");
                      })
                    : [];
                  if (cajasRecep.length > 0) {
                    return cajasRecep.map((caja, idx) => (
                      <div
                        key={idx}
                        className="bg-orange-50 border-2 border-orange-200 rounded-xl p-6 shadow flex flex-col gap-2"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-bold text-orange-800 text-lg">
                            {caja.usuario_nombre || "Sin usuario"}
                          </span>
                          <span className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-semibold">
                            Turno: {caja.turno}
                          </span>
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              caja.estado === "abierta"
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            Estado: {caja.estado}
                          </span>
                        </div>
                        <div className="flex gap-6 mb-2">
                          <span className="text-yellow-700 font-semibold">
                            Apertura: S/ {parseFloat(caja.monto_apertura || 0).toFixed(2)}
                          </span>
                          <span className="text-purple-700 font-semibold">
                            Total cobrado: S/ {parseFloat(caja.total_caja || 0).toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-blue-700 mb-2 block">
                            Ingresos por Tipo de Pago:
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {caja.por_pago && caja.por_pago.length > 0 ? (
                              caja.por_pago.map((pago, i) => {
                                let color = "green";
                                let icon = (
                                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="2" fill="#22c55e"/><rect x="7" y="11" width="10" height="2" rx="1" fill="#fff"/></svg>
                                );
                                // ...existing code...
                                if ((pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("tarjeta")) {
                                  color = "blue";
                                  icon = (
                                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="2" fill="#3b82f6"/><rect x="7" y="11" width="10" height="2" rx="1" fill="#fff"/></svg>
                                  );
                                  // ...existing code...
                                } else if ((pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("yape") || (pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("plin") || (pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("transfer")) {
                                  color = "purple";
                                  icon = (
                                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2" fill="#a855f7"/><rect x="9" y="7" width="6" height="2" rx="1" fill="#fff"/></svg>
                                  );
                                  // ...existing code...
                                }
                                return (
                                  <div key={i} className={`rounded-lg shadow bg-white border-t-4 border-${color}-400 px-3 py-2 flex items-center gap-2 min-w-[120px]`}>
                                    {icon}
                                    <div>
                                      <div className={`font-bold text-${color}-700 text-sm`}>{(pago.metodo_pago || pago.tipo_pago).toUpperCase()}</div>
                                      <div className={`text-xs text-${color}-600`}>S/ {parseFloat(pago.total_pago).toFixed(2)}</div>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="text-gray-500">No hay ingresos registrados</div>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="font-semibold text-purple-700 mb-2 block">
                            Ingresos por Tipo de Servicio:
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {caja.por_servicio && caja.por_servicio.length > 0 ? (
                              caja.por_servicio.map((serv, j) => {
                                let color = "purple";
                                let icon = (
                                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#a855f7"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="#fff">{serv.tipo_ingreso[0]}</text></svg>
                                );
                                // ...existing code...
                                if (serv.tipo_ingreso.toLowerCase().includes("consulta")) {
                                  color = "blue";
                                  icon = (
                                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#3b82f6"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="#fff">C</text></svg>
                                  );
                                  // ...existing code...
                                } else if (serv.tipo_ingreso.toLowerCase().includes("laboratorio")) {
                                  color = "green";
                                  icon = (
                                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#22c55e"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="#fff">L</text></svg>
                                  );
                                  // ...existing code...
                                } else if (serv.tipo_ingreso.toLowerCase().includes("farmacia")) {
                                  color = "yellow";
                                  icon = (
                                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#fbbf24"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="#fff">F</text></svg>
                                  );
                                  // ...existing code...
                                }
                                return (
                                  <div key={j} className={`rounded-lg shadow bg-white border-t-4 border-${color}-400 px-3 py-2 flex items-center gap-2 min-w-[120px]`}>
                                    {icon}
                                    <div>
                                      <div className={`font-bold text-${color}-700 text-sm`}>{serv.tipo_ingreso.toUpperCase()}</div>
                                      <div className={`text-xs text-${color}-600`}>S/ {parseFloat(serv.total_servicio).toFixed(2)}</div>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="text-gray-500">No hay ingresos registrados</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ));
                  } else {
                    return <div className="text-gray-500">No hay cajas registradas hoy</div>;
                  }
                })()}
              </div>
            </div>
          )}
        </div>
      );
    }