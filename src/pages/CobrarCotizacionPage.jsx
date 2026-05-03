import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import CobroModuloFinal from "../components/cobro/CobroModuloFinal";
import Spinner from "../components/comunes/Spinner";
import { authFetch } from "../utils/apiClient";

const serviceKeyMap = {
  laboratorio: "laboratorio",
  rayosx: "rayosx",
  rayos_x: "rayosx",
  rx: "rayosx",
  ecografia: "ecografia",
  operacion: "operacion",
  operaciones: "operacion",
  procedimiento: "procedimiento",
  procedimientos: "procedimiento",
  farmacia: "farmacia",
  consulta: "consulta",
};

function normalizarServicioKey(value) {
  const base = String(value || "").toLowerCase();
  return serviceKeyMap[base] || "procedimiento";
}

export default function CobrarCotizacionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cotizacionId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cotizacion, setCotizacion] = useState(null);
  const [cotizacionesSeleccionadas, setCotizacionesSeleccionadas] = useState([]);
  const [paciente, setPaciente] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [montoAbonoInput, setMontoAbonoInput] = useState("");
  const [modoCobro, setModoCobro] = useState("completo");
  const blockedNoticeShownRef = useRef(false);
  const criterioImputacion = "fifo";
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const cotizacionIds = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const idsParam = String(params.get("ids") || "").trim();
    const ids = [];
    if (Number(cotizacionId) > 0) {
      ids.push(Number(cotizacionId));
    }
    if (idsParam) {
      ids.push(...idsParam.split(",").map((value) => Number(String(value).trim())));
    }
    return Array.from(new Set(ids.filter((value) => Number.isFinite(value) && value > 0)));
  }, [cotizacionId, location.search]);
  const esCobroUnificado = cotizacionIds.length > 1;
  const themePrimarySoft = {
    backgroundColor: "var(--color-primary-light)",
    borderColor: "var(--color-primary-light)",
    color: "var(--color-primary-dark)",
  };

  useEffect(() => {
    let mounted = true;

    const cargar = async () => {
      setLoading(true);
      setError("");
      try {
        const cacheBuster = Date.now();
        const cargas = await Promise.all(
          cotizacionIds.map(async (id) => {
            const [dataCot, dataPagos] = await Promise.all([
              authFetch(`api_cotizaciones.php?cotizacion_id=${Number(id)}&_t=${cacheBuster}`, {
                cache: "no-store",
              }).then((res) => res.json()),
              authFetch(`api_cotizaciones.php?accion=pagos&cotizacion_id=${Number(id)}&_t=${cacheBuster}`, {
                cache: "no-store",
              }).then((res) => res.json()),
            ]);

            if (!dataCot?.success || !dataCot?.cotizacion) {
              throw new Error(dataCot?.error || `No se pudo cargar la cotización #${id}`);
            }

            return {
              cotizacion: dataCot.cotizacion,
              pagos: Array.isArray(dataCot?.cotizacion?.pagos)
                ? dataCot.cotizacion.pagos
                : (dataPagos?.success && Array.isArray(dataPagos.pagos) ? dataPagos.pagos : []),
            };
          })
        );

        if (!mounted) return;

        const cotizacionesCargadas = cargas.map((item) => item.cotizacion);
        const pacientesIds = Array.from(new Set(cotizacionesCargadas.map((item) => Number(item?.paciente_id || 0)).filter((id) => id > 0)));
        if (pacientesIds.length > 1) {
          throw new Error("Las cotizaciones seleccionadas pertenecen a pacientes distintos.");
        }

        const cotBase = cotizacionesCargadas[0] || null;
        const nombreTemporal = String(cotBase?.nombre || "").trim();
        const apellidoTemporal = String(cotBase?.apellido || "").trim();
        const nombreCompletoTemporal = `${nombreTemporal} ${apellidoTemporal}`.trim();
        const pacienteCotizacion = {
          id: Number(cotBase?.paciente_id || 0) || null,
          nombre: nombreCompletoTemporal || "Particular",
          apellido: "",
          dni: String(cotBase?.dni || "").trim(),
          historia_clinica: String(cotBase?.historia_clinica || "").trim(),
        };

        const total = cotizacionesCargadas.reduce((acc, item) => acc + Number(item?.total || 0), 0);
        const totalPagado = cotizacionesCargadas.reduce((acc, item) => acc + Number(item?.total_pagado || 0), 0);
        const saldoPendiente = cotizacionesCargadas.reduce((acc, item) => {
          const saldo = Number(item?.saldo_pendiente);
          if (Number.isFinite(saldo)) {
            return acc + Math.max(0, saldo);
          }
          return acc + Math.max(0, Number(item?.total || 0) - Number(item?.total_pagado || 0));
        }, 0);
        const cotizacionMaster = cotBase
          ? {
              ...cotBase,
              id: Number(cotBase.id || cotizacionIds[0] || 0),
              ids: cotizacionIds,
              es_unificado: cotizacionIds.length > 1,
              total,
              total_pagado: totalPagado,
              saldo_pendiente: saldoPendiente,
              estado: saldoPendiente <= 0 ? "pagado" : (totalPagado > 0 ? "parcial" : "pendiente"),
            }
          : null;

        const pagosFinal = cargas
          .flatMap(({ cotizacion: cot, pagos: pagosCot }) => (Array.isArray(pagosCot) ? pagosCot : []).map((pago) => ({
            ...pago,
            cotizacion_id: Number(cot?.id || 0),
          })))
          .sort((a, b) => String(b?.created_at || "").localeCompare(String(a?.created_at || "")));

        setCotizacionesSeleccionadas(cotizacionesCargadas);
        setSelectedIds(new Set(cotizacionesCargadas.map((c) => String(c.id))));
        setCotizacion(cotizacionMaster);
        setPaciente(pacienteCotizacion);
        setPagos(pagosFinal);
      } catch (err) {
        if (!mounted) return;
        setError(err?.message || "Error al cargar datos de cobro");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    cargar();
    return () => {
      mounted = false;
    };
  }, [cotizacionIds]);

  useEffect(() => {
    if (loading) return;
    if (cotizacionIds.length !== 1) return;

    const baseId = Number(cotizacionIds[0] || 0);
    if (baseId <= 0) return;

    let cancelled = false;
    const resolverGrupo = async () => {
      try {
        const res = await authFetch(
          `api_cotizaciones.php?accion=sugerir_grupo_cobro&cotizacion_id=${baseId}&_t=${Date.now()}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (cancelled || !data?.success || !Array.isArray(data.ids)) return;

        const sugeridos = Array.from(
          new Set(
            data.ids
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value) && value > 0)
          )
        );

        if (sugeridos.length <= 1) return;

        const query = `?ids=${sugeridos.join(",")}`;
        navigate(`/cobrar-cotizacion/${Number(sugeridos[0])}${query}`, { replace: true });
      } catch {
        // Si falla la sugerencia, mantener el flujo normal de cobro individual.
      }
    };

    resolverGrupo();
    return () => {
      cancelled = true;
    };
  }, [loading, cotizacionIds, navigate]);

  const cotizacionesActivas = useMemo(() => {
    if (selectedIds.size === 0) return cotizacionesSeleccionadas;
    return cotizacionesSeleccionadas.filter((c) => selectedIds.has(String(c.id)));
  }, [cotizacionesSeleccionadas, selectedIds]);

  const saldoBaseActivo = useMemo(() => {
    return cotizacionesActivas.reduce((acc, c) => {
      const s = Number(c?.saldo_pendiente);
      return acc + (Number.isFinite(s) ? Math.max(0, s) : Math.max(0, Number(c?.total || 0) - Number(c?.total_pagado || 0)));
    }, 0);
  }, [cotizacionesActivas]);

  const detallesCotizacionActivos = useMemo(() => {
    return cotizacionesActivas.flatMap((cot) => {
      const detalles = Array.isArray(cot?.detalles) ? cot.detalles : [];
      return detalles
        .filter((d) => {
          const estadoItem = String(d?.estado_item || "activo").toLowerCase();
          return estadoItem !== "eliminado" && Number(d?.cantidad || 0) > 0;
        })
        .map((d) => ({
          cotizacion_detalle_id: Number(d.id) || null,
          detalle_id: Number(d.id) || null,
          servicio_tipo: normalizarServicioKey(d.servicio_tipo),
          servicio_id: Number(d.servicio_id) || null,
          tarifa_id: Number(d.servicio_id) || null,
          descripcion: d.descripcion || "Servicio",
          cantidad: Number(d.cantidad) || 1,
          precio_unitario: Number(d.precio_unitario) || 0,
          subtotal: Number(d.subtotal) || (Number(d.precio_unitario) || 0) * (Number(d.cantidad) || 1),
          cotizacion_id: Number(d.cotizacion_id || cot?.id || 0),
          consulta_id: Number(d.consulta_id) || null,
          derivado: Boolean(d.derivado),
          tipo_derivacion: d.tipo_derivacion || "",
          valor_derivacion: Number(d.valor_derivacion || 0),
          laboratorio_referencia: d.laboratorio_referencia || "",
          medico_id: d.medico_id || null,
          medico_nombre_completo: d.medico_nombre_completo || undefined,
          medico_nombre: d.medico_nombre || undefined,
          medico_apellido: d.medico_apellido || undefined,
          medico_especialidad: d.especialidad || d.medico_especialidad || undefined,
        }));
    });
  }, [cotizacionesActivas]);

  const totalDetallesActivos = useMemo(() => {
    return detallesCotizacionActivos.reduce((acc, d) => acc + Number(d.subtotal || 0), 0);
  }, [detallesCotizacionActivos]);

  const saldoPendiente = useMemo(() => {
    // Para cobro unificado, usar el saldo filtrado de las cotizaciones activas seleccionadas
    if (esCobroUnificado && saldoBaseActivo > 0) return saldoBaseActivo;
    const estadoCot = String(cotizacion?.estado || "").toLowerCase();
    const saldo = Number(cotizacion?.saldo_pendiente);
    if (Number.isFinite(saldo)) {
      const saldoNormalizado = Math.max(0, saldo);
      if (saldoNormalizado > 0) return saldoNormalizado;

      // Compatibilidad: recuperar cotizaciones antiguas o inconsistentes
      // que quedaron en pendiente/parcial con saldo en cero.
      if (saldoNormalizado === 0 && ["pendiente", "parcial"].includes(estadoCot)) {
        const totalCotizacion = Number(cotizacion?.total);
        const totalPagado = Number(cotizacion?.total_pagado);
        if (Number.isFinite(totalCotizacion) && totalCotizacion > 0) {
          const saldoEstimado = Number.isFinite(totalPagado)
            ? Math.max(0, totalCotizacion - totalPagado)
            : Math.max(0, totalCotizacion);
          if (saldoEstimado > 0) return saldoEstimado;
        }
        if (totalDetallesActivos > 0) return Math.max(0, totalDetallesActivos);
      }

      return 0;
    }

    const totalCotizacion = Number(cotizacion?.total);
    const totalPagado = Number(cotizacion?.total_pagado);
    if (Number.isFinite(totalCotizacion) && Number.isFinite(totalPagado)) {
      return Math.max(0, totalCotizacion - totalPagado);
    }

    return Math.max(0, totalDetallesActivos);
  }, [cotizacion?.saldo_pendiente, cotizacion?.estado, cotizacion?.total, cotizacion?.total_pagado, totalDetallesActivos, esCobroUnificado, saldoBaseActivo]);

  useEffect(() => {
    if (!Number.isFinite(Number(saldoPendiente)) || Number(saldoPendiente) <= 0) {
      setMontoAbonoInput("");
      return;
    }
    setMontoAbonoInput((prev) => {
      const prevNum = Number(prev);
      if (Number.isFinite(prevNum) && prevNum > 0) {
        const capped = Math.min(prevNum, Number(saldoPendiente));
        return capped.toFixed(2);
      }
      return Number(saldoPendiente).toFixed(2);
    });
  }, [saldoPendiente, cotizacion?.id]);

  const montoObjetivoCobro = useMemo(() => {
    const saldo = Math.max(0, Number(saldoPendiente || 0));
    if (modoCobro !== "parcial") return saldo;
    const monto = Number(montoAbonoInput);
    if (!Number.isFinite(monto) || monto <= 0) return saldo;
    return Math.min(monto, saldo);
  }, [montoAbonoInput, saldoPendiente, modoCobro]);

  const detallesCobro = useMemo(() => {
    if (!detallesCotizacionActivos.length) return [];

    const totalBase = Number(totalDetallesActivos || 0);
    const saldoObjetivo = Math.max(0, Number(montoObjetivoCobro || 0));

    if (!Number.isFinite(totalBase) || totalBase <= 0) {
      return detallesCotizacionActivos;
    }

    // Si el saldo cubre todo, cobrar todos los ítems tal cual.
    if (saldoObjetivo >= totalBase) {
      return detallesCotizacionActivos;
    }

    // Reparte el pago histórico por orden de detalle (FIFO/LIFO configurable):
    // evita prorrateos artificiales como 8.33/1.67 cuando el pendiente real
    // corresponde a un ítem específico.
    let pagadoRestante = Math.max(0, Number(cotizacion?.total_pagado || 0));
    const source = criterioImputacion === "lifo"
      ? [...detallesCotizacionActivos].reverse()
      : detallesCotizacionActivos;
    const pendientes = [];

    for (const item of source) {
      const subtotalItem = Math.max(0, Number(item.subtotal || 0));
      const pagadoEnItem = Math.min(subtotalItem, pagadoRestante);
      const pendienteItem = Number((subtotalItem - pagadoEnItem).toFixed(2));
      pagadoRestante = Number((pagadoRestante - pagadoEnItem).toFixed(2));

      if (pendienteItem > 0) {
        const cantidadOriginal = Math.max(1, Number(item.cantidad || 1));
        const precioPendiente = Number((pendienteItem / cantidadOriginal).toFixed(2));
        pendientes.push({
          ...item,
          precio_unitario: precioPendiente,
          subtotal: pendienteItem,
        });
      }
    }

    // Salvaguarda: si por redondeo no quedaron pendientes calculados,
    // usar el enfoque previo de un solo ítem por saldo.
    if (!pendientes.length && saldoObjetivo > 0) {
      const primero = source[0];
      return [{
        ...primero,
        cantidad: 1,
        precio_unitario: saldoObjetivo,
        subtotal: saldoObjetivo,
      }];
    }

    // Si el usuario eligió un adelanto menor al saldo pendiente, recorta
    // el cobro al monto objetivo respetando el orden FIFO/LIFO.
    const pendientesRecortados = [];
    let restante = Number(saldoObjetivo.toFixed(2));
    for (const item of pendientes) {
      if (restante <= 0) break;
      const subtotalItem = Math.max(0, Number(item.subtotal || 0));
      const montoAplicado = Math.min(subtotalItem, restante);
      if (montoAplicado <= 0) continue;
      const cantidadBase = Math.max(1, Number(item.cantidad || 1));
      const precioAplicado = Number((montoAplicado / cantidadBase).toFixed(2));
      pendientesRecortados.push({
        ...item,
        precio_unitario: precioAplicado,
        subtotal: Number(montoAplicado.toFixed(2)),
      });
      restante = Number((restante - montoAplicado).toFixed(2));
    }

    return pendientesRecortados;
  }, [detallesCotizacionActivos, totalDetallesActivos, montoObjetivoCobro, cotizacion?.total_pagado, criterioImputacion]);

  const totalCobro = useMemo(() => {
    return detallesCobro.reduce((acc, d) => acc + Number(d.subtotal || 0), 0);
  }, [detallesCobro]);

  const estado = String(cotizacion?.estado || "").toLowerCase();
  const esEstadoBloqueado = estado === "anulada" || estado === "pagado";

  const servicioPago = useMemo(() => {
    const tipos = Array.from(new Set(detallesCobro.map((detalle) => normalizarServicioKey(detalle?.servicio_tipo || "")).filter(Boolean)));
    const key = tipos.length === 1 ? tipos[0] : "mixto";
    const activeIdList = [...selectedIds].map(Number).filter((n) => n > 0);
    const isMulti = activeIdList.length > 1;
    return {
      key,
      label: isMulti
        ? `Cobro unificado de cotizaciones ${activeIdList.map((id) => `#${id}`).join(", ")}`
        : `Cobro de cotización #${activeIdList[0] || cotizacion?.id || ""}`.trim(),
      cotizacion_id: Number(activeIdList[0] || cotizacion?.id || 0),
      cotizacion_ids: activeIdList,
    };
  }, [cotizacion?.id, selectedIds, detallesCobro]);

  const recargarCotizacion = async () => {
    try {
      const cacheBuster = Date.now();
      const res = await authFetch(
        `api_cotizaciones.php?cotizacion_id=${Number(cotizacion?.id)}&_t=${cacheBuster}`,
        {
          cache: "no-store",
        }
      );
      const data = await res.json();
      if (data?.success && data?.cotizacion) {
        setCotizacion(data.cotizacion);
      }
    } catch (err) {
      console.error("Error recargando cotización:", err);
    }
  };

  const manejarCobroCompleto = async (_cobroId, _servicio, _cobroResumen) => {
    try {
      // El backend ya sincroniza la cotización en CobroModule::procesarCobro()
      // Recargar desde servidor para mostrar estado actualizado
      await recargarCotizacion();

      // Si la cotización incluye una consulta médica, crear el registro en la tabla
      // de consultas para que aparezca en el panel del médico.
      const tieneConsulta = detallesCotizacionActivos.some(
        (d) => d.servicio_tipo === "consulta" && d.medico_id
      );
      if (tieneConsulta) {
        try {
          await authFetch("api_cotizaciones.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accion: "crear_consulta_desde_cotizacion",
              cotizacion_id: Number(cotizacion?.id),
            }),
          });
        } catch {
          // La creación de consulta es best-effort; no bloquear el flujo.
        }
      }

      await Swal.fire("Cobro aplicado", "La cotización fue actualizada con el pago realizado.", "success");
      navigate("/cotizaciones");
    } catch (err) {
      await Swal.fire("Cobro registrado con observación", err?.message || "No se pudo actualizar la cotización automáticamente.", "warning");
      navigate("/cotizaciones");
    }
  };

  useEffect(() => {
    if (loading || !cotizacion?.id || !esEstadoBloqueado || blockedNoticeShownRef.current) return;
    blockedNoticeShownRef.current = true;

    const redirigirConAviso = async () => {
      if (estado === "pagado") {
        await Swal.fire({
          icon: "info",
          title: "Cotización sin saldo pendiente",
          text: "Esta cotización ya está pagada y no requiere cobro. Te llevaremos al listado de cotizaciones.",
          confirmButtonText: "Ir a cotizaciones",
        });
        navigate("/cotizaciones", { replace: true });
        return;
      }

      await Swal.fire({
        icon: "warning",
        title: "Cotización anulada",
        text: "Esta cotización está anulada y no permite registrar cobros.",
        confirmButtonText: "Ir a cotizaciones",
      });
      navigate("/cotizaciones", { replace: true });
    };

    redirigirConAviso();
  }, [loading, cotizacion?.id, esEstadoBloqueado, estado, navigate]);

  if (loading) return <Spinner />;

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <button
          onClick={() => navigate("/cotizaciones")}
          className="mb-4 bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
        >
          Volver
        </button>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-4">{error}</div>
      </div>
    );
  }

  if (esEstadoBloqueado) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className={`rounded-xl border p-5 ${estado === "pagado" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
          <h2 className="text-lg font-semibold mb-2">
            {estado === "pagado"
              ? (esCobroUnificado ? "Cotizaciones ya pagadas" : "Cotización ya pagada")
              : (esCobroUnificado ? "Cotización no cobrable dentro del grupo" : "Cotización anulada")}
          </h2>
          <p className="text-sm leading-relaxed">
            {estado === "pagado"
              ? (esCobroUnificado
                ? "El grupo seleccionado ya no tiene saldo por cobrar. Puedes revisar el detalle individual de las cotizaciones para ver los importes y movimientos registrados."
                : "Esta cotización ya no tiene saldo por cobrar. Puedes revisar su detalle para ver los importes y movimientos registrados.")
              : (esCobroUnificado
                ? "Una de las cotizaciones del grupo quedó fuera de estado cobrable. Refresca el listado antes de volver a intentar un cobro unificado."
                : "Esta cotización fue anulada y por seguridad no admite cobros desde esta pantalla.")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {estado === "pagado" && (
              <button
                onClick={() => navigate(`/cotizaciones/${Number(cotizacion?.id || 0)}/detalle`)}
                className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700"
              >
                Ver detalle de cotización
              </button>
            )}
            <button
              onClick={() => navigate("/cotizaciones")}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
            >
              Ir a cotizaciones
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!paciente || !detallesCobro.length) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <button
          onClick={() => navigate("/cotizaciones")}
          className="mb-4 bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
        >
          Volver
        </button>
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded p-4">
          No hay detalles válidos para procesar {esCobroUnificado ? "este cobro unificado" : "el cobro de esta cotización"}.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <button
        onClick={() => navigate("/cotizaciones")}
        className="mb-4 bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
      >
        Volver a cotizaciones
      </button>

      <div className="rounded p-4 mb-4 text-sm border" style={themePrimarySoft}>
        <div><b>{esCobroUnificado ? "Cotizaciones" : "Cotización"}:</b> {cotizacionIds.map((id) => `#${id}`).join(", ")}</div>
        <div><b>Paciente:</b> {paciente.nombre} {paciente.apellido}</div>
        <div><b>Saldo actual:</b> S/ {Number(saldoPendiente).toFixed(2)}</div>
        <div className="mt-2 text-xs text-gray-700">
          El sistema aplica el pago automáticamente de forma secuencial sobre los servicios pendientes{esCobroUnificado ? " del grupo seleccionado" : ""}.
        </div>

        {esCobroUnificado && (
          <div className="mt-3 border-t border-current/20 pt-3">
            <div className="text-xs font-semibold mb-2">Selecciona los servicios a cobrar en este ticket:</div>
            <div className="flex flex-col gap-1">
              {cotizacionesSeleccionadas.map((cot) => {
                const isSelected = selectedIds.has(String(cot.id));
                const saldoCot = Math.max(0, Number(cot?.saldo_pendiente ?? cot?.total ?? 0));
                // Derivar etiqueta del tipo de servicio desde el campo servicios_tipos
                // (ej: "laboratorio,farmacia") o desde el primer detalle activo.
                const tiposRaw = String(cot?.servicios_tipos || "").trim();
                const tiposArr = tiposRaw
                  ? tiposRaw.split(",").map((t) => t.trim()).filter(Boolean)
                  : Array.from(new Set((cot?.detalles || []).map((d) => String(d?.servicio_tipo || "").trim()).filter(Boolean)));
                const labelMap = { laboratorio: "Laboratorio", rayosx: "Rayos X", rayos_x: "Rayos X", rx: "Rayos X", ecografia: "Ecografía", farmacia: "Farmacia", consulta: "Consulta", procedimiento: "Procedimiento", operacion: "Operación", operaciones: "Operación", cirugia: "Cirugía", cirugia_mayor: "Cirugía mayor" };
                const tipoLabel = tiposArr.length > 0
                  ? tiposArr.map((t) => labelMap[t.toLowerCase()] || (t.charAt(0).toUpperCase() + t.slice(1))).join(" + ")
                  : "Servicio";
                const isLast = isSelected && selectedIds.size === 1;
                return (
                  <label
                    key={cot.id}
                    className={`flex items-center justify-between rounded px-3 py-2 border cursor-pointer transition-opacity ${
                      isSelected ? "bg-white border-gray-300" : "bg-gray-100 border-gray-200 opacity-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isLast}
                        title={isLast ? "Debe quedar al menos una cotización seleccionada" : ""}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            if (prev.size === 1 && prev.has(String(cot.id))) return prev;
                            const next = new Set(prev);
                            if (next.has(String(cot.id))) next.delete(String(cot.id));
                            else next.add(String(cot.id));
                            return next;
                          });
                        }}
                        className="w-4 h-4 cursor-pointer"
                      />
                      <span className="font-medium">#{cot.id}</span>
                      <span className="text-gray-600">{tipoLabel}</span>
                    </div>
                    <span className={`font-semibold tabular-nums ${
                      isSelected ? "text-gray-800" : "text-gray-400 line-through"
                    }`}>
                      S/ {saldoCot.toFixed(2)}
                    </span>
                  </label>
                );
              })}
            </div>
            {selectedIds.size < cotizacionIds.length && (
              <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                {cotizacionIds.length - selectedIds.size} cotización(es) excluida(s) — quedan como <b>pendiente</b> para cobrar después.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border rounded-xl p-4 mb-4">
        <h3 className="font-semibold text-gray-800 mb-2">Historial de pagos por fecha</h3>
        {pagos.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay pagos registrados para {esCobroUnificado ? "las cotizaciones seleccionadas" : "esta cotización"}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-gray-600">
                  {esCobroUnificado && <th className="text-left py-2 pr-4">Cotización</th>}
                  <th className="text-left py-2 pr-4">Fecha</th>
                  <th className="text-left py-2 pr-4">Tipo</th>
                  <th className="text-left py-2 pr-4">Monto</th>
                  <th className="text-left py-2 pr-4">Metodo de pago</th>
                  <th className="text-left py-2 pr-4">Saldo</th>
                  <th className="text-left py-2 pr-4">Usuario</th>
                  <th className="text-left py-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((pago) => {
                  const tipo = String(pago?.tipo_movimiento || "abono").toLowerCase();
                  const esDescuento = tipo === "devolucion";
                  const fecha = pago?.created_at ? new Date(pago.created_at).toLocaleString("es-PE") : "-";
                  const metodoPago = String(pago?.metodo_pago || "").trim();
                  return (
                    <tr key={pago.id} className="border-b last:border-0 align-top">
                      {esCobroUnificado && <td className="py-2 pr-4 whitespace-nowrap">#{Number(pago?.cotizacion_id || 0)}</td>}
                      <td className="py-2 pr-4 whitespace-nowrap">{fecha}</td>
                      <td className="py-2 pr-4">{esDescuento ? "Descuento" : "Abono"}</td>
                      <td className={`py-2 pr-4 font-semibold ${esDescuento ? "text-amber-700" : "text-emerald-700"}`}>
                        {esDescuento ? "-" : "+"} S/ {Number(pago?.monto || 0).toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">{metodoPago || "-"}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        S/ {Number(pago?.saldo_anterior || 0).toFixed(2)} {"->"} S/ {Number(pago?.saldo_nuevo || 0).toFixed(2)}
                      </td>
                      <td className="py-2 pr-4">{pago?.usuario_nombre || `Usuario #${pago?.usuario_id || "-"}`}</td>
                      <td className="py-2 text-gray-600">{pago?.descripcion || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CobroModuloFinal
        paciente={paciente}
        servicio={servicioPago}
        detalles={detallesCobro}
        total={totalCobro}
        modoCobro={modoCobro}
        onModoCobroChange={setModoCobro}
        montoAbonoInput={montoAbonoInput}
        saldoPendiente={saldoPendiente}
        montoObjetivoCobro={montoObjetivoCobro}
        onMontoAbonoChange={setMontoAbonoInput}
        onSetCobrarTodo={() => setMontoAbonoInput(Number(saldoPendiente).toFixed(2))}
        onSetCobrarMitad={() => setMontoAbonoInput((Math.max(0, Number(saldoPendiente || 0)) / 2).toFixed(2))}
        onCobroCompleto={manejarCobroCompleto}
        onCancelar={() => navigate("/cotizaciones")}
      />
    </div>
  );
}
