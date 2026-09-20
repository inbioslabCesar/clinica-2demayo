import React, { useState, useEffect } from 'react';
import RowsSelector from './RowsSelector';
import CajasCerradasTable from './CajasCerradasTable';
import ConfirmModal from './ConfirmModal';
import HistorialReaperturasPage from './HistorialReaperturasPage';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../../utils/apiClient';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';

const getFechaLimaISO = (offsetDias = 0) => {
	const base = new Date();
	base.setDate(base.getDate() + offsetDias);
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(base);
};

const ReabrirCajaPage = () => {
	const [cajasCerradas, setCajasCerradas] = useState([]);
	const [resumenDiario, setResumenDiario] = useState([]);
	const [resumenCierreRealDiario, setResumenCierreRealDiario] = useState([]);
	const [indicadores, setIndicadores] = useState({
		total_cajas: 0,
		total_pendientes_cuadre: 0,
		total_regularizadas: 0,
		efectivo_real_total: 0,
		efectivo_esperado_total: 0,
		diferencia_efectivo_total: 0,
		virtual_cobrado_total: 0,
		virtual_real_total: 0,
		diferencia_virtual_total: 0,
	});
	const [historialReaperturas, setHistorialReaperturas] = useState([]);
	const [activeTab, setActiveTab] = useState('cajas');
	const navigate = useNavigate();
	const [loading, setLoading] = useState(true);
	const [procesando, setProcesando] = useState(false);
	const [showModal, setShowModal] = useState(false);
	const [cajaSeleccionada, setCajaSeleccionada] = useState(null);
	const [motivo, setMotivo] = useState('');
	const [rowsPerPage, setRowsPerPage] = useState(10);
	const [page, setPage] = useState(1);
	const [paginacion, setPaginacion] = useState({ page: 1, per_page: 10, total: 0, total_pages: 1, from: 0, to: 0 });
	const [fechaHasta, setFechaHasta] = useState(() => getFechaLimaISO(0));
	const [fechaDesde, setFechaDesde] = useState(() => getFechaLimaISO(-30));
	const [usuarioIdFiltro, setUsuarioIdFiltro] = useState('');
	const [turnoFiltro, setTurnoFiltro] = useState('');
	const [usuariosDisponibles, setUsuariosDisponibles] = useState([]);
	const [turnosDisponibles, setTurnosDisponibles] = useState([]);
	const [errorFiltros, setErrorFiltros] = useState('');

	useEffect(() => {
		cargarDatos();
	}, []);

	const construirFiltrosActuales = () => ({
		fecha_desde: fechaDesde,
		fecha_hasta: fechaHasta,
		usuario_id: usuarioIdFiltro,
		turno: turnoFiltro,
	});

	const cargarDatos = async ({ filtros, pageParam, perPageParam } = {}) => {
		const filtrosFinales = filtros || construirFiltrosActuales();
		const pageFinal = pageParam || page;
		const perPageFinal = perPageParam || rowsPerPage;
		try {
			setLoading(true);
			const params = new URLSearchParams();
			if (filtrosFinales.fecha_desde) params.set('fecha_desde', filtrosFinales.fecha_desde);
			if (filtrosFinales.fecha_hasta) params.set('fecha_hasta', filtrosFinales.fecha_hasta);
			if (filtrosFinales.usuario_id) params.set('usuario_id', filtrosFinales.usuario_id);
			if (filtrosFinales.turno) params.set('turno', filtrosFinales.turno);
			params.set('page', String(pageFinal));
			params.set('per_page', String(perPageFinal));
			const response = await authFetch(`api_cajas_cerradas.php?${params.toString()}`);
			if (response.ok) {
				const data = await response.json();
				if (data.success) {
					setCajasCerradas(data.cajas_cerradas);
					setResumenDiario(Array.isArray(data.resumen_diario) ? data.resumen_diario : []);
					setResumenCierreRealDiario(Array.isArray(data.resumen_cierre_real_diario) ? data.resumen_cierre_real_diario : []);
					setIndicadores(data.indicadores || {});
					setHistorialReaperturas(data.historial_reaperturas);
					setUsuariosDisponibles(Array.isArray(data.usuarios_disponibles) ? data.usuarios_disponibles : []);
					setTurnosDisponibles(Array.isArray(data.turnos_disponibles) ? data.turnos_disponibles : []);
					const pag = data.paginacion || { page: pageFinal, per_page: perPageFinal, total: 0, total_pages: 1, from: 0, to: 0 };
					setPaginacion(pag);
					setPage(Number(pag.page || pageFinal));
					setRowsPerPage(Number(pag.per_page || perPageFinal));
				}
			}
		} catch (error) {
			console.error('Error al cargar datos:', error);
		} finally {
			setLoading(false);
		}
	};

	const userRole = sessionStorage.getItem('user_role') || localStorage.getItem('user_role') || 'recepcionista';

	const handleReabrir = (caja) => {
		setCajaSeleccionada(caja);
		setMotivo('');
		setShowModal(true);
	};

	const handlePrevPage = () => {
		if (page <= 1) return;
		cargarDatos({ pageParam: page - 1 });
	};

	const handleNextPage = () => {
		if (page >= (paginacion.total_pages || 1)) return;
		cargarDatos({ pageParam: page + 1 });
	};

	const handleGoToPage = (targetPage) => {
		const safePage = Math.max(1, Math.min(Number(targetPage) || 1, paginacion.total_pages || 1));
		if (safePage === page) return;
		cargarDatos({ pageParam: safePage });
	};

	const handleRowsPerPageChange = (nextRows) => {
		setRowsPerPage(nextRows);
		setPage(1);
		cargarDatos({ pageParam: 1, perPageParam: nextRows });
	};

	const handleCloseModal = () => {
		setShowModal(false);
		setCajaSeleccionada(null);
	};

	const handleConfirmReapertura = async () => {
		if (!cajaSeleccionada || !motivo.trim()) return;
		setProcesando(true);
		try {
			const response = await authFetch('api_reabrir_caja.php', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ caja_id: cajaSeleccionada.id, motivo })
			});
			if (response.ok) {
				const data = await response.json();
				if (data.success) {
					cargarDatos({ pageParam: page });
					setShowModal(false);
				}
			}
		} catch (error) {
			console.error('Error al reabrir caja:', error);
		} finally {
			setProcesando(false);
		}
	};

	const handleBuscar = () => {
		if (!fechaDesde || !fechaHasta) return;
		if (fechaDesde > fechaHasta) {
			setErrorFiltros('La fecha "Desde" no puede ser mayor que "Hasta".');
			return;
		}
		setErrorFiltros('');
		setPage(1);
		cargarDatos({
			filtros: {
				fecha_desde: fechaDesde,
				fecha_hasta: fechaHasta,
				usuario_id: usuarioIdFiltro,
				turno: turnoFiltro,
			},
			pageParam: 1,
		});
	};

	const handleResetFiltros = () => {
		const hasta = getFechaLimaISO(0);
		const desde = getFechaLimaISO(-30);
		setFechaDesde(desde);
		setFechaHasta(hasta);
		setUsuarioIdFiltro('');
		setTurnoFiltro('');
		setErrorFiltros('');
		setPage(1);
		cargarDatos({ filtros: { fecha_desde: desde, fecha_hasta: hasta, usuario_id: '', turno: '' }, pageParam: 1 });
	};

	const columnasExport = [
		{ key: 'fecha', label: 'Fecha' },
		{ key: 'usuario_nombre', label: 'Usuario' },
		{ key: 'turno', label: 'Turno' },
		{ key: 'observaciones_cierre', label: 'Observaciones' },
		{ key: 'monto_cierre', label: 'Monto Cierre' },
		{ key: 'diferencia', label: 'Diferencia' },
		{ key: 'total_efectivo', label: 'Efectivo' },
		{ key: 'total_yape', label: 'Yape' },
		{ key: 'total_plin', label: 'Plin' },
		{ key: 'total_tarjetas', label: 'Tarjetas' },
		{ key: 'total_transferencias', label: 'Transferencias' },
		{ key: 'total_egresos', label: 'Total Egresos' },
		{ key: 'ganancia_dia', label: 'Ganancia Día' },
	];

	const columnasResumenExport = [
		{ key: 'fecha', label: 'Fecha' },
		{ key: 'total_cajas', label: 'Cajas' },
		{ key: 'monto_cierre', label: 'Monto Cierre' },
		{ key: 'diferencia', label: 'Diferencia' },
		{ key: 'total_efectivo', label: 'Efectivo' },
		{ key: 'total_yape', label: 'Yape' },
		{ key: 'total_plin', label: 'Plin' },
		{ key: 'total_tarjetas', label: 'Tarjetas' },
		{ key: 'total_transferencias', label: 'Transferencias' },
		{ key: 'total_egresos', label: 'Total Egresos' },
		{ key: 'ganancia_dia', label: 'Ganancia Día' },
	];

	const filasExportActual = cajasCerradas.map((caja) => ({
		fecha: caja.fecha || '',
		usuario_nombre: caja.usuario_nombre || '-',
		turno: caja.turno || '-',
		observaciones_cierre: String(caja.observaciones_cierre || '').trim() || 'Sin observaciones',
		monto_cierre: Number(caja.monto_cierre || 0).toFixed(2),
		diferencia: Number(caja.diferencia || 0).toFixed(2),
		total_efectivo: Number(caja.total_efectivo || 0).toFixed(2),
		total_yape: Number(caja.total_yape || 0).toFixed(2),
		total_plin: Number(caja.total_plin || 0).toFixed(2),
		total_tarjetas: Number(caja.total_tarjetas || 0).toFixed(2),
		total_transferencias: Number(caja.total_transferencias || 0).toFixed(2),
		total_egresos: Number(caja.total_egresos || 0).toFixed(2),
		ganancia_dia: Number(caja.ganancia_dia || 0).toFixed(2),
	}));

	const filasResumenExport = resumenDiario.map((fila) => ({
		fecha: fila.fecha || '',
		total_cajas: Number(fila.total_cajas || 0),
		monto_cierre: Number(fila.monto_cierre || 0).toFixed(2),
		diferencia: Number(fila.diferencia || 0).toFixed(2),
		total_efectivo: Number(fila.total_efectivo || 0).toFixed(2),
		total_yape: Number(fila.total_yape || 0).toFixed(2),
		total_plin: Number(fila.total_plin || 0).toFixed(2),
		total_tarjetas: Number(fila.total_tarjetas || 0).toFixed(2),
		total_transferencias: Number(fila.total_transferencias || 0).toFixed(2),
		total_egresos: Number(fila.total_egresos || 0).toFixed(2),
		ganancia_dia: Number(fila.ganancia_dia || 0).toFixed(2),
	}));

	const cargarCajasParaExport = async () => {
		const filtros = construirFiltrosActuales();
		const acumulado = [];
		let paginaActual = 1;
		let totalPaginas = 1;
		do {
			const params = new URLSearchParams();
			if (filtros.fecha_desde) params.set('fecha_desde', filtros.fecha_desde);
			if (filtros.fecha_hasta) params.set('fecha_hasta', filtros.fecha_hasta);
			if (filtros.usuario_id) params.set('usuario_id', filtros.usuario_id);
			if (filtros.turno) params.set('turno', filtros.turno);
			params.set('page', String(paginaActual));
			params.set('per_page', '200');
			const response = await authFetch(`api_cajas_cerradas.php?${params.toString()}`);
			if (!response.ok) break;
			const data = await response.json();
			if (!data.success) break;
			acumulado.push(...(Array.isArray(data.cajas_cerradas) ? data.cajas_cerradas : []));
			totalPaginas = Number(data.paginacion?.total_pages || 1);
			paginaActual += 1;
		} while (paginaActual <= totalPaginas && paginaActual <= 100);

		return acumulado.map((caja) => ({
			fecha: caja.fecha || '',
			usuario_nombre: caja.usuario_nombre || '-',
			turno: caja.turno || '-',
			observaciones_cierre: String(caja.observaciones_cierre || '').trim() || 'Sin observaciones',
			monto_cierre: Number(caja.monto_cierre || 0).toFixed(2),
			diferencia: Number(caja.diferencia || 0).toFixed(2),
			total_efectivo: Number(caja.total_efectivo || 0).toFixed(2),
			total_yape: Number(caja.total_yape || 0).toFixed(2),
			total_plin: Number(caja.total_plin || 0).toFixed(2),
			total_tarjetas: Number(caja.total_tarjetas || 0).toFixed(2),
			total_transferencias: Number(caja.total_transferencias || 0).toFixed(2),
			total_egresos: Number(caja.total_egresos || 0).toFixed(2),
			ganancia_dia: Number(caja.ganancia_dia || 0).toFixed(2),
		}));
	};

	const handleExportExcel = async () => {
		const filasExport = await cargarCajasParaExport();
		if (!filasExport.length) return;
		exportToExcel(filasExport, columnasExport, `cajas-cerradas-${fechaDesde}-a-${fechaHasta}.xlsx`);
	};

	const handleExportPdf = async () => {
		const filasExport = await cargarCajasParaExport();
		if (!filasExport.length) return;
		exportToPDF(filasExport, columnasExport, `cajas-cerradas-${fechaDesde}-a-${fechaHasta}.pdf`);
	};

	const handleExportResumenExcel = () => {
		if (!filasResumenExport.length) return;
		exportToExcel(filasResumenExport, columnasResumenExport, `resumen-cajas-${fechaDesde}-a-${fechaHasta}.xlsx`);
	};

	const handleExportResumenPdf = () => {
		if (!filasResumenExport.length) return;
		exportToPDF(filasResumenExport, columnasResumenExport, `resumen-cajas-${fechaDesde}-a-${fechaHasta}.pdf`);
	};

	const canExportDetalle = filasExportActual.length > 0 || (paginacion.total || 0) > 0;
	const canExportResumen = filasResumenExport.length > 0;

	return (
		<div className="min-h-screen bg-gray-50 p-4">
			<div className="w-full max-w-7xl mx-auto">
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
						<div className="w-full bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
									<input
										type="date"
										value={fechaDesde}
										onChange={(e) => setFechaDesde(e.target.value)}
										className="w-full border border-gray-300 rounded px-3 py-2"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
									<input
										type="date"
										value={fechaHasta}
										onChange={(e) => setFechaHasta(e.target.value)}
										className="w-full border border-gray-300 rounded px-3 py-2"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
									<select
										value={usuarioIdFiltro}
										onChange={(e) => setUsuarioIdFiltro(e.target.value)}
										className="w-full border border-gray-300 rounded px-3 py-2"
									>
										<option value="">Todos</option>
										{usuariosDisponibles.map((u) => (
											<option key={u.id} value={u.id}>{u.nombre}</option>
										))}
									</select>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">Turno</label>
									<select
										value={turnoFiltro}
										onChange={(e) => setTurnoFiltro(e.target.value)}
										className="w-full border border-gray-300 rounded px-3 py-2"
									>
										<option value="">Todos</option>
										{turnosDisponibles.map((turno) => (
											<option key={turno} value={turno}>{turno}</option>
										))}
									</select>
								</div>
								<div>
									<button
										onClick={handleBuscar}
										className="w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded font-semibold"
									>
										Filtrar
									</button>
								</div>
							</div>
							<div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-1 lg:grid-cols-3 gap-3 items-end">
								<div>
									<button
										onClick={handleResetFiltros}
										className="w-full lg:w-auto bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded font-semibold"
									>
										Restablecer filtros
									</button>
								</div>
								<div>
									<p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Exportar detalle por caja</p>
									<div className="grid grid-cols-2 gap-2">
										<button
											onClick={handleExportExcel}
											disabled={!canExportDetalle}
											className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-2 rounded font-semibold"
										>
											Detalle Excel
										</button>
										<button
											onClick={handleExportPdf}
											disabled={!canExportDetalle}
											className="bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-2 rounded font-semibold"
										>
											Detalle PDF
										</button>
									</div>
								</div>
								<div>
									<p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Exportar resumen diario</p>
									<div className="grid grid-cols-2 gap-2">
										<button
											onClick={handleExportResumenExcel}
											disabled={!canExportResumen}
											className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-2 rounded font-semibold"
										>
											Resumen Excel
										</button>
										<button
											onClick={handleExportResumenPdf}
											disabled={!canExportResumen}
											className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-2 rounded font-semibold"
										>
											Resumen PDF
										</button>
									</div>
								</div>
							</div>
							{errorFiltros ? (
								<div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
									{errorFiltros}
								</div>
							) : null}
						</div>
						<div className="w-full flex flex-col items-end mb-4">
							<RowsSelector rowsPerPage={rowsPerPage} onChangeRows={handleRowsPerPageChange} />
						</div>
						<CajasCerradasTable
							cajas={cajasCerradas}
							resumenDiario={resumenDiario}
							resumenCierreRealDiario={resumenCierreRealDiario}
							indicadores={indicadores}
							paginacion={paginacion}
							page={page}
							rowsPerPage={rowsPerPage}
							userRole={userRole}
							onReabrir={handleReabrir}
							onPrevPage={handlePrevPage}
							onNextPage={handleNextPage}
							onGoToPage={handleGoToPage}
							fechaDesde={fechaDesde}
							fechaHasta={fechaHasta}
						/>
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
