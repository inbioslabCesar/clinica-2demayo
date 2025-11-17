import React from 'react';

function RowsSelector({ rowsPerPage, setRowsPerPage, setPage }) {
	return (
		<div className="mb-4 flex items-center gap-4">
			<label className="font-semibold">Filas por página:</label>
			<select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }} className="input max-w-[80px]">
				<option value={3}>3</option>
				<option value={5}>5</option>
				<option value={10}>10</option>
			</select>
		</div>
	);
}

export default RowsSelector;
