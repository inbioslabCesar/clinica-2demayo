import React from 'react';

function CajasCerradasTable({ cajas, resumenDiario = [], page, rowsPerPage, userRole, onReabrir, fechaDesde, fechaHasta }) {
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
					Rango: {fechaDesde || '-'} a {fechaHasta || '-'} | Registros: {cajas.length}
				</p>
			</div>
			<div className="px-4 py-4 border-b border-gray-100 bg-white">
				<h3 className="text-sm font-semibold text-gray-800 mb-2">Resumen por día</h3>
				{resumenDiario.length === 0 ? (
					<p className="text-xs text-gray-500">Sin datos para el rango seleccionado.</p>
				) : (
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
								{resumenDiario.map((d) => (
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
					cajas.slice((page - 1) * rowsPerPage, page * rowsPerPage).map((caja) => (
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
									<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
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
						onClick={() => onReabrir('prev')}
					>Anterior</button>
					<span className="px-3 py-1 text-sm font-medium bg-gray-50 rounded">Página {page} de {Math.max(1, Math.ceil(cajas.length / rowsPerPage))}</span>
					<button
						className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 disabled:opacity-50 hover:bg-yellow-200 transition-colors shadow-sm"
						disabled={page === Math.max(1, Math.ceil(cajas.length / rowsPerPage))}
						onClick={() => onReabrir('next')}
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
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Observaciones</th>
							<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
						</tr>
					</thead>
					<tbody className="bg-white divide-y divide-gray-200">
						{cajas.length === 0 ? (
							<tr>
								<td colSpan="16" className="px-4 py-8 text-center text-gray-500">
									No hay cajas cerradas
								</td>
							</tr>
						) : (
							cajas.slice((page - 1) * rowsPerPage, page * rowsPerPage).map((caja) => (
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
									<td className="px-4 py-3 text-sm text-gray-600 max-w-[260px]" title={String(caja.observaciones_cierre || '').trim() || 'Sin observaciones'}>
										{resumirObservacion(caja.observaciones_cierre)}
									</td>
									<td className="px-4 py-3 text-sm">
										<button
											onClick={() => onReabrir(caja)}
											className={`bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors ${userRole !== 'administrador' ? 'opacity-50 cursor-not-allowed' : ''}`}
											disabled={userRole !== 'administrador'}
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
				{/* Paginación fuera del scroll horizontal */}
				<div className="flex justify-between items-center mt-4 px-4 pb-4">
					<div>
						Página {page} de {Math.max(1, Math.ceil(cajas.length / rowsPerPage))}
					</div>
					<div className="flex gap-2">
						<button
							className="btn btn-sm"
							disabled={page === 1}
							onClick={() => onReabrir('prev')}
						>Anterior</button>
						<button
							className="btn btn-sm"
							disabled={page === Math.max(1, Math.ceil(cajas.length / rowsPerPage))}
							onClick={() => onReabrir('next')}
						>Siguiente</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export default CajasCerradasTable;
