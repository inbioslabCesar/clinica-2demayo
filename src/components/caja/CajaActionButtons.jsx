import React from "react";
import { useNavigate } from "react-router-dom";

export default function CajaActionButtons({ cajaAbierta, usuario, setShowModal, onCorregirApertura }) {
  const navigate = useNavigate();
  const userRole = usuario?.rol || sessionStorage.getItem('user_role') || localStorage.getItem('user_role');

  const baseBtn = "w-full rounded-2xl px-4 py-3 text-left font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl";

  return (
    <div className="w-full space-y-3">
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Caja</div>
        <div className="grid grid-cols-1 gap-2">
          {!cajaAbierta && usuario && (
            <button
              className={`${baseBtn} bg-gradient-to-r from-cyan-600 to-blue-700`}
              onClick={() => setShowModal(true)}
            >
              <div className="text-xs text-cyan-100">Operación principal</div>
              <div className="text-sm">Abrir caja</div>
            </button>
          )}
          {cajaAbierta && usuario && (
            <button
              className={`${baseBtn} bg-gradient-to-r from-rose-600 to-red-700`}
              onClick={() => navigate("/contabilidad/cerrar-caja")}
            >
              <div className="text-xs text-rose-100">Operación principal</div>
              <div className="text-sm">Cerrar caja y cuadrar</div>
            </button>
          )}
          {cajaAbierta && usuario && (
            <button
              className={`${baseBtn} bg-gradient-to-r from-amber-500 to-orange-600`}
              onClick={() => onCorregirApertura && onCorregirApertura()}
            >
              <div className="text-xs text-amber-100">Ajuste operativo</div>
              <div className="text-sm">Corregir apertura</div>
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Navegación</div>
        <div className="grid grid-cols-1 gap-2">
          <button
            className={`${baseBtn} bg-gradient-to-r from-orange-500 to-amber-600`}
            onClick={() => navigate("/contabilidad/egresos")}
          >
            <div className="text-xs text-orange-100">Finanzas</div>
            <div className="text-sm">Ir a egresos</div>
          </button>
          {userRole === 'administrador' && (
            <button
              className={`${baseBtn} bg-gradient-to-r from-slate-600 to-slate-700`}
              onClick={() => navigate("/reabrir-caja")}
            >
              <div className="text-xs text-slate-100">Auditoría</div>
              <div className="text-sm">Historial y reaperturas</div>
            </button>
          )}
          {userRole === 'administrador' && (
            <button
              className={`${baseBtn} bg-gradient-to-r from-violet-600 to-fuchsia-700`}
              onClick={() => navigate("/admin/dashboard-estadisticas")}
            >
              <div className="text-xs text-violet-100">Analítica</div>
              <div className="text-sm">Dashboard estadístico</div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
