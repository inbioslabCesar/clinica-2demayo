import React, { useState, useEffect } from 'react';
import { BASE_URL } from '../config/config';

const ReabrirCajaPage = () => {
  const [cajasCerradas, setCajasCerradas] = useState([]);
  const [historialReaperturas, setHistorialReaperturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [cajaSeleccionada, setCajaSeleccionada] = useState(null);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const response = await fetch(BASE_URL + 'api_cajas_cerradas.php', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCajasCerradas(data.cajas_cerradas);
          setHistorialReaperturas(data.historial_reaperturas);
        }
      }
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const confirmarReapertura = (caja) => {
    setCajaSeleccionada(caja);
    setMotivo('');
    setShowModal(true);
  };

  const reabrirCaja = async () => {
    if (!motivo.trim()) {
      alert('Por favor ingresa el motivo de la reapertura');
      return;
    }

    try {
      setProcesando(true);
      const response = await fetch(BASE_URL + 'api_reabrir_caja.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          caja_id: cajaSeleccionada.id,
          motivo: motivo.trim()
        })
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ Caja ID ${cajaSeleccionada.id} reabierta exitosamente`);
        setShowModal(false);
        setCajaSeleccionada(null);
        setMotivo('');
        cargarDatos(); // Recargar datos
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error al reabrir caja:', error);
      alert('❌ Error de conexión');
    } finally {
      setProcesando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando cajas cerradas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <svg className="w-8 h-8 mr-3 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
                Reabrir Cajas Cerradas
              </h1>
              <p className="text-gray-600 mt-1">Función exclusiva para administradores</p>
            </div>
            <div className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
              🔐 Solo Administradores
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cajas Cerradas */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Cajas Cerradas Recientes</h2>
                <p className="text-sm text-gray-600">Últimas 20 cajas cerradas</p>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">H. Cierre</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Diferencia</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {cajasCerradas.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                          No hay cajas cerradas
                        </td>
                      </tr>
                    ) : (
                      cajasCerradas.map((caja) => (
                        <tr key={caja.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{caja.id}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{caja.fecha}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {caja.hora_cierre ? caja.hora_cierre.substr(0, 8) : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            S/ {parseFloat(caja.monto_cierre || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                              parseFloat(caja.diferencia || 0) === 0 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              S/ {parseFloat(caja.diferencia || 0).toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <button
                              onClick={() => confirmarReapertura(caja)}
                              className={`bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors ${caja.fecha !== (new Date().toISOString().slice(0,10)) ? 'opacity-50 cursor-not-allowed' : ''}`}
                              disabled={caja.fecha !== (new Date().toISOString().slice(0,10))}
                            >
                              🔓 Reabrir
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Historial de Reaperturas */}
          <div>
            <div className="bg-white rounded-lg shadow-md">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Historial de Reaperturas</h2>
                <p className="text-sm text-gray-600">Últimas 10 reaperturas</p>
              </div>
              
              <div className="p-4 space-y-3">
                {historialReaperturas.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No hay reaperturas registradas</p>
                ) : (
                  historialReaperturas.map((reapertura, index) => (
                    <div key={index} className="border-l-4 border-yellow-400 pl-3 py-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Caja ID {reapertura.caja_id}
                          </p>
                          <p className="text-xs text-gray-600">
                            {reapertura.usuario_nombre}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {reapertura.motivo}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(reapertura.fecha_reapertura).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Confirmación */}
      {showModal && cajaSeleccionada && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <svg className="w-8 h-8 text-yellow-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900">Confirmar Reapertura</h3>
              </div>

              <div className="mb-4 p-3 bg-gray-50 rounded">
                <p className="text-sm"><strong>Caja ID:</strong> {cajaSeleccionada.id}</p>
                <p className="text-sm"><strong>Fecha:</strong> {cajaSeleccionada.fecha}</p>
                <p className="text-sm"><strong>Cerrada:</strong> {cajaSeleccionada.hora_cierre}</p>
                <p className="text-sm"><strong>Monto:</strong> S/ {parseFloat(cajaSeleccionada.monto_cierre || 0).toFixed(2)}</p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Motivo de la reapertura *
                </label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Describe el motivo de esta reapertura..."
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
                  disabled={procesando}
                >
                  Cancelar
                </button>
                <button
                  onClick={reabrirCaja}
                  disabled={procesando || !motivo.trim()}
                  className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 transition-colors"
                >
                  {procesando ? 'Reabriendo...' : '🔓 Reabrir Caja'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReabrirCajaPage;