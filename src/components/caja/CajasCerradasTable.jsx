import React, { useEffect, useMemo, useState } from 'react';

function CajasCerradasTable({
	cajas,
	resumenDiario = [],
	resumenCierreRealDiario = [],
	indicadores = {},
	paginacion = {},
	page,
	userRole,
	onReabrir,
	onPrevPage,
	onNextPage,
	onGoToPage,
	fechaDesde,
	fechaHasta,
}) {
	const DAILY_ROWS_OPTIONS = [5, 7, 10];
	const DEFAULT_DAILY_ROWS = 7;
	const LS_KEY_REAL_ROWS = 'reabrir_caja_resumen_real_rows';
	const LS_KEY_GENERAL_ROWS = 'reabrir_caja_resumen_general_rows';
	const LS_KEY_REAL_SHOW_ALL = 'reabrir_caja_resumen_real_show_all';
	const LS_KEY_GENERAL_SHOW_ALL = 'reabrir_caja_resumen_general_show_all';

	const readIntPref = (key, fallback) => {
		if (typeof window === 'undefined') return fallback;
		const raw = window.localStorage.getItem(key);
		const value = Number(raw);
		if (!Number.isFinite(value)) return fallback;
		return DAILY_ROWS_OPTIONS.includes(value) ? value : fallback;
	};

	const readBoolPref = (key, fallback) => {
		if (typeof window === 'undefined') return fallback;
		const raw = window.localStorage.getItem(key);
		if (raw === null) return fallback;
		return raw === '1';
	};

	const [resumenRealRowsPerPage, setResumenRealRowsPerPage] = useState(() => readIntPref(LS_KEY_REAL_ROWS, DEFAULT_DAILY_ROWS));
	const [resumenGeneralRowsPerPage, setResumenGeneralRowsPerPage] = useState(() => readIntPref(LS_KEY_GENERAL_ROWS, DEFAULT_DAILY_ROWS));
	const [resumenRealPage, setResumenRealPage] = useState(1);
	const [resumenGeneralPage, setResumenGeneralPage] = useState(1);
	const [resumenRealShowAll, setResumenRealShowAll] = useState(() => readBoolPref(LS_KEY_REAL_SHOW_ALL, false));
	const [resumenGeneralShowAll, setResumenGeneralShowAll] = useState(() => readBoolPref(LS_KEY_GENERAL_SHOW_ALL, false));
    const [resumenRealFechaFiltro, setResumenRealFechaFiltro] = useState('');
    const [resumenGeneralFechaFiltro, setResumenGeneralFechaFiltro] = useState('');

	const resumenRealFiltrado = useMemo(() => {
		if (!resumenRealFechaFiltro) return resumenCierreRealDiario;
		return resumenCierreRealDiario.filter((d) => String(d.fecha || '').slice(0, 10) === resumenRealFechaFiltro);
	}, [resumenCierreRealDiario, resumenRealFechaFiltro]);

	const resumenGeneralFiltrado = useMemo(() => {
		if (!resumenGeneralFechaFiltro) return resumenDiario;
		return resumenDiario.filter((d) => String(d.fecha || '').slice(0, 10) === resumenGeneralFechaFiltro);
	}, [resumenDiario, resumenGeneralFechaFiltro]);

	const totalResumenRealPages = Math.max(1, Math.ceil(resumenRealFiltrado.length / resumenRealRowsPerPage));
	const totalResumenGeneralPages = Math.max(1, Math.ceil(resumenGeneralFiltrado.length / resumenGeneralRowsPerPage));

	useEffect(() => {
		setResumenRealPage(1);
		setResumenRealFechaFiltro('');
	}, [fechaDesde, fechaHasta, resumenCierreRealDiario.length]);

	useEffect(() => {
		setResumenGeneralPage(1);
		setResumenGeneralFechaFiltro('');
	}, [fechaDesde, fechaHasta, resumenDiario.length]);

	useEffect(() => {
		setResumenRealPage(1);
	}, [resumenRealFechaFiltro, resumenRealRowsPerPage]);

	useEffect(() => {
		setResumenGeneralPage(1);
	}, [resumenGeneralFechaFiltro, resumenGeneralRowsPerPage]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(LS_KEY_REAL_ROWS, String(resumenRealRowsPerPage));
	}, [resumenRealRowsPerPage]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(LS_KEY_GENERAL_ROWS, String(resumenGeneralRowsPerPage));
	}, [resumenGeneralRowsPerPage]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(LS_KEY_REAL_SHOW_ALL, resumenRealShowAll ? '1' : '0');
	}, [resumenRealShowAll]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(LS_KEY_GENERAL_SHOW_ALL, resumenGeneralShowAll ? '1' : '0');
	}, [resumenGeneralShowAll]);

	const resumenRealVisible = useMemo(() => {
		if (resumenRealShowAll) return resumenRealFiltrado;
		const start = (resumenRealPage - 1) * resumenRealRowsPerPage;
		return resumenRealFiltrado.slice(start, start + resumenRealRowsPerPage);
	}, [resumenRealFiltrado, resumenRealPage, resumenRealRowsPerPage, resumenRealShowAll]);

	const resumenGeneralVisible = useMemo(() => {
		if (resumenGeneralShowAll) return resumenGeneralFiltrado;
		const start = (resumenGeneralPage - 1) * resumenGeneralRowsPerPage;
		return resumenGeneralFiltrado.slice(start, start + resumenGeneralRowsPerPage);
	}, [resumenGeneralFiltrado, resumenGeneralPage, resumenGeneralRowsPerPage, resumenGeneralShowAll]);

	const renderPager = (currentPage, totalPages, setPage) => (
		<div className="mt-3 flex items-center justify-between gap-2 text-xs text-gray-600">
			<span>Página {currentPage} de {totalPages}</span>
			<div className="flex items-center gap-2">
				<button
					type="button"
					className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
					onClick={() => setPage(Math.max(1, currentPage - 1))}
					disabled={currentPage <= 1}
				>
					Anterior
				</button>
				<button
					type="button"
					className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
					onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
					disabled={currentPage >= totalPages}
				>
					Siguiente
				</button>
			</div>
		</div>
	);

	const renderDailyTools = ({
		rowsPerPage,
		onChangeRows,
		showAll,
		onToggleShowAll,
		fechaFiltro,
		onFechaChange,
		rowsLabel,
		totalRows,
	}) => (
		<div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
			<div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
				<span>{rowsLabel}: {totalRows}</span>
				<label className="inline-flex items-center gap-2">
					<span>Filas</span>
					<select
						className="border border-gray-300 rounded px-2 py-1"
						value={rowsPerPage}
						onChange={(e) => onChangeRows(Number(e.target.value))}
						disabled={showAll}
					>
						{DAILY_ROWS_OPTIONS.map((n) => (
							<option key={n} value={n}>{n}</option>
						))}
					</select>
				</label>
				<button
					type="button"
					className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
					onClick={onToggleShowAll}
				>
					{showAll ? 'Volver a paginado' : 'Ver todo'}
				</button>
			</div>
			<div className="flex items-center gap-2 text-xs text-gray-600">
				<span>Fecha puntual</span>
				<input
					type="date"
					value={fechaFiltro}
					onChange={(e) => onFechaChange(e.target.value)}
					className="border border-gray-300 rounded px-2 py-1"
				/>
				<button
					type="button"
					className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
					onClick={() => onFechaChange('')}
					disabled={!fechaFiltro}
				>
					Limpiar
				</button>
			</div>
		</div>
	);

	const totalPages = Number(paginacion.total_pages || 1);
	const totalRegistros = Number(paginacion.total || 0);
	const fromRegistro = Number(paginacion.from || 0);
	const toRegistro = Number(paginacion.to || 0);
	const safeGoToPage = (event) => {
		const target = Number(event.target.value || 1);
		if (Number.isNaN(target)) return;
		onGoToPage(target);
	};

	const fmtMoney = (value) => `S/ ${Number(value || 0).toFixed(2)}`;
	const fmtMoneyNullable = (value) => (value === null || value === undefined || value === '' ? '-' : `S/ ${Number(value).toFixed(2)}`);
	const kpiCards = [
		{ label: 'Cajas cerradas', value: Number(indicadores.total_cajas || 0), accent: 'text-slate-800' },
		{ label: 'Pendiente de cuadre', value: Number(indicadores.total_pendientes_cuadre || 0), accent: 'text-amber-700' },
		{ label: 'Regularizadas', value: Number(indicadores.total_regularizadas || 0), accent: 'text-emerald-700' },
		{ label: 'Cierre real efectivo (regularizadas)', value: fmtMoney(indicadores.efectivo_real_total), accent: 'text-blue-700' },
		{ label: 'Efectivo esperado (regularizadas)', value: fmtMoney(indicadores.efectivo_esperado_total), accent: 'text-slate-700' },
		{ label: 'Diferencia efectiva', value: fmtMoney(indicadores.diferencia_efectivo_total), accent: Number(indicadores.diferencia_efectivo_total || 0) === 0 ? 'text-emerald-700' : 'text-rose-700' },
		{ label: 'Virtual cobrado (regularizadas)', value: fmtMoney(indicadores.virtual_cobrado_total), accent: 'text-indigo-700' },
		{ label: 'Virtual real (regularizadas)', value: fmtMoney(indicadores.virtual_real_total), accent: 'text-cyan-700' },
	];

	const resumirObservacion = (texto) => {
		const clean = String(texto || '').trim();
		if (!clean) return 'Sin observaciones';
		if (clean.length <= 80) return clean;
		return `${clean.slice(0, 80)}...`;
	};

	const resumen = cajas.reduce((acc, caja) => {
		acc.total_efectivo += parseFloat(caja.total_efectivo || 0);
		acc.total_yape += parseFloat(caja.total_yape || 0);
		acc.total_plin += parseFloat(caja.total_plin || 0);
		acc.total_tarjetas += parseFloat(caja.total_tarjetas || 0);
		acc.total_transferencias += parseFloat(caja.total_transferencias || 0);
		acc.total_egresos += parseFloat(caja.total_egresos || 0);
		acc.ganancia_dia += parseFloat(caja.ganancia_dia || 0);
		return acc;
	}, {
		total_efectivo: 0,
		total_yape: 0,
		total_plin: 0,
		total_tarjetas: 0,
		total_transferencias: 0,
		total_egresos: 0,
		ganancia_dia: 0,
	});

	return (
		<div className="bg-white rounded-lg shadow-md">
			<div className="p-4 border-b border-gray-200">
				<h2 className="text-lg font-semibold text-gray-900">Historial de Cajas Cerradas</h2>
				<p className="text-sm text-gray-600">
					Rango: {fechaDesde || '-'} a {fechaHasta || '-'} | Mostrando {fromRegistro}-{toRegistro} de {totalRegistros}
				</p>
			</div>
			<div className="px-4 py-4 bg-gradient-to-r from-slate-50 to-blue-50 border-b border-gray-100">
				<h3 className="text-sm font-semibold text-gray-800 mb-3">Panel de control del cierre</h3>
				<p className="text-xs text-amber-800 mb-3">
					Los indicadores de cierre real se calculan solo con cajas regularizadas. Las cajas en pendiente de cuadre pueden mostrar montos operativos en "Resumen por dia", pero no suman en este bloque.
				</p>
				<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
					{kpiCards.map((kpi) => (
						<div key={kpi.label} className="rounded-xl border border-white/70 bg-white p-3 shadow-sm">
							<div className="text-[11px] uppercase tracking-wide text-gray-500">{kpi.label}</div>
							<div className={`text-base font-bold ${kpi.accent}`}>{kpi.value}</div>
						</div>
					))}
				</div>
			</div>
			<div className="px-4 py-4 border-b border-gray-100 bg-white">
				<h3 className="text-sm font-semibold text-gray-800 mb-2">Cierre real por día</h3>
				<p className="text-xs text-gray-500 mb-2">
					Este cuadro excluye autocierres pendientes de cuadre real.
				</p>
				{resumenCierreRealDiario.length === 0 ? (
					<p className="text-xs text-gray-500">Sin datos para el rango seleccionado.</p>
				) : (
					<>
						{renderDailyTools({
							rowsPerPage: resumenRealRowsPerPage,
							onChangeRows: setResumenRealRowsPerPage,
							showAll: resumenRealShowAll,
							onToggleShowAll: () => setResumenRealShowAll((v) => !v),
							fechaFiltro: resumenRealFechaFiltro,
							onFechaChange: setResumenRealFechaFiltro,
							rowsLabel: 'Días encontrados',
							totalRows: resumenRealFiltrado.length,
						})}
						<div className="overflow-x-auto">
							<table className="min-w-full text-xs border border-gray-200 rounded">
								<thead className="bg-slate-50">
									<tr>
										<th className="px-2 py-2 text-left">Fecha</th>
										<th className="px-2 py-2 text-right">Cajas</th>
										<th className="px-2 py-2 text-right">Pendientes</th>
										<th className="px-2 py-2 text-right">Regularizadas</th>
										<th className="px-2 py-2 text-right">Efectivo Esperado</th>
										<th className="px-2 py-2 text-right">Efectivo Real</th>
										<th className="px-2 py-2 text-right">Dif. Efectivo</th>
										<th className="px-2 py-2 text-right">Virtual Cobrado</th>
										<th className="px-2 py-2 text-right">Virtual Real</th>
										<th className="px-2 py-2 text-right">Dif. Virtual</th>
									</tr>
								</thead>
								<tbody>
									{resumenRealVisible.map((d) => {
										const difEfectivo = Number(d.diferencia_efectivo_regularizada || 0);
										const difVirtual = Number(d.diferencia_virtual_regularizada || 0);
										return (
											<tr key={`real-${d.fecha}`} className="border-t border-gray-100">
												<td className="px-2 py-2 text-left text-gray-700 font-medium">{d.fecha}</td>
												<td className="px-2 py-2 text-right text-gray-700">{Number(d.total_cajas || 0)}</td>
												<td className="px-2 py-2 text-right text-amber-700">{Number(d.cajas_pendientes_cuadre || 0)}</td>
												<td className="px-2 py-2 text-right text-emerald-700">{Number(d.cajas_regularizadas || 0)}</td>
												<td className="px-2 py-2 text-right text-gray-700">{fmtMoney(d.efectivo_esperado_regularizado)}</td>
												<td className="px-2 py-2 text-right text-gray-700">{fmtMoney(d.efectivo_real_contado)}</td>
												<td className={`px-2 py-2 text-right font-semibold ${difEfectivo === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(difEfectivo)}</td>
												<td className="px-2 py-2 text-right text-gray-700">{fmtMoney(d.virtual_cobrado_regularizado)}</td>
												<td className="px-2 py-2 text-right text-gray-700">{fmtMoney(d.virtual_real_contado)}</td>
												<td className={`px-2 py-2 text-right font-semibold ${difVirtual === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(difVirtual)}</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
						{!resumenRealShowAll ? renderPager(resumenRealPage, totalResumenRealPages, setResumenRealPage) : null}
					</>
				)}
			</div>
			<div className="px-4 py-4 border-b border-gray-100 bg-white">
				<h3 className="text-sm font-semibold text-gray-800 mb-2">Resumen por día</h3>
				{resumenDiario.length === 0 ? (
					<p className="text-xs text-gray-500">Sin datos para el rango seleccionado.</p>
				) : (
					<>
						{renderDailyTools({
							rowsPerPage: resumenGeneralRowsPerPage,
							onChangeRows: setResumenGeneralRowsPerPage,
							showAll: resumenGeneralShowAll,
							onToggleShowAll: () => setResumenGeneralShowAll((v) => !v),
							fechaFiltro: resumenGeneralFechaFiltro,
							onFechaChange: setResumenGeneralFechaFiltro,
							rowsLabel: 'Días encontrados',
							totalRows: resumenGeneralFiltrado.length,
						})}
						<div className="overflow-x-auto">
							<table className="min-w-full text-xs border border-gray-200 rounded">
								<thead className="bg-gray-50">
									<tr>
										<th className="px-2 py-2 text-left">Fecha</th>
										<th className="px-2 py-2 text-right">Cajas</th>
										<th className="px-2 py-2 text-right">Efectivo</th>
										<th className="px-2 py-2 text-right">Yape+Plin</th>
										<th className="px-2 py-2 text-right">Tarj+Transf</th>
										<th className="px-2 py-2 text-right">Egresos</th>
										<th className="px-2 py-2 text-right">Ganancia</th>
										<th className="px-2 py-2 text-right">Diferencia</th>
									</tr>
								</thead>
								<tbody>
									{resumenGeneralVisible.map((d) => (
										<tr key={d.fecha} className="border-t border-gray-100">
											<td className="px-2 py-2 text-left text-gray-700">{d.fecha}</td>
											<td className="px-2 py-2 text-right text-gray-700">{parseInt(d.total_cajas || 0, 10)}</td>
											<td className="px-2 py-2 text-right text-gray-700">S/ {parseFloat(d.total_efectivo || 0).toFixed(2)}</td>
											<td className="px-2 py-2 text-right text-gray-700">S/ {(parseFloat(d.total_yape || 0) + parseFloat(d.total_plin || 0)).toFixed(2)}</td>
											<td className="px-2 py-2 text-right text-gray-700">S/ {(parseFloat(d.total_tarjetas || 0) + parseFloat(d.total_transferencias || 0)).toFixed(2)}</td>
											<td className="px-2 py-2 text-right text-gray-700">S/ {parseFloat(d.total_egresos || 0).toFixed(2)}</td>
											<td className="px-2 py-2 text-right text-gray-700">S/ {parseFloat(d.ganancia_dia || 0).toFixed(2)}</td>
											<td className="px-2 py-2 text-right text-gray-700">S/ {parseFloat(d.diferencia || 0).toFixed(2)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						{!resumenGeneralShowAll ? renderPager(resumenGeneralPage, totalResumenGeneralPages, setResumenGeneralPage) : null}
					</>
				)}
			</div>
			<div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 border-b border-gray-100 bg-gray-50">
				<div className="rounded bg-white p-2 border text-xs">
					<span className="text-gray-500">Efectivo</span>
					<div className="text-sm font-bold text-gray-900">S/ {resumen.total_efectivo.toFixed(2)}</div>
				</div>
				<div className="rounded bg-white p-2 border text-xs">
					<span className="text-gray-500">Yape + Plin</span>
					<div className="text-sm font-bold text-gray-900">S/ {(resumen.total_yape + resumen.total_plin).toFixed(2)}</div>
				</div>
				<div className="rounded bg-white p-2 border text-xs">
					<span className="text-gray-500">Tarjetas + Transferencias</span>
					<div className="text-sm font-bold text-gray-900">S/ {(resumen.total_tarjetas + resumen.total_transferencias).toFixed(2)}</div>
				</div>
				<div className="rounded bg-white p-2 border text-xs">
					<span className="text-gray-500">Egresos / Ganancia</span>
					<div className="text-sm font-bold text-gray-900">S/ {resumen.total_egresos.toFixed(2)} / S/ {resumen.ganancia_dia.toFixed(2)}</div>
				</div>
			</div>
			{/* Vista tipo card en móvil */}
			<div className="block md:hidden p-4">
				{cajas.length === 0 ? (
					<div className="text-center py-8 text-gray-500">No hay cajas cerradas</div>
				) : (
					cajas.map((caja) => (
						<div key={caja.id} className="rounded-xl shadow-lg border border-yellow-100 bg-gradient-to-br from-yellow-50 via-white to-yellow-100 p-4 flex flex-col gap-2 mb-4">
							<div className="flex items-center justify-between mb-2">
								<span className="font-bold text-yellow-800 text-lg">Caja #{caja.id}</span>
								<span className={`px-2 py-1 rounded-full text-xs font-semibold ${parseFloat(caja.diferencia || 0) === 0 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
									Dif.: S/ {parseFloat(caja.diferencia || 0).toFixed(2)}
								</span>
							</div>
							<div className="text-sm text-gray-700 mb-1"><span className="font-bold">Fecha:</span> {caja.fecha}</div>
							<div className="text-sm text-gray-700 mb-1"><span className="font-bold">Usuario:</span> {caja.usuario_nombre || '-'}</div>
							<div className="flex gap-2 text-xs text-gray-500 mb-1">
								<span>Turno: {caja.turno || '-'}</span>
								<span>Hora cierre: {caja.hora_cierre ? caja.hora_cierre.substr(0, 8) : '-'}</span>
							</div>
							<div className="flex gap-2 text-xs text-gray-500 mb-1">
								<span>Monto cierre: <span className="font-bold text-yellow-800">S/ {parseFloat(caja.monto_cierre || 0).toFixed(2)}</span></span>
							</div>
							<div className="text-xs rounded bg-white/80 border border-yellow-200 p-2 text-gray-700">
								<div>Efectivo esperado: <span className="font-semibold">{fmtMoney(Number(caja.monto_contado || 0) - Number(caja.diferencia || 0))}</span></div>
								<div>Efectivo real: <span className="font-semibold">{fmtMoney(caja.monto_contado || 0)}</span></div>
								<div>Virtual real: <span className="font-semibold">{fmtMoney(caja.virtual_contado || 0)}</span></div>
							</div>
							<div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
								<span>Efectivo: S/ {parseFloat(caja.total_efectivo || 0).toFixed(2)}</span>
								<span>Yape: S/ {parseFloat(caja.total_yape || 0).toFixed(2)}</span>
								<span>Plin: S/ {parseFloat(caja.total_plin || 0).toFixed(2)}</span>
								<span>Tarjetas: S/ {parseFloat(caja.total_tarjetas || 0).toFixed(2)}</span>
								<span>Transfer.: S/ {parseFloat(caja.total_transferencias || 0).toFixed(2)}</span>
								<span>Ganancia: S/ {parseFloat(caja.ganancia_dia || 0).toFixed(2)}</span>
							</div>
							<div className="text-xs text-gray-600 bg-white/80 border border-yellow-100 rounded p-2">
								<span className="font-semibold text-gray-700">Observaciones:</span> {resumirObservacion(caja.observaciones_cierre)}
							</div>
							<div className="mt-2 flex justify-end">
								<button
									onClick={() => onReabrir(caja)}
									className={`p-2 rounded-full bg-yellow-600 hover:bg-yellow-700 text-white flex items-center justify-center shadow ${userRole !== 'administrador' ? 'opacity-50 cursor-not-allowed' : ''}`}
									disabled={userRole !== 'administrador'}
									title="Reabrir"
								>
									<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
								</button>
							</div>
						</div>
					))
				)}
				{/* Paginación móvil */}
				<div className="flex justify-center items-center mt-2 gap-2">
					<button
						className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 disabled:opacity-50 hover:bg-yellow-200 transition-colors shadow-sm"
						disabled={page === 1}
						onClick={onPrevPage}
					>Anterior</button>
					<span className="px-3 py-1 text-sm font-medium bg-gray-50 rounded">Página {page} de {totalPages}</span>
					<button
						className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 disabled:opacity-50 hover:bg-yellow-200 transition-colors shadow-sm"
						disabled={page === totalPages}
						onClick={onNextPage}
					>Siguiente</button>
				</div>
			</div>
			{/* Vista tabla en desktop */}
			<div className="hidden md:block">
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-gray-200">
					<thead className="bg-gray-50">
						<tr>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Turno</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">H. Cierre</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Diferencia</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Efectivo</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Yape</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plin</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarjetas</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transferencias</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Egresos</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ganancia</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ef. Esperado Real</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ef. Real Contado</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Observaciones</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
						</tr>
					</thead>
					<tbody className="bg-white divide-y divide-gray-200">
						{cajas.length === 0 ? (
							<tr>
								<td colSpan="18" className="px-4 py-8 text-center text-gray-500">
									No hay cajas cerradas
								</td>
							</tr>
						) : (
							cajas.map((caja) => (
								<tr key={caja.id} className="hover:bg-gray-50">
									<td className="px-4 py-3 text-sm font-medium text-gray-900">{caja.id}</td>
									<td className="px-4 py-3 text-sm text-gray-600">{caja.fecha}</td>
									<td className="px-4 py-3 text-sm text-gray-600">{caja.usuario_nombre || '-'}</td>
									<td className="px-4 py-3 text-sm text-gray-600">{caja.turno || '-'}</td>
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
									<td className="px-4 py-3 text-sm text-gray-600">S/ {parseFloat(caja.total_efectivo || 0).toFixed(2)}</td>
									<td className="px-4 py-3 text-sm text-gray-600">S/ {parseFloat(caja.total_yape || 0).toFixed(2)}</td>
									<td className="px-4 py-3 text-sm text-gray-600">S/ {parseFloat(caja.total_plin || 0).toFixed(2)}</td>
									<td className="px-4 py-3 text-sm text-gray-600">S/ {parseFloat(caja.total_tarjetas || 0).toFixed(2)}</td>
									<td className="px-4 py-3 text-sm text-gray-600">S/ {parseFloat(caja.total_transferencias || 0).toFixed(2)}</td>
									<td className="px-4 py-3 text-sm text-gray-600">S/ {parseFloat(caja.total_egresos || 0).toFixed(2)}</td>
									<td className="px-4 py-3 text-sm text-gray-600">S/ {parseFloat(caja.ganancia_dia || 0).toFixed(2)}</td>
									<td className="px-4 py-3 text-sm text-gray-600">{(caja.monto_contado === null || caja.monto_contado === '' || caja.monto_contado === undefined) ? '-' : fmtMoney(Number(caja.monto_contado || 0) - Number(caja.diferencia || 0))}</td>
									<td className="px-4 py-3 text-sm text-gray-600">{fmtMoneyNullable(caja.monto_contado)}</td>
									<td className="px-4 py-3 text-sm text-gray-600 max-w-[260px]" title={String(caja.observaciones_cierre || '').trim() || 'Sin observaciones'}>
										{resumirObservacion(caja.observaciones_cierre)}
									</td>
									<td className="px-4 py-3 text-sm">
										<button
											onClick={() => onReabrir(caja)}
											className={`bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors ${userRole !== 'administrador' ? 'opacity-50 cursor-not-allowed' : ''}`}
											disabled={userRole !== 'administrador'}
										>
											Reabrir
										</button>
									</td>
								</tr>
							))
						)}
					</tbody>
					</table>
				</div>
				{/* Paginación fuera del scroll horizontal */}
				<div className="flex justify-between items-center mt-4 px-4 pb-4">
					<div className="text-sm text-gray-600">
						Página {page} de {totalPages} | Filas {fromRegistro}-{toRegistro} de {totalRegistros}
					</div>
					<div className="flex items-center gap-2">
						<input
							type="number"
							min={1}
							max={totalPages}
							value={page}
							onChange={safeGoToPage}
							className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
						/>
						<button
							className="btn btn-sm"
							disabled={page === 1}
							onClick={onPrevPage}
						>Anterior</button>
						<button
							className="btn btn-sm"
							disabled={page === totalPages}
							onClick={onNextPage}
						>Siguiente</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export default CajasCerradasTable;
