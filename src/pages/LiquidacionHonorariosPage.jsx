import { useState, useEffect } from "react";
import { authFetch } from "../utils/apiClient";
import Swal from "sweetalert2";

const LIQUIDACION_PREFS_KEY = "liquidacion_honorarios_filtros_v1";

function leerPreferenciasLiquidacion(prefKey) {
  try {
    const raw = sessionStorage.getItem(prefKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function esFechaIsoValida(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function LiquidacionHonorariosPage() {
  // Obtener usuario actual desde sessionStorage
  const usuario = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('usuario')) || {};
    } catch {
      return {};
    }
  })();
  const rolUsuario = String(usuario?.rol || "").toLowerCase();
  const esRolMedico = rolUsuario.includes("medico") || rolUsuario.includes("doctor");
  const usuarioPrefId = String(usuario?.id ?? usuario?.usuario_id ?? usuario?.nombre ?? "anon").trim() || "anon";
  const preferenciasKey = `${LIQUIDACION_PREFS_KEY}_${usuarioPrefId}`;
  const preferenciasGuardadas = leerPreferenciasLiquidacion(preferenciasKey);

  const [honorarios, setHonorarios] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [resumen, setResumen] = useState({
    pendiente_hoy: 0,
    pendiente_mes: 0,
    liquidado_mes: 0,
    deuda_neta: 0,
    pendientes_count: 0,
    liquidados_count: 0,
    por_servicio: [],
    subtotales_pagina: { pendiente: 0, pagado: 0, total: 0, items: 0 },
  });
  const [turno, setTurno] = useState(() => {
    const saved = String(preferenciasGuardadas?.turno || "").toLowerCase().trim();
    return ["", "mañana", "tarde", "noche"].includes(saved) ? saved : "";
  });
  const [medicoId, setMedicoId] = useState(() => String(preferenciasGuardadas?.medicoId || ""));
  const [estado, setEstado] = useState(() => {
    const saved = String(preferenciasGuardadas?.estado || "").toLowerCase().trim();
    return ["pendiente", "pagado", "cancelado"].includes(saved) ? saved : "pendiente";
  });
  const [tipoFecha, setTipoFecha] = useState(() => {
    const saved = String(preferenciasGuardadas?.tipoFecha || "").toLowerCase().trim();
    if (saved === "movimiento" || saved === "atencion") return saved;
    return esRolMedico ? "atencion" : "movimiento";
  });
  const [rango, setRango] = useState(() => {
    const saved = String(preferenciasGuardadas?.rango || "").toLowerCase().trim();
    if (["hoy", "semana", "mes", ""].includes(saved)) return saved;
    return "hoy";
  });
  const [fechaDesde, setFechaDesde] = useState(() => {
    const saved = String(preferenciasGuardadas?.fechaDesde || "").trim();
    return esFechaIsoValida(saved) ? saved : "";
  });
  const [fechaHasta, setFechaHasta] = useState(() => {
    const saved = String(preferenciasGuardadas?.fechaHasta || "").trim();
    return esFechaIsoValida(saved) ? saved : "";
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = Number(preferenciasGuardadas?.rowsPerPage || 0);
    return [3, 5, 10].includes(saved) ? saved : 3;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);

  useEffect(() => {
    cargarMedicos();
    cargarHonorarios(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(preferenciasKey, JSON.stringify({
        tipoFecha,
        rango,
        medicoId,
        turno,
        estado,
        fechaDesde,
        fechaHasta,
        rowsPerPage,
      }));
    } catch {
      // Ignorar errores de persistencia para no romper el flujo de liquidación.
    }
  }, [preferenciasKey, tipoFecha, rango, medicoId, turno, estado, fechaDesde, fechaHasta, rowsPerPage]);

  const fmtMoney = (n) => `S/ ${Number(n || 0).toFixed(2)}`;

  const badgeEstadoClass = (value) => {
    const key = (value || "").toLowerCase();
    if (key === "pagado") return "bg-emerald-100 text-emerald-800";
    if (key === "cancelado") return "bg-rose-100 text-rose-800";
    return "bg-amber-100 text-amber-800";
  };

  const estadoLabel = (value) => {
    const key = (value || "").toLowerCase();
    if (key === "cancelado") return "ANULADO";
    return value ? value.toUpperCase() : "";
  };

  const etiquetaListaVacia = estado === "pendiente" ? "pendientes" : estado === "pagado" ? "pagados" : "anulados";

  const badgeOrigenClass = (value) => {
    const key = (value || "").toLowerCase();
    if (key === "contrato") return "bg-cyan-100 text-cyan-800";
    if (key === "cotizacion") return "bg-indigo-100 text-indigo-800";
    return "bg-slate-100 text-slate-700";
  };

  const labelOrigen = (value) => {
    const key = (value || "").toLowerCase();
    if (key === "contrato") return "Contrato";
    if (key === "cotizacion") return "Cotización";
    return "Directo";
  };

  const badgeAntiguedad = (dias) => {
    const n = Number(dias || 0);
    if (n <= 0) return { label: "Hoy", cls: "bg-emerald-100 text-emerald-800" };
    if (n <= 3) return { label: `${n} d`, cls: "bg-amber-100 text-amber-800" };
    return { label: `+${n} d`, cls: "bg-rose-100 text-rose-800" };
  };

  const topServicios = Array.isArray(resumen?.por_servicio)
    ? [...resumen.por_servicio]
        .sort((a, b) => Number(b?.monto || 0) - Number(a?.monto || 0))
        .slice(0, 3)
    : [];
  const maxServicioMonto = topServicios.reduce((acc, item) => Math.max(acc, Number(item?.monto || 0)), 0);

  const cargarMedicos = async () => {
    try {
      const response = await authFetch(`api_medicos.php`);
      const data = await response.json();
      if (data.success) {
        setMedicos(data.medicos || []);
      }
    } catch (err) {
      console.error('Error al cargar médicos:', err);
    }
  };

  const cargarHonorarios = async (targetPage = page, filtrosOverride = null) => {
    setLoading(true);
    try {
      const filtros = filtrosOverride || {};
      const medicoIdQ = filtros.medicoId ?? medicoId;
      const turnoQ = filtros.turno ?? turno;
      const estadoQ = filtros.estado ?? estado;
      const tipoFechaQ = filtros.tipoFecha ?? tipoFecha;
      const fechaDesdeQ = filtros.fechaDesde ?? fechaDesde;
      const fechaHastaQ = filtros.fechaHasta ?? fechaHasta;
      const rangoQ = filtros.rango ?? rango;
      const rowsPerPageQ = filtros.rowsPerPage ?? rowsPerPage;

      const params = [];
      if (medicoIdQ) params.push(`medico_id=${medicoIdQ}`);
      if (turnoQ) params.push(`turno=${turnoQ}`);
      if (estadoQ) params.push(`estado=${estadoQ}`);
      if (tipoFechaQ) params.push(`tipo_fecha=${encodeURIComponent(tipoFechaQ)}`);
      // Al pedir anulados, queremos verlos TODOS: honorarios anulados uno por
      // uno (api_eliminar_honorario.php) y los anulados en bloque al anular
      // toda una cotización. El backend excluye estos últimos por defecto en
      // las demás pestañas para no ensuciar "pendiente"/"pagado".
      if (estadoQ === 'cancelado') params.push(`incluir_anuladas=1`);
      if (fechaDesdeQ) params.push(`fecha_desde=${encodeURIComponent(fechaDesdeQ)}`);
      if (fechaHastaQ) params.push(`fecha_hasta=${encodeURIComponent(fechaHastaQ)}`);
      if (!fechaDesdeQ && !fechaHastaQ && rangoQ) params.push(`rango=${encodeURIComponent(rangoQ)}`);
      params.push(`page=${targetPage}`);
      params.push(`limit=${rowsPerPageQ}`);
      const query = params.length ? `?${params.join("&")}` : "";
      const response = await authFetch(`api_honorarios_pendientes.php${query}`);
      const data = await response.json();
      if (data.success) {
        setHonorarios(data.honorarios || []);
        setResumen(data.resumen || {});
        setPage(Number(data.page || targetPage));
        setTotalPages(Math.max(1, Number(data.total_pages || 1)));
        setTotalRegistros(Number(data.total || 0));
      } else {
        console.warn('Error en respuesta de honorarios:', data);
      }
    } catch (err) {
      console.error('Error al cargar honorarios:', err);
    } finally {
      setLoading(false);
    }
  };

  const aplicarRangoRapido = (nuevoRango) => {
    setRango(nuevoRango);
    setFechaDesde("");
    setFechaHasta("");
    setPage(1);
  };

  const filtrar = () => {
    cargarHonorarios(1);
  };

  const restablecerPreferencias = async () => {
    const tipoFechaDefault = esRolMedico ? "atencion" : "movimiento";
    const rangoDefault = "hoy";
    const estadoDefault = "pendiente";
    const rowsDefault = 3;

    try {
      sessionStorage.removeItem(preferenciasKey);
    } catch {
      // No bloquear el flujo si sessionStorage no está disponible.
    }

    setMedicoId("");
    setTurno("");
    setEstado(estadoDefault);
    setTipoFecha(tipoFechaDefault);
    setRango(rangoDefault);
    setFechaDesde("");
    setFechaHasta("");
    setRowsPerPage(rowsDefault);
    setPage(1);

    await cargarHonorarios(1, {
      medicoId: "",
      turno: "",
      estado: estadoDefault,
      tipoFecha: tipoFechaDefault,
      rango: rangoDefault,
      fechaDesde: "",
      fechaHasta: "",
      rowsPerPage: rowsDefault,
    });

    Swal.fire("Preferencias restablecidas", "Se restauraron tus filtros por defecto.", "success");
  };

  // Acción anular honorario (no se elimina físicamente: se anula el cobro,
  // se revierte su ingreso en caja y se cancela el registro, conservando el
  // rastro contable y clínico para auditoría).
  const eliminarHonorario = async (honorarioId) => {
    const { value: motivo, isConfirmed } = await Swal.fire({
      title: "¿Anular este honorario?",
      html: "Se anulará el cobro asociado, se revertirá su ingreso en caja y se cancelará el registro. No se borrará ningún dato: todo queda disponible para auditoría.",
      icon: "warning",
      input: "text",
      inputPlaceholder: "Escribe el motivo de la anulación",
      inputValidator: (value) => {
        if (!value || !value.trim()) return "El motivo es obligatorio";
        return undefined;
      },
      showCancelButton: true,
      confirmButtonText: "Sí, anular",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d33",
    });
    if (!isConfirmed) return;
    try {
      const response = await authFetch(`api_eliminar_honorario.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: honorarioId, motivo: motivo.trim() }),
      });
      const data = await response.json();
      if (data.success) {
        Swal.fire("Anulado", "El honorario y su cobro asociado fueron anulados correctamente.", "success");
        cargarHonorarios(page);
      } else {
        Swal.fire("Error", data.error || "No se pudo anular el honorario.", "error");
      }
    } catch {
      Swal.fire("Error", "Error de conexión.", "error");
    }
  };

  const liquidarHonorario = async (honorarioId) => {
    const result = await Swal.fire({
      title: "Liquidar honorario",
      html: `
        <div class="text-left space-y-3">
          <label class="block text-sm font-semibold">Método de pago al médico</label>
          <select id="liquidacion-metodo" class="swal2-select !w-full !m-0">
            <option value="efectivo">Efectivo</option>
            <option value="yape">Yape</option>
            <option value="plin">Plin</option>
            <option value="transferencia">Transferencia</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="cheque">Cheque</option>
            <option value="deposito">Depósito</option>
          </select>
          <label class="block text-sm font-semibold">Fuente de fondos</label>
          <select id="liquidacion-fuente" class="swal2-select !w-full !m-0">
            <option value="clinica">Saldo de la clínica</option>
            <option value="tercero_directo">Pago directo del dueño / tercero</option>
            <option value="tercero_fondeo">Dueño / tercero fondeó a la clínica</option>
          </select>
          <input id="liquidacion-tercero" class="swal2-input !w-full !m-0" placeholder="Nombre del dueño / tercero (si aplica)" />
          <input id="liquidacion-referencia" class="swal2-input !w-full !m-0" placeholder="N.º de operación o referencia (opcional)" />
          <textarea id="liquidacion-observaciones" class="swal2-textarea !w-full !m-0" placeholder="Observación (opcional)"></textarea>
        </div>`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, liquidar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#3085d6",
      didOpen: () => {
        const fuente = document.getElementById("liquidacion-fuente");
        const tercero = document.getElementById("liquidacion-tercero");
        const actualizarTercero = () => {
          tercero.disabled = fuente.value === "clinica";
          if (fuente.value === "clinica") tercero.value = "";
        };
        fuente.addEventListener("change", actualizarTercero);
        actualizarTercero();
      },
      preConfirm: () => {
        const metodoPago = document.getElementById("liquidacion-metodo").value;
        const fuenteFondos = document.getElementById("liquidacion-fuente").value;
        const terceroNombre = document.getElementById("liquidacion-tercero").value.trim();
        if (fuenteFondos !== "clinica" && !terceroNombre) {
          Swal.showValidationMessage("Indica quién cubrió el pago externo.");
          return false;
        }
        return {
          metodo_pago: metodoPago,
          fuente_fondos: fuenteFondos,
          tercero_nombre: terceroNombre,
          referencia_pago: document.getElementById("liquidacion-referencia").value.trim(),
          observaciones: document.getElementById("liquidacion-observaciones").value.trim(),
        };
      },
    });
    if (!result.isConfirmed) return;
    try {
      const response = await authFetch(`api_liquidar_honorario.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: honorarioId, ...result.value }),
      });
      const data = await response.json();
      if (data.success) {
        Swal.fire("¡Liquidado!", "El honorario ha sido marcado como pagado.", "success");
        cargarHonorarios(page);
      } else {
        Swal.fire("Error", data.error || "No se pudo liquidar el honorario.", "error");
      }
    } catch (error) {
      console.error("Error al liquidar honorario:", error);
      Swal.fire("Error", "Error de conexión.", "error");
    }
  };

  // Mostrar cualquier servicio que tenga participación médica liquidable.
  const honorariosUnicos = honorarios
    .filter((h, idx, arr) => arr.findIndex(x => x.id === h.id) === idx)
    .filter(h => Number(h.monto_medico || 0) > 0);

  return (
    <div className="w-full max-w-[1700px] mx-auto px-3 sm:px-4 lg:px-6 py-6">
      <h1 className="text-2xl font-bold mb-4 text-blue-800">Liquidación de Honorarios Médicos</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 mb-6">
        <div className="rounded-xl p-4 bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200">
          <div className="text-xs font-semibold text-amber-700">Pendiente Hoy</div>
          <div className="text-xl font-bold text-amber-900 mt-1">{fmtMoney(resumen.pendiente_hoy)}</div>
        </div>
        <div className="rounded-xl p-4 bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200">
          <div className="text-xs font-semibold text-orange-700">Pendiente Mes</div>
          <div className="text-xl font-bold text-orange-900 mt-1">{fmtMoney(resumen.pendiente_mes)}</div>
        </div>
        <div className="rounded-xl p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200">
          <div className="text-xs font-semibold text-emerald-700">Liquidado Mes</div>
          <div className="text-xl font-bold text-emerald-900 mt-1">{fmtMoney(resumen.liquidado_mes)}</div>
        </div>
        <div className="rounded-xl p-4 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200">
          <div className="text-xs font-semibold text-blue-700">Deuda Neta</div>
          <div className="text-xl font-bold text-blue-900 mt-1">{fmtMoney(resumen.deuda_neta)}</div>
        </div>
        <div className="rounded-xl p-4 bg-gradient-to-br from-violet-50 to-violet-100 border border-violet-200">
          <div className="text-xs font-semibold text-violet-700">Pendientes</div>
          <div className="text-xl font-bold text-violet-900 mt-1">{Number(resumen.pendientes_count || 0)}</div>
        </div>
        <div className="rounded-xl p-4 bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200">
          <div className="text-xs font-semibold text-slate-700">Liquidados</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{Number(resumen.liquidados_count || 0)}</div>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm sm:text-base font-bold text-blue-900">Distribución por servicio (Top 3)</h2>
          <span className="text-xs text-slate-500">Según filtros actuales</span>
        </div>
        {topServicios.length === 0 ? (
          <div className="text-sm text-slate-500 py-2">Sin datos de servicios para el filtro seleccionado.</div>
        ) : (
          <div className="space-y-3">
            {topServicios.map((item, idx) => {
              const monto = Number(item?.monto || 0);
              const pct = maxServicioMonto > 0 ? Math.max(6, Math.round((monto / maxServicioMonto) * 100)) : 0;
              const nombre = String(item?.tipo_servicio || "otros").toUpperCase();
              const cantidad = Number(item?.cantidad || 0);
              return (
                <div key={`${nombre}-${idx}`}>
                  <div className="flex items-center justify-between text-xs sm:text-sm mb-1">
                    <div className="font-semibold text-slate-700">{nombre}</div>
                    <div className="text-slate-600">{cantidad} ítem(s) · <span className="font-bold text-blue-800">{fmtMoney(monto)}</span></div>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white p-3 sm:p-4 rounded shadow mb-6">
        <div className="flex flex-wrap gap-2 mb-3">
          <button type="button" onClick={() => aplicarRangoRapido("hoy")} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${rango === "hoy" && !fechaDesde && !fechaHasta ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-800"}`}>Hoy</button>
          <button type="button" onClick={() => aplicarRangoRapido("semana")} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${rango === "semana" && !fechaDesde && !fechaHasta ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-800"}`}>Semana</button>
          <button type="button" onClick={() => aplicarRangoRapido("mes")} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${rango === "mes" && !fechaDesde && !fechaHasta ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-800"}`}>Mes</button>
          <button type="button" onClick={() => { setRango(""); }} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${(fechaDesde || fechaHasta) ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-800"}`}>Personalizado</button>
        </div>

        <form className="grid grid-cols-1 md:grid-cols-8 gap-3">
            <div className="flex flex-col bg-blue-50 rounded-lg p-2">
              <label className="text-xs sm:text-sm font-semibold text-blue-800 mb-1">Médico:</label>
              <select value={medicoId} onChange={e => setMedicoId(e.target.value)} className="border rounded px-2 py-2 text-xs sm:text-sm focus:outline-blue-400">
                <option value="">Todos</option>
                {medicos.map(m => (
                  <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col bg-blue-50 rounded-lg p-2">
              <label className="text-xs sm:text-sm font-semibold text-blue-800 mb-1">Turno:</label>
              <select value={turno} onChange={e => setTurno(e.target.value)} className="border rounded px-2 py-2 text-xs sm:text-sm focus:outline-blue-400">
                <option value="">Todos</option>
                <option value="mañana">Mañana</option>
                <option value="tarde">Tarde</option>
                <option value="noche">Noche</option>
              </select>
            </div>
            <div className="flex flex-col bg-blue-50 rounded-lg p-2">
              <label className="text-xs sm:text-sm font-semibold text-blue-800 mb-1">Estado:</label>
              <select value={estado} onChange={e => setEstado(e.target.value)} className="border rounded px-2 py-2 text-xs sm:text-sm focus:outline-blue-400">
                <option value="pendiente">Pendiente</option>
                <option value="pagado">Pagado</option>
                <option value="cancelado">Anulado</option>
              </select>
            </div>
            <div className="flex flex-col bg-blue-50 rounded-lg p-2">
              <label className="text-xs sm:text-sm font-semibold text-blue-800 mb-1">Base de fecha:</label>
              <select value={tipoFecha} onChange={e => setTipoFecha(e.target.value)} className="border rounded px-2 py-2 text-xs sm:text-sm focus:outline-blue-400">
                <option value="movimiento">Movimiento / cobro</option>
                <option value="atencion">Atención / cotización</option>
              </select>
            </div>
            <div className="flex flex-col bg-blue-50 rounded-lg p-2">
              <label className="text-xs sm:text-sm font-semibold text-blue-800 mb-1">Filas por página:</label>
              <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }} className="border rounded px-2 py-2 text-xs sm:text-sm focus:outline-blue-400">
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
            </div>
            <div className="flex flex-col bg-blue-50 rounded-lg p-2">
              <label className="text-xs sm:text-sm font-semibold text-blue-800 mb-1">Desde:</label>
              <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setRango(""); }} className="border rounded px-2 py-2 text-xs sm:text-sm focus:outline-blue-400" />
            </div>
            <div className="flex flex-col bg-blue-50 rounded-lg p-2">
              <label className="text-xs sm:text-sm font-semibold text-blue-800 mb-1">Hasta:</label>
              <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setRango(""); }} className="border rounded px-2 py-2 text-xs sm:text-sm focus:outline-blue-400" />
            </div>
            <div className="flex flex-col justify-end gap-2">
              <button type="button" onClick={filtrar} className="bg-blue-600 text-white px-4 py-2 rounded font-bold w-full">Filtrar</button>
              <button type="button" onClick={restablecerPreferencias} className="bg-slate-100 text-slate-700 border border-slate-300 px-4 py-2 rounded font-semibold w-full">Restablecer preferencias</button>
            </div>
          </form>
      </div>

      {loading ? (
        <div className="text-center py-8">Cargando honorarios...</div>
      ) : (
        <>
          <div className="block md:hidden">
            <div className="space-y-4">
              {honorariosUnicos.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No hay honorarios {etiquetaListaVacia}</div>
              ) : honorariosUnicos.map(h => {
                const antiguedad = badgeAntiguedad(h.antiguedad_dias);
                return (
                  <div key={h.id} className="rounded-xl shadow-lg border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-blue-100 p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-blue-800 text-lg">{`${h.medico_nombre} ${h.medico_apellido}`.toUpperCase()}</span>
                      <span className="text-xs px-2 py-1 rounded bg-blue-200 text-blue-800 font-bold">{h.tipo_servicio ? h.tipo_servicio.toUpperCase() : ""}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-1">
                      <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${badgeOrigenClass(h.origen_resumen)}`}>{labelOrigen(h.origen_resumen)}</span>
                      <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${antiguedad.cls}`}>{antiguedad.label}</span>
                    </div>
                    <div className="text-sm text-gray-700 mb-1">{h.descripcion ? h.descripcion.toUpperCase() : ""}</div>
                    <div className="text-sm text-gray-700"><span className="font-bold">Paciente:</span> {`${h.paciente_nombre} ${h.paciente_apellido}`.toUpperCase()}</div>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>Fecha: {h.fecha ? h.fecha.toUpperCase() : ""}</span>
                      <span>Turno: {h.turno ? h.turno.toUpperCase() : ""}</span>
                    </div>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>Estado: <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${badgeEstadoClass(h.estado_pago_medico)}`}>{estadoLabel(h.estado_pago_medico)}</span></span>
                      <span>Monto: <span className="font-bold text-blue-800">S/ {parseFloat(h.monto_medico).toFixed(2)}</span></span>
                    </div>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>Cobrado por: {h.cobrado_por_nombre ? h.cobrado_por_nombre.toUpperCase() : "-"}</span>
                      <span>Liquidado por: {h.liquidado_por_nombre ? h.liquidado_por_nombre.toUpperCase() : "-"}</span>
                    </div>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>Fecha Liquidación: {h.fecha_liquidacion ? h.fecha_liquidacion.toUpperCase() : "-"}</span>
                    </div>
                    {h.estado_pago_medico === "cancelado" && h.motivo_anulacion && (
                      <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded px-2 py-1">
                        Motivo de anulación: {h.motivo_anulacion}
                      </div>
                    )}
                    <div className="mt-2 flex justify-end gap-2">
                      {h.estado_pago_medico === "pendiente" && (
                        <button onClick={() => liquidarHonorario(h.id)} className="bg-green-600 text-white px-4 py-1 rounded font-bold">Liquidar</button>
                      )}
                      {/* Botón anular solo para administrador y mientras siga pendiente */}
                      {usuario.rol === 'administrador' && h.estado_pago_medico === "pendiente" && (
                        <button onClick={() => eliminarHonorario(h.id)} className="bg-red-600 text-white px-4 py-1 rounded font-bold">Anular</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="hidden md:block">
            <table className="w-full bg-white rounded shadow">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2">Médico</th>
                  <th className="px-4 py-2">Descripción</th>
                  <th className="px-4 py-2">Servicio</th>
                  <th className="px-4 py-2">Paciente</th>
                  <th className="px-4 py-2">Origen</th>
                  <th className="px-4 py-2">Antigüedad</th>
                  <th className="hidden sm:table-cell px-4 py-2">Fecha</th>
                  <th className="hidden sm:table-cell px-4 py-2">Turno</th>
                  <th className="px-4 py-2">Monto</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="hidden sm:table-cell px-4 py-2">Cobrado por</th>
                  <th className="hidden sm:table-cell px-4 py-2">Liquidado por</th>
                  <th className="hidden sm:table-cell px-4 py-2">Fecha Liquidación</th>
                  <th className="px-4 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {honorariosUnicos.length === 0 ? (
                  <tr><td colSpan={14} className="text-center py-8 text-gray-500">No hay honorarios {etiquetaListaVacia}</td></tr>
                ) : honorariosUnicos.map(h => {
                  const antiguedad = badgeAntiguedad(h.antiguedad_dias);
                  return (
                    <tr key={h.id}>
                      <td className="px-4 py-2">{`${h.medico_nombre} ${h.medico_apellido}`.toUpperCase()}</td>
                      <td className="px-4 py-2">{h.descripcion ? h.descripcion.toUpperCase() : ""}</td>
                      <td className="px-4 py-2">{h.tipo_servicio ? h.tipo_servicio.toUpperCase() : ""}</td>
                      <td className="px-4 py-2">{`${h.paciente_nombre} ${h.paciente_apellido}`.toUpperCase()}</td>
                      <td className="px-4 py-2"><span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${badgeOrigenClass(h.origen_resumen)}`}>{labelOrigen(h.origen_resumen)}</span></td>
                      <td className="px-4 py-2"><span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${antiguedad.cls}`}>{antiguedad.label}</span></td>
                      <td className="hidden sm:table-cell px-4 py-2">{h.fecha ? h.fecha.toUpperCase() : ""}</td>
                      <td className="hidden sm:table-cell px-4 py-2">{h.turno ? h.turno.toUpperCase() : ""}</td>
                      <td className="px-4 py-2">S/ {parseFloat(h.monto_medico).toFixed(2)}</td>
                      <td className="px-4 py-2">
                        <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${badgeEstadoClass(h.estado_pago_medico)}`}>{estadoLabel(h.estado_pago_medico)}</span>
                        {h.estado_pago_medico === "cancelado" && h.motivo_anulacion && (
                          <div className="mt-1 max-w-[220px] text-[11px] text-rose-700" title={h.motivo_anulacion}>{h.motivo_anulacion}</div>
                        )}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-2">
                        {h.cobrado_por_nombre ? (
                          <span>{h.cobrado_por_nombre.toUpperCase()} <span className="text-xs text-gray-500">({h.cobrado_por_rol ? h.cobrado_por_rol.toUpperCase() : ""})</span></span>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-2">
                        {h.estado_pago_medico === "pagado" && h.liquidado_por_nombre ? (
                          <span>{h.liquidado_por_nombre.toUpperCase()} <span className="text-xs text-gray-500">({h.liquidado_por_rol ? h.liquidado_por_rol.toUpperCase() : ""})</span></span>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-2">
                        {h.estado_pago_medico === "pagado" && h.fecha_liquidacion ? (
                          <span>{h.fecha_liquidacion.toUpperCase()}</span>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-2 flex gap-2">
                        {h.estado_pago_medico === "pendiente" && (
                          <button onClick={() => liquidarHonorario(h.id)} className="bg-green-600 text-white px-3 py-1 rounded">Liquidar</button>
                        )}
                        {usuario.rol === 'administrador' && h.estado_pago_medico === "pendiente" && (
                          <button onClick={() => eliminarHonorario(h.id)} className="bg-red-600 text-white px-3 py-1 rounded">Anular</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 flex flex-wrap gap-4">
              <span>Items página: <strong>{Number(resumen?.subtotales_pagina?.items || 0)}</strong></span>
              <span>Subtotal pendiente: <strong>{fmtMoney(resumen?.subtotales_pagina?.pendiente)}</strong></span>
              <span>Subtotal pagado: <strong>{fmtMoney(resumen?.subtotales_pagina?.pagado)}</strong></span>
              <span>Subtotal total: <strong>{fmtMoney(resumen?.subtotales_pagina?.total)}</strong></span>
            </div>

            <div className="flex justify-end items-center mt-4 gap-3">
              <button disabled={page === 1} onClick={() => cargarHonorarios(page - 1)} className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50">Anterior</button>
              <span className="text-sm text-slate-600">Página {page} de {totalPages} · {totalRegistros} registros</span>
              <button disabled={page >= totalPages} onClick={() => cargarHonorarios(page + 1)} className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50">Siguiente</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default LiquidacionHonorariosPage;
