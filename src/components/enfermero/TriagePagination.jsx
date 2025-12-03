import { Icon } from '@fluentui/react';

export default function TriagePagination({ totalRows, totalPages, startIdx, endIdx, page, setPage }) {
  if (totalPages <= 1) return null;
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Mostrando {startIdx + 1} - {Math.min(endIdx, totalRows)} de {totalRows} pacientes
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setPage(page - 1)} 
            disabled={page === 1} 
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 text-gray-700 rounded-xl transition-all duration-300 disabled:cursor-not-allowed"
          >
            <Icon iconName="ChevronLeft" className="text-lg" />
            <span className="hidden sm:inline">Anterior</span>
          </button>
          <div className="flex items-center gap-1">
            <span className="px-3 py-2 text-sm font-medium text-gray-600">
              Página {page} de {totalPages}
            </span>
          </div>
          <button 
            onClick={() => setPage(page + 1)} 
            disabled={page === totalPages} 
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 text-gray-700 rounded-xl transition-all duration-300 disabled:cursor-not-allowed"
          >
            <span className="hidden sm:inline">Siguiente</span>
            <Icon iconName="ChevronRight" className="text-lg" />
          </button>
        </div>
      </div>
    </div>
  );
}
