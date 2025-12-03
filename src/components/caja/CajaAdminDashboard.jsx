import React, { useEffect, useState } from "react";

import AperturaCajaForm from "./AperturaCajaForm";
import Modal from "../comunes/Modal";
import CajaActionButtons from "./CajaActionButtons";
import CajaResumenDiario from "./CajaResumenDiario";
import CajaRecepcionistasResumen from "./CajaRecepcionistasResumen";


export default function CajaAdminDashboard() {
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cajaAbierta, setCajaAbierta] = useState(false);
  const [usuario, setUsuario] = useState(null);
  const [showModal, setShowModal] = useState(false);
  // ...existing code...

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
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const usuarioSession = JSON.parse(sessionStorage.getItem("usuario") || "{}");
    setUsuario(usuarioSession);
    fetchResumen();
  }, []);

  if (loading)
    return <div className="p-8 text-center">Cargando resumen...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!resumen) return null;

  return (
    <div className="max-w-7xl mx-auto p-2 sm:p-8 bg-white rounded-xl shadow-lg">
      <div className="flex flex-col gap-4">
        <div className="w-full flex flex-col sm:flex-row sm:justify-between gap-2 sm:gap-4">
          <CajaActionButtons cajaAbierta={cajaAbierta} usuario={usuario} setShowModal={setShowModal} />
        </div>
        <Modal open={showModal} onClose={() => setShowModal(false)}>
          <div className="p-2 sm:p-4">
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
        <div className="w-full">
          <CajaResumenDiario resumen={resumen} />
        </div>
        {usuario && usuario.rol === "administrador" && (
          <div className="w-full">
            <CajaRecepcionistasResumen cajasRecep={resumen.cajas_resumen ? resumen.cajas_resumen.filter(caja => {
              const rol = (caja.usuario_rol || caja.rol || caja.user_rol || "").toString().toLowerCase();
              return rol.includes("recepcionista");
            }) : []} />
          </div>
        )}
      </div>
    </div>
  );
}