import React from 'react';

function RowsSelector({ rowsPerPage, onChangeRows }) {
	return (
		<div className="mb-4 flex items-center gap-4">
			<label className="font-semibold">Filas por página:</label>
			<select value={rowsPerPage} onChange={e => onChangeRows(Number(e.target.value))} className="input max-w-[90px]">
				<option value={10}>10</option>
				<option value={25}>25</option>
				<option value={50}>50</option>
				<option value={100}>100</option>
			</select>
		</div>
	);
}

export default RowsSelector;
