import React, { useEffect, useMemo, useState } from "react";

import { authFetch } from "../../utils/apiClient";
import AperturaCajaForm from "./AperturaCajaForm";
import Modal from "../comunes/Modal";
import CajaActionButtons from "./CajaActionButtons";
import CajaResumenDiario from "./CajaResumenDiario";
import CajaRecepcionistasResumen from "./CajaRecepcionistasResumen";
import ModalCorregirApertura from "./ModalCorregirApertura";


export default function CajaAdminDashboard() {
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cajaAbierta, setCajaAbierta] = useState(false);
  const [cajaActual, setCajaActual] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showCorregirAperturaModal, setShowCorregirAperturaModal] = useState(false);
  // ...existing code...

  // Función para cargar resumen (reutilizable)
  const fetchResumen = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const resp = await authFetch("api_resumen_diario.php");
      const data = await resp.json();
      if (data.success) {
        setResumen(data);
        setError("");
        const abierta = data.caja_abierta === true || data.caja_abierta === 1;
        setCajaAbierta(abierta);

        if (abierta) {
          try {
            const rCaja = await authFetch("api_caja_actual.php", { cache: "no-store" });
            const dataCaja = await rCaja.json();
            if (dataCaja?.success && dataCaja?.caja) {
              setCajaActual(dataCaja.caja);
            } else {
              setCajaActual(null);
            }
          } catch {
            setCajaActual(null);
          }
        } else {
          setCajaActual(null);
        }
      } else {
        if (!silent) {
          setError(data.error || "Error al cargar resumen");
        }
      }
    } catch {
      if (!silent) {
        setError("Error de conexión");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    const usuarioSession = JSON.parse(sessionStorage.getItem("usuario") || "{}");
    setUsuario(usuarioSession);
    fetchResumen();

    const timerId = window.setInterval(() => {
      fetchResumen({ silent: true });
    }, 10000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  const cajasRecepcionistas = useMemo(() => {
    if (!Array.isArray(resumen?.cajas_resumen)) return [];
    return resumen.cajas_resumen.filter((caja) => {
      const rol = (caja.usuario_rol || caja.rol || caja.user_rol || "").toString().toLowerCase();
      return rol.includes("recepcionista");
    });
  }, [resumen]);

  const consolidadoRecepcion = useMemo(() => {
    const totalIngresos = cajasRecepcionistas.reduce((acc, caja) => acc + Number(caja?.total_caja || 0), 0);
    const totalGanancia = cajasRecepcionistas.reduce((acc, caja) => acc + Number(caja?.ganancia_dia || 0), 0);
    const cajasAbiertas = cajasRecepcionistas.filter((caja) => String(caja?.estado || "").toLowerCase() === "abierta").length;
    const usuariosUnicos = new Set(cajasRecepcionistas.map((caja) => String(caja?.usuario_id || "")).filter(Boolean)).size;
    return {
      totalIngresos,
      totalGanancia,
      cajasAbiertas,
      usuariosUnicos,
    };
  }, [cajasRecepcionistas]);

  const controlRealRecepcion = useMemo(() => {
    const cajasPendientesRegularizacion = cajasRecepcionistas.filter((caja) => {
      const estado = String(caja?.estado || "").toLowerCase();
      return estado === "cerrada" && Number(caja?.cierre_pendiente_cuadre || 0) === 1;
    });

    const cajasCerradas = cajasRecepcionistas.filter((caja) => {
      const estado = String(caja?.estado || "").toLowerCase();
      return estado === "cerrada" && Number(caja?.control_real_disponible || 0) === 1 && Number(caja?.cierre_pendiente_cuadre || 0) !== 1;
    });

    const cajasConCuadreEfectivo = cajasCerradas.filter((caja) => Math.abs(Number(caja?.diferencia || 0)) < 0.01).length;
    const cajasConVirtualRegistrado = cajasCerradas.filter((caja) => caja?.diferencia_virtual_cierre !== null && caja?.diferencia_virtual_cierre !== undefined).length;
    const cajasConCuadreVirtual = cajasCerradas.filter((caja) => {
      const dv = caja?.diferencia_virtual_cierre;
      return dv !== null && dv !== undefined && Math.abs(Number(dv || 0)) < 0.01;
    }).length;
    const diferenciaEfectivoTotal = cajasCerradas.reduce((acc, caja) => acc + Number(caja?.diferencia || 0), 0);
    const diferenciaVirtualTotal = cajasCerradas.reduce((acc, caja) => {
      const dv = caja?.diferencia_virtual_cierre;
      return acc + (dv === null || dv === undefined ? 0 : Number(dv || 0));
    }, 0);
    const efectivoEsperadoTotal = cajasCerradas.reduce((acc, caja) => acc + Number(caja?.efectivo_esperado_cierre || 0), 0);
    const efectivoContadoTotal = cajasCerradas.reduce((acc, caja) => acc + Number(caja?.monto_contado || 0), 0);
    const virtualCobradoTotal = cajasCerradas.reduce((acc, caja) => acc + Number(caja?.virtual_cobrado_cierre || 0), 0);
    const virtualContadoTotal = cajasCerradas.reduce((acc, caja) => {
      const vc = caja?.virtual_contado_cierre;
      return acc + (vc === null || vc === undefined ? 0 : Number(vc || 0));
    }, 0);

    return {
      cajasCerradas: cajasCerradas.length,
      cajasPendientesRegularizacion: cajasPendientesRegularizacion.length,
      cajasConCuadreEfectivo,
      cajasConVirtualRegistrado,
      cajasConCuadreVirtual,
      diferenciaEfectivoTotal,
      diferenciaVirtualTotal,
      efectivoEsperadoTotal,
      efectivoContadoTotal,
      virtualCobradoTotal,
      virtualContadoTotal,
    };
  }, [cajasRecepcionistas]);

  const esAdmin = String(usuario?.rol || "").toLowerCase() === "administrador";
  const estadoCajaTexto = cajaAbierta ? "Caja abierta" : "Caja cerrada";
  const estadoCajaClass = cajaAbierta
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-100 text-slate-700";
  const cajasSinCuadreEfectivo = Math.max(0, Number(controlRealRecepcion?.cajasCerradas || 0) - Number(controlRealRecepcion?.cajasConCuadreEfectivo || 0));
  const cajasPendienteCuadreTotal = cajasSinCuadreEfectivo + Number(controlRealRecepcion?.cajasPendientesRegularizacion || 0);

  if (loading)
    return <div className="p-8 text-center">Cargando resumen...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!resumen) return null;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="h-fit rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-lg xl:sticky xl:top-4">
          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Estado actual</div>
            <div className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${estadoCajaClass}`}>{estadoCajaTexto}</div>
            <div className="mt-2 text-xs text-slate-600">Responsable: {cajaActual?.usuario_nombre || usuario?.nombre || "Sin asignar"}</div>
          </div>

          <CajaActionButtons
            cajaAbierta={cajaAbierta}
            usuario={usuario}
            setShowModal={setShowModal}
            onCorregirApertura={() => setShowCorregirAperturaModal(true)}
          />
        </aside>

        <main className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-100 p-3 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Ingresos recep.</div>
              <div className="mt-1 text-2xl font-black text-cyan-900">S/ {Number(consolidadoRecepcion.totalIngresos || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-100 p-3 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Ganancia recep.</div>
              <div className="mt-1 text-2xl font-black text-emerald-900">S/ {Number(consolidadoRecepcion.totalGanancia || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-100 p-3 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Cajas cerradas</div>
              <div className="mt-1 text-2xl font-black text-violet-900">{Number(controlRealRecepcion.cajasCerradas || 0)}</div>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-orange-100 p-3 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Pendiente de cuadre</div>
              <div className="mt-1 text-2xl font-black text-rose-900">{cajasPendienteCuadreTotal}</div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-lg sm:p-4">
            <CajaResumenDiario
              resumen={resumen}
              adminRecepConsolidado={esAdmin ? consolidadoRecepcion : null}
              adminControlRealConsolidado={esAdmin ? controlRealRecepcion : null}
            />
          </div>

          {esAdmin && (
            <div className="rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-lg sm:p-4">
              <CajaRecepcionistasResumen cajasRecep={cajasRecepcionistas} />
            </div>
          )}
        </main>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <div className="p-2 sm:p-4">
          <h3 className="text-lg font-bold text-blue-800 mb-4">Apertura de Caja</h3>
          <AperturaCajaForm
            usuario={usuario}
            onApertura={async () => {
              setShowModal(false);
              await fetchResumen();
            }}
          />
        </div>
      </Modal>
      <ModalCorregirApertura
        open={showCorregirAperturaModal}
        cajaActual={cajaActual}
        usuario={usuario}
        onClose={() => setShowCorregirAperturaModal(false)}
        onUpdated={fetchResumen}
      />
    </div>
  );
}