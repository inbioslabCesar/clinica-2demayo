import { useState, useEffect, useMemo } from 'react';
import CobroDescuento from './CobroDescuento';
import { BASE_URL } from '../../config/config';
import Swal from 'sweetalert2';
import { authFetch } from '../../utils/apiClient';

function formatUserRole(roleRaw) {
  const role = String(roleRaw || '').trim().toLowerCase();
  if (!role) return '';
  if (role === 'admin' || role === 'administrador') return 'Admin';
  if (role.includes('recep')) return 'Recepcion';
  if (role.includes('caja') || role.includes('cajero')) return 'Caja';
  if (role.includes('medico')) return 'Medico';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function CobroModulo({
  paciente,
  servicio,
  onCobroCompleto,
  onCancelar,
  detalles,
  detallesSeleccionados,
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
      const [atencionSolidaria, setAtencionSolidaria] = useState(false);
    // Estados para descuento
    const [tipoDescuento, setTipoDescuento] = useState('porcentaje');
    const [valorDescuento, setValorDescuento] = useState(0);
    const [errorDescuento, setErrorDescuento] = useState('');
  // Hook para verificar si el usuario tiene caja abierta
  const [cajaActual, setCajaActual] = useState(null);
  const [cajaLoading, setCajaLoading] = useState(true);
  useEffect(() => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
    authFetch("api_caja_actual.php")
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
  const serviciosPermitidos = ['consulta', 'laboratorio', 'farmacia', 'rayosx', 'ecografia', 'procedimiento','operacion','hospitalizacion', 'mixto'];
  const esServicioMedico = servicio && serviciosPermitidos.includes(servicio.key);
  // const [tarifas, setTarifas] = useState([]); // Eliminado: no se usa
  const [tipoCobertura, setTipoCobertura] = useState('particular');
  const [tipoPago, setTipoPago] = useState('efectivo');
  const [observaciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [usarRepartoManual, setUsarRepartoManual] = useState(false);
  const [repartoPorDetalle, setRepartoPorDetalle] = useState({});
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

  const buildDetalleKey = (detalle, index) => {
    return String(
      detalle?.cotizacion_detalle_id
      || detalle?.detalle_id
      || `${detalle?.cotizacion_id || 0}-${detalle?.servicio_id || 0}-${index}`
    );
  };

  const montoAplicadoPorDetalle = useMemo(() => {
    const map = new Map();
    detallesCobro.forEach((item, index) => {
      const key = buildDetalleKey(item, index);
      map.set(key, Number(item?.subtotal || 0));
    });
    return map;
  }, [detallesCobro]);

  const subtotalesNetosPorDetalle = useMemo(() => {
    const map = new Map();
    const subtotales = detallesCobro.map((item) => Math.max(0, Number(item?.subtotal || 0)));
    const baseTotal = subtotales.reduce((acc, value) => acc + value, 0);
    let descuentoCalculado = 0;
    if (tipoDescuento === 'porcentaje') {
      descuentoCalculado = baseTotal * (Number(valorDescuento || 0) / 100);
    } else {
      descuentoCalculado = Number(valorDescuento || 0);
    }
    const descuentoTotal = Math.max(0, Math.min(Number.isFinite(descuentoCalculado) ? descuentoCalculado : 0, baseTotal));

    if (descuentoTotal <= 0 || baseTotal <= 0) {
      detallesCobro.forEach((item, index) => {
        const key = buildDetalleKey(item, index);
        map.set(key, subtotales[index] || 0);
      });
      return map;
    }

    const indicesValidos = [];
    subtotales.forEach((subtotal, index) => {
      if (subtotal > 0) {
        indicesValidos.push(index);
      }
    });

    const ultimoIdx = indicesValidos.length > 0 ? indicesValidos[indicesValidos.length - 1] : -1;
    let descuentoAsignado = 0;

    detallesCobro.forEach((item, index) => {
      const key = buildDetalleKey(item, index);
      const subtotal = subtotales[index] || 0;
      if (subtotal <= 0) {
        map.set(key, 0);
        return;
      }

      let descuentoItem = 0;
      if (index === ultimoIdx) {
        descuentoItem = Math.max(0, Number((descuentoTotal - descuentoAsignado).toFixed(2)));
      } else {
        const proporcion = subtotal / baseTotal;
        descuentoItem = Number((descuentoTotal * proporcion).toFixed(2));
        descuentoAsignado = Number((descuentoAsignado + descuentoItem).toFixed(2));
      }

      descuentoItem = Math.min(descuentoItem, subtotal);
      const subtotalNeto = Math.max(0, Number((subtotal - descuentoItem).toFixed(2)));
      map.set(key, subtotalNeto);
    });

    return map;
  }, [detallesCobro, tipoDescuento, valorDescuento]);

  const totalNetoReparto = useMemo(() => {
    let total = 0;
    detallesCobro.forEach((item, index) => {
      const key = buildDetalleKey(item, index);
      total += Number(subtotalesNetosPorDetalle.get(key) || 0);
    });
    return Number(total.toFixed(2));
  }, [detallesCobro, subtotalesNetosPorDetalle]);

  const normalizarDecimalInput = (value) => String(value ?? '').replace(',', '.');
  const esDecimalParcialValido = (value) => /^\d*(\.\d{0,2})?$/.test(value);

  useEffect(() => {
    setRepartoPorDetalle((prev) => {
      const next = { ...prev };
      detallesCobro.forEach((item, index) => {
        const key = buildDetalleKey(item, index);
        const subtotal = Math.max(0, Number(subtotalesNetosPorDetalle.get(key) || 0));
        const sugerido = Number(item?.monto_medico || 0);
        const montoInicial = Number.isFinite(sugerido) && sugerido > 0 ? Math.min(sugerido, subtotal) : 0;
        const porcentajeInicial = subtotal > 0 ? Number(((montoInicial * 100) / subtotal).toFixed(2)) : 0;
        if (!next[key]) {
          next[key] = {
            monto_medico: String(montoInicial),
            porcentaje_medico: porcentajeInicial.toFixed(2),
          };
          return;
        }

        const montoPrevio = Number(next[key]?.monto_medico);
        if (Number.isFinite(montoPrevio) && montoPrevio > subtotal) {
          next[key] = {
            ...next[key],
            monto_medico: subtotal.toFixed(2),
            porcentaje_medico: subtotal > 0 ? ((subtotal * 100) / subtotal).toFixed(2) : '0.00',
          };
        }
      });
      return next;
    });
  }, [detallesCobro, subtotalesNetosPorDetalle]);

  const updateRepartoMonto = (key, subtotal, value) => {
    const clean = normalizarDecimalInput(value);
    if (clean !== '' && !esDecimalParcialValido(clean)) {
      return;
    }

    const raw = clean === '' ? '' : Number(clean);
    let montoValue = clean;
    if (clean !== '' && Number.isFinite(raw) && raw > subtotal) {
      montoValue = String(subtotal);
    }

    const montoNum = montoValue === '' ? null : Number(montoValue);
    const montoSeguro = Number.isFinite(montoNum) ? Math.max(0, Math.min(Number(montoNum), subtotal)) : 0;
    const porcentaje = montoValue === '' ? '' : (subtotal > 0 ? ((montoSeguro * 100) / subtotal).toFixed(2) : '0.00');

    setRepartoPorDetalle((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        monto_medico: montoValue,
        porcentaje_medico: porcentaje,
      },
    }));
  };

  const updateRepartoPorcentaje = (key, subtotal, value) => {
    const clean = normalizarDecimalInput(value);
    if (clean !== '' && !esDecimalParcialValido(clean)) {
      return;
    }

    const raw = clean === '' ? '' : Number(clean);
    const porcentajeSeguro = clean === ''
      ? ''
      : (Number.isFinite(raw) ? Math.max(0, Math.min(raw, 100)) : 0);
    const monto = clean === ''
      ? ''
      : (subtotal > 0 ? ((Number(porcentajeSeguro) * subtotal) / 100).toFixed(2) : '0.00');

    setRepartoPorDetalle((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        porcentaje_medico: clean,
        monto_medico: monto,
      },
    }));
  };

  const normalizarRepartoMontoOnBlur = (key, subtotal) => {
    setRepartoPorDetalle((prev) => {
      const entry = prev[key] || {};
      const raw = normalizarDecimalInput(entry?.monto_medico ?? '');
      if (raw === '') {
        return prev;
      }

      const monto = Number(raw);
      if (!Number.isFinite(monto)) {
        return {
          ...prev,
          [key]: {
            ...entry,
            monto_medico: '',
            porcentaje_medico: '',
          },
        };
      }

      const montoSeguro = Math.max(0, Math.min(monto, subtotal));
      const porcentaje = subtotal > 0 ? ((montoSeguro * 100) / subtotal) : 0;
      return {
        ...prev,
        [key]: {
          ...entry,
          monto_medico: montoSeguro.toFixed(2),
          porcentaje_medico: porcentaje.toFixed(2),
        },
      };
    });
  };

  const normalizarRepartoPorcentajeOnBlur = (key, subtotal) => {
    setRepartoPorDetalle((prev) => {
      const entry = prev[key] || {};
      const raw = normalizarDecimalInput(entry?.porcentaje_medico ?? '');
      if (raw === '') {
        return prev;
      }

      const porcentaje = Number(raw);
      if (!Number.isFinite(porcentaje)) {
        return {
          ...prev,
          [key]: {
            ...entry,
            porcentaje_medico: '',
          },
        };
      }

      const porcentajeSeguro = Math.max(0, Math.min(porcentaje, 100));
      const monto = subtotal > 0 ? ((porcentajeSeguro * subtotal) / 100) : 0;
      return {
        ...prev,
        [key]: {
          ...entry,
          porcentaje_medico: porcentajeSeguro.toFixed(2),
          monto_medico: monto.toFixed(2),
        },
      };
    });
  };

  const resumenRepartoManual = useMemo(() => {
    let totalMedicos = 0;
    let totalClinica = 0;
    let incompletos = 0;
    detallesCobro.forEach((item, index) => {
      const key = buildDetalleKey(item, index);
      const subtotal = Math.max(0, Number(subtotalesNetosPorDetalle.get(key) || 0));
      const entry = repartoPorDetalle[key] || {};
      const montoRaw = entry?.monto_medico;
      if (montoRaw === '' || montoRaw === undefined || montoRaw === null) {
        incompletos++;
        return;
      }
      const monto = Number(montoRaw);
      if (!Number.isFinite(monto)) {
        incompletos++;
        return;
      }
      const montoMed = Math.max(0, Math.min(monto, subtotal));
      totalMedicos += montoMed;
      totalClinica += (subtotal - montoMed);
    });
    return {
      totalMedicos: Number(totalMedicos.toFixed(2)),
      totalClinica: Number(totalClinica.toFixed(2)),
      totalNeto: Number((totalMedicos + totalClinica).toFixed(2)),
      incompletos,
    };
  }, [detallesCobro, repartoPorDetalle, subtotalesNetosPorDetalle]);

  const detallesRender = useMemo(() => {
    const base = Array.isArray(detallesSeleccionados) && detallesSeleccionados.length > 0
      ? detallesSeleccionados
      : detallesCobro;

    if (modoCobro !== 'parcial') {
      return base.map((item, index) => ({
        ...item,
        subtotal_mostrar: Number(item?.subtotal || 0),
      }));
    }

    return base.map((item, index) => {
      const key = buildDetalleKey(item, index);
      const aplicado = Number(montoAplicadoPorDetalle.get(key) || 0);
      return {
        ...item,
        subtotal_mostrar: aplicado,
        subtotal_original: Number(item?.subtotal || 0),
      };
    });
  }, [detallesSeleccionados, detallesCobro, modoCobro, montoAplicadoPorDetalle]);

  const montoOriginal = detallesCobro.reduce((total, detalle) => total + (detalle.subtotal || 0), 0);
let descuento = 0;
if (tipoDescuento === 'porcentaje') {
  descuento = montoOriginal * (valorDescuento / 100);
} else {
  descuento = valorDescuento;
}
  const esDescuentoTotal = montoOriginal > 0 && descuento >= (montoOriginal - 0.005);

  useEffect(() => {
    if (!esDescuentoTotal) {
      setAtencionSolidaria(false);
    }
  }, [esDescuentoTotal]);

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

    const montoOriginalValidacion = detallesCobro.reduce((total, detalle) => total + (detalle.subtotal || 0), 0);
    let descuentoValidacion = 0;
    if (tipoDescuento === 'porcentaje') {
      descuentoValidacion = montoOriginalValidacion * (valorDescuento / 100);
    } else {
      descuentoValidacion = valorDescuento;
    }

    if (descuentoValidacion > 0 && !String(motivo || '').trim()) {
      Swal.fire('Motivo requerido', 'Debes ingresar el motivo del descuento para continuar.', 'warning');
      return;
    }

    let detallesPayload = detallesCobro;
    if (usarRepartoManual) {
      const validados = [];
      let totalMedicosManual = 0;
      let totalClinicaManual = 0;
      for (let i = 0; i < detallesCobro.length; i += 1) {
        const item = detallesCobro[i];
        const key = buildDetalleKey(item, i);
        const subtotal = Math.max(0, Number(subtotalesNetosPorDetalle.get(key) || 0));
        const entry = repartoPorDetalle[key] || {};
        const rawMonto = entry?.monto_medico;
        const montoMedico = Number(normalizarDecimalInput(rawMonto));
        if (rawMonto === '' || rawMonto === undefined || rawMonto === null || !Number.isFinite(montoMedico)) {
          Swal.fire('Reparto incompleto', `Debes definir el monto del médico para: ${item?.descripcion || 'Servicio'}.`, 'warning');
          return;
        }
        if (montoMedico < 0 || montoMedico > subtotal) {
          Swal.fire('Reparto inválido', `El monto del médico en ${item?.descripcion || 'Servicio'} debe estar entre 0 y S/ ${subtotal.toFixed(2)}.`, 'warning');
          return;
        }
        const montoMed = Number(montoMedico.toFixed(2));
        const montoCli = Number((subtotal - montoMed).toFixed(2));
        const porcentajeMed = subtotal > 0 ? Number(((montoMed * 100) / subtotal).toFixed(2)) : 0;
        totalMedicosManual += montoMed;
        totalClinicaManual += montoCli;

        validados.push({
          ...item,
          reparto_manual_aplicado: 1,
          monto_medico_override: montoMed,
          monto_clinica_override: montoCli,
          porcentaje_medico_override: porcentajeMed,
        });
      }

      const totalManual = Number((totalMedicosManual + totalClinicaManual).toFixed(2));
      const totalEsperado = Number(totalNetoReparto.toFixed(2));
      if (Math.abs(totalManual - totalEsperado) > 0.02) {
        Swal.fire(
          'Reparto inconsistente',
          `La suma del reparto manual (S/ ${totalManual.toFixed(2)}) no coincide con el monto neto a repartir (S/ ${totalEsperado.toFixed(2)}).`,
          'warning'
        );
        return;
      }

      detallesPayload = validados;
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
        referencia_origen: String(servicio?.referencia_origen || paciente?.referencia_origen || '').trim(),
        total: Math.max(montoOriginal - descuento, 0),
        monto_original: montoOriginal,
        monto_descuento: descuento,
        tipo_descuento: tipoDescuento,
        valor_descuento: valorDescuento,
        atencion_solidaria: esDescuentoTotal && atencionSolidaria,
        tipo_pago: tipoPago,
        observaciones: observaciones,
        detalles: detallesPayload,
        servicio: String(servicio.key),
        servicio_info: { key: String(servicio.key), label: servicio.label, cotizacion_ids: servicio?.cotizacion_ids || [] },
        cotizacion_id: Number(servicio?.cotizacion_id || 0) || null,
        cotizacion_ids: Array.isArray(servicio?.cotizacion_ids) ? servicio.cotizacion_ids : [],
        reparto_manual_aplicado: usarRepartoManual ? 1 : 0,
        motivo: descuento > 0 ? motivo : ''
      };
      let payloadCobro = { ...cobroData };
      let result = null;
      let intentoReprogramacion = 0;

      while (true) {
        const response = await authFetch("api_cobros.php", {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payloadCobro)
        });

        try {
          result = await response.json();
        } catch {
          const text = await response.text();
          Swal.fire('Error', 'Respuesta inesperada del servidor: ' + text, 'error');
          setLoading(false);
          return;
        }

        if (result?.success) {
          break;
        }

        const conflictos = Array.isArray(result?.conflictos) ? result.conflictos : [];
        const esConflictoHorario = String(result?.code || '') === 'conflicto_horario';
        if (esConflictoHorario && conflictos.length > 0 && intentoReprogramacion === 0) {
          const reprogramacion = {};
          const usadosPorMedicoFecha = new Map();
          const keyGrupo = (conf) => `${Number(conf?.medico_id || 0)}|${String(conf?.fecha_programada || '')}`;
          const keySlot = (slot) => `${String(slot?.fecha_programada || '')}|${String(slot?.hora_programada || '')}`;

          const cotizacionesConflicto = Array.from(new Set(
            conflictos
              .map((conf) => Number(conf?.cotizacion_id || 0))
              .filter((id) => id > 0)
          ));

          const conflictosOrdenados = [...conflictos].sort((a, b) => {
            const ma = Number(a?.medico_id || 0);
            const mb = Number(b?.medico_id || 0);
            if (ma !== mb) return ma - mb;
            const fa = String(a?.fecha_programada || '');
            const fb = String(b?.fecha_programada || '');
            if (fa !== fb) return fa.localeCompare(fb);
            const ha = String(a?.hora_programada || '');
            const hb = String(b?.hora_programada || '');
            if (ha !== hb) return ha.localeCompare(hb);
            return Number(a?.detalle_id || 0) - Number(b?.detalle_id || 0);
          });

          const resumen = conflictosOrdenados.map((conf) => {
            const desc = String(conf?.descripcion || 'Servicio');
            const cotId = Number(conf?.cotizacion_id || 0);
            const fecha = String(conf?.fecha_programada || '-');
            const hora = conf?.hora_programada ? String(conf.hora_programada).slice(0, 5) : 'sin hora';
            const sugeridos = Array.isArray(conf?.horarios_sugeridos) ? conf.horarios_sugeridos : [];
            const grupo = keyGrupo(conf);
            if (!usadosPorMedicoFecha.has(grupo)) {
              usadosPorMedicoFecha.set(grupo, new Set());
            }
            const usadosGrupo = usadosPorMedicoFecha.get(grupo);

            let elegido = null;
            if (sugeridos.length > 0) {
              for (const slot of sugeridos) {
                const claveSlot = keySlot(slot);
                if (claveSlot === '|' || usadosGrupo.has(claveSlot)) {
                  continue;
                }
                elegido = slot;
                usadosGrupo.add(claveSlot);
                break;
              }
            }

            if (!elegido && Number(conf?.detalle_id || 0) > 0) {
              // fallback conservador: si no hay slot libre en lista, no forzar duplicados
              // para evitar segundo rechazo por conflicto en el backend.
            }

            if (elegido && Number(conf?.detalle_id || 0) > 0) {
              reprogramacion[String(Number(conf.detalle_id))] = {
                fecha_programada: elegido.fecha_programada,
                hora_programada: elegido.hora_programada,
              };
            }
            const sugeridosTxt = sugeridos.length > 0
              ? sugeridos.map((s) => `${String(s?.fecha_programada || '')} ${String(s?.hora_label || String(s?.hora_programada || '').slice(0, 5))}`.trim()).join(', ')
              : 'sin sugerencias disponibles';
            const cabecera = cotId > 0
              ? `Cotización #${cotId} · ${desc}`
              : desc;
            return `• ${cabecera} (Cita objetivo: ${fecha} ${hora}) → ${sugeridosTxt}`;
          }).join('\n');

          const cotizacionesTxt = cotizacionesConflicto.length > 0
            ? `Cotizaciones involucradas: ${cotizacionesConflicto.map((id) => `#${id}`).join(', ')}\n\n`
            : '';

          const puedeReprogramar = Object.keys(reprogramacion).length > 0;
          const decision = await Swal.fire({
            icon: 'warning',
            title: 'Conflicto de horario detectado',
            text: puedeReprogramar
              ? `El médico ya tiene turnos ocupados.\n\n${cotizacionesTxt}${resumen}\n\n¿Deseas reprogramar automáticamente a la primera hora sugerida y continuar con el cobro?`
              : `No hay horario asignado/disponible para algunos servicios.\n\n${cotizacionesTxt}${resumen}`,
            showCancelButton: puedeReprogramar,
            confirmButtonText: puedeReprogramar ? 'Reprogramar y cobrar' : 'Entendido',
            cancelButtonText: 'Cancelar',
          });

          if (decision.isConfirmed && puedeReprogramar) {
            payloadCobro = {
              ...payloadCobro,
              reprogramacion_horaria: reprogramacion,
            };
            intentoReprogramacion = 1;
            continue;
          }

          return;
        }

        if (result?.error) {
          Swal.fire({
            icon: 'error',
            title: 'Error en el cobro',
            text: result.error,
          });
          return;
        }

        Swal.fire('Error', 'Error al procesar el cobro', 'error');
        return;
      }

      if (result.success) {
        let comprobanteOk = true;
        try {
          // Mostrar comprobante
          await mostrarComprobante(result.cobro_id, payloadCobro);
        } catch {
          comprobanteOk = false;
          await Swal.fire({
            icon: 'warning',
            title: 'Cobro registrado',
            text: `El cobro #${Number(result.cobro_id || 0)} se guardo correctamente, pero no se pudo abrir el comprobante en este momento.`,
            confirmButtonText: 'Continuar',
          });
        }
        // Callback para continuar con el flujo
        if (onCobroCompleto) {
          onCobroCompleto(result.cobro_id, servicio, {
            monto_original: Number(montoOriginal || 0),
            monto_descuento: Number(descuento || 0),
            total_cobrado: Number(payloadCobro.total || 0),
          });
        }
        if (!comprobanteOk) {
          return;
        }
      }
    } catch {
      // Eliminado log de error en producción
      Swal.fire('Error', 'Error de conexión con el servidor', 'error');
    } finally {
      setLoading(false);
    }
  };

  const mostrarComprobante = async (cobroId, datosComprobante) => {
    const usuarioSesion = JSON.parse(sessionStorage.getItem('usuario') || '{}');
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
        const resConsulta = await authFetch(`api_consultas.php?consulta_id=${consultaId}`);
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
    const esConsultaMedica = consulta.key === 'consulta';
    const numeroOrden = tipoConsultaRaw === 'programada' ? (consulta.numero_orden || consultaVinculada?.numero_orden || 'N/A') : '';
    let correlativoDiaConsulta = null;
    const medicoConsultaId = Number(
      consultaVinculada?.medico_id
      || consulta?.medico_id
      || detalleConsulta?.medico_id
      || 0
    );
    const horaConsultaNorm = String(horaConsulta || '').slice(0, 5);
    if (esConsultaMedica && medicoConsultaId > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fechaConsulta)) {
      try {
        const qs = new URLSearchParams({
          medico_id: String(medicoConsultaId),
          fecha_desde: fechaConsulta,
          fecha_hasta: fechaConsulta,
        });
        const resCorrelativo = await authFetch(`api_consultas.php?${qs.toString()}`);
        const dataCorrelativo = await resCorrelativo.json();
        if (dataCorrelativo?.success && Array.isArray(dataCorrelativo.consultas)) {
          const activasDia = dataCorrelativo.consultas
            .filter((c) => String(c?.estado || '').toLowerCase().trim() !== 'cancelada')
            .sort((a, b) => {
              const horaA = String(a?.hora || '').slice(0, 5);
              const horaB = String(b?.hora || '').slice(0, 5);
              if (horaA < horaB) return -1;
              if (horaA > horaB) return 1;
              return Number(a?.id || 0) - Number(b?.id || 0);
            });

          const idxConsulta = activasDia.findIndex((c) => Number(c?.id || 0) === consultaId);
          if (idxConsulta >= 0) {
            correlativoDiaConsulta = idxConsulta + 1;
          } else if (horaConsultaNorm) {
            correlativoDiaConsulta = activasDia.filter((c) => String(c?.hora || '').slice(0, 5) <= horaConsultaNorm).length + 1;
          }
        }
      } catch {
        correlativoDiaConsulta = null;
      }
    }
    const logoSrc = clinicBrand.logo || '/2demayo.svg';
    const cotizacionIdsTicket = Array.from(new Set([
      ...(Array.isArray(datosComprobante?.cotizacion_ids) ? datosComprobante.cotizacion_ids : []),
      ...(Array.isArray(servicio?.cotizacion_ids) ? servicio.cotizacion_ids : []),
      Number(servicio?.cotizacion_id || 0),
    ].map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)));
    const cotizacionId = cotizacionIdsTicket[0] || 0;
    const referenciaOrigenCobro = String(
      datosComprobante?.referencia_origen
      || servicio?.referencia_origen
      || paciente?.referencia_origen
      || ''
    ).trim();
    const usuarioNombre = String(
      datosComprobante?.usuario_nombre
      || usuarioSesion?.nombre
      || usuarioSesion?.usuario
      || 'Sistema'
    ).trim() || 'Sistema';
    const usuarioRolFmt = formatUserRole(
      datosComprobante?.usuario_rol
      || usuarioSesion?.rol
      || ''
    );
    const usuarioLabel = usuarioRolFmt ? `${usuarioNombre} (${usuarioRolFmt})` : usuarioNombre;
    const tieneSaldoPendiente = Number.isFinite(Number(saldoPendiente)) && Number(saldoPendiente) > 0;
    const esCobroCotizacion = cotizacionIdsTicket.length > 0 && tieneSaldoPendiente;
    const saldoAnteriorCobro = Math.max(0, Number(saldoPendiente || 0));
    const abonoAplicadoCobro = Math.max(0, Number(datosComprobante?.total || 0));
    const descuentoAplicadoCobro = Math.max(0, Number(datosComprobante?.monto_descuento || 0));
    const saldoRestanteCobro = Math.max(0, saldoAnteriorCobro - abonoAplicadoCobro - descuentoAplicadoCobro);
    const esAdelantoCobro = tieneSaldoPendiente && (modoCobro === 'parcial' || saldoRestanteCobro > 0);
    const mostrarResumenSaldo = tieneSaldoPendiente && (esCobroCotizacion || esAdelantoCobro);

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

    const toMoney = (value) => `S/ ${Number(value || 0).toFixed(2)}`;
    const escapeHtml = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    const contactoLinea = [
      clinicBrand.telefono ? `Tel: ${escapeHtml(clinicBrand.telefono)}` : '',
      clinicBrand.celular ? `Cel: ${escapeHtml(clinicBrand.celular)}` : '',
    ].filter(Boolean).join(' | ');
    const categoriaLabelMap = {
      consulta: 'Consultas',
      laboratorio: 'Laboratorio',
      farmacia: 'Farmacia',
      rayosx: 'Rayos X',
      ecografia: 'Ecografía',
      procedimiento: 'Procedimientos',
      operacion: 'Operaciones',
      hospitalizacion: 'Hospitalización',
    };
    const gruposDetalles = Object.values((Array.isArray(datosComprobante.detalles) ? datosComprobante.detalles : []).reduce((acc, d) => {
      const key = String(d?.servicio_tipo || 'procedimiento').toLowerCase();
      if (!acc[key]) {
        acc[key] = {
          key,
          label: categoriaLabelMap[key] || 'Otros servicios',
          subtotal: 0,
          items: [],
        };
      }
      acc[key].subtotal += Number(d?.subtotal || 0);
      acc[key].items.push(d);
      return acc;
    }, {}));
    const resumenDetallesHtml = gruposDetalles.map((grupo) => {
      const itemsHtml = grupo.items.map((d) => {
        const descripcion = String(d?.descripcion || 'Servicio').trim();
        const servicioLabel = escapeHtml(categoriaLabelMap[String(d?.servicio_tipo || '').toLowerCase()] || String(d?.servicio_tipo || 'Servicio').trim() || 'Servicio');
        const fechaProgramadaRaw = String(d?.fecha_programada || '').slice(0, 10);
        const horaProgramada = String(d?.hora_programada || '').slice(0, 5);
        const fechaProgramada = /^\d{4}-\d{2}-\d{2}$/.test(fechaProgramadaRaw)
          ? (() => {
              const [anio, mes, dia] = fechaProgramadaRaw.split('-');
              return `${dia}/${mes}/${anio}`;
            })()
          : fechaProgramadaRaw;
        const prefijoCotizacion = Number(d?.cotizacion_id || 0) > 0 && cotizacionIdsTicket.length > 1
          ? `[#${Number(d?.cotizacion_id || 0)}] `
          : '';
        const descripcionCorta = `${prefijoCotizacion}${descripcion}`.length > 34
          ? `${`${prefijoCotizacion}${descripcion}`.slice(0, 31)}...`
          : `${prefijoCotizacion}${descripcion}`;
        const cantidad = Number(d?.cantidad || 0);
        const subtotal = Number(d?.subtotal || 0);
        const programacionLinea = (servicioLabel || fechaProgramada || horaProgramada)
          ? `<div class="t-submeta">${servicioLabel ? `Servicio: ${servicioLabel}` : ''}${servicioLabel && (fechaProgramada || horaProgramada) ? ' | ' : ''}${fechaProgramada ? `Fecha: ${escapeHtml(fechaProgramada)}` : ''}${fechaProgramada && horaProgramada ? ' | ' : ''}${horaProgramada ? `Hora: ${escapeHtml(horaProgramada)}` : ''}</div>`
          : '';
        return `
          <div class="t-item">
            <div class="t-row">
              <div class="t-desc">${descripcionCorta} x${cantidad}</div>
              <div class="t-amount">${toMoney(subtotal)}</div>
            </div>
            ${programacionLinea}
          </div>`;
      }).join('');

      return `
        <div class="t-section">${grupo.label}</div>
        ${itemsHtml}
        <div class="t-row">
          <div class="t-desc"><strong>Subtotal ${grupo.label}</strong></div>
          <div class="t-amount">${toMoney(grupo.subtotal)}</div>
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
        .ticket-80 .t-item { margin: 2px 0 4px; }
        .ticket-80 .t-desc {
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ticket-80 .t-submeta {
          margin: 0 0 2px;
          font-size: 9px;
          line-height: 1.1;
          color: #374151;
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
          <div class="t-clinic"${clinicBrand.nombre_color ? ` style="color:${clinicBrand.nombre_color};"` : ''}>${clinicBrand.name}</div>
          ${clinicBrand.slogan ? `<div class="t-line" style="font-style:italic;${clinicBrand.slogan_color ? `color:${clinicBrand.slogan_color};` : ''}">${clinicBrand.slogan}</div>` : ''}
          ${clinicBrand.direccion ? `<div class="t-line">${clinicBrand.direccion}</div>` : ''}
          ${contactoLinea ? `<div class="t-line">${contactoLinea}</div>` : ''}
          ${clinicBrand.ruc ? `<div class="t-line">RUC: ${clinicBrand.ruc}</div>` : ''}
        </div>

        <hr class="t-hr" />
        <div class="t-title">Comprobante de pago #${cobroId}</div>
        <div class="t-meta">Fecha: ${fechaHora}</div>
        <div class="t-meta">Paciente: ${nombreCompleto}</div>
        <div class="t-meta">DNI: ${dniPaciente || '-'}</div>
        <div class="t-meta">H.C.: ${historiaClinicaPaciente || '-'}</div>
        <div class="t-meta">Usuario: ${escapeHtml(usuarioLabel)}</div>
        ${cotizacionIdsTicket.length > 0 ? `<div class="t-meta">Atenciones: ${cotizacionIdsTicket.map((id) => `#${id}`).join(', ')}</div>` : ''}
        ${referenciaOrigenCobro ? `<div class="t-meta">Referencia origen: ${referenciaOrigenCobro}</div>` : ''}
        ${esConsultaMedica ? `<div class="t-meta">Consulta: ${tipoConsulta}</div>` : ''}
        ${esConsultaMedica ? `<div class="t-meta">Fecha consulta: ${fechaConsultaFmt || 'No registrada'}</div>` : ''}
        ${esConsultaMedica ? `<div class="t-meta">Hora consulta: ${horaConsulta || 'No registrada'}</div>` : ''}
        ${esConsultaMedica && Number(correlativoDiaConsulta || 0) > 0 ? `<div class="t-meta">Correlativo del dia: N° ${Number(correlativoDiaConsulta)}</div>` : ''}
        ${esConsultaMedica && tipoConsultaRaw === 'programada' ? `<div class="t-meta">Orden: ${numeroOrden}</div>` : ''}
        ${nombreProfesional ? `<div class="t-meta">Profesional: ${nombreProfesional}</div>` : ''}

        <hr class="t-hr" />
        <div class="t-section">Detalle</div>
        ${resumenDetallesHtml || '<div class="t-meta">Sin detalles</div>'}

        <hr class="t-hr" />
        ${descuentoAplicadoCobro > 0
          ? `<div class="t-row"><div class="t-desc"><strong>Descuento</strong></div><div class="t-amount">-${toMoney(descuentoAplicadoCobro)}</div></div>`
          : ''}
        <div class="t-row t-total"><div class="t-desc">TOTAL</div><div class="t-amount">${toMoney(datosComprobante.total)}</div></div>

        ${mostrarResumenSaldo ? `
          <div class="t-section">Resumen saldo</div>
          ${esCobroCotizacion ? `<div class="t-meta">${cotizacionIdsTicket.length > 1 ? 'Atenciones' : 'Atención'}: ${cotizacionIdsTicket.map((id) => `#${id}`).join(', ')}</div>` : ''}
          <div class="t-meta">Aplicación: ${esAdelantoCobro ? 'Adelanto' : 'Pago completo'}</div>
          <div class="t-row"><div class="t-desc">Saldo anterior</div><div class="t-amount">${toMoney(saldoAnteriorCobro)}</div></div>
          <div class="t-row"><div class="t-desc">Abono aplicado</div><div class="t-amount">${toMoney(abonoAplicadoCobro)}</div></div>
          <div class="t-row"><div class="t-desc">Saldo pendiente</div><div class="t-amount">${toMoney(saldoRestanteCobro)}</div></div>
        ` : ''}

        <div class="t-meta">Pago: ${tipoPago === 'yape' ? 'Yape' : tipoPago.toUpperCase()}</div>
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
              {esDescuentoTotal && (
                <label className="mt-3 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                  <input
                    type="checkbox"
                    checked={atencionSolidaria}
                    onChange={(event) => setAtencionSolidaria(event.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    <strong>Atención solidaria: el médico renuncia a su honorario.</strong>
                    <span className="mt-1 block">No se generará liquidación médica para este cobro. Si no se marca, la clínica asume el costo del honorario.</span>
                  </span>
                </label>
              )}
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
                  {modoCobro === 'parcial' ? 'Adelanto de hoy:' : 'Cobro automático de hoy:'} S/ {totalCobro.toFixed(2)} de un saldo pendiente de S/ {Number(saldoPendiente || 0).toFixed(2)}.
                </div>
              </div>
            )}
            <h4 className="font-semibold mb-2 text-blue-700 flex items-center gap-2 text-lg"><span className="text-blue-400">🧾</span> Detalle del Servicio</h4>
            {detallesRender.map((detalle, index) => {
              let precio = detalle.subtotal_mostrar;
              if (
                modoCobro !== 'parcial'
                && (typeof precio !== 'number' || precio <= 0)
                && typeof detalle.precio_publico === 'number'
              ) {
                precio = detalle.precio_publico;
              }
              const medicoNombre = String(
                detalle.medico_nombre_completo
                || `${detalle.medico_nombre || ''} ${detalle.medico_apellido || ''}`
              ).trim();
              const pendienteServicio = Math.max(
                0,
                Number(detalle?.subtotal_original || 0) - Number(detalle?.subtotal_mostrar || 0)
              );
              const key = buildDetalleKey(detalle, index);
              return (
                <div key={key} className="flex justify-between items-center text-base">
                  <span>
                    {detalle.descripcion}
                    {Number(detalle?.cotizacion_id || 0) > 0 && Array.isArray(servicio?.cotizacion_ids) && servicio.cotizacion_ids.length > 1 ? (
                      <span className="block text-xs text-slate-500">Atención #{Number(detalle.cotizacion_id)}</span>
                    ) : null}
                    {modoCobro === 'parcial' ? (
                      <span className="block text-xs text-gray-500">
                        Aplicado hoy: S/ {Number(detalle?.subtotal_mostrar || 0).toFixed(2)}
                        {Number(detalle?.subtotal_original || 0) > 0 ? ` de S/ ${Number(detalle.subtotal_original).toFixed(2)}` : ''}
                      </span>
                    ) : null}
                    {modoCobro === 'parcial' ? (
                      <span className="block text-xs text-amber-700">
                        Pendiente en servicio: S/ {pendienteServicio.toFixed(2)}
                      </span>
                    ) : null}
                    {medicoNombre ? <span className="block text-xs text-gray-500">{medicoNombre}</span> : null}
                  </span>
                  <span className="font-bold">S/ {Math.max(0, Number(precio || 0)).toFixed(2)}</span>
                </div>
              );
            })}
            <hr className="my-3" />
            <div className="flex justify-between items-center font-bold text-lg lg:text-xl">
              <span>Total:</span>
              <span className="text-green-600">S/ {totalCobro.toFixed(2)}</span>
            </div>

            <div className="mt-4 rounded-xl border border-indigo-200 bg-white p-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-indigo-800">
                <input
                  type="checkbox"
                  checked={usarRepartoManual}
                  onChange={(e) => setUsarRepartoManual(e.target.checked)}
                />
                Definir reparto manual de este cobro (médico/clínica)
              </label>
              <p className="text-xs text-gray-600 mt-1">
                Úsalo cuando el paciente paga un monto distinto y quieres decidir explícitamente cuánto se liquida al médico por cada servicio.
              </p>

              {usarRepartoManual && (
                <div className="mt-3 space-y-3">
                  {detallesCobro.map((detalle, index) => {
                    const key = buildDetalleKey(detalle, index);
                    const subtotal = Math.max(0, Number(subtotalesNetosPorDetalle.get(key) || 0));
                    const subtotalOriginal = Math.max(0, Number(detalle?.subtotal || 0));
                    const entry = repartoPorDetalle[key] || {};
                    const montoMedico = entry?.monto_medico ?? '';
                    const porcentaje = entry?.porcentaje_medico ?? '';
                    const montoMedNum = Number(montoMedico || 0);
                    const montoClinica = Number((subtotal - Math.max(0, Math.min(montoMedNum, subtotal))).toFixed(2));
                    const medicoNombre = String(detalle?.medico_nombre_completo || `${detalle?.medico_nombre || ''} ${detalle?.medico_apellido || ''}`).trim();

                    return (
                      <div key={`rep-${key}`} className="rounded-lg border border-gray-200 p-3">
                        <div className="text-sm font-semibold text-gray-800">{detalle?.descripcion || 'Servicio'}</div>
                        <div className="text-xs text-gray-500 mb-2">
                          {medicoNombre || 'Sin médico'} | Monto neto a repartir: S/ {subtotal.toFixed(2)}
                          {Math.abs(subtotalOriginal - subtotal) > 0.009 ? ` (original: S/ ${subtotalOriginal.toFixed(2)})` : ''}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                          <div>
                            <label className="text-xs text-gray-600">% médico</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={porcentaje}
                              onChange={(e) => updateRepartoPorcentaje(key, subtotal, e.target.value)}
                              onBlur={() => normalizarRepartoPorcentajeOnBlur(key, subtotal)}
                              className="w-full border rounded px-2 py-1"
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">Monto médico (S/)</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={montoMedico}
                              onChange={(e) => updateRepartoMonto(key, subtotal, e.target.value)}
                              onBlur={() => normalizarRepartoMontoOnBlur(key, subtotal)}
                              className="w-full border rounded px-2 py-1"
                              placeholder="0.00"
                            />
                          </div>
                          <div className="md:col-span-2 flex items-end">
                            <div className="text-xs text-gray-700">Clínica (residual): <span className="font-semibold">S/ {montoClinica.toFixed(2)}</span></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    Total médicos: <strong>S/ {resumenRepartoManual.totalMedicos.toFixed(2)}</strong> | Total clínica: <strong>S/ {resumenRepartoManual.totalClinica.toFixed(2)}</strong> | Base neta: <strong>S/ {resumenRepartoManual.totalNeto.toFixed(2)}</strong>
                  </div>
                </div>
              )}
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
              disabled={loading}
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