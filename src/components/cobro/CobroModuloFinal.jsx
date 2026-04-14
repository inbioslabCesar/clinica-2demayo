import { useState, useEffect, useMemo } from 'react';
import CobroDescuento from './CobroDescuento';
import { BASE_URL } from '../../config/config';
import Swal from 'sweetalert2';

function CobroModulo({
  paciente,
  servicio,
  onCobroCompleto,
  onCancelar,
  detalles,
  total: _total,
  modoCobro,
  onModoCobroChange,
  montoAbonoInput,
  saldoPendiente,
  montoObjetivoCobro,
  onMontoAbonoChange,
  onSetCobrarTodo,
  onSetCobrarMitad,
}) {
        // ...existing code...
        const [motivo, setMotivo] = useState('');
    // Estados para descuento
    const [tipoDescuento, setTipoDescuento] = useState('porcentaje');
    const [valorDescuento, setValorDescuento] = useState(0);
    const [errorDescuento, setErrorDescuento] = useState('');
  // Hook para verificar si el usuario tiene caja abierta
  const [cajaActual, setCajaActual] = useState(null);
  const [cajaLoading, setCajaLoading] = useState(true);
  useEffect(() => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
    fetch(`${BASE_URL}api_caja_actual.php`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        const usuarioSesionId = Number(usuario?.id || 0);
        const usuarioCajaId = Number(data?.caja?.usuario_id || 0);
        if (data.success && data.caja && usuarioSesionId > 0 && usuarioCajaId === usuarioSesionId) {
          setCajaActual(data.caja);
        } else {
          setCajaActual(null);
        }
        setCajaLoading(false);
      })
      .catch(() => {
        setCajaActual(null);
        setCajaLoading(false);
      });
  }, []);
  // Solo permitir servicios médicos (consulta, laboratorio, farmacia, etc.)
  const serviciosPermitidos = ['consulta', 'laboratorio', 'farmacia', 'rayosx', 'ecografia', 'procedimiento','operacion','hospitalizacion'];
  const esServicioMedico = servicio && serviciosPermitidos.includes(servicio.key);
  // const [tarifas, setTarifas] = useState([]); // Eliminado: no se usa
  const [tipoCobertura, setTipoCobertura] = useState('particular');
  const [tipoPago, setTipoPago] = useState('efectivo');
  const [observaciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [clinicBrand, setClinicBrand] = useState({ name: 'MI CLINICA', logo: '', slogan: '', slogan_color: '', nombre_color: '', direccion: '', telefono: '', celular: '', ruc: '', email: '' });

  const nombrePaciente = String(paciente?.nombre || paciente?.nombres || '').trim();
  const apellidoPaciente = String(paciente?.apellido || paciente?.apellidos || '').trim();
  const nombrePacienteCompleto = `${nombrePaciente} ${apellidoPaciente}`.trim();
  const dniPaciente = String(paciente?.dni || '').trim();
  const historiaClinicaPaciente = String(paciente?.historia_clinica || '').trim();

  // Cargar tarifas solo si no se reciben detalles por props
  useEffect(() => {
    if (!detalles) {
      cargarTarifas();
    }
  }, [detalles]);

  useEffect(() => {
    let mounted = true;
    const cargarMarcaClinica = async () => {
      try {
        const resp = await fetch(`${BASE_URL}api_get_configuracion.php`, {
          method: 'GET',
          credentials: 'include',
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
      const response = await fetch(`${BASE_URL}api_tarifas.php`, {
        credentials: 'include'
      });
      await response.json();
      // if (data.success) {
      //   setTarifas(data.tarifas || []);
      // }
    } catch {
      // Eliminado log de error al cargar tarifas
    }
  };

  // Usar detalles y total recibidos por props si existen y son válidos
  const detallesCobro = useMemo(() => {
    if (Array.isArray(detalles) && detalles.length > 0) {
      return detalles;
    }
    return [];
  }, [detalles]);

  const montoOriginal = detallesCobro.reduce((total, detalle) => total + (detalle.subtotal || 0), 0);
let descuento = 0;
if (tipoDescuento === 'porcentaje') {
  descuento = montoOriginal * (valorDescuento / 100);
} else {
  descuento = valorDescuento;
}

  const calcularTotal = () => {
    const montoOriginal = detallesCobro.reduce((total, detalle) => total + (detalle.subtotal || 0), 0);
    let descuento = 0;
    if (tipoDescuento === 'porcentaje') {
      descuento = montoOriginal * (valorDescuento / 100);
    } else {
      descuento = valorDescuento;
    }
    return Math.max(montoOriginal - descuento, 0);
  };

  const procesarCobro = async () => {
    if (cajaLoading) {
      Swal.fire('Espere', 'Verificando caja abierta...', 'info');
      return;
    }
    if (!cajaActual) {
      Swal.fire('Error', 'No tienes una caja abierta. Abre tu caja antes de cobrar.', 'error');
      return;
    }
    if (detallesCobro.length === 0) {
      Swal.fire('Error', 'No hay servicios para cobrar', 'error');
      return;
    }
    // Validar datos mínimos del paciente/particular
    if (!paciente || !nombrePacienteCompleto) {
      Swal.fire('Error', 'Falta identificar al paciente o particular para el cobro.', 'error');
      return;
    }

    setLoading(true);

    try {
      // Obtener usuario actual del sessionStorage
      const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
      const montoOriginal = detallesCobro.reduce((total, detalle) => total + (detalle.subtotal || 0), 0);
      let descuento = 0;
      if (tipoDescuento === 'porcentaje') {
        descuento = montoOriginal * (valorDescuento / 100);
      } else {
        descuento = valorDescuento;
      }
      if (descuento < 0 || descuento > montoOriginal) {
        setErrorDescuento('El descuento no puede ser mayor al monto original ni negativo.');
        setLoading(false);
        return;
      } else {
        setErrorDescuento('');
      }
      const cobroData = {
        paciente_id: paciente.id || null,
        usuario_id: usuario.id,
        usuario_nombre: usuario.nombre || '',
        paciente_nombre: nombrePacienteCompleto,
        paciente_dni: dniPaciente,
        total: Math.max(montoOriginal - descuento, 0),
        monto_original: montoOriginal,
        monto_descuento: descuento,
        tipo_descuento: tipoDescuento,
        valor_descuento: valorDescuento,
        tipo_pago: tipoPago,
        observaciones: observaciones,
        detalles: detallesCobro,
        servicio: String(servicio.key),
        servicio_info: { key: String(servicio.key), label: servicio.label },
        cotizacion_id: Number(servicio?.cotizacion_id || 0) || null,
        motivo: descuento > 0 ? motivo : ''
      };
      const response = await fetch(`${BASE_URL}api_cobros.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(cobroData)
      });
      let result;
      try {
        result = await response.json();
      } catch {
        const text = await response.text();
        Swal.fire('Error', 'Respuesta inesperada del servidor: ' + text, 'error');
        setLoading(false);
        return;
      }
      // Mostrar error con SweetAlert2 si el backend responde error
      if (!result.success && result.error) {
        Swal.fire({
          icon: 'error',
          title: 'Error en el cobro',
          text: result.error,
        });
        return;
      }

      if (result.success) {
        // Si el servicio es laboratorio y no hay consulta asociada, crear orden de laboratorio
        if (servicio?.key === 'laboratorio' && !servicio?.consulta_id) {
          const examenesIds = detallesCobro
            .filter(d => d.servicio_tipo === 'laboratorio' && d.servicio_id)
            .map(d => d.servicio_id);
          const ordenResponse = await fetch(`${BASE_URL}api_ordenes_laboratorio.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              consulta_id: null,
              examenes: examenesIds,
              paciente_id: paciente?.id || null,
              cobro_id: result.cobro_id,
              cotizacion_id: servicio?.cotizacion_id || null,
            })
          });
          await ordenResponse.json(); // Eliminado: no se usa la variable
        }
        // Mostrar comprobante
        await mostrarComprobante(result.cobro_id, cobroData);
        // Callback para continuar con el flujo
        if (onCobroCompleto) {
          onCobroCompleto(result.cobro_id, servicio, {
            monto_original: Number(montoOriginal || 0),
            monto_descuento: Number(descuento || 0),
            total_cobrado: Number(cobroData.total || 0),
          });
        }
      } else {
        Swal.fire('Error', result.error || 'Error al procesar el cobro', 'error');
      }
    } catch {
      // Eliminado log de error en producción
      Swal.fire('Error', 'Error de conexión con el servidor', 'error');
    } finally {
      setLoading(false);
    }
  };

  const mostrarComprobante = async (cobroId, datosComprobante) => {

    const fechaHora = new Date().toLocaleString('es-PE');
    const nombreCompleto = nombrePacienteCompleto;
    const consulta = datosComprobante.servicio_info || {};
    const detalleConsulta = Array.isArray(datosComprobante.detalles)
      ? datosComprobante.detalles.find((d) => String(d.servicio_tipo || '').toLowerCase() === 'consulta') || datosComprobante.detalles[0]
      : null;
    const consultaId = Number(consulta.consulta_id || servicio?.consulta_id || detalleConsulta?.consulta_id || 0);
    let consultaVinculada = null;
    if (consultaId > 0) {
      try {
        const resConsulta = await fetch(`${BASE_URL}api_consultas.php?consulta_id=${consultaId}`, {
          credentials: 'include',
        });
        const dataConsulta = await resConsulta.json();
        if (dataConsulta?.success && Array.isArray(dataConsulta.consultas) && dataConsulta.consultas.length > 0) {
          consultaVinculada = dataConsulta.consultas[0] || null;
        }
      } catch {
        consultaVinculada = null;
      }
    }

    const tipoConsultaRaw = String(
      consultaVinculada?.tipo_consulta
      || consulta.tipo_consulta
      || detalleConsulta?.tipo_consulta
      || ''
    ).toLowerCase();
    const tipoConsulta = tipoConsultaRaw === 'programada'
      ? 'Programada'
      : tipoConsultaRaw === 'espontanea'
        ? 'Espontanea'
        : (tipoConsultaRaw ? tipoConsultaRaw.charAt(0).toUpperCase() + tipoConsultaRaw.slice(1) : 'No especificada');

    let horaConsulta = String(consultaVinculada?.hora || consulta.hora || detalleConsulta?.hora || '').slice(0, 5);
    let fechaConsulta = String(consultaVinculada?.fecha || consulta.fecha || detalleConsulta?.fecha || '').slice(0, 10);
    if (!horaConsulta && Array.isArray(datosComprobante.detalles) && datosComprobante.detalles.length > 0) {
      horaConsulta = datosComprobante.detalles[0].hora || '';
    }
    if (!fechaConsulta && Array.isArray(datosComprobante.detalles) && datosComprobante.detalles.length > 0) {
      fechaConsulta = datosComprobante.detalles[0].fecha || '';
    }
    const fechaConsultaFmt = /^\d{4}-\d{2}-\d{2}$/.test(fechaConsulta)
      ? (() => {
          const [y, m, d] = fechaConsulta.split('-');
          return `${d}/${m}/${y}`;
        })()
      : fechaConsulta;
    const numeroOrden = tipoConsultaRaw === 'programada' ? (consulta.numero_orden || consultaVinculada?.numero_orden || 'N/A') : '';
    const logoSrc = clinicBrand.logo || '/2demayo.svg';
    const cotizacionId = Number(servicio?.cotizacion_id || 0);
    const tieneSaldoPendiente = Number.isFinite(Number(saldoPendiente)) && Number(saldoPendiente) > 0;
    const esCobroCotizacion = cotizacionId > 0 && tieneSaldoPendiente;
    const saldoAnteriorCobro = Math.max(0, Number(saldoPendiente || 0));
    const abonoAplicadoCobro = Math.max(0, Number(datosComprobante?.total || 0));
    const descuentoAplicadoCobro = Math.max(0, Number(datosComprobante?.monto_descuento || 0));
    const saldoRestanteCobro = Math.max(0, saldoAnteriorCobro - abonoAplicadoCobro - descuentoAplicadoCobro);
    const esAdelantoCobro = tieneSaldoPendiente && (modoCobro === 'parcial' || saldoRestanteCobro > 0);
    const mostrarResumenSaldo = tieneSaldoPendiente && (esCobroCotizacion || esAdelantoCobro);

    // Determinar si el servicio es consulta médica
    const esConsultaMedica = consulta.key === 'consulta';

    // Buscar profesional en consulta vinculada/detalles/servicio
    let nombreMedico = '';
    let abreviaturaProfesional = String(
      consultaVinculada?.medico_abreviatura_profesional
      || consulta.medico_abreviatura_profesional
      || detalleConsulta?.medico_abreviatura_profesional
      || ''
    ).trim();

    if (consultaVinculada) {
      const desdeConsulta = String(
        consultaVinculada.medico_nombre_completo
        || `${consultaVinculada.medico_nombre || ''} ${consultaVinculada.medico_apellido || ''}`
      ).trim();
      if (desdeConsulta) {
        nombreMedico = desdeConsulta;
      }
    }

    if (Array.isArray(datosComprobante.detalles)) {
      for (const d of datosComprobante.detalles) {
        if (!abreviaturaProfesional) {
          abreviaturaProfesional = String(d.medico_abreviatura_profesional || '').trim();
        }
        const medicoCompleto = String(
          d.medico_nombre_completo
          || `${d.medico_nombre || ''} ${d.medico_apellido || ''}`
        ).trim();
        if (medicoCompleto) {
          nombreMedico = medicoCompleto;
          break;
        }
        if (d.medico_nombre) {
          nombreMedico = d.medico_nombre;
          break;
        }
        if (d.medico) {
          nombreMedico = d.medico;
          break;
        }
      }
    }
    // Si no se encontró en detalles, usar el del servicio
    if (!nombreMedico && datosComprobante.servicio_info && datosComprobante.servicio_info.medico_nombre) {
      nombreMedico = datosComprobante.servicio_info.medico_nombre;
    }
    if (!abreviaturaProfesional) {
      abreviaturaProfesional = 'Dr(a).';
    }
    const nombreProfesional = nombreMedico
      ? (nombreMedico.toLowerCase().startsWith(abreviaturaProfesional.toLowerCase()) ? nombreMedico : `${abreviaturaProfesional} ${nombreMedico}`)
      : '';

    const comprobante = `
      <div style="text-align: left; font-family: monospace;">
        <div style="text-align: center; margin-bottom: 0;">
          <img src='${logoSrc}' alt='Logo' style='height:60px; margin-bottom:4px; display:block; margin-left:auto; margin-right:auto;' />
          <h3 style="text-align: center; margin-bottom: 4px; margin-top: 4px;${clinicBrand.nombre_color ? ' color:' + clinicBrand.nombre_color + ';' : ''}">${clinicBrand.name}</h3>
          ${clinicBrand.slogan ? `<p style="text-align:center;margin:0 0 4px;font-style:italic;font-size:11px;${clinicBrand.slogan_color ? 'color:' + clinicBrand.slogan_color + ';' : ''}">${clinicBrand.slogan}</p>` : ''}
          ${clinicBrand.direccion ? `<p style="text-align:center;margin:2px 0;font-size:11px;">${clinicBrand.direccion}</p>` : ''}
          ${clinicBrand.telefono ? `<p style="text-align:center;margin:2px 0;font-size:11px;">Tel: ${clinicBrand.telefono}</p>` : ''}
          ${clinicBrand.celular ? `<p style="text-align:center;margin:2px 0;font-size:11px;">Cel: ${clinicBrand.celular}</p>` : ''}
          ${clinicBrand.email ? `<p style="text-align:center;margin:2px 0;font-size:11px;">${clinicBrand.email}</p>` : ''}
          ${clinicBrand.ruc ? `<p style="text-align:center;margin:2px 0;font-size:11px;">RUC: ${clinicBrand.ruc}</p>` : ''}
        </div>
        <hr>
        <p><strong>COMPROBANTE DE PAGO #${cobroId}</strong></p>
        <p>Fecha: ${fechaHora}</p>
        <p>Paciente: ${nombreCompleto}</p>
        <p>DNI: ${dniPaciente || '-'}</p>
        <p>H.C.: ${historiaClinicaPaciente || '-'}</p>
        ${esConsultaMedica ? `<p>Tipo de consulta: ${tipoConsulta}</p>` : ''}
        ${esConsultaMedica ? `<p>Fecha de consulta: ${fechaConsultaFmt || 'No registrada'}</p>` : ''}
        ${esConsultaMedica ? `<p>Hora de consulta: ${horaConsulta || 'No registrada'}</p>` : ''}
        ${esConsultaMedica && tipoConsultaRaw === 'programada' ? `<p>N° Orden de llegada: ${numeroOrden}</p>` : ''}
        ${nombreProfesional ? `<p>Profesional: ${nombreProfesional}</p>` : ''}
        <hr>
        <p><strong>DETALLE:</strong></p>
        ${datosComprobante.detalles.map(d => {
          const resumen = d.descripcion.length > 50 ? d.descripcion.slice(0, 47) + '...' : d.descripcion;
          return `<p>${resumen} x${d.cantidad} .... S/ ${d.subtotal.toFixed(2)}</p>`;
        }).join('')}
        <hr>
          ${datosComprobante.monto_descuento && datosComprobante.monto_descuento > 0 ? `
            <p style="color: #d97706;"><strong>DESCUENTO:</strong> -S/ ${datosComprobante.monto_descuento.toFixed(2)} (${datosComprobante.tipo_descuento === 'porcentaje' ? datosComprobante.valor_descuento + '%' : 'Monto fijo'})</p>
          ` : ''}
        <p><strong>TOTAL: S/ ${datosComprobante.total.toFixed(2)}</strong></p>
        ${mostrarResumenSaldo ? `
          ${esCobroCotizacion ? `<p><strong>Cotización:</strong> #${cotizacionId}</p>` : ''}
          <p><strong>Tipo de aplicación:</strong> ${esAdelantoCobro ? 'Adelanto' : 'Pago completo'}</p>
          <p><strong>Saldo anterior:</strong> S/ ${saldoAnteriorCobro.toFixed(2)}</p>
          <p><strong>Abono aplicado hoy:</strong> S/ ${abonoAplicadoCobro.toFixed(2)}</p>
          ${descuentoAplicadoCobro > 0 ? `<p><strong>Descuento aplicado:</strong> S/ ${descuentoAplicadoCobro.toFixed(2)}</p>` : ''}
          <p><strong>Saldo pendiente:</strong> S/ ${saldoRestanteCobro.toFixed(2)}</p>
        ` : ''}
        <p>Tipo de pago: ${tipoPago === 'yape' ? 'Yape' : tipoPago.toUpperCase()}</p>
        <p>Cobertura: ${tipoCobertura.toUpperCase()}</p>
        <hr>
        <p style="text-align: center; font-size: 12px;">
          Gracias por su preferencia<br>
          Conserve este comprobante
        </p>
      </div>
    `;

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
        ventanaImpresion.document.write(comprobante);
        ventanaImpresion.document.close();
        ventanaImpresion.print();
      }
    });
  };

  if (!servicio) {
    return <div>Seleccione un servicio primero</div>;
  }
  if (!esServicioMedico) {
    return (
      <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-6 rounded">
        <h3 className="text-lg font-bold mb-2">⚠️ Solo se pueden procesar cobros de servicios médicos</h3>
        <p>Este módulo no permite cobrar egresos operativos ni otros tipos de egresos. Por favor, utilice el formulario de egresos operativos para registrar gastos administrativos, compras, pagos de servicios, etc.</p>
      </div>
    );
  }

  const totalCobro = calcularTotal();

  return (
    <div className="bg-white p-5 md:p-7 lg:p-8 rounded-2xl shadow-2xl border border-blue-200 w-full max-w-[1200px] mx-auto mt-6 lg:mt-8">
      <h3 className="text-2xl font-bold mb-6 text-blue-800 flex items-center gap-2">
        <span className="text-3xl">💰</span> Módulo de Cobros
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-7">
        {/* Columna izquierda: Paciente, cobertura, motivo */}
        <div className="space-y-6 flex flex-col justify-between h-full">
          <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200 shadow-sm">
            <h4 className="font-semibold mb-2 text-gray-700 flex items-center gap-2 text-lg"><span className="text-blue-500">👤</span> Paciente</h4>
            <div className="text-lg lg:text-xl font-bold">{nombrePacienteCompleto || '-'}</div>
            <div className="text-base text-gray-600">DNI: {dniPaciente || '-'} | H.C.: {historiaClinicaPaciente || '-'}</div>
          </div>
          <div>
            <label className="block font-semibold mb-2">Tipo de Cobertura:</label>
            <select 
              value={tipoCobertura} 
              onChange={(e) => setTipoCobertura(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 text-base"
            >
              <option value="particular">Particular</option>
              <option value="seguro">Seguro</option>
              <option value="convenio">Convenio</option>
            </select>
          </div>
          {descuento > 0 && (
            <div>
              <label className="block font-semibold mb-2">Motivo del descuento <span className="text-red-500">*</span>:</label>
              <textarea 
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 h-20 focus:ring-2 focus:ring-blue-300 text-base"
                placeholder="Motivo o justificación del descuento (obligatorio)"
                required={descuento > 0}
              />
            </div>
          )}
        </div>
        {/* Columna derecha: Detalle, descuento, pago, acción */}
        <div className="space-y-6 flex flex-col justify-between h-full">
          <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 shadow-sm">
            {typeof onMontoAbonoChange === 'function' && (
              <div className="mb-4 p-3 rounded-xl border border-blue-200 bg-white">
                <h5 className="font-semibold text-blue-800 mb-2">Forma de cobro</h5>
                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => typeof onModoCobroChange === 'function' && onModoCobroChange('completo')}
                    className={`px-3 py-2 rounded border whitespace-nowrap ${modoCobro === 'completo' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}
                  >
                    Cobro completo (automático)
                  </button>
                  <button
                    type="button"
                    onClick={() => typeof onModoCobroChange === 'function' && onModoCobroChange('parcial')}
                    className={`px-3 py-2 rounded border whitespace-nowrap ${modoCobro === 'parcial' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}
                  >
                    Adelanto (monto manual)
                  </button>
                </div>

                {modoCobro === 'parcial' && (
                  <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
                    <input
                      id="monto-abono-modulo"
                      type="number"
                      min="0"
                      step="0.01"
                      value={montoAbonoInput ?? ''}
                      onChange={(e) => onMontoAbonoChange(e.target.value)}
                      className="border rounded px-3 py-2 bg-white w-full sm:w-40"
                      placeholder="0.00"
                    />
                    <button
                      type="button"
                      onClick={() => typeof onSetCobrarMitad === 'function' && onSetCobrarMitad()}
                      className="px-3 py-2 rounded border bg-white hover:bg-gray-50 whitespace-nowrap"
                    >
                      Mitad
                    </button>
                    <button
                      type="button"
                      onClick={() => typeof onSetCobrarTodo === 'function' && onSetCobrarTodo()}
                      className="px-3 py-2 rounded border bg-white hover:bg-gray-50 whitespace-nowrap"
                    >
                      Máximo pendiente
                    </button>
                  </div>
                )}

                <div className="mt-2 text-xs text-gray-600 rounded-md bg-blue-50 px-2 py-1">
                  {modoCobro === 'parcial' ? 'Adelanto de hoy:' : 'Cobro automático de hoy:'} S/ {Number(montoObjetivoCobro || 0).toFixed(2)} de un saldo pendiente de S/ {Number(saldoPendiente || 0).toFixed(2)}.
                </div>
              </div>
            )}
            <h4 className="font-semibold mb-2 text-blue-700 flex items-center gap-2 text-lg"><span className="text-blue-400">🧾</span> Detalle del Servicio</h4>
            {detallesCobro.map((detalle, index) => {
              let precio = detalle.subtotal;
              if ((typeof precio !== 'number' || precio <= 0) && typeof detalle.precio_publico === 'number') {
                precio = detalle.precio_publico;
              }
              const medicoNombre = String(
                detalle.medico_nombre_completo
                || `${detalle.medico_nombre || ''} ${detalle.medico_apellido || ''}`
              ).trim();
              return (
                <div key={index} className="flex justify-between items-center text-base">
                  <span>
                    {detalle.descripcion}
                    {medicoNombre ? <span className="block text-xs text-gray-500">{medicoNombre}</span> : null}
                  </span>
                  <span className="font-bold">S/ {precio > 0 ? precio.toFixed(2) : '—'}</span>
                </div>
              );
            })}
            <hr className="my-3" />
            <div className="flex justify-between items-center font-bold text-lg lg:text-xl">
              <span>Total:</span>
              <span className="text-green-600">S/ {totalCobro.toFixed(2)}</span>
            </div>
          </div>
          <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200 shadow-sm">
            <CobroDescuento
              tipoDescuento={tipoDescuento}
              setTipoDescuento={setTipoDescuento}
              valorDescuento={valorDescuento}
              setValorDescuento={setValorDescuento}
              montoOriginal={detallesCobro.reduce((total, detalle) => total + (detalle.subtotal || 0), 0)}
              montoDescuentoOverride={descuento}
              montoFinalOverride={totalCobro}
              errorDescuento={errorDescuento}
            />
          </div>
          <div>
            <label className="block font-semibold mb-2">Método de Pago:</label>
            <select 
              value={tipoPago} 
              onChange={(e) => setTipoPago(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 text-base"
            >
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="yape">Yape</option>
              <option value="plin">Plin</option>
            </select>
          </div>
          <div className="flex flex-col md:flex-row gap-4 mt-4">
            <button 
              onClick={procesarCobro}
              disabled={loading || totalCobro <= 0}
              className="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg font-bold text-lg hover:bg-green-700 disabled:bg-gray-400 transition-all shadow-md"
            >
              {loading ? 'Procesando...' : `💳 Cobrar S/ ${totalCobro.toFixed(2)}`}
            </button>
            <button 
              onClick={onCancelar}
              className="flex-1 bg-gray-500 text-white py-3 px-6 rounded-lg font-bold text-lg hover:bg-gray-600 transition-all shadow-md"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CobroModulo;