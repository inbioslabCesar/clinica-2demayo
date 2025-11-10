import React, { useState, useEffect } from 'react';
import { BASE_URL } from '../../config/config';
import RowsSelector from './RowsSelector';
import CajasCerradasTable from './CajasCerradasTable';
import ConfirmModal from './ConfirmModal';
import { useNavigate } from 'react-router-dom';

const ReabrirCajaPage = () => {
  const [cajasCerradas, setCajasCerradas] = useState([]);
  const [historialReaperturas, setHistorialReaperturas] = useState([]);
  const [activeTab, setActiveTab] = useState('cajas');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [cajaSeleccionada, setCajaSeleccionada] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(3);
  const [page, setPage] = useState(1);

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

  const userRole = sessionStorage.getItem('user_role') || localStorage.getItem('user_role') || 'recepcionista';

  // Acciones de paginación y reapertura
  const handleReabrir = (cajaOrAction) => {
    if (cajaOrAction === 'prev') setPage(page > 1 ? page - 1 : 1);
    else if (cajaOrAction === 'next') setPage(page < Math.ceil(cajasCerradas.length / rowsPerPage) ? page + 1 : page);
    else {
      setCajaSeleccionada(cajaOrAction);
      setMotivo('');
      setShowModal(true);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setCajaSeleccionada(null);
    setMotivo('');
  };

  const handleConfirmReapertura = async () => {
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
        handleCloseModal();
        cargarDatos();
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
              <p className="text-gray-600 mt-1">
                {userRole === 'administrador'
                  ? 'Función exclusiva para administradores'
                  : 'No tienes permisos para reabrir cajas'}
              </p>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${userRole === 'administrador' ? 'bg-red-100 text-red-800' : 'bg-gray-200 text-gray-500'}`}>
              {userRole === 'administrador' ? '🔐 Solo Administradores' : '🔒 Acceso restringido'}
            </div>
          </div>
        </div>
        {/* Tabs */}
        <div className="mb-6">
          <div className="flex gap-2 border-b border-gray-200">
            <button
              className={`px-4 py-2 font-semibold focus:outline-none ${activeTab === 'cajas' ? 'border-b-2 border-yellow-600 text-yellow-700 bg-white' : 'text-gray-500 bg-gray-100'}`}
              onClick={() => setActiveTab('cajas')}
            >Cajas Cerradas</button>
            <button
              className={`px-4 py-2 font-semibold focus:outline-none ${activeTab === 'historial' ? 'border-b-2 border-yellow-600 text-yellow-700 bg-white' : 'text-gray-500 bg-gray-100'}`}
              onClick={() => navigate('/historial-reaperturas')}
            >Historial de Reaperturas</button>
          </div>
        </div>
        {/* Tab content */}
        {activeTab === 'cajas' && (
          <>
            <div className="w-full flex flex-col items-end mb-4">
              <RowsSelector rowsPerPage={rowsPerPage} setRowsPerPage={setRowsPerPage} setPage={setPage} />
            </div>
            <div className="w-full">
              <CajasCerradasTable
                cajas={cajasCerradas}
                page={page}
                rowsPerPage={rowsPerPage}
                userRole={userRole}
                onReabrir={handleReabrir}
              />
            </div>
          </>
        )}
      </div>
      {showModal && (
        <ConfirmModal
          caja={cajaSeleccionada}
          motivo={motivo}
          setMotivo={setMotivo}
          onClose={handleCloseModal}
          onConfirm={handleConfirmReapertura}
          procesando={procesando}
        />
      )}
    </div>
  );
};

export default ReabrirCajaPage;
