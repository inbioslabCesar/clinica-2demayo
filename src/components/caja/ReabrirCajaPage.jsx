import React, { useState, useEffect } from 'react';
import { BASE_URL } from '../../config/config';
import RowsSelector from './RowsSelector';
import CajasCerradasTable from './CajasCerradasTable';
import ConfirmModal from './ConfirmModal';
import HistorialReaperturasPage from './HistorialReaperturasPage';
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
	};

	const handleConfirmReapertura = async () => {
		if (!cajaSeleccionada || !motivo.trim()) return;
		setProcesando(true);
		try {
			const response = await fetch(BASE_URL + 'api_reabrir_caja.php', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ caja_id: cajaSeleccionada.id, motivo })
			});
			if (response.ok) {
				const data = await response.json();
				if (data.success) {
					cargarDatos();
					setShowModal(false);
				}
			}
		} catch (error) {
			console.error('Error al reabrir caja:', error);
		} finally {
			setProcesando(false);
		}
	};

	return (
		<div className="min-h-screen bg-gray-50 p-4">
			<div className="w-full max-w-3xl mx-auto">
				<div className="bg-white rounded-lg shadow-md p-6 mb-6">
					<h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center">
						<svg className="w-8 h-8 mr-3 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
						</svg>
						Reapertura de Caja
					</h1>
					<p className="text-gray-600">Gestiona la reapertura de cajas cerradas</p>
				</div>
				<div className="mb-4 flex gap-4">
					<button
						className={`px-4 py-2 rounded font-semibold transition-colors ${activeTab === 'cajas' ? 'bg-yellow-600 text-white' : 'bg-gray-200 text-gray-700'}`}
						onClick={() => setActiveTab('cajas')}
					>Cajas Cerradas</button>
					<button
						className={`px-4 py-2 rounded font-semibold transition-colors ${activeTab === 'historial' ? 'bg-yellow-600 text-white' : 'bg-gray-200 text-gray-700'}`}
						onClick={() => setActiveTab('historial')}
					>Historial de Reaperturas</button>
				</div>
				{activeTab === 'cajas' ? (
					<>
						<div className="w-full flex flex-col items-end mb-4">
							<RowsSelector rowsPerPage={rowsPerPage} setRowsPerPage={setRowsPerPage} setPage={setPage} />
						</div>
						<CajasCerradasTable cajas={cajasCerradas} page={page} rowsPerPage={rowsPerPage} userRole={userRole} onReabrir={handleReabrir} />
					</>
				) : (
					<HistorialReaperturasPage />
				)}
				{/* Modal de confirmación */}
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
		</div>
	);
};

export default ReabrirCajaPage;
