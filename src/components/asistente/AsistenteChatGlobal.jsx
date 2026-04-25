import { useState, useEffect, useRef, useCallback } from 'react';
import { BASE_URL } from '../../config/config.js';

const API_CHAT_URL = '/api_asistente_chat.php';
const API_APARIENCIA_URL = '/api_configuracion_apariencia.php';
const SOPORTE_WHATSAPP = '51945241682';

const CATEGORIAS_ICONOS = {
  'Caja':           '💰',
  'Pacientes':      '👤',
  'Cotizaciones':   '📋',
  'Consultas':      '📅',
  'Historia Clínica': '🏥',
  'Laboratorio':    '🔬',
  'Farmacia':       '💊',
  'Tarifas':        '🏷️',
  'Usuarios':       '👥',
  'Dashboard':      '📊',
  'Configuración':  '⚙️',
};

const SUGERENCIAS_POR_ROL = {
  medico: [
    { id: 'rol-med-1', categoria: 'Historia Clínica', pregunta: '¿Cómo veo el historial completo del paciente en HC?' },
    { id: 'rol-med-2', categoria: 'Historia Clínica', pregunta: '¿Cómo agendo la próxima cita desde la HC?' },
    { id: 'rol-med-3', categoria: 'Laboratorio', pregunta: '¿Cómo ve el médico los resultados de laboratorio?' },
    { id: 'rol-med-4', categoria: 'Consultas', pregunta: '¿Cómo veo las consultas del día?' },
  ],
  laboratorista: [
    { id: 'rol-lab-1', categoria: 'Laboratorio', pregunta: '¿Cómo cargo los resultados de laboratorio?' },
    { id: 'rol-lab-2', categoria: 'Laboratorio', pregunta: '¿Cómo configuro valores referenciales por sexo y edad?' },
    { id: 'rol-lab-3', categoria: 'Laboratorio', pregunta: '¿Cómo agrego subtítulos o títulos en un examen de laboratorio?' },
    { id: 'rol-lab-4', categoria: 'Laboratorio', pregunta: '¿Cómo ordeno los parámetros del examen?' },
  ],
  quimico: [
    { id: 'rol-qui-1', categoria: 'Farmacia', pregunta: '¿Cómo busco un medicamento?' },
    { id: 'rol-qui-2', categoria: 'Farmacia', pregunta: '¿Cómo registro una venta de farmacia?' },
    { id: 'rol-qui-3', categoria: 'Farmacia', pregunta: '¿Cómo reviso stock disponible de medicamentos?' },
    { id: 'rol-qui-4', categoria: 'Farmacia', pregunta: '¿Cómo identifico medicamentos por código?' },
  ],
  enfermero: [
    { id: 'rol-enf-1', categoria: 'Consultas', pregunta: '¿Cómo veo las consultas del día?' },
    { id: 'rol-enf-2', categoria: 'Historia Clínica', pregunta: '¿Cómo veo el historial completo del paciente en HC?' },
    { id: 'rol-enf-3', categoria: 'Pacientes', pregunta: '¿Cómo busco un paciente?' },
    { id: 'rol-enf-4', categoria: 'Consultas', pregunta: '¿Cómo agendo una consulta?' },
  ],
  recepcionista: [
    { id: 'rol-rec-1', categoria: 'Pacientes', pregunta: '¿Cómo registro un paciente nuevo?' },
    { id: 'rol-rec-2', categoria: 'Cotizaciones', pregunta: '¿Cómo hago una cotización?' },
    { id: 'rol-rec-3', categoria: 'Cotizaciones', pregunta: '¿Cómo cobro una cotización?' },
    { id: 'rol-rec-4', categoria: 'Caja', pregunta: '¿Cómo abro la caja?' },
  ],
};

