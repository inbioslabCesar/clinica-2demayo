import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";
import { 
  FaMoneyBillWave, 
  FaLock, 
  FaUnlock, 
  FaUser, 
  FaCalendarAlt
} from "react-icons/fa";
import Swal from 'sweetalert2';
import Spinner from "../components/Spinner";
import DashboardCajaAbierta from "../components/DashboardCajaAbierta";
import EgresosDiariosForm from "../components/EgresosDiariosForm";
import EgresosDiariosList from "../components/EgresosDiariosList";

export default function IngresosPage() {
  // Egresos diarios (demo: estado local, luego se conecta a backend)
  const [egresosDiarios, setEgresosDiarios] = useState([]);

  const handleAddEgreso = (egreso) => {
    setEgresosDiarios(prev => [...prev, egreso]);
  };
  const [loading, setLoading] = useState(true);
  const [cajaActual, setCajaActual] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [resumenHoy, setResumenHoy] = useState(null);
  const navigate = useNavigate();

  // Estados para apertura de caja
  const [modalApertura, setModalApertura] = useState(false);
  const [montoApertura, setMontoApertura] = useState("");
  const [observacionesApertura, setObservacionesApertura] = useState("");
  const [loadingApertura, setLoadingApertura] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      // Obtener usuario actual
      const usuarioResp = await fetch(`${BASE_URL}api_auth_status.php`, { credentials: 'include' });
      const usuarioData = await usuarioResp.json();
      if (!usuarioData.success || !usuarioData.authenticated) {
        Swal.fire({
          icon: 'warning',
          title: 'Sesión expirada',
          text: 'Debe iniciar sesión para acceder al módulo de ingresos',
          confirmButtonText: 'Ir al Login'
        }).then(() => {
          navigate('/');
        });
        return;
      }
      setUsuario(usuarioData);

      // Verificar estado de caja actual
      const cajaResp = await fetch(`${BASE_URL}api_caja_estado.php`, { credentials: 'include' });
      const cajaData = await cajaResp.json();
      if (cajaData.success) {
        setCajaActual(cajaData.caja);
        // Si hay caja abierta, obtener resumen
        if (cajaData.caja) {
          const resumenResp = await fetch(`${BASE_URL}api_resumen_ingresos.php`, { credentials: 'include' });
          const resumenData = await resumenResp.json();
          if (resumenData.success) {
            setResumenHoy(resumenData.resumen);
          }
          // Obtener egresos diarios desde el backend
          const egresosResp = await fetch(`${BASE_URL}api_egresos.php`, { credentials: 'include' });
          const egresosData = await egresosResp.json();
          if (egresosData.success) {
            setEgresosDiarios(egresosData.egresos || []);
          } else {
            setEgresosDiarios([]);
          }
        } else {
          setEgresosDiarios([]);
        }
      } else {
        console.log('Estado de caja:', cajaData.error);
        setEgresosDiarios([]);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error de conexión',
        text: 'No se pudo conectar con el servidor. Verifique su conexión.',
        confirmButtonText: 'Reintentar'
      }).then(() => {
        cargarDatos();
      });
      setEgresosDiarios([]);
    } finally {
      setLoading(false);
    }
  };

  const abrirCaja = async () => {
    if (!montoApertura || parseFloat(montoApertura) < 0) {
      Swal.fire('Error', 'Debe ingresar un monto válido', 'error');
      return;
    }

    try {
      setLoadingApertura(true);
      
      const response = await fetch(`${BASE_URL}api_caja_abrir.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          monto_apertura: parseFloat(montoApertura),
          observaciones: observacionesApertura
        })
      });

      const data = await response.json();
      
      if (data.success) {
        Swal.fire('¡Éxito!', 'Caja abierta correctamente', 'success');
        setModalApertura(false);
        setMontoApertura("");
        setObservacionesApertura("");
        cargarDatos(); // Recargar datos
      } else {
        Swal.fire('Error', data.error || 'Error al abrir caja', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      Swal.fire('Error', 'Error de conexión', 'error');
    } finally {
      setLoadingApertura(false);
    }
  };

  const cerrarCaja = () => {
    navigate('/contabilidad/cierre-caja');
  };

  if (loading) return <Spinner />;

  return (
  <div className="max-w-[1600px] mx-auto p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FaMoneyBillWave className="text-4xl text-green-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Módulo de Ingresos</h1>
              <p className="text-gray-600">Gestión de caja e ingresos diarios</p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 text-gray-600">
              <FaCalendarAlt />
              <span>{new Date().toLocaleDateString('es-PE', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600 mt-1">
              <FaUser />
              <span>{usuario?.nombre}</span>
            </div>
          </div>
        </div>
      </div>

      {!cajaActual ? (
        /* Estado: Caja Cerrada - Necesita Apertura */
        <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200 rounded-xl p-8 text-center">
          <FaLock className="text-6xl text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-red-700 mb-2">Caja Cerrada</h2>
          <p className="text-red-600 mb-6">
            Debe abrir la caja para comenzar a registrar ingresos del día
          </p>
          <button
            onClick={() => setModalApertura(true)}
            className="bg-gradient-to-r from-green-500 to-green-600 text-white px-8 py-3 rounded-lg font-semibold hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105 flex items-center gap-2 mx-auto"
          >
            <FaUnlock />
            Abrir Caja
          </button>
        </div>
      ) : (
        <>
          {/* Estado: Caja Abierta - Dashboard */}
          <DashboardCajaAbierta 
            cajaActual={cajaActual}
            resumenHoy={resumenHoy}
            onActualizar={cargarDatos}
            egresosDiarios={egresosDiarios}
            
          />
        </>
      )}

      {/* Modal de Apertura de Caja */}
      {modalApertura && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <FaUnlock className="text-5xl text-green-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-800">Apertura de Caja</h2>
              <p className="text-gray-600">Ingrese los datos para abrir la caja del día</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Monto Inicial (Efectivo) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">S/</span>
                  <input
                    type="number"
                    step="0.01"
                    value={montoApertura}
                    onChange={(e) => setMontoApertura(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="0.00"
                    disabled={loadingApertura}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Observaciones (Opcional)
                </label>
                <textarea
                  value={observacionesApertura}
                  onChange={(e) => setObservacionesApertura(e.target.value)}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                  rows="3"
                  placeholder="Notas adicionales sobre la apertura..."
                  disabled={loadingApertura}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setModalApertura(false)}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-all"
                disabled={loadingApertura}
              >
                Cancelar
              </button>
              <button
                onClick={abrirCaja}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-semibold hover:from-green-600 hover:to-green-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                disabled={loadingApertura}
              >
                {loadingApertura ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Abriendo...
                  </>
                ) : (
                  <>
                    <FaUnlock />
                    Abrir Caja
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}