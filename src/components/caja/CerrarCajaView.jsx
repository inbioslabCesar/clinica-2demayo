import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";

// Modal SweetAlert2 para impresión tipo etiquetera
function mostrarEtiquetaImpresion(datos, totalesBackend = null, clinicBrand = null) {
  // Usar los totales de métodos de pago del backend si están disponibles
  const total_efectivo = totalesBackend?.total_efectivo ?? datos.total_efectivo ?? 0;
  const total_yape = totalesBackend?.total_yape ?? datos.total_yape ?? 0;
  const total_plin = totalesBackend?.total_plin ?? datos.total_plin ?? 0;
  const total_tarjetas = totalesBackend?.total_tarjetas ?? datos.total_tarjetas ?? 0;
  const total_transferencias = totalesBackend?.total_transferencias ?? datos.total_transferencias ?? 0;
  // Egresos
  const egreso_honorarios = totalesBackend?.egreso_honorarios ?? datos.egreso_honorarios ?? 0;
  const egreso_lab_ref = totalesBackend?.egreso_lab_ref ?? datos.egreso_lab_ref ?? 0;
  const egreso_operativo = totalesBackend?.egreso_operativo ?? datos.egreso_operativo ?? 0;
  // Nuevo: egresos cubiertos por Yape/Transferencias
  const egreso_electronico = datos.egreso_electronico !== undefined && datos.egreso_electronico !== "" && !isNaN(parseFloat(datos.egreso_electronico)) ? parseFloat(datos.egreso_electronico) : 0;
  const total_egresos = totalesBackend?.total_egresos ?? (egreso_honorarios + egreso_lab_ref + egreso_operativo);
  // Lógica para explicación automática de diferencia negativa
  let explicacionDiferencia = "";
  const diferencia = (datos.monto_contado !== undefined ? parseFloat(datos.monto_contado) : 0) - total_egresos;
  if (diferencia < 0) {
    explicacionDiferencia = "<div class='t-warning'>No hay efectivo suficiente; el egreso fue cubierto por Yape, Plin, transferencia o quedó pendiente.</div>";
  }
  // Recibo compacto tipo etiquetera
  const clinicName = String(clinicBrand?.name || 'MI CLINICA').trim();
  const logoHtml = clinicBrand?.logo
    ? `<div style="text-align:center;margin:0 0 8px 0;"><img src="${clinicBrand.logo}" alt="Logo clínica" style="display:block;height:52px;max-width:160px;object-fit:contain;margin:0 auto;" /></div>`
    : '';
  const sloganHtml = clinicBrand?.slogan
    ? `<p style="text-align:center;margin:0 0 8px 0;font-style:italic;font-size:11px;line-height:1.25;${clinicBrand.slogan_color ? 'color:' + clinicBrand.slogan_color + ';' : ''}">${clinicBrand.slogan}</p>`
    : '';
  const printModeKey = "cierreCaja.printMode";
  const lastResolvedPrintModeKey = "cierreCaja.lastResolvedPrintMode";
  const getStoredPrintMode = () => {
    try {
      const mode = window.localStorage.getItem(printModeKey);
      if (mode === "auto" || mode === "termica" || mode === "a4") return mode;
    } catch (_) {
      // ignore storage errors
    }
    return "auto";
  };
  const getAutoResolvedMode = () => {
    try {
      const last = window.localStorage.getItem(lastResolvedPrintModeKey);
      if (last === "termica" || last === "a4") return last;
    } catch (_) {
      // ignore storage errors
    }
    return "termica";
  };
  const storePrintModes = (selectedMode, resolvedMode) => {
    try {
      window.localStorage.setItem(printModeKey, selectedMode);
      window.localStorage.setItem(lastResolvedPrintModeKey, resolvedMode);
    } catch (_) {
      // ignore storage errors
    }
  };

  const cierreId = Number(datos.caja_id || 0);
  const payloadQr = [
    `CIERRE:${cierreId || "-"}`,
    `FECHA:${datos.fecha || "-"}`,
    `USUARIO:${datos.usuario_nombre || "-"}`,
    `APERTURA:${(datos.monto_apertura || 0).toFixed(2)}`,
    `EFECTIVO:${total_efectivo.toFixed(2)}`,
    `EGRESOS:${total_egresos.toFixed(2)}`,
  ].join("|");
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(payloadQr)}`;

  const construirRecibo = (printMode = "termica") => {
    const esA4 = printMode === "a4";
    const estilosRecibo = `
    <style>
      .ticket-cierre {
        width: ${esA4 ? "720px" : "320px"};
        margin: 0 auto;
        padding: ${esA4 ? "14px 18px" : "10px 12px"};
        box-sizing: border-box;
        font-family: "Courier New", "Lucida Console", monospace;
        color: #1f2937;
        font-size: ${esA4 ? "14px" : "13px"};
        line-height: 1.3;
      }
      .ticket-cierre .t-center { text-align: center; }
      .ticket-cierre .t-title {
        margin: 0 0 8px 0;
        font-size: 16px;
        font-weight: 700;
        letter-spacing: 0.3px;
      }
      .ticket-cierre .t-subtitle {
        margin: 0 0 10px 0;
        font-size: 13px;
        font-weight: 700;
      }
      .ticket-cierre .t-hr {
        border: 0;
        border-top: 1px dashed #6b7280;
        margin: 8px 0;
      }
      .ticket-cierre .t-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        margin: ${esA4 ? "2px 0" : "1px 0"};
      }
      .ticket-cierre .t-row .label { font-weight: 700; white-space: nowrap; }
      .ticket-cierre .t-row .value { text-align: right; }
      .ticket-cierre .t-section {
        margin-top: 6px;
        font-weight: 700;
        text-transform: uppercase;
        font-size: 12px;
        letter-spacing: 0.4px;
      }
      .ticket-cierre .t-note {
        margin-top: 8px;
        white-space: pre-line;
        font-size: 12px;
      }
      .ticket-cierre .t-warning {
        margin-top: 8px;
        color: #b91c1c;
        font-weight: 700;
        font-size: 12px;
      }
      .ticket-cierre .t-footer {
        margin-top: 10px;
        text-align: center;
        font-size: 11px;
        color: #4b5563;
      }
      .ticket-cierre .t-qr {
        margin-top: 10px;
        text-align: center;
      }
      .ticket-cierre .t-qr img {
        width: 92px;
        height: 92px;
        object-fit: contain;
      }
      .ticket-cierre .t-qr-caption {
        margin-top: 4px;
        font-size: 11px;
        color: #4b5563;
      }
      @media print {
        body { margin: 0; }
        @page {
          size: ${esA4 ? "A4 portrait" : "auto"};
          margin: ${esA4 ? "10mm" : "2mm"};
        }
        .ticket-cierre {
          width: ${esA4 ? "190mm" : "76mm"};
          margin: 0;
          padding: ${esA4 ? "6mm" : "3mm"};
          font-size: ${esA4 ? "13px" : "12px"};
        }
      }
    </style>
  `;

    return `
    ${estilosRecibo}
    <div class="ticket-cierre">
      ${logoHtml}
      <h3 class="t-center t-title" style="${clinicBrand?.nombre_color ? 'color:' + clinicBrand.nombre_color + ';' : ''}">${clinicName}</h3>
      ${sloganHtml}
      <h4 class="t-center t-subtitle">CIERRE DE CAJA</h4>
      <hr class="t-hr" />

      <div class="t-row"><span class="label">Usuario</span><span class="value">${datos.usuario_nombre || "-"}</span></div>
      <div class="t-row"><span class="label">Rol</span><span class="value">${datos.usuario_rol || "-"}</span></div>
      <div class="t-row"><span class="label">Fecha</span><span class="value">${datos.fecha || "-"}</span></div>
      <div class="t-row"><span class="label">Apertura</span><span class="value">S/ ${(datos.monto_apertura||0).toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Hora apertura</span><span class="value">${datos.hora_apertura || "-"}</span></div>
      <div class="t-row"><span class="label">Hora cierre</span><span class="value">${datos.hora_cierre || "-"}</span></div>

      <hr class="t-hr" />
      <div class="t-section">Ingresos por tipo</div>
      <div class="t-row"><span class="label">Efectivo</span><span class="value">S/ ${total_efectivo.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Yape</span><span class="value">S/ ${total_yape.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Plin</span><span class="value">S/ ${total_plin.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Tarjeta</span><span class="value">S/ ${total_tarjetas.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Transferencia</span><span class="value">S/ ${total_transferencias.toFixed(2)}</span></div>

      <hr class="t-hr" />
      <div class="t-section">Egresos</div>
      <div class="t-row"><span class="label">Honorarios medicos</span><span class="value">S/ ${egreso_honorarios.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Lab. referencia</span><span class="value">S/ ${egreso_lab_ref.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Operativo</span><span class="value">S/ ${egreso_operativo.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Yape/Transferencias</span><span class="value">S/ ${egreso_electronico.toFixed(2)}</span></div>
      <div class="t-row"><span class="label">Total egresos</span><span class="value">S/ ${total_egresos.toFixed(2)}</span></div>

      <hr class="t-hr" />
      <div class="t-section">Ocurrencias</div>
      <div class="t-note">${datos.observaciones || "Sin observaciones"}</div>
      ${explicacionDiferencia}
      <hr class="t-hr" />
      <div class="t-qr">
        <img src="${qrSrc}" alt="QR auditoria cierre" />
        <div class="t-qr-caption">Auditoria: CIERRE #${cierreId || "-"}</div>
      </div>
      <div class="t-footer">Conserve este recibo para archivo</div>
    </div>
  `;
  };

  const storedMode = getStoredPrintMode();
  const previewMode = storedMode === "auto" ? getAutoResolvedMode() : storedMode;
  const reciboPreview = construirRecibo(previewMode);
  const selectorModo = `
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;text-align:left;font-size:13px;">
      <label for="ticket-print-mode" style="font-weight:600;display:block;margin-bottom:4px;">Modo de impresion</label>
      <select id="ticket-print-mode" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:6px;">
        <option value="auto" ${storedMode === "auto" ? "selected" : ""}>Auto (usa ultimo modo)</option>
        <option value="termica" ${storedMode === "termica" ? "selected" : ""}>Termica 80mm</option>
        <option value="a4" ${storedMode === "a4" ? "selected" : ""}>A4</option>
      </select>
    </div>
  `;
  Swal.fire({
    title: 'Cierre de Caja Procesado ✅',
    html: `${reciboPreview}${selectorModo}`,
    icon: 'success',
    confirmButtonText: 'Imprimir Recibo',
    showCancelButton: true,
    cancelButtonText: 'Solo Continuar'
  }).then((result) => {
    if (result.isConfirmed) {
      const selector = Swal.getHtmlContainer()?.querySelector("#ticket-print-mode");
      const selectedMode = selector?.value === "a4" || selector?.value === "termica" || selector?.value === "auto"
        ? selector.value
        : storedMode;
      const resolvedMode = selectedMode === "auto" ? getAutoResolvedMode() : selectedMode;
      storePrintModes(selectedMode, resolvedMode);
      const recibo = construirRecibo(resolvedMode);
      const ventanaImpresion = window.open('', '_blank');
      ventanaImpresion.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Cierre de Caja</title></head><body>${recibo}</body></html>`);
      ventanaImpresion.document.close();
      ventanaImpresion.print();
    }
  });
}

export default function CerrarCajaView() {
  const [observaciones, setObservaciones] = useState("");
  const [resumen, setResumen] = useState(null);
  const [montoContado, setMontoContado] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [egresoElectronicoManual, setEgresoElectronicoManual] = useState("");
  const [clinicBrand, setClinicBrand] = useState({ name: 'MI CLINICA', logo: '', slogan: '', slogan_color: '', nombre_color: '' });
  const navigate = useNavigate();

  const verificarCajaAbierta = async ({ mostrarMensaje = false } = {}) => {
    try {
      const r = await fetch('/api_caja_estado.php', {
        credentials: 'include',
        cache: 'no-store'
      });
      const data = await r.json();
      const abierta = Boolean(data?.success) && String(data?.estado || '').toLowerCase() === 'abierta';
      if (!abierta && mostrarMensaje) {
        await Swal.fire({
          icon: 'info',
          title: 'Caja ya cerrada',
          text: 'No puedes acceder a cierre de caja porque la caja actual ya esta cerrada.',
          confirmButtonText: 'Entendido'
        });
      }
      return abierta;
    } catch (_) {
      return false;
    }
  };

  useEffect(() => {
    // Obtener resumen de caja actual
    async function fetchResumen() {
      setLoading(true);
      try {
        const abierta = await verificarCajaAbierta();
        if (!abierta) {
          setError('No hay caja abierta para cerrar');
          navigate('/contabilidad', { replace: true });
          return;
        }

        const resp = await fetch("/api_resumen_diario.php", { credentials: "include" });
        const data = await resp.json();
        if (data.success) {
          setResumen(data);
          setError("");
        } else {
          setError(data.error || "Error al cargar resumen");
        }
      } catch (e) {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }
    fetchResumen();
  }, [navigate]);

  useEffect(() => {
    // Evita acceso por BFCache (atras/adelante del navegador) cuando la caja ya fue cerrada.
    const onPageShow = async () => {
      const abierta = await verificarCajaAbierta();
      if (!abierta) {
        navigate('/contabilidad', { replace: true });
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [navigate]);

  useEffect(() => {
    let mounted = true;
    fetch('/api_get_configuracion.php', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    })
      .then((res) => res.json())
      .then((data) => {
        if (!mounted || !data?.success) return;
        const cfg = data.data || {};
        const name = String(cfg.nombre_clinica || '').trim().toUpperCase() || 'MI CLINICA';
        const rawLogo = String(cfg.logo_url || '').trim();
        const logo = rawLogo
          ? (/^(https?:\/\/|data:|blob:)/i.test(rawLogo)
            ? rawLogo
            : `${window.location.origin}/${rawLogo.replace(/^\/+/, '')}`)
          : '';
        setClinicBrand({
          name,
          logo,
          slogan: String(cfg.slogan || '').trim(),
          slogan_color: String(cfg.slogan_color || '').trim(),
          nombre_color: String(cfg.nombre_color || '').trim(),
        });
      })
      .catch(() => {
        // fallback defaults
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Calcular ingreso total y ganancia neta solo si resumen existe
  const ingresoTotalDia = resumen?.por_pago
    ? resumen.por_pago.reduce((acc, p) => acc + parseFloat(p.total_pago || 0), 0)
    : 0;

  const gananciaDia = resumen
    ? ingresoTotalDia
      - (parseFloat(resumen.egreso_honorarios || 0)
      + parseFloat(resumen.egreso_lab_ref || 0)
      + parseFloat(resumen.egreso_operativo || 0))
    : 0;

  const handleCerrarCaja = async () => {
    // Calcular totales por método de pago
    let total_yape = 0;
    let total_plin = 0;
    let total_tarjetas = 0;
    let total_transferencias = 0;
    if (resumen?.por_pago?.length) {
      resumen.por_pago.forEach(p => {
        const metodo = (p.metodo_pago || p.tipo_pago || '').toLowerCase();
        if (metodo === 'yape') total_yape = parseFloat(p.total_pago);
        if (metodo === 'plin') total_plin = parseFloat(p.total_pago);
        if (metodo === 'tarjeta') total_tarjetas = parseFloat(p.total_pago);
        if (metodo === 'transferencia') total_transferencias = parseFloat(p.total_pago);
      });
    }
    try {
      const abierta = await verificarCajaAbierta({ mostrarMensaje: true });
      if (!abierta) {
        navigate('/contabilidad', { replace: true });
        return;
      }

      const resp = await fetch("/api_cerrar_caja.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          monto_contado: montoContado,
          observaciones,
          total_yape,
          total_plin,
          total_tarjetas,
          total_transferencias,
          egreso_electronico: egresoElectronicoManual
        })
      });
      const data = await resp.json();
      if (data.success) {
        // Mostrar recibo tipo etiquetera con los totales de egresos del backend
        mostrarEtiquetaImpresion({
          ...resumen,
          observaciones,
          monto_contado: montoContado,
          caja_id: data.caja_id,
          fecha: data.fecha || resumen?.fecha || new Date().toISOString().slice(0, 10),
          egreso_electronico: egresoElectronicoManual,
          hora_cierre: data.hora_cierre || new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true }),
          usuario_nombre: data.usuario_nombre || (window.sessionStorage.getItem('usuario') ? JSON.parse(window.sessionStorage.getItem('usuario')).nombre : ''),
          usuario_rol: data.usuario_rol || (window.sessionStorage.getItem('usuario') ? JSON.parse(window.sessionStorage.getItem('usuario')).rol : ''),
        }, data.totales, clinicBrand);
        // Redirigir después de cerrar el modal
        setTimeout(() => navigate('/contabilidad'), 500);
      } else {
        alert("Error: " + (data.error || "No se pudo cerrar la caja"));
      }
    } catch (e) {
      alert("Error de conexión al cerrar caja");
    }
  };

  if (loading) return <div className="p-8 text-center">Cargando resumen...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!resumen) return null;


  // Definir variables seguras para evitar ReferenceError
  const efectivoCobrado = (() => {
    const efectivo = resumen?.por_pago?.find(p => (p.metodo_pago || p.tipo_pago)?.toLowerCase() === "efectivo");
    return efectivo ? parseFloat(efectivo.total_pago) : 0;
  })();

  // Calcular egresos cubiertos por Yape/transferencias
  const egresoCubiertoElectronico = egresoElectronicoManual !== "" && !isNaN(parseFloat(egresoElectronicoManual))
    ? parseFloat(egresoElectronicoManual)
    : 0;

  // Calcular total egresos
  const totalEgresos = (resumen.egreso_honorarios ? resumen.egreso_honorarios : 0)
    + (resumen.egreso_lab_ref ? resumen.egreso_lab_ref : 0)
    + (resumen.egreso_operativo ? resumen.egreso_operativo : 0);

  // Efectivo esperado final: efectivo cobrado - (total egresos - egresoCubiertoElectronico)
  const efectivoEsperado = efectivoCobrado - (totalEgresos - egresoCubiertoElectronico);

  // Diferencia: efectivo contado - efectivo esperado
  const diferencia = parseFloat(montoContado || 0) - efectivoEsperado;

  return (
    <>
      <div className="max-w-3xl mx-auto p-4 sm:p-8 bg-gradient-to-br from-red-50 via-white to-red-100 rounded-2xl shadow-2xl">
        <h2 className="text-3xl font-extrabold mb-6 text-red-700 flex items-center gap-3 drop-shadow">
          <span className="inline-block bg-red-100 text-red-700 rounded-full p-2 text-3xl">🧾</span>
          Cierre de Caja
        </h2>
        <div className="flex flex-wrap gap-4 mb-6 justify-center">
          <div className="bg-orange-100 rounded-xl px-6 py-3 flex flex-col items-center shadow-lg w-full sm:w-auto">
            <span className="text-xs text-orange-700 font-semibold">Fecha</span>
            <span className="font-bold text-orange-800 text-lg tracking-wide">{resumen.fecha}</span>
          </div>
          <div className="bg-blue-100 rounded-xl px-6 py-3 flex flex-col items-center shadow-lg w-full sm:w-auto">
            <span className="text-xs text-blue-700 font-semibold">Apertura</span>
            <span className="font-bold text-blue-800 text-lg tracking-wide">S/ {resumen.monto_apertura?.toFixed(2)}</span>
          </div>
          <div className="bg-yellow-100 rounded-xl px-6 py-3 flex flex-col items-center shadow-lg w-full sm:w-auto">
            <span className="text-xs text-yellow-700 font-semibold">Ingreso total del día</span>
            <span className="font-bold text-yellow-800 text-lg tracking-wide">S/ {ingresoTotalDia.toFixed(2)}</span>
          </div>
          <div className="bg-green-100 rounded-xl px-6 py-3 flex flex-col items-center shadow-lg w-full sm:w-auto">
            <span className="text-xs text-green-700 font-semibold">Ganancia del día</span>
            <span className="font-bold text-green-800 text-lg tracking-wide">S/ {gananciaDia.toFixed(2)}</span>
            <span className="text-xs text-gray-600 mt-1">(Ingreso total - egresos)</span>
          </div>
        </div>
        <div className="mb-6">
          <span className="font-semibold text-gray-700 mb-2 block text-lg">Cobros por tipo de pago:</span>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-blue-200 scrollbar-track-blue-50 snap-x snap-mandatory">
            {resumen.por_pago?.map((pago, i) => {
              let color = "green";
              if ((pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("tarjeta")) color = "blue";
              else if ((pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("yape") || (pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("plin") || (pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("transfer")) color = "purple";
              else if ((pago.metodo_pago || pago.tipo_pago).toLowerCase().includes("efectivo")) color = "yellow";
              return (
                <div key={i} className={`rounded-xl shadow-lg bg-white border-t-4 border-${color}-400 px-4 py-3 flex flex-col items-center gap-1 w-full sm:w-[140px] snap-center transition-all hover:scale-105`}>
                  <span className={`font-bold text-${color}-700 text-sm truncate`}>{(pago.metodo_pago || pago.tipo_pago).toUpperCase()}</span>
                  <span className={`text-base text-${color}-600 font-mono`}>S/ {parseFloat(pago.total_pago).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-4 mb-6">
          <div className="bg-yellow-100 rounded-xl px-6 py-5 flex flex-col items-center shadow-lg">
            <span className="text-xs text-yellow-700 font-semibold">Efectivo cobrado</span>
            <span className="font-bold text-yellow-800 text-2xl">S/ {efectivoCobrado.toFixed(2)}</span>
          </div>
          {/* Comparativo de egresos */}
          <div className="flex gap-4 flex-wrap justify-center my-2">
            <div className="bg-orange-100 rounded-xl px-6 py-4 flex flex-col items-center shadow-lg min-w-[160px]">
              <span className="text-xs text-orange-700 font-semibold flex items-center gap-1">🩺 Honorarios Médicos</span>
              <span className="font-bold text-orange-800 text-lg">- S/ {(resumen.egreso_honorarios ? resumen.egreso_honorarios.toFixed(2) : "0.00")}</span>
            </div>
            <div className="bg-pink-100 rounded-xl px-6 py-4 flex flex-col items-center shadow-lg min-w-[160px]">
              <span className="text-xs text-pink-700 font-semibold flex items-center gap-1">🧑‍🔬 Honorarios Lab. Ref.</span>
              <span className="font-bold text-pink-800 text-lg">- S/ {(resumen.egreso_lab_ref ? resumen.egreso_lab_ref.toFixed(2) : "0.00")}</span>
            </div>
            <div className="bg-indigo-100 rounded-xl px-6 py-4 flex flex-col items-center shadow-lg min-w-[160px]">
              <span className="text-xs text-indigo-700 font-semibold flex items-center gap-1">🛠️ Egreso Operativo</span>
              <span className="font-bold text-indigo-800 text-lg">- S/ {(resumen.egreso_operativo ? resumen.egreso_operativo.toFixed(2) : "0.00")}</span>
            </div>
          </div>
          {/* Total egresos */}
          <div className="flex gap-2 flex-wrap justify-center my-2">
            <div className="bg-gray-100 rounded-xl px-6 py-3 flex flex-col items-center shadow-lg min-w-[160px]">
              <span className="text-xs text-gray-700 font-semibold">Total egresos</span>
              <span className="font-bold text-gray-800 text-lg">- S/ {((resumen.egreso_honorarios ? resumen.egreso_honorarios : 0) + (resumen.egreso_lab_ref ? resumen.egreso_lab_ref : 0) + (resumen.egreso_operativo ? resumen.egreso_operativo : 0)).toFixed(2)}</span>
            </div>
          </div>
          {/* Resumen comparativo */}
          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            <div className="flex-1 bg-yellow-200 rounded-xl px-6 py-5 flex flex-col items-center shadow-lg">
              <span className="text-xs text-yellow-700 font-semibold">Efectivo esperado</span>
              <span className="font-bold text-yellow-800 text-3xl">S/ {efectivoEsperado.toFixed(2)}</span>
              <span className="text-xs text-gray-700 mt-1">(Efectivo cobrado - total egresos + egreso electrónico)</span>
            </div>
            <div className="flex-1 bg-purple-100 rounded-xl px-6 py-5 flex flex-col items-center shadow-lg">
              <span className="text-xs text-purple-700 font-semibold">Egresos cubiertos por Yape/Transferencias</span>
              <input
                type="number"
                value={egresoElectronicoManual}
                onChange={e => setEgresoElectronicoManual(e.target.value)}
                className="border-2 border-purple-300 rounded-xl px-4 py-2 mt-2 text-xl text-center font-bold w-full max-w-[160px] focus:ring-2 focus:ring-purple-400 bg-white"
                placeholder="S/ 0.00"
                min={0}
                step={0.01}
              />
              <span className="text-xs text-gray-700 mt-1">(Descontado del total egreso)</span>
            </div>
            <div className="flex-1 bg-green-100 rounded-xl px-6 py-5 flex flex-col items-center shadow-lg">
              <span className="text-xs text-green-700 font-semibold">Efectivo contado</span>
              <input
                type="number"
                value={montoContado}
                onChange={e => setMontoContado(e.target.value)}
                className="border-2 border-green-300 rounded-xl px-4 py-2 mt-2 text-xl text-center font-bold w-full max-w-[160px] focus:ring-2 focus:ring-green-400 bg-white"
                placeholder="S/ 0.00"
              />
            </div>
            <div className={`flex-1 rounded-xl px-6 py-5 flex flex-col items-center shadow-lg ${diferencia === 0 ? "bg-green-200" : diferencia > 0 ? "bg-blue-100" : "bg-red-100"}`}>
              <span className="text-xs font-semibold mb-1">Diferencia</span>
              <span className={`font-bold text-3xl ${diferencia === 0 ? "text-green-700" : diferencia > 0 ? "text-blue-700" : "text-red-700"}`}>S/ {diferencia.toFixed(2)}</span>
              {diferencia === 0 ? (
                <span className="text-green-700 text-xs font-semibold mt-1">¡Cuadre perfecto!</span>
              ) : diferencia > 0 ? (
                <span className="text-blue-700 text-xs font-semibold mt-1">Sobra efectivo</span>
              ) : (
                <span className="text-red-700 text-xs font-semibold mt-1">Falta efectivo</span>
              )}
            </div>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-base font-semibold text-gray-700 mb-2" htmlFor="observaciones">Ocurrencias / Observaciones</label>
          <textarea
            id="observaciones"
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
            className="w-full border-2 border-red-300 rounded-xl px-4 py-3 min-h-[70px] resize-y focus:ring-2 focus:ring-red-400 bg-white text-base"
            placeholder="Escribe aquí cualquier ocurrencia, incidente o comentario relevante antes del cierre..."
          />
        </div>
        <button
          className="bg-gradient-to-r from-red-500 to-red-700 text-white px-10 py-4 rounded-2xl shadow-xl font-extrabold text-xl w-full mt-2 transition-all hover:scale-105 hover:from-red-600 hover:to-red-800"
          onClick={handleCerrarCaja}
        >
          Confirmar cierre de caja
        </button>
      </div>
    </>
  );
}