const CATEGORIAS_PERMITIDAS_POR_ROL = {
  medico: ['Historia Clínica', 'Consultas', 'Laboratorio', 'Pacientes'],
  laboratorista: ['Laboratorio'],
  quimico: ['Farmacia'],
  enfermero: ['Consultas', 'Historia Clínica', 'Pacientes'],
  recepcionista: ['Caja', 'Pacientes', 'Cotizaciones', 'Consultas'],
};

function icono(cat) {
  return CATEGORIAS_ICONOS[cat] ?? '❓';
}

function normalizarRol(rolRaw) {
  const rol = String(rolRaw || '').trim().toLowerCase();
  if (rol === 'químico') return 'quimico';
  return rol;
}

function filtrarPorRol(items, rolRaw) {
  const rol = normalizarRol(rolRaw);
  const permitidas = CATEGORIAS_PERMITIDAS_POR_ROL[rol] || null;
  const list = Array.isArray(items) ? items : [];
  if (!permitidas) return list;
  return list.filter((item) => {
    const categoria = String(item?.categoria || '').trim();
    if (!categoria) return true;
    return permitidas.includes(categoria);
  });
}

function sugerenciasFallbackPorRol(rolRaw) {
  const rol = normalizarRol(rolRaw);
  const list = SUGERENCIAS_POR_ROL[rol];
  return Array.isArray(list) ? list : [];
}

