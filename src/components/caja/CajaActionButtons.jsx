import React from "react";

export default function CajaActionButtons({ cajaAbierta, usuario, setShowModal }) {
  const userRole = usuario?.rol || sessionStorage.getItem('user_role') || localStorage.getItem('user_role');
  return (
    <div className="mb-6 flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4 w-full">
      {!cajaAbierta && usuario && (
        <button
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 text-white font-semibold px-6 py-2 rounded-lg shadow-lg transition-all duration-200 hover:scale-105 hover:from-blue-600 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
          onClick={() => setShowModal(true)}
        >
          Abrir Caja
        </button>
      )}
      {cajaAbierta && usuario && (
        <button
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-red-500 via-red-600 to-red-700 text-white font-semibold px-6 py-2 rounded-lg shadow-lg transition-all duration-200 hover:scale-105 hover:from-red-600 hover:to-red-800 focus:outline-none focus:ring-2 focus:ring-red-400"
          onClick={() => window.location.href = "/contabilidad/cerrar-caja"}
        >
          Cerrar Caja
        </button>
      )}
      <button
        className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 text-white font-semibold px-6 py-2 rounded-lg shadow-lg transition-all duration-200 hover:scale-105 hover:from-orange-500 hover:to-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
        onClick={() => window.location.href = "/contabilidad/egresos"}
      >
        Ir a Egresos
      </button>
      {userRole === 'administrador' && (
        <button
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 via-purple-600 to-purple-700 text-white font-semibold px-6 py-2 rounded-lg shadow-lg transition-all duration-200 hover:scale-105 hover:from-purple-600 hover:to-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-400"
          onClick={() => window.location.href = "/admin/dashboard-estadisticas"}
        >
          📊 Dashboard Estadístico
        </button>
      )}
    </div>
  );
}
