import { useState, useEffect, useMemo } from 'react';
import CobroDescuento from './CobroDescuento';
import { BASE_URL } from '../../config/config';
import Swal from 'sweetalert2';
import { authFetch } from '../../utils/apiClient';

function CobroModulo({ paciente, servicio, onCobroCompleto, onCancelar }) {
    // Estados para descuento
    const [tipoDescuento, setTipoDescuento] = useState('porcentaje');
    const [valorDescuento, setValorDescuento] = useState(0);
    const [errorDescuento, setErrorDescuento] = useState('');
  const [tarifas, setTarifas] = useState([]);
  const [tipoCobertura, setTipoCobertura] = useState('particular');
  const [tipoPago, setTipoPago] = useState('efectivo');
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [clinicBrand, setClinicBrand] = useState({ name: 'MI CLINICA', logo: '', slogan: '', slogan_color: '', nombre_color: '', direccion: '', telefono: '', celular: '', ruc: '', email: '' });

  // Cargar tarifas al montar el componente
  useEffect(() => {
    cargarTarifas();
  }, []);

  useEffect(() => {
    let mounted = true;
    const cargarMarcaClinica = async () => {
      try {
        const resp = await authFetch("api_get_configuracion.php", {
          method: 'GET',
          cache: 'no-store'
        });
        const data = await resp.json();
        if (!mounted || !data?.success) return;
        const cfg = data.data || {};
        const nombre = String(cfg.nombre_clinica || '').trim().toUpperCase() || 'MI CLINICA';
        const rawLogo = String(cfg.logo_url || '').trim();
        const logo = rawLogo
          ? (/^(https?:\/\/|data:|blob:)/i.test(rawLogo)
            ? rawLogo
            : `${String(BASE_URL || '').replace(/\/+$/, '')}/${rawLogo.replace(/^\/+/, '')}`)
          : '';
        setClinicBrand({
          name: nombre,
          logo,
          slogan: String(cfg.slogan || '').trim(),
          slogan_color: String(cfg.slogan_color || '').trim(),
          nombre_color: String(cfg.nombre_color || '').trim(),
          direccion: String(cfg.direccion || '').trim(),
          telefono: String(cfg.telefono || '').trim(),
          celular: String(cfg.celular || '').trim(),
          ruc: String(cfg.ruc || '').trim(),
          email: String(cfg.email || '').trim(),
        });
      } catch {
        // fallback defaults
      }
    };
    cargarMarcaClinica();
    return () => {
      mounted = false;
    };
  }, []);

  const cargarTarifas = async () => {
    try {
      const response = await authFetch("api_tarifas.php");
      const data = await response.json();
      if (data.success) {
        setTarifas(data.tarifas || []);
      }
    } catch (error) {
      console.error('Error al cargar tarifas:', error);
    }
  };

  // Calcular detalles del cobro usando useMemo
 const detallesCobro = useMemo(() => {
  if (!servicio || tarifas.length === 0) return [];
  const tarifa = tarifas.find(t => t.servicio_tipo === servicio.key && t.activo === 1);
  if (!tarifa) return [];
  let precio = tarifa.precio_particular;
  if (tipoCobertura === 'seguro' && tarifa.precio_seguro) {
    precio = tarifa.precio_seguro;
  } else if (tipoCobertura === 'convenio' && tarifa.precio_convenio) {
    precio = tarifa.precio_convenio;
  }
  return [{
    servicio_tipo: servicio.key,
    descripcion: servicio.label,
    cantidad: 1,
    precio_unitario: parseFloat(precio),
    subtotal: parseFloat(precio)
  }];
}, [servicio, tarifas, tipoCobertura]);

  const calcularTotal = () => {
    const montoOriginal = detallesCobro.reduce((total, detalle) => total + detalle.subtotal, 0);
    let descuento = 0;
    if (tipoDescuento === 'porcentaje') {
      descuento = montoOriginal * (valorDescuento / 100);
    } else {
      descuento = valorDescuento;
    }
    return Math.max(montoOriginal - descuento, 0);
  };

  const procesarCobro = async () => {
    if (detallesCobro.length === 0) {
      Swal.fire('Error', 'No hay servicios para cobrar', 'error');
      return;
    }
    // Validar descuento
    const montoOriginal = detallesCobro.reduce((total, detalle) => total + detalle.subtotal, 0);
    let descuento = 0;
    if (tipoDescuento === 'porcentaje') {
      descuento = montoOriginal * (valorDescuento / 100);
    } else {
      descuento = valorDescuento;
    }
    if (descuento < 0 || descuento > montoOriginal) {
      setErrorDescuento('El descuento no puede ser mayor al monto original ni negativo.');
      return;
    } else {
      setErrorDescuento('');
    }
    setLoading(true);
    try {
      // Obtener usuario actual del sessionStorage
      const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
      const cobroData = {
        paciente_id: paciente.id,
        usuario_id: usuario.id,
        total: Math.max(montoOriginal - descuento, 0),
        monto_original: montoOriginal,
        monto_descuento: descuento,
        tipo_descuento: tipoDescuento,
        valor_descuento: valorDescuento,
        observaciones: observaciones,
        detalles: detallesCobro,
        servicio_info: servicio
      };
      const response = await authFetch("api_cobros.php", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(cobroData)
      });
      const result = await response.json();
      if (result.success) {
        // Mostrar comprobante
        await mostrarComprobante(result.cobro_id, cobroData);
        // Callback para continuar con el flujo
        if (onCobroCompleto) {
          onCobroCompleto(result.cobro_id, servicio);
        }
      } else {
        Swal.fire('Error', result.error || 'Error al procesar el cobro', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      Swal.fire('Error', 'Error de conexión con el servidor', 'error');
    } finally {
      setLoading(false);
    }
  };

  const mostrarComprobante = async (cobroId, datosComprobante) => {
    const fechaHora = new Date().toLocaleString('es-PE');
    
    const toMoney = (value) => `S/ ${Number(value || 0).toFixed(2)}`;
    const contactoLinea = [
      clinicBrand.telefono ? `Tel: ${clinicBrand.telefono}` : '',
      clinicBrand.celular ? `Cel: ${clinicBrand.celular}` : '',
    ].filter(Boolean).join(' | ');
    const resumenDetallesHtml = (Array.isArray(datosComprobante.detalles) ? datosComprobante.detalles : []).map((d) => {
      const descripcion = String(d?.descripcion || 'Servicio').trim();
      const descripcionCorta = descripcion.length > 34 ? `${descripcion.slice(0, 31)}...` : descripcion;
      const cantidad = Number(d?.cantidad || 0);
      const subtotal = Number(d?.subtotal || 0);
      return `
        <div class="t-row">
          <div class="t-desc">${descripcionCorta} x${cantidad}</div>
          <div class="t-amount">${toMoney(subtotal)}</div>
        </div>`;
    }).join('');

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
        }
        .ticket-80 .t-center { text-align: center; }
        .ticket-80 .t-logo { height: 44px; margin: 0 auto 4px; display: block; }
        .ticket-80 .t-clinic { margin: 2px 0; font-size: 13px; font-weight: 700; letter-spacing: 0.2px; }
        .ticket-80 .t-line { margin: 1px 0; }
        .ticket-80 .t-hr { border: 0; border-top: 1px dashed #6b7280; margin: 6px 0; }
        .ticket-80 .t-title { font-weight: 700; text-transform: uppercase; margin: 0 0 4px; }
        .ticket-80 .t-meta { margin: 1px 0; }
        .ticket-80 .t-section { margin: 6px 0 3px; font-weight: 700; text-transform: uppercase; }
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
        .ticket-80 .t-note { margin-top: 6px; text-align: center; font-size: 10px; color: #4b5563; }
        @media print {
          @page { size: 80mm auto; margin: 2mm; }
          html, body { margin: 0; padding: 0; }
          .ticket-80 {
            width: 76mm;
            max-width: 76mm;
            margin: 0;
            padding: 2.5mm;
            font-size: 10.5px;
            line-height: 1.15;
          }
          .ticket-80 .t-clinic { font-size: 12px; }
          .ticket-80 .t-logo { height: 38px; margin-bottom: 3px; }
          .ticket-80 .t-total { font-size: 11.5px; }
        }
      </style>`;

    const comprobanteBody = `
      <div class="ticket-80">
        <div class="t-center">
          ${clinicBrand.logo ? `<img src="${clinicBrand.logo}" alt="Logo clínica" class="t-logo" />` : ''}
          <div class="t-clinic"${clinicBrand.nombre_color ? ` style="color:${clinicBrand.nombre_color};"` : ''}>${clinicBrand.name}</div>
          ${clinicBrand.slogan ? `<div class="t-line" style="font-style:italic;${clinicBrand.slogan_color ? `color:${clinicBrand.slogan_color};` : ''}">${clinicBrand.slogan}</div>` : ''}
          ${clinicBrand.direccion ? `<div class="t-line">${clinicBrand.direccion}</div>` : ''}
          ${contactoLinea ? `<div class="t-line">${contactoLinea}</div>` : ''}
          ${clinicBrand.ruc ? `<div class="t-line">RUC: ${clinicBrand.ruc}</div>` : ''}
        </div>

        <hr class="t-hr" />
        <div class="t-title">Comprobante de pago #${cobroId}</div>
        <div class="t-meta">Fecha: ${fechaHora}</div>
        <div class="t-meta">Paciente: ${paciente.nombre} ${paciente.apellido}</div>
        <div class="t-meta">DNI: ${paciente.dni}</div>
        <div class="t-meta">H.C.: ${paciente.historia_clinica}</div>

        <hr class="t-hr" />
        <div class="t-section">Detalle</div>
        ${resumenDetallesHtml || '<div class="t-meta">Sin detalles</div>'}

        <hr class="t-hr" />
        ${datosComprobante.monto_descuento && Number(datosComprobante.monto_descuento) > 0
          ? `<div class="t-row"><div class="t-desc"><strong>Descuento</strong></div><div class="t-amount">-${toMoney(datosComprobante.monto_descuento)}</div></div>`
          : ''}
        <div class="t-row t-total"><div class="t-desc">TOTAL</div><div class="t-amount">${toMoney(datosComprobante.total)}</div></div>
        <div class="t-meta">Pago: ${tipoPago.toUpperCase()}</div>
        <div class="t-meta">Cobertura: ${tipoCobertura.toUpperCase()}</div>
        <hr class="t-hr" />
        <div class="t-note">Gracias por su preferencia<br />Conserve este comprobante</div>
      </div>`;

    const comprobante = `${ticketCss}${comprobanteBody}`;

    await Swal.fire({
      title: 'Cobro Procesado ✅',
      html: comprobante,
      icon: 'success',
      confirmButtonText: 'Imprimir Comprobante',
      showCancelButton: true,
      cancelButtonText: 'Solo Continuar'
    }).then((result) => {
      if (result.isConfirmed) {
        // Abrir ventana de impresión
        const ventanaImpresion = window.open('', '_blank');
        const documentoImpresion = `<!doctype html><html><head><meta charset="utf-8"><title>Comprobante</title>${ticketCss}</head><body>${comprobanteBody}</body></html>`;
        ventanaImpresion.document.write(documentoImpresion);
        ventanaImpresion.document.close();
        ventanaImpresion.print();
      }
    });
  };

  if (!servicio) {
    return <div>Seleccione un servicio primero</div>;
  }

  const total = calcularTotal();

  return (
    <div className="bg-white p-6 rounded-2xl shadow-xl border border-blue-200 max-w-3xl mx-auto">
      <h3 className="text-2xl font-bold mb-6 text-blue-800 flex items-center gap-2">
        <span className="text-3xl">💰</span> Módulo de Cobros
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Columna 1: Paciente y cobertura */}
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <h4 className="font-semibold mb-1 text-gray-700 flex items-center gap-2"><span className="text-blue-500">👤</span> Paciente</h4>
            <div className="text-lg font-bold">{paciente.nombre} {paciente.apellido}</div>
            <div className="text-sm text-gray-600">DNI: {paciente.dni} | H.C.: {paciente.historia_clinica}</div>
          </div>
          <div>
            <label className="block font-semibold mb-1">Tipo de Cobertura:</label>
            <select 
              value={tipoCobertura} 
              onChange={(e) => setTipoCobertura(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300"
            >
              <option value="particular">Particular</option>
              <option value="seguro">Seguro</option>
              <option value="convenio">Convenio</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">Método de Pago:</label>
            <select 
              value={tipoPago} 
              onChange={(e) => setTipoPago(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300"
            >
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">Observaciones:</label>
            <textarea 
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 h-20 focus:ring-2 focus:ring-blue-300"
              placeholder="Observaciones adicionales (opcional)"
            />
          </div>
        </div>
        {/* Columna 2: Detalle, descuento y total */}
        <div className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
            <h4 className="font-semibold mb-2 text-blue-700 flex items-center gap-2"><span className="text-blue-400">🧾</span> Detalle del Servicio</h4>
            {detallesCobro.map((detalle, index) => (
              <div key={index} className="flex justify-between items-center text-base">
                <span>{detalle.descripcion}</span>
                <span className="font-bold">S/ {detalle.subtotal.toFixed(2)}</span>
              </div>
            ))}
            <hr className="my-2" />
            <div className="flex justify-between items-center font-bold text-lg">
              <span>Total:</span>
              <span className="text-green-600">S/ {total.toFixed(2)}</span>
            </div>
          </div>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <CobroDescuento
              tipoDescuento={tipoDescuento}
              setTipoDescuento={setTipoDescuento}
              valorDescuento={valorDescuento}
              setValorDescuento={setValorDescuento}
              montoOriginal={detallesCobro.reduce((total, detalle) => total + detalle.subtotal, 0)}
              errorDescuento={errorDescuento}
            />
          </div>
        </div>
      </div>
      {/* Botones de acción */}
      <div className="flex flex-col md:flex-row gap-4 mt-8">
        <button 
          onClick={procesarCobro}
          disabled={loading || total <= 0}
          className="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg font-bold text-lg hover:bg-green-700 disabled:bg-gray-400 transition-all shadow-md"
        >
          {loading ? 'Procesando...' : `💳 Cobrar S/ ${total.toFixed(2)}`}
        </button>
        <button 
          onClick={onCancelar}
          className="flex-1 bg-gray-500 text-white py-3 px-6 rounded-lg font-bold text-lg hover:bg-gray-600 transition-all shadow-md"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default CobroModulo;