// Mensaje tipo burbuja
function Burbuja({ msg }) {
  const esUsuario = msg.tipo === 'usuario';
  return (
    <div className={`flex ${esUsuario ? 'justify-end' : 'justify-start'} mb-2`}>
      {!esUsuario && (
        <div className="mr-2 flex-shrink-0">
          {msg.avatar ? (
            <img src={msg.avatar} alt="Asistente" className="h-7 w-7 rounded-full object-cover border border-slate-200" />
          ) : (
            <div className="h-7 w-7 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold select-none">A</div>
          )}
        </div>
      )}
      <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-[12.5px] leading-5 shadow-sm ${
        esUsuario
          ? 'bg-violet-600 text-white rounded-br-sm'
          : 'bg-white text-slate-800 rounded-bl-sm border border-slate-100'
      }`}>
        {msg.texto}
        {msg.relacionadas?.length > 0 && (
          <div className="mt-2 border-t border-slate-100 pt-2 space-y-1">
            <p className="text-[11px] text-slate-500 font-medium">También puede interesarte:</p>
            {msg.relacionadas.map(r => (
              <button
                key={r.id}
                onClick={msg.onRelacionada?.(r.pregunta)}
                className="block w-full text-left text-[11px] text-violet-700 hover:text-violet-900 hover:underline"
              >
                • {r.pregunta}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AsistenteChatGlobal({ usuario, placementMode = 'default' }) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([]);
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const [categorias, setCategorias] = useState([]);
  const [sugerencias, setSugerencias] = useState([]);
  const [avatarSrc, setAvatarSrc] = useState('');
  const [mostrarSugerencias, setMostrarSugerencias] = useState(true);
  const [pulsing, setPulsing] = useState(true);
  const [ultimaPregunta, setUltimaPregunta] = useState('');
  const [intentosAclaracion, setIntentosAclaracion] = useState(0);
  const [hcContexto, setHcContexto] = useState({
    available: false,
    consultaId: 0,
    totalHistoriasPrevias: 0,
    resumenItems: [],
    hcAnteriorLoading: false,
    hcAnteriorError: '',
    canOpenHistoryDrawer: false,
  });

  const mensajesRef  = useRef(null);
  const inputRef     = useRef(null);
  const inicializado = useRef(false);
  const hcResumenMostradoRef = useRef({ consultaId: 0, enviado: false });
  const rolActual = normalizarRol(usuario?.rol);

  // Scroll al final
  const scrollAlFinal = useCallback(() => {
    requestAnimationFrame(() => {
      if (mensajesRef.current) {
        mensajesRef.current.scrollTop = mensajesRef.current.scrollHeight;
      }
    });
  }, []);

  // Cargar avatar activo + categorías al montar
  useEffect(() => {
    const cargar = async () => {
      try {
        const [resAvatar, resCat] = await Promise.all([
          fetch(API_APARIENCIA_URL, { credentials: 'include' }),
          fetch(`${API_CHAT_URL}?action=categorias`, { credentials: 'include' }),
        ]);
        const [dataAv, dataCat] = await Promise.all([resAvatar.json(), resCat.json()]);

        if (dataAv?.success) {
          const activo = dataAv.data?.avatares?.find(a => a.activo);
          if (activo?.valor) {
            setAvatarSrc(`${BASE_URL}${activo.valor}`);
          }
        }
        if (dataCat?.success) {
          setCategorias(dataCat.categorias || []);
        }
      } catch {
        // fail silently
      }
    };
    cargar();

    // Quitar pulse después de 4 segundos
    const t = setTimeout(() => setPulsing(false), 4000);
    return () => clearTimeout(t);
  }, []);

  // Mensaje de bienvenida al abrir
  useEffect(() => {
    if (abierto && !inicializado.current) {
      inicializado.current = true;
      const rolLabel = usuario?.rol === 'medico' ? 'Dr.' : '';
      const nombre   = usuario?.nombre ? ` ${rolLabel} ${usuario.nombre}` : '';
      setMensajes([{
        tipo:  'asistente',
        texto: `Hola${nombre}! 👋 Me alegra acompañarte en esta atención. Estoy aquí para apoyarte paso a paso, tanto en funcionalidades del sistema como en contexto clínico de HC previa cuando esté disponible.\n\nCuéntame qué necesitas y lo resolvemos juntos.`,
        id:    'bienvenida',
      }]);
      setTimeout(() => cargarSugerencias(''), 200);
    }
    if (abierto) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [abierto]);

  useEffect(() => {
    scrollAlFinal();
  }, [mensajes]);

  useEffect(() => {
    const onHcContextUpdated = (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const resumenItems = Array.isArray(detail.resumenItems)
        ? detail.resumenItems.map((item) => String(item || '').trim()).filter(Boolean)
        : [];

      setHcContexto({
        available: Boolean(detail.available),
        consultaId: Number(detail.consultaId || 0),
        totalHistoriasPrevias: Number(detail.totalHistoriasPrevias || 0),
        resumenItems,
        hcAnteriorLoading: Boolean(detail.hcAnteriorLoading),
        hcAnteriorError: String(detail.hcAnteriorError || ''),
        canOpenHistoryDrawer: Boolean(detail.canOpenHistoryDrawer),
      });
    };

    window.addEventListener('hc-assistant-context-updated', onHcContextUpdated);
    return () => window.removeEventListener('hc-assistant-context-updated', onHcContextUpdated);
  }, []);

  useEffect(() => {
    if (!abierto || !hcContexto.available) return;

    const consultaId = Number(hcContexto.consultaId || 0);
    if (hcResumenMostradoRef.current.consultaId !== consultaId) {
      hcResumenMostradoRef.current = { consultaId, enviado: false };
    }
    if (hcResumenMostradoRef.current.enviado) return;

    const timer = window.setTimeout(() => {
      const resumenTexto = hcContexto.hcAnteriorLoading
        ? 'Estoy preparando el contexto de HC previa para que tengas una vista rápida y segura.'
        : hcContexto.hcAnteriorError
          ? `No pude cargar el resumen de HC previa: ${hcContexto.hcAnteriorError}`
          : (hcContexto.resumenItems || []).length > 0
            ? `Te comparto un resumen inicial:\n${hcContexto.resumenItems.slice(0, 4).map((item) => `• ${item}`).join('\n')}`
            : 'Esta atención no tiene HC previa encadenada en este momento.';

      agregarMensaje({
        tipo: 'asistente',
        texto: `Perfecto, ya estoy contigo en esta HC. ${resumenTexto}`,
        accionAbrirHistorial: hcContexto.canOpenHistoryDrawer,
      });

      hcResumenMostradoRef.current = { consultaId, enviado: true };
    }, 550);

    return () => window.clearTimeout(timer);
  }, [
    abierto,
    hcContexto.available,
    hcContexto.consultaId,
    hcContexto.hcAnteriorLoading,
    hcContexto.hcAnteriorError,
    hcContexto.resumenItems,
    hcContexto.canOpenHistoryDrawer,
  ]);

  const cargarSugerencias = async (cat) => {
    try {
      const url = `${API_CHAT_URL}?action=sugerencias${cat ? `&categoria=${encodeURIComponent(cat)}` : ''}`;
      const res  = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        const filtradas = filtrarPorRol(data.sugerencias || [], rolActual);
        setSugerencias(filtradas.length > 0 ? filtradas : sugerenciasFallbackPorRol(rolActual));
      }
    } catch {
      // ignore
      setSugerencias(sugerenciasFallbackPorRol(rolActual));
    }
  };

  const agregarMensaje = (msg) => {
    setMensajes(prev => [...prev, { ...msg, id: Date.now() + Math.random() }]);
  };

  const abrirDrawerHistorialHc = (registrarMensaje = false) => {
    if (!hcContexto.canOpenHistoryDrawer) {
      if (registrarMensaje) {
        agregarMensaje({
          tipo: 'asistente',
          texto: 'Esta atención no tiene HC previa encadenada para abrir historial.'
        });
      }
      return;
    }

    window.dispatchEvent(new CustomEvent('hc-assistant-open-history-drawer'));
    if (registrarMensaje) {
      agregarMensaje({
        tipo: 'asistente',
        texto: 'Listo, abrí el historial clínico previo en el panel lateral derecho.'
      });
    }
  };

  const escalarASoporte = async (motivo = 'sin_respuesta', preguntaParam = '') => {
    const preguntaFinal = String(preguntaParam || ultimaPregunta || '').trim();
    const nombre = [usuario?.nombre, usuario?.apellido].filter(Boolean).join(' ').trim();
    const rol = String(usuario?.rol || '').trim() || 'sin_rol';
    const urlActual = typeof window !== 'undefined' ? window.location.href : '';

    if (!preguntaFinal) {
      agregarMensaje({ tipo: 'asistente', texto: 'Para escalar, primero necesito tu pregunta o duda.' });
      return;
    }

    try {
      await fetch(API_CHAT_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'escalar',
          pregunta: preguntaFinal,
          motivo,
          url_actual: urlActual,
        }),
      });
    } catch {
      // Aunque falle el registro, se permite continuar con WhatsApp.
    }

    const texto = [
      'Hola, necesito soporte del sistema.',
      `Usuario: ${nombre || 'No identificado'}`,
      `Rol: ${rol}`,
      `Motivo: ${motivo}`,
      `Consulta: ${preguntaFinal}`,
      `Pantalla: ${urlActual}`,
    ].join('\n');

    const waUrl = `https://wa.me/${SOPORTE_WHATSAPP}?text=${encodeURIComponent(texto)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    agregarMensaje({
      tipo: 'asistente',
      texto: 'Listo. Te derive al area de soporte por WhatsApp para atencion personalizada. Si no responden de inmediato, pueden estar en otra atencion o conversacion; te recomiendo enviar un solo mensaje claro y esperar su confirmacion. Si es urgente, indicalo en la primera linea.',
    });
  };

  const enviarPregunta = async (preguntaTexto) => {
    const texto = (preguntaTexto ?? input).trim();
    if (!texto || cargando) return;

    setInput('');
    setUltimaPregunta(texto);
    setMostrarSugerencias(false);
    agregarMensaje({ tipo: 'usuario', texto });
    setCargando(true);

    const textoNormalizado = texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const consultaHistorial = /(historia\s*previa|historias?\s*clinicas?\s*previas?|hc\s*previa|historial\s*(clinico|completo|previo)|ver\s*historial|abrir\s*historial|ultimas?\s*historias?\s*clinicas?)/.test(textoNormalizado);
    const consultaResumenHc = /(resumen|datos\s*previos|hc\s*anterior|diagnostico\s*previo|laboratorio\s*previo|ecografia\s*previa)/.test(textoNormalizado);
    const consultaCitaControl = /(cita\s*control|proxima\s*cita|control\s*(medico|hc|consulta)?|seguimiento)/.test(textoNormalizado);
    const consultaImpresion = /(imprimir|impresion|boton(es)?\s*(hc|lab|receta)|imprime\s*(hc|lab|receta)|hc\s*lab\s*receta)/.test(textoNormalizado);
    const consultaRecetaManual = /(agregar\s*manual|medicamento\s*manual|no\s*encuentro\s*el\s*medicamento|receta\s*manual)/.test(textoNormalizado);
    const consultaFrecuencia = /(por\s*hora|por\s*dia|cada\s*\d+\s*hora|frecuencia\s*tratamiento|horario\s*medicamento)/.test(textoNormalizado);
    const consultaCie10 = /(cie10|diagnostico\s*multiple|mas\s*de\s*un\s*diagnostico|varios\s*diagnosticos|codigo\s*cie)/.test(textoNormalizado);
    const esRolClinico = ['medico', 'enfermero'].includes(rolActual);

    if (esRolClinico && (consultaHistorial || consultaResumenHc)) {
      const resumenItems = Array.isArray(hcContexto.resumenItems) ? hcContexto.resumenItems : [];
      const resumenTexto = resumenItems.length > 0
        ? resumenItems.map((item) => `• ${item}`).join('\n')
        : 'En esta atención no encuentro HC previa encadenada para resumir.';

      if (consultaHistorial && hcContexto.canOpenHistoryDrawer) {
        abrirDrawerHistorialHc(false);
      }

      setIntentosAclaracion(0);
      agregarMensaje({
        tipo: 'asistente',
        texto: `🏥 **Contexto HC previa**\n\n${resumenTexto}${consultaHistorial && hcContexto.canOpenHistoryDrawer ? '\n\nAbrí el panel lateral derecho con el historial completo.' : ''}`,
      });
      setCargando(false);
      return;
    }

    if (esRolClinico && consultaCitaControl) {
      setIntentosAclaracion(0);
      agregarMensaje({
        tipo: 'asistente',
        texto: '📅 **Cita de control en HC**\n\n1. Activa "Programar próxima cita al guardar esta HC".\n2. Marca "Cita de control" si corresponde.\n3. Completa fecha y hora.\n4. Al guardar la HC, la cita se agenda automáticamente.\n\nSi deseas, te guío paso a paso con tu caso actual.',
      });
      setCargando(false);
      return;
    }

    if (esRolClinico && consultaImpresion) {
      setIntentosAclaracion(0);
      agregarMensaje({
        tipo: 'asistente',
        texto: '🖨️ **Botones de impresión**\n\n• **HC**: imprime la historia clínica actual.\n• **Lab**: imprime resultados/ordenes de laboratorio disponibles.\n• **Receta**: imprime los medicamentos registrados.\n\nSi un botón está deshabilitado, normalmente falta contenido en esa sección.',
      });
      setCargando(false);
      return;
    }

    if (esRolClinico && consultaRecetaManual) {
      setIntentosAclaracion(0);
      agregarMensaje({
        tipo: 'asistente',
        texto: '💊 **Medicamento manual**\n\nEn "Receta médica", si no aparece el fármaco en la búsqueda, usa "No encuentro el medicamento, agregar manualmente" y completa: nombre, dosis, frecuencia, duración y observaciones.',
      });
      setCargando(false);
      return;
    }

    if (esRolClinico && consultaFrecuencia) {
      setIntentosAclaracion(0);
      agregarMensaje({
        tipo: 'asistente',
        texto: '⏱️ **Tratamiento por hora o por día**\n\nRegistra la frecuencia de forma clínica clara: "cada 8 horas", "1 vez al día" o similar. Si necesitas precisión, agrega horarios exactos en observaciones (ej. 08:00 - 16:00 - 24:00).',
      });
      setCargando(false);
      return;
    }

    if (esRolClinico && consultaCie10) {
      setIntentosAclaracion(0);
      agregarMensaje({
        tipo: 'asistente',
        texto: '🧾 **CIE10 en HC**\n\nSí, puedes agregar más de un diagnóstico. Recomiendo registrar primero el principal y luego los adicionales relacionados para mantener coherencia clínica y facilitar reportes.',
      });
      setCargando(false);
      return;
    }

    try {
      const res  = await fetch(API_CHAT_URL, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ action: 'buscar', pregunta: texto }),
      });
      const data = await res.json();

      if (!data.success) {
        agregarMensaje({ tipo: 'asistente', texto: 'Ocurrió un error al consultar. Intenta nuevamente.' });
        return;
      }

      if (data.tipo === 'respuesta' && data.resultado) {
        const relacionadasFiltradas = filtrarPorRol(data.relacionadas || [], rolActual);
        setIntentosAclaracion(0);
        agregarMensaje({
          tipo:        'asistente',
          texto:       `${icono(data.resultado.categoria)} **${data.resultado.categoria}**\n\n${data.resultado.respuesta}`,
          relacionadas: relacionadasFiltradas,
          onRelacionada: (p) => () => enviarPregunta(p),
        });
      } else {
        // Sin resultado o general
        const msg = data.mensaje || 'No encontré información sobre tu consulta.';
        const sug = filtrarPorRol(data.sugerencias || [], rolActual);
        const sugFinal = sug.length > 0 ? sug : sugerenciasFallbackPorRol(rolActual);

        if (intentosAclaracion < 1) {
          setIntentosAclaracion(1);
          agregarMensaje({
            tipo: 'asistente',
            texto: `Quiero entenderte bien para ayudarte de forma precisa. ¿Me lo puedes explicar con un poco más de detalle?\n\nSi puedes, incluye: modulo, accion exacta y en que paso te quedaste (por ejemplo: "HC > CIE10 > agregar segundo diagnostico").`,
            relacionadas: sugFinal.map(s => ({ id: s.id, pregunta: s.pregunta, categoria: s.categoria })),
            onRelacionada: (p) => () => enviarPregunta(p),
          });
          return;
        }

        setIntentosAclaracion(0);
        agregarMensaje({
          tipo: 'asistente',
          texto: `${msg}\n\nAun no tengo suficiente contexto para responder con seguridad. ¿Deseas que te derive al area de soporte para atencion directa?`,
          relacionadas: sugFinal.map(s => ({ id: s.id, pregunta: s.pregunta, categoria: s.categoria })),
          escalar: true,
          onRelacionada: (p) => () => enviarPregunta(p),
        });
      }
    } catch {
      agregarMensaje({
        tipo: 'asistente',
        texto: 'No pude conectar con el asistente. Si deseas, te derivo al area de soporte por WhatsApp.',
        escalar: true,
      });
    } finally {
      setCargando(false);
    }
  };

  const manejarCategoria = (cat) => {
    agregarMensaje({ tipo: 'usuario', texto: `Ver temas de: ${cat}` });
    setMostrarSugerencias(true);
    cargarSugerencias(cat);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarPregunta();
    }
  };

  const limpiarChat = () => {
    inicializado.current = false;
    hcResumenMostradoRef.current = { consultaId: Number(hcContexto.consultaId || 0), enviado: false };
    setIntentosAclaracion(0);
    setMensajes([]);
    setSugerencias([]);
    setMostrarSugerencias(true);
    setInput('');
    // Re-trigger welcome
    const rolLabel = usuario?.rol === 'medico' ? 'Dr.' : '';
    const nombre   = usuario?.nombre ? ` ${rolLabel} ${usuario.nombre}` : '';
    setMensajes([{
      tipo:  'asistente',
      texto: `Hola${nombre}! 👋 Seguimos trabajando juntos. Dime qué necesitas y te acompaño en cada paso.`,
      id:    'bienvenida-reset',
    }]);
    const sugeridas = sugerenciasFallbackPorRol(rolActual);
    if (sugeridas.length > 0) {
      setSugerencias(sugeridas);
    } else {
      cargarSugerencias('');
    }
  };

  // Renderizar texto con **negrita** básica
  const renderTexto = (texto) => {
    const partes = texto.split('\n').map((linea, i) => {
      const segmentos = linea.split(/\*\*([^*]+)\*\*/g).map((seg, j) =>
        j % 2 === 1 ? <strong key={j}>{seg}</strong> : seg
      );
      return <span key={i}>{segmentos}{i < texto.split('\n').length - 1 && <br />}</span>;
    });
    return partes;
  };

  const isHcDesktopTop = placementMode === 'hc-desktop-top';
  const floatingButtonClass = isHcDesktopTop
    ? `fixed right-6 bottom-6 lg:bottom-auto lg:top-24 z-[9999] flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-violet-300 ${
        abierto ? 'bg-slate-700 scale-95' : 'bg-violet-600 hover:bg-violet-700 hover:scale-110'
      } ${pulsing && !abierto ? 'animate-pulse' : ''}`
    : `fixed bottom-6 right-6 z-[9999] flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-violet-300 ${
        abierto ? 'bg-slate-700 scale-95' : 'bg-violet-600 hover:bg-violet-700 hover:scale-110'
      } ${pulsing && !abierto ? 'animate-pulse' : ''}`;

  const chatPanelClass = isHcDesktopTop
    ? `fixed right-6 bottom-24 lg:bottom-auto lg:top-40 z-[9998] w-[360px] max-w-[calc(100vw-24px)] flex flex-col rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden transition-all duration-300 origin-bottom-right lg:origin-top-right ${
        abierto ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`
    : `fixed bottom-24 right-6 z-[9998] w-[360px] max-w-[calc(100vw-24px)] flex flex-col rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden transition-all duration-300 origin-bottom-right ${
        abierto ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`;
  return (
    <>
      {/* ── Botón flotante ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        aria-label={abierto ? 'Cerrar asistente' : 'Abrir asistente'}
        className={floatingButtonClass}
        style={{ boxShadow: '0 4px 24px 0 rgba(109,40,217,0.35)' }}
      >
        {abierto ? (
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : avatarSrc ? (
          <img src={avatarSrc} alt="Asistente" className="h-10 w-10 rounded-full object-cover" onError={() => setAvatarSrc('')} />
        ) : (
          <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
        )}
        {!abierto && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-green-400 border-2 border-white" aria-hidden />
        )}
      </button>

      {/* ── Panel de chat ──────────────────────────────────────────────── */}
      <div
        className={chatPanelClass}
        style={{ height: 520, maxHeight: 'calc(100dvh - 120px)' }}
        aria-hidden={!abierto}
      >
        {/* Cabecera */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-violet-700 to-purple-600 flex-shrink-0">
          <div className="flex-shrink-0">
            {avatarSrc ? (
              <img src={avatarSrc} alt="Asistente" className="h-9 w-9 rounded-full object-cover border-2 border-white/30" onError={() => setAvatarSrc('')} />
            ) : (
              <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">A</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-none">Asistente del sistema</p>
            <p className="text-violet-200 text-[11px] mt-0.5">Base de conocimiento · Siempre disponible</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={limpiarChat}
              title="Nueva conversación"
              className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              title="Cerrar"
              className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Área de mensajes */}
        <div
          ref={mensajesRef}
          className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 bg-slate-50"
        >
          {mensajes.map((msg) => (
            <div key={msg.id} className={`flex ${msg.tipo === 'usuario' ? 'justify-end' : 'justify-start'} mb-2`}>
              {msg.tipo !== 'usuario' && (
                <div className="mr-2 flex-shrink-0 mt-0.5">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="Asistente" className="h-7 w-7 rounded-full object-cover border border-slate-200" onError={() => setAvatarSrc('')} />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold">A</div>
                  )}
                </div>
              )}
              <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-[12.5px] leading-5 shadow-sm ${
                msg.tipo === 'usuario'
                  ? 'bg-violet-600 text-white rounded-br-sm'
                  : 'bg-white text-slate-800 rounded-bl-sm border border-slate-100'
              }`}>
                <div>{renderTexto(msg.texto)}</div>
                {msg.relacionadas?.length > 0 && (
                  <div className="mt-2 border-t border-slate-100 pt-2 space-y-1">
                    <p className="text-[11px] text-slate-500 font-medium">También puede interesarte:</p>
                    {msg.relacionadas.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => enviarPregunta(r.pregunta)}
                        className="block w-full text-left text-[11px] text-violet-700 hover:text-violet-900 hover:underline"
                      >
                        • {r.pregunta}
                      </button>
                    ))}
                  </div>
                )}
                {msg.escalar && (
                  <div className="mt-2 border-t border-slate-100 pt-2">
                    <button
                      type="button"
                      onClick={() => escalarASoporte('no_resuelto_en_chat', ultimaPregunta || msg.texto)}
                      className="w-full rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-[11px] text-emerald-700 hover:bg-emerald-100 transition-colors"
                    >
                      Contactar al area de soporte (WhatsApp)
                    </button>
                  </div>
                )}
                {msg.accionAbrirHistorial && (
                  <div className="mt-2 border-t border-slate-100 pt-2">
                    <button
                      type="button"
                      onClick={() => abrirDrawerHistorialHc(true)}
                      className="w-full rounded-lg bg-sky-50 border border-sky-200 px-2.5 py-1.5 text-[11px] text-sky-700 hover:bg-sky-100 transition-colors"
                    >
                      Abrir historial clínico previo
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Indicador escribiendo */}
          {cargando && (
            <div className="flex justify-start mb-2">
              <div className="mr-2 flex-shrink-0">
                <div className="h-7 w-7 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold">A</div>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm">
                <span className="flex gap-1 items-center h-5">
                  <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Sugerencias / Categorías */}
        {mostrarSugerencias && !cargando && (
          <div className="flex-shrink-0 bg-slate-50 border-t border-slate-100 px-3 py-2">
            {sugerencias.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {sugerencias.slice(0, 5).map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => enviarPregunta(s.pregunta)}
                    className="text-[11px] bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 rounded-full px-2.5 py-1 transition-colors leading-none"
                  >
                    {s.pregunta.length > 40 ? s.pregunta.slice(0, 38) + '…' : s.pregunta}
                  </button>
                ))}
              </div>
            ) : categorias.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {filtrarPorRol(categorias, rolActual).map(c => (
                  <button
                    key={c.categoria}
                    type="button"
                    onClick={() => manejarCategoria(c.categoria)}
                    className="text-[11px] bg-white border border-slate-200 text-slate-700 hover:bg-violet-50 hover:border-violet-300 rounded-full px-2.5 py-1 transition-colors leading-none"
                  >
                    {icono(c.categoria)} {c.categoria}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* Input */}
        <div className="flex-shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu pregunta aquí…"
            rows={1}
            disabled={cargando}
            className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all disabled:opacity-60"
            style={{ minHeight: 38, maxHeight: 90, overflowY: 'auto' }}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 90) + 'px';
            }}
          />
          <button
            type="button"
            onClick={() => enviarPregunta()}
            disabled={!input.trim() || cargando}
            className="flex-shrink-0 h-9 w-9 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
            aria-label="Enviar"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
