import React, { useEffect, useState } from 'react';
import { BASE_URL } from '../../config/config';
import HistorialReaperturas from './HistorialReaperturas';
import RowsSelector from './RowsSelector';

const HistorialReaperturasPage = () => {
	const [historial, setHistorial] = useState([]);
	const [loading, setLoading] = useState(true);
	const [rowsPerPage, setRowsPerPage] = useState(3);
	const [page, setPage] = useState(1);

	useEffect(() => {
		const fetchHistorial = async () => {
			try {
				setLoading(true);
				const response = await fetch(BASE_URL + 'api_cajas_cerradas.php', {
					credentials: 'include'
				});
				if (response.ok) {
					const data = await response.json();
					if (data.success) {
						setHistorial(data.historial_reaperturas || []);
					}
				}
			} catch (error) {
				console.error('Error al cargar historial:', error);
			} finally {
				setLoading(false);
			}
		};
		fetchHistorial();
	}, []);

	return (
		<div className="min-h-screen bg-gray-50 p-4">
			<div className="w-full max-w-2xl mx-auto">
				<div className="bg-white rounded-lg shadow-md p-6 mb-6">
					<h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center">
						<svg className="w-8 h-8 mr-3 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
						</svg>
						Historial de Reaperturas
					</h1>
					<p className="text-gray-600">Listado completo de reaperturas de caja</p>
				</div>
				{loading ? (
					<div className="text-center py-12">
						<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-600 mx-auto mb-4"></div>
						<p className="text-gray-600">Cargando historial...</p>
					</div>
				) : (
					<>
						<div className="w-full flex flex-col items-end mb-4">
							<RowsSelector rowsPerPage={rowsPerPage} setRowsPerPage={setRowsPerPage} setPage={setPage} />
						</div>
						<HistorialReaperturas historial={historial.slice((page-1)*rowsPerPage, page*rowsPerPage)} />
						{/* Paginación */}
						<div className="flex justify-between items-center mt-4">
							<div>
								Página {page} de {Math.max(1, Math.ceil(historial.length / rowsPerPage))}
							</div>
							<div className="flex gap-2">
								<button
									className="btn btn-sm"
									disabled={page === 1}
									onClick={() => setPage(page > 1 ? page - 1 : 1)}
								>Anterior</button>
								<button
									className="btn btn-sm"
									disabled={page === Math.max(1, Math.ceil(historial.length / rowsPerPage))}
									onClick={() => setPage(page < Math.ceil(historial.length / rowsPerPage) ? page + 1 : page)}
								>Siguiente</button>
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	);
};

export default HistorialReaperturasPage;
