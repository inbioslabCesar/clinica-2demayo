import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import { BASE_URL } from "../config/config";
import { authFetch } from "../utils/apiClient";

function money(v) {
  return `S/ ${Number(v || 0).toFixed(2)}`;
}

const ESTADO_EVENTO_COLORES = {
  pendiente:    "bg-slate-100 text-slate-700",
  confirmado:   "bg-blue-100 text-blue-700",
  atendido:     "bg-emerald-100 text-emerald-700",
  espontaneo:   "bg-teal-100 text-teal-700",
  no_asistio_justificado: "bg-orange-100 text-orange-700",
  reprogramado: "bg-amber-100 text-amber-700",
  cancelado:    "bg-red-100 text-red-700",
};

const ANCHOR_LABELS = {
  ninguno:                  null,
  fur:                      "FUR",
  fecha_cirugia:            "Cirugía",
  fecha_parto_estimada:     "FPP",
  fecha_inicio_tratamiento: "Inicio tratamiento",
};

export default function EstadoCuentaContratoPage() {
  const { pacienteId } = useParams();
  const navigate = useNavigate();
  const [clinicBrand, setClinicBrand] = useState({
    name: "MI CLINICA",
    logo: "",
    slogan: "",
    slogan_color: "",
    nombre_color: "",
    direccion: "",
    telefono: "",
    celular: "",
    ruc: "",
    email: "",
  });
  const [loading, setLoading] = useState(true);
  const [contratos, setContratos] = useState([]);
  const [agendaPorContrato, setAgendaPorContrato] = useState({});
  const [loadingAgenda, setLoadingAgenda] = useState({});
  const [agendaAbierta, setAgendaAbierta] = useState(new Set());
  const [agendaFiltroEstado, setAgendaFiltroEstado] = useState({});
  const [recalcForm, setRecalcForm] = useState(null); // {contratoId, anchor_tipo, anchor_fecha, saving}

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`api_contratos.php?accion=estado_cuenta&paciente_id=${Number(pacienteId)}&_t=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo cargar estado de cuenta");
      setContratos(Array.isArray(data.contratos) ? data.contratos : []);
    } catch (error) {
      Swal.fire("Error", error?.message || "No se pudo cargar estado de cuenta", "error");
    } finally {
      setLoading(false);
    }
  }, [pacienteId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    let mounted = true;
    const cargarMarcaClinica = async () => {
      try {
        const resp = await authFetch("api_get_configuracion.php", {
          method: "GET",
          cache: "no-store",
        });
        const data = await resp.json();
        if (!mounted || !data?.success) return;
        const cfg = data.data || {};
        const nombre = String(cfg.nombre_clinica || "").trim().toUpperCase() || "MI CLINICA";
        const rawLogo = String(cfg.logo_url || "").trim();
        const logo = rawLogo
          ? (/^(https?:\/\/|data:|blob:)/i.test(rawLogo)
            ? rawLogo
            : `${String(BASE_URL || "").replace(/\/+$/, "")}/${rawLogo.replace(/^\/+/, "")}`)
          : "";
        setClinicBrand({
          name: nombre,
          logo,
          slogan: String(cfg.slogan || "").trim(),
          slogan_color: String(cfg.slogan_color || "").trim(),
          nombre_color: String(cfg.nombre_color || "").trim(),
          direccion: String(cfg.direccion || "").trim(),
          telefono: String(cfg.telefono || "").trim(),
          celular: String(cfg.celular || "").trim(),
          ruc: String(cfg.ruc || "").trim(),
          email: String(cfg.email || "").trim(),
        });
      } catch {
        // keep default brand values
      }
    };
    cargarMarcaClinica();
    return () => {
      mounted = false;
    };
  }, []);

  const saldoTotal = useMemo(() => contratos.reduce((acc, c) => acc + Number(c.saldo_pendiente || 0), 0), [contratos]);
  const totalAbonadoGeneral = useMemo(() => contratos.reduce((acc, c) => acc + Number(c.total_abonado || 0), 0), [contratos]);
  const serviciosTotalesGeneral = useMemo(() => contratos.reduce((acc, c) => acc + Number(c.servicios_totales || 0), 0), [contratos]);
  const serviciosConsumidosGeneral = useMemo(() => contratos.reduce((acc, c) => acc + Number(c.servicios_consumidos || 0), 0), [contratos]);
  const agendaConsumidosGeneral = useMemo(() => contratos.reduce((acc, c) => acc + Number(c.agenda_consumidos || 0), 0), [contratos]);
  const pacienteInfo = useMemo(() => {
    const base = Array.isArray(contratos) && contratos.length > 0 ? contratos[0] : null;
    const nombre = String(base?.paciente_nombre || "").trim();
    const apellido = String(base?.paciente_apellido || "").trim();
    const dni = String(base?.paciente_dni || "").trim();
    const hc = String(base?.paciente_hc || "").trim();
    const fullName = `${nombre} ${apellido}`.trim();
    return { fullName, dni, hc };
  }, [contratos]);

  const cargarAgenda = useCallback(async (contratoId) => {
    setLoadingAgenda((p) => ({ ...p, [contratoId]: true }));
    try {
      const res = await authFetch(
        `api_contratos.php?accion=agenda_contrato&contrato_paciente_id=${contratoId}&_t=${Date.now()}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "Error al cargar agenda");
      setAgendaPorContrato((p) => ({ ...p, [contratoId]: Array.isArray(data.eventos) ? data.eventos : [] }));
    } catch {
      setAgendaPorContrato((p) => ({ ...p, [contratoId]: [] }));
    } finally {
      setLoadingAgenda((p) => ({ ...p, [contratoId]: false }));
    }
  }, []);

  const toggleAgenda = (contratoId) => {
    setAgendaAbierta((prev) => {
      const next = new Set(prev);
      if (next.has(contratoId)) {
        next.delete(contratoId);
      } else {
        next.add(contratoId);
        if (!agendaPorContrato[contratoId]) cargarAgenda(contratoId);
      }
      return next;
    });
  };

  const actualizarEvento = async (ev, nuevoEstado, contrato) => {
    const eventoId = Number(ev?.id || 0);
    const contratoId = Number(contrato?.id || 0);
    if (!eventoId || !contratoId) return;

    const enviarActualizacion = async (permitirExtra = 0) => {
      const res = await authFetch("api_contratos.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "actualizar_evento_agenda", id: eventoId, estado_evento: nuevoEstado, permitir_extra: permitirExtra }),
      });
      return res.json();
    };

    if (nuevoEstado === "atendido") {
      const confirm = await Swal.fire({
        title: "Marcar como atendido",
        text: "Esto incrementará el consumo de este servicio en el contrato. ¿Continuar?",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Sí, confirmar",
        cancelButtonText: "Cancelar",
      });
      if (!confirm.isConfirmed) return;
    }
    try {
      let data = await enviarActualizacion(0);

      if (!data?.success && data?.requiere_confirmacion_extra && (nuevoEstado === "atendido" || nuevoEstado === "espontaneo")) {
        const confirmExtra = await Swal.fire({
          title: "Sin cobertura de contrato",
          text: "Este consumo no tiene cupo vigente en contrato. ¿Deseas continuar como consumo extra?",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Sí, continuar como extra",
          cancelButtonText: "Cancelar",
        });
        if (!confirmExtra.isConfirmed) return;
        data = await enviarActualizacion(1);
      }

      if (!data?.success) throw new Error(data?.error || "No se pudo actualizar evento");
      await cargarAgenda(contratoId);
      await cargar();
    } catch (err) {
      Swal.fire("Error", err?.message || "No se pudo actualizar evento", "error");
    }
  };

  const abrirRecalc = (c) => {
    setRecalcForm({
      contratoId: Number(c.id),
      anchor_tipo: c.anchor_tipo || "ninguno",
      anchor_fecha: c.anchor_fecha || "",
      saving: false,
    });
  };

  const guardarRecalc = async () => {
    if (!recalcForm) return;
    setRecalcForm((p) => ({ ...p, saving: true }));
    try {
      const res = await authFetch("api_contratos.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "recalcular_agenda",
          contrato_paciente_id: recalcForm.contratoId,
          anchor_tipo: recalcForm.anchor_tipo,
          anchor_fecha: recalcForm.anchor_tipo !== "ninguno" ? recalcForm.anchor_fecha : null,
        }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "Error al recalcular");
      await Swal.fire("Listo", `Agenda recalculada: ${data.insertados} eventos regenerados.`, "success");
      setRecalcForm(null);
      await cargar();
      await cargarAgenda(recalcForm.contratoId);
    } catch (err) {
      Swal.fire("Error", err?.message || "No se pudo recalcular", "error");
      setRecalcForm((p) => ({ ...p, saving: false }));
    }
  };

  const registrarAbono = async (contrato) => {
    let cajaAbierta = false;
    try {
      const cajaRes = await authFetch(`api_caja_estado.php?_t=${Date.now()}`, {
        cache: "no-store",
      });
      const cajaData = await cajaRes.json();
      cajaAbierta = Boolean(cajaData?.success) && String(cajaData?.estado || "").toLowerCase() === "abierta";
    } catch {
      cajaAbierta = false;
    }

    const { value: formValues } = await Swal.fire({
      title: `Abono - ${contrato.plantilla_nombre || "Contrato"}`,
      html: `
        <div style="text-align:left;font-size:13px;">
          ${!cajaAbierta ? `
            <div style="margin:0 0 12px 0;padding:10px;border-radius:8px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;">
              <div style="font-weight:600;margin-bottom:8px;">⚠️ No se pueden realizar cobros. La caja se encuentra cerrada.</div>
              <a id="swal-ir-apertura-caja" href="#" style="color:#b91c1c;text-decoration:underline;font-weight:600;">Ir a Apertura de Caja</a>
            </div>
          ` : ""}
          <label style="font-weight:600;display:block;margin-bottom:4px;">Saldo pendiente: ${money(contrato.saldo_pendiente)}</label>
          <input id="swal-abono-monto" type="number" min="0.01" step="0.01"
            placeholder="Monto a abonar"
            class="swal2-input" style="margin:0 0 12px 0;width:100%;" ${!cajaAbierta ? "disabled" : ""} />
          <label style="font-weight:600;display:block;margin-bottom:4px;">Método de pago</label>
          <select id="swal-abono-metodo" class="swal2-select" style="width:100%;margin:0;padding:8px;border:1px solid #d1d5db;border-radius:6px;" ${!cajaAbierta ? "disabled" : ""}>
            <option value="efectivo">Efectivo</option>
            <option value="yape">Yape</option>
            <option value="plin">Plin</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Guardar abono",
      cancelButtonText: "Cancelar",
      focusConfirm: false,
      didOpen: () => {
        if (!cajaAbierta) {
          const confirmBtn = Swal.getConfirmButton();
          if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.style.opacity = "0.5";
            confirmBtn.style.cursor = "not-allowed";
          }

          const linkApertura = document.getElementById("swal-ir-apertura-caja");
          if (linkApertura) {
            linkApertura.addEventListener("click", (event) => {
              event.preventDefault();
              Swal.close();
              navigate("/contabilidad");
            });
          }
        }
      },
      preConfirm: () => {
        if (!cajaAbierta) {
          Swal.showValidationMessage("Debe abrir caja antes de registrar un movimiento");
          return false;
        }
        const montoVal = parseFloat(document.getElementById("swal-abono-monto")?.value || 0);
        const metodoVal = document.getElementById("swal-abono-metodo")?.value || "efectivo";
        if (!(montoVal > 0)) {
          Swal.showValidationMessage("Monto inválido");
          return false;
        }
        return { monto: montoVal, metodo: metodoVal };
      },
    });

    if (!formValues) return;
    const { monto, metodo } = formValues;

    try {
      const res = await authFetch("api_contratos.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "registrar_abono",
          contrato_paciente_id: Number(contrato.id),
          monto,
          metodo_pago: metodo,
          observaciones: "Abono desde Estado de Cuenta",
        }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo registrar abono");
      const fechaHora = new Date().toLocaleString("es-PE");
      const toMoney = (value) => `S/ ${Number(value || 0).toFixed(2)}`;
      const contactoLinea = [clinicBrand.telefono, clinicBrand.celular].filter(Boolean).join(" | ");
      const logoSrc = clinicBrand.logo || "https://via.placeholder.com/120x60?text=LOGO";
      const nombrePaciente = String(pacienteInfo?.fullName || "Paciente").trim() || "Paciente";

      const ticketCss = `
        <style>
          * { box-sizing: border-box; }
          .ticket-80 {
            width: 100%;
            max-width: 320px;
            margin: 0 auto;
            padding: 8px 10px;
            font-family: "Courier New", "Lucida Console", monospace;
            font-size: 11px;
            line-height: 1.2;
            color: #111827;
            font-weight: 700;
          }
          .ticket-80 .t-center { text-align: center; }
          .ticket-80 .t-logo { height: 50px; margin: 0 auto 4px; display: block; image-rendering: -webkit-optimize-contrast; filter: contrast(1.15) saturate(1.05); }
          .ticket-80 .t-clinic { margin: 2px 0; font-size: 13px; font-weight: 800; letter-spacing: 0.2px; }
          .ticket-80 .t-line { margin: 1px 0; font-weight: 700; }
          .ticket-80 .t-hr { border: 0; border-top: 1px dashed #6b7280; margin: 6px 0; }
          .ticket-80 .t-title { font-weight: 800; text-transform: uppercase; margin: 0 0 4px; }
          .ticket-80 .t-meta { margin: 1px 0; font-weight: 700; }
          .ticket-80 .t-section { margin: 6px 0 3px; font-weight: 800; text-transform: uppercase; }
          .ticket-80 .t-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 6px;
            margin: 1px 0;
          }
          .ticket-80 .t-desc {
            flex: 1;
            min-width: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .ticket-80 .t-amount { white-space: nowrap; font-weight: 700; }
          .ticket-80 .t-total { font-size: 12px; font-weight: 700; }
          .ticket-80 .t-note { margin-top: 6px; text-align: center; font-size: 10px; color: #111827; font-weight: 700; }
          @media print {
            @page { size: 80mm auto; margin: 2mm; }
            html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .ticket-80 {
              width: 76mm;
              max-width: 76mm;
              margin: 0;
              padding: 2.5mm;
              font-size: 10.5px;
              line-height: 1.15;
            }
            .ticket-80 .t-clinic { font-size: 12px; }
            .ticket-80 .t-logo { height: 42px; margin-bottom: 3px; }
            .ticket-80 .t-total { font-size: 11.5px; }
          }
        </style>`;

      const comprobanteBody = `
        <div class="ticket-80">
          <div class="t-center">
            <img src="${logoSrc}" alt="Logo" class="t-logo" />
            <div class="t-clinic"${clinicBrand.nombre_color ? ` style="color:${clinicBrand.nombre_color};"` : ""}>${clinicBrand.name}</div>
            ${clinicBrand.slogan ? `<div class="t-line" style="font-style:italic;${clinicBrand.slogan_color ? `color:${clinicBrand.slogan_color};` : ""}">${clinicBrand.slogan}</div>` : ""}
            ${clinicBrand.direccion ? `<div class="t-line">${clinicBrand.direccion}</div>` : ""}
            ${contactoLinea ? `<div class="t-line">${contactoLinea}</div>` : ""}
            ${clinicBrand.ruc ? `<div class="t-line">RUC: ${clinicBrand.ruc}</div>` : ""}
          </div>

          <hr class="t-hr" />
          <div class="t-title">Comprobante de abono #${Number(data?.ingreso_id || 0) || "-"}</div>
          <div class="t-meta">Fecha: ${fechaHora}</div>
          <div class="t-meta">Paciente: ${nombrePaciente}</div>
          <div class="t-meta">DNI: ${pacienteInfo?.dni || "-"}</div>
          <div class="t-meta">H.C.: ${pacienteInfo?.hc || "-"}</div>
          <div class="t-meta">Contrato: #${Number(contrato?.id || 0)} ${String(contrato?.plantilla_codigo || "")}</div>

          <hr class="t-hr" />
          <div class="t-section">Detalle</div>
          <div class="t-row"><div class="t-desc">Abono contrato</div><div class="t-amount">${toMoney(data?.abono_registrado || 0)}</div></div>

          <hr class="t-hr" />
          <div class="t-section">Resumen saldo</div>
          <div class="t-row"><div class="t-desc">Saldo anterior</div><div class="t-amount">${toMoney(data?.saldo_anterior || 0)}</div></div>
          <div class="t-row"><div class="t-desc">Abono aplicado</div><div class="t-amount">${toMoney(data?.abono_registrado || 0)}</div></div>
          <div class="t-row t-total"><div class="t-desc">Saldo pendiente</div><div class="t-amount">${toMoney(data?.saldo_nuevo || 0)}</div></div>

          <div class="t-meta">Estado contrato: ${String(data?.estado_contrato || "activo").toUpperCase()}</div>
          <div class="t-meta">Pago: ${String(metodo || "efectivo").toUpperCase()}</div>
          <hr class="t-hr" />
          <div class="t-note">Gracias por su preferencia<br />Conserve este comprobante</div>
        </div>`;

      const comprobante = `${ticketCss}${comprobanteBody}`;

      await Swal.fire({
        title: "Abono Procesado ✅",
        html: comprobante,
        icon: "success",
        confirmButtonText: "Imprimir Comprobante",
        showCancelButton: true,
        cancelButtonText: "Solo Continuar",
      }).then((result) => {
        if (result.isConfirmed) {
          const ventanaImpresion = window.open("", "_blank");
          if (!ventanaImpresion) return;
          const documentoImpresion = `<!doctype html><html><head><meta charset="utf-8"><title>Comprobante</title>${ticketCss}</head><body>${comprobanteBody}</body></html>`;
          ventanaImpresion.document.write(documentoImpresion);
          ventanaImpresion.document.close();
          ventanaImpresion.print();
        }
      });
      await cargar();
    } catch (error) {
      Swal.fire("Error", error?.message || "No se pudo registrar abono", "error");
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Estado de Cuenta del Paciente</h1>
          <p className="text-sm text-slate-600">Paciente ID: {pacienteId}</p>
          {(pacienteInfo.fullName || pacienteInfo.dni || pacienteInfo.hc) && (
            <p className="text-sm text-slate-600">
              {pacienteInfo.fullName || "Paciente"}
              {pacienteInfo.dni ? ` | DNI: ${pacienteInfo.dni}` : ""}
              {pacienteInfo.hc ? ` | HC: ${pacienteInfo.hc}` : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-2 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Volver
          </button>
          <button
            onClick={cargar}
            className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Recargar
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
          <div className="text-xs uppercase tracking-wide">Saldo total pendiente</div>
          <div className="font-semibold text-lg">{money(saldoTotal)}</div>
        </div>
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
          <div className="text-xs uppercase tracking-wide">Total abonado</div>
          <div className="font-semibold text-lg">{money(totalAbonadoGeneral)}</div>
        </div>
        <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-sky-900">
          <div className="text-xs uppercase tracking-wide">Servicios totales</div>
          <div className="font-semibold text-lg">{Number(serviciosTotalesGeneral || 0).toFixed(2)}</div>
        </div>
        <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900">
          <div className="text-xs uppercase tracking-wide">Servicios consumidos</div>
          <div className="font-semibold text-lg">{Number(serviciosConsumidosGeneral || 0).toFixed(2)}</div>
        </div>
        <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-teal-900">
          <div className="text-xs uppercase tracking-wide">Agenda consumidos</div>
          <div className="font-semibold text-lg">{Number(agendaConsumidosGeneral || 0)}</div>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-center text-slate-500">Cargando...</div>
      ) : contratos.length === 0 ? (
        <div className="p-6 text-center text-slate-500 border rounded-lg">Sin contratos activos para este paciente.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {contratos.map((c) => (
            <div key={c.id} className="border rounded-xl p-4 bg-white shadow-sm">
              {(() => {
                const contratoCerrado = ["finalizado", "liquidado", "cancelado"].includes(String(c.estado || "").toLowerCase());
                return (
              <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{c.plantilla_nombre} ({c.plantilla_codigo})</h2>
                  <p className="text-sm text-slate-600">Estado: {c.estado} | Periodo: {c.fecha_inicio} a {c.fecha_fin}</p>
                  <p className="text-sm text-slate-600">Total: {money(c.monto_total)} | Abonado: {money(c.total_abonado)} | Saldo: {money(c.saldo_pendiente)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {Number(c.alerta_liquidacion_vencida || 0) === 1 ? (
                    <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-700">Liquidacion vencida</span>
                  ) : Number(c.alerta_liquidacion_critica || 0) === 1 ? (
                    <span className="px-2 py-1 rounded text-xs bg-amber-100 text-amber-700">Liquidacion pendiente critica</span>
                  ) : null}
                  {c.fecha_alerta_liquidacion && (
                    <span className="px-2 py-1 rounded text-xs bg-slate-100 text-slate-700">Alerta desde: {String(c.fecha_alerta_liquidacion).slice(0, 10)}</span>
                  )}
                  <button
                    onClick={() => registrarAbono(c)}
                    disabled={contratoCerrado}
                    className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Registrar abono
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Resumen de consumo</h3>
                  <p className="text-sm text-slate-600">Servicios totales: {Number(c.servicios_totales || 0).toFixed(2)}</p>
                  <p className="text-sm text-slate-600">Servicios consumidos: {Number(c.servicios_consumidos || 0).toFixed(2)}</p>
                  <p className="text-sm text-slate-600">Servicios pendientes: {Number(c.servicios_pendientes || 0).toFixed(2)}</p>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2 mt-3">Agenda</h3>
                  <p className="text-sm text-slate-600">Eventos programados: {Number(c.agenda_total || 0)}</p>
                  <p className="text-sm text-slate-600">Eventos consumidos: {Number(c.agenda_consumidos || 0)}</p>
                  <p className="text-sm text-slate-600">Pendientes por atender: {Number(c.agenda_restantes || 0)}</p>
                  <p className="text-sm text-slate-600">Penultima actividad: {c.penultima_fecha_programada ? String(c.penultima_fecha_programada).slice(0, 10) : '-'}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.anchor_tipo && c.anchor_tipo !== "ninguno" && (
                      <span className="text-xs px-2 py-1 rounded bg-violet-100 text-violet-700">
                        Anchor: {ANCHOR_LABELS[c.anchor_tipo] || c.anchor_tipo}
                        {c.anchor_fecha ? ` — ${String(c.anchor_fecha).slice(0, 10)}` : ""}
                      </span>
                    )}
                    <button
                      className="text-xs px-2 py-1 rounded bg-sky-100 text-sky-700 hover:bg-sky-200"
                      onClick={() => toggleAgenda(Number(c.id))}
                    >
                      {agendaAbierta.has(Number(c.id)) ? "Ocultar agenda" : "Ver agenda"}
                    </button>
                    <button
                      disabled={contratoCerrado}
                      className="text-xs px-2 py-1 rounded bg-violet-100 text-violet-700 hover:bg-violet-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => abrirRecalc(c)}
                    >
                      Recalcular agenda
                    </button>
                  </div>

                  {/* Panel recalcular agenda */}
                  {recalcForm?.contratoId === Number(c.id) && (
                    <div className="mt-2 p-3 border rounded bg-violet-50 text-sm flex flex-col gap-2">
                      <p className="text-xs font-semibold text-violet-800">Recalcular agenda — cambia el anchor y regenera eventos pendientes</p>
                      <div className="flex flex-wrap gap-2 items-end">
                        <label className="flex flex-col text-xs text-slate-600">
                          Anchor clínico
                          <select
                            className="border rounded px-2 py-1 mt-1"
                            value={recalcForm.anchor_tipo}
                            onChange={(e) => setRecalcForm((p) => ({ ...p, anchor_tipo: e.target.value, anchor_fecha: "" }))}
                          >
                            <option value="ninguno">Ninguno (fecha inicio)</option>
                            <option value="fur">FUR — Fecha Última Regla</option>
                            <option value="fecha_cirugia">Fecha de cirugía programada</option>
                            <option value="fecha_parto_estimada">Fecha probable de parto (FPP)</option>
                            <option value="fecha_inicio_tratamiento">Inicio de tratamiento</option>
                          </select>
                        </label>
                        {recalcForm.anchor_tipo !== "ninguno" && (
                          <label className="flex flex-col text-xs text-slate-600">
                            Fecha del anchor
                            <input
                              type="date"
                              className="border rounded px-2 py-1 mt-1"
                              value={recalcForm.anchor_fecha}
                              onChange={(e) => setRecalcForm((p) => ({ ...p, anchor_fecha: e.target.value }))}
                            />
                          </label>
                        )}
                        <button
                          className="px-3 py-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 text-xs self-end"
                          onClick={guardarRecalc}
                          disabled={recalcForm.saving}
                        >
                          {recalcForm.saving ? "Recalculando..." : "Confirmar recálculo"}
                        </button>
                        <button
                          className="px-3 py-1 rounded bg-gray-100 text-gray-700 text-xs self-end"
                          onClick={() => setRecalcForm(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tabla de agenda expandible */}
                  {agendaAbierta.has(Number(c.id)) && (
                    <div className="mt-2">
                      <div className="mb-2 flex items-center gap-2 text-xs">
                        <label className="text-slate-600">Filtrar agenda:</label>
                        <select
                          className="border rounded px-2 py-1"
                          value={agendaFiltroEstado[Number(c.id)] || "todos"}
                          onChange={(e) => setAgendaFiltroEstado((p) => ({ ...p, [Number(c.id)]: e.target.value }))}
                        >
                          <option value="todos">Todos</option>
                          <option value="pendiente">Pendiente</option>
                          <option value="confirmado">Confirmado</option>
                          <option value="atendido">Atendido</option>
                          <option value="espontaneo">Espontáneo</option>
                          <option value="no_asistio_justificado">No asistió</option>
                          <option value="reprogramado">Reprogramado</option>
                          <option value="cancelado">Cancelado</option>
                        </select>
                      </div>
                      {loadingAgenda[Number(c.id)] ? (
                        <p className="text-xs text-slate-500">Cargando agenda...</p>
                      ) : !agendaPorContrato[Number(c.id)] || agendaPorContrato[Number(c.id)].length === 0 ? (
                        <p className="text-xs text-slate-500">Sin eventos de agenda.</p>
                      ) : (
                        <div className="overflow-auto border rounded">
                          <table className="min-w-full text-xs">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left">Fecha prog.</th>
                                <th className="px-2 py-2 text-left">Evento</th>
                                <th className="px-2 py-2 text-left">Tipo</th>
                                <th className="px-2 py-2 text-left">Programacion</th>
                                <th className="px-2 py-2 text-left">Estado</th>
                                <th className="px-2 py-2 text-left">Accion</th>
                              </tr>
                            </thead>
                            <tbody>
                              {agendaPorContrato[Number(c.id)]
                                .filter((ev) => {
                                  const f = agendaFiltroEstado[Number(c.id)] || "todos";
                                  if (f === "todos") return true;
                                  return String(ev.estado_evento || "").toLowerCase() === f;
                                })
                                .map((ev) => {
                                const progLabel = (() => {
                                  if (!ev.offset_tipo || ev.offset_tipo === "ninguno") return `Orden ${ev.orden_programado || "-"}`;
                                  if (ev.offset_tipo === "semana_gestacional") return `Sem. gest. ${ev.offset_valor}`;
                                  return `+${ev.offset_valor} ${ev.offset_unidad} desde anchor`;
                                })();
                                return (
                                  <tr key={ev.id} className="border-t">
                                    <td className="px-2 py-2 whitespace-nowrap">{ev.fecha_programada ? String(ev.fecha_programada).slice(0, 10) : "-"}</td>
                                    <td className="px-2 py-2">{ev.titulo_evento}</td>
                                    <td className="px-2 py-2">{ev.servicio_tipo}</td>
                                    <td className="px-2 py-2 text-slate-500">{progLabel}</td>
                                    <td className="px-2 py-2">
                                      <span className={`px-2 py-1 rounded ${ESTADO_EVENTO_COLORES[ev.estado_evento] || "bg-gray-100 text-gray-700"}`}>
                                        {ev.estado_evento}
                                      </span>
                                    </td>
                                    <td className="px-2 py-2">
                                      {ev.estado_evento === "pendiente" && (
                                        <div className="flex gap-1">
                                          <button
                                            disabled={contratoCerrado}
                                            className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                            onClick={() => actualizarEvento(ev, "atendido", c)}
                                          >
                                            Atendido
                                          </button>
                                          <button
                                            disabled={contratoCerrado}
                                            className="px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                            onClick={() => actualizarEvento(ev, "confirmado", c)}
                                          >
                                            Confirmar
                                          </button>
                                          <button
                                            disabled={contratoCerrado}
                                            className="px-2 py-1 rounded bg-teal-100 text-teal-700 hover:bg-teal-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                            onClick={() => actualizarEvento(ev, "espontaneo", c)}
                                          >
                                            Espontáneo
                                          </button>
                                          <button
                                            disabled={contratoCerrado}
                                            className="px-2 py-1 rounded bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                            onClick={() => actualizarEvento(ev, "no_asistio_justificado", c)}
                                          >
                                            No asistió
                                          </button>
                                          <button
                                            disabled={contratoCerrado}
                                            className="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                            onClick={() => actualizarEvento(ev, "cancelado", c)}
                                          >
                                            Cancelar
                                          </button>
                                        </div>
                                      )}
                                      {ev.estado_evento === "confirmado" && (
                                        <div className="flex gap-1">
                                          <button
                                            disabled={contratoCerrado}
                                            className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                            onClick={() => actualizarEvento(ev, "atendido", c)}
                                          >
                                            Atendido
                                          </button>
                                          <button
                                            disabled={contratoCerrado}
                                            className="px-2 py-1 rounded bg-teal-100 text-teal-700 hover:bg-teal-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                            onClick={() => actualizarEvento(ev, "espontaneo", c)}
                                          >
                                            Espontáneo
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Pagos</h3>
                  <div className="max-h-36 overflow-auto border rounded p-2">
                    {(Array.isArray(c.pagos) ? c.pagos : []).length === 0 ? (
                      <p className="text-sm text-slate-500">Sin movimientos.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-500">
                            <th className="py-1">Fecha</th>
                            <th className="py-1">Monto</th>
                            <th className="py-1">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(c.pagos || []).map((p) => (
                            <tr key={p.id} className="border-t">
                              <td className="py-1">{p.fecha_pago || p.created_at || "-"}</td>
                              <td className="py-1">{money(p.monto_pagado)}</td>
                              <td className="py-1">{p.estado || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
              </>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
