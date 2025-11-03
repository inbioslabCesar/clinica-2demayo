import React, { useEffect, useState } from "react";
import AperturaCajaForm from "./AperturaCajaForm";

export default function CajaAdminDashboard() {
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cajaAbierta, setCajaAbierta] = useState(false);
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    // Obtener usuario actual
    const usuarioSession = JSON.parse(
      sessionStorage.getItem("usuario") || "{}"
    );
    setUsuario(usuarioSession);
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
    fetchResumen();
  }, []);

  if (loading)
    return <div className="p-8 text-center">Cargando resumen...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!resumen) return null;

  return (
    <div className="max-w-6xl mx-auto p-8 bg-white rounded-xl shadow-lg">
      {!cajaAbierta && usuario && (
        <div className="mb-8">
          <AperturaCajaForm
            usuario={usuario}
            onApertura={() => window.location.reload()}
          />
        </div>
      )}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-purple-800 mb-6">
          Resumen Diario de Caja
        </h2>
        <span className="text-lg font-semibold text-gray-700">Fecha:</span>{" "}
        {resumen.fecha}
      </div>
      <div className="mb-6">
        <span className="text-lg font-semibold text-blue-700">
          Monto de apertura de caja:
        </span>{" "}
        S/ {resumen.monto_apertura ? resumen.monto_apertura.toFixed(2) : "0.00"}
      </div>
      <div className="mb-8">
        <h3 className="text-xl font-bold text-green-700 mb-2">
          Ingreso Total del Día
        </h3>
        <div className="text-3xl font-extrabold text-green-700">
          S/ {resumen.total.toFixed(2)}
        </div>
      </div>
      <div className="mb-8">
        <h3 className="text-lg font-bold text-blue-700 mb-2">
          Ingresos por Tipo de Pago
        </h3>
        <ul className="list-disc ml-6">
          {resumen.por_pago && resumen.por_pago.length > 0 ? (
            resumen.por_pago.map((pago, idx) => (
              <li key={idx} className="mb-1">
                <span className="font-semibold text-gray-800">
                  {pago.metodo_pago || pago.tipo_pago}:
                </span>{" "}
                S/ {parseFloat(pago.total_pago).toFixed(2)}
              </li>
            ))
          ) : (
            <li className="mb-1 text-gray-500">No hay ingresos registrados</li>
          )}
        </ul>
      </div>
      <div className="mb-8">
        <h3 className="text-lg font-bold text-purple-700 mb-2">
          Ingresos por Tipo de Servicio
        </h3>
        <ul className="list-disc ml-6">
          {resumen.por_servicio && resumen.por_servicio.length > 0 ? (
            resumen.por_servicio.map((serv, idx) => (
              <li key={idx} className="mb-1">
                <span className="font-semibold text-gray-800">
                  {serv.tipo_ingreso}:
                </span>{" "}
                S/ {parseFloat(serv.total_servicio).toFixed(2)}
              </li>
            ))
          ) : (
            <li className="mb-1 text-gray-500">No hay ingresos registrados</li>
          )}
        </ul>
      </div>
      {usuario && usuario.rol === "administrador" && (
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-orange-700 mb-6">
            Cajas del Día por Recepcionista
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {resumen.cajas_resumen && resumen.cajas_resumen.length > 0 ? (
              resumen.cajas_resumen.map((caja, idx) => (
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
                      Apertura: S/{" "}
                      {parseFloat(caja.monto_apertura || 0).toFixed(2)}
                    </span>
                    <span className="text-purple-700 font-semibold">
                      Total cobrado: S/{" "}
                      {parseFloat(caja.total_caja || 0).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-blue-700">
                      Ingresos por Tipo de Pago:
                    </span>
                    <ul className="list-disc ml-6">
                      {caja.por_pago && caja.por_pago.length > 0 ? (
                        caja.por_pago.map((pago, i) => (
                          <li key={i} className="text-blue-800">
                            {pago.metodo_pago}:{" "}
                            <span className="font-bold">
                              S/ {parseFloat(pago.total_pago).toFixed(2)}
                            </span>
                          </li>
                        ))
                      ) : (
                        <li className="text-gray-500">
                          No hay ingresos registrados
                        </li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <span className="font-semibold text-purple-700">
                      Ingresos por Tipo de Servicio:
                    </span>
                    <ul className="list-disc ml-6">
                      {caja.por_servicio && caja.por_servicio.length > 0 ? (
                        caja.por_servicio.map((serv, j) => (
                          <li key={j} className="text-purple-800">
                            {serv.tipo_ingreso}:{" "}
                            <span className="font-bold">
                              S/ {parseFloat(serv.total_servicio).toFixed(2)}
                            </span>
                          </li>
                        ))
                      ) : (
                        <li className="text-gray-500">
                          No hay ingresos registrados
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-gray-500">No hay cajas registradas hoy</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
