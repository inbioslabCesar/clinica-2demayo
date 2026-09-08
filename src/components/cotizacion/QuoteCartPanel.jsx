import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuoteCart } from "../../context/QuoteCartContext";
import Swal from "sweetalert2";
import { authFetch } from "../../utils/apiClient";
import { validarAgendaAntesDeCotizar } from "../../utils/agendaGuardCotizacion";

function getLimaDate() {
  const now = new Date();
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = partes.find((p) => p.type === "year")?.value;
  const month = partes.find((p) => p.type === "month")?.value;
  const day = partes.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function getLimaTime() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value;
  const minute = parts.find((p) => p.type === "minute")?.value;
  return `${hour}:${minute}`;
}

function esServicioProgramableParaAgenda(servicioTipo) {
  const tipo = String(servicioTipo || "").toLowerCase();
  return tipo !== "farmacia";
}

function esConsultaProgramadaDelCarrito(item) {
  const esConsulta = String(item?.serviceType || "").toLowerCase() === "consulta";
  if (!esConsulta) return false;
  const tipoConsulta = String(item?.consultaTipoConsulta || "programada").toLowerCase();
  return tipoConsulta === "programada";
}

function buildEntryKey(row) {
  return [
    Number(row?.medicoId || 0),
    String(row?.fecha || ""),
    String(row?.hora || ""),
    String(row?.tipo || ""),
  ].join("|");
}

function actualizarDescripcionConsultaProgramada(descripcion, fecha, hora) {
  const base = String(descripcion || "Consulta medica").trim();
  const fechaNorm = String(fecha || "").slice(0, 10);
  const horaNorm = String(hora || "").slice(0, 5);
  if (!fechaNorm || !horaNorm) {
    return base;
  }

  const baseSinHorario = base.replace(/\(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?\)\s*$/i, "").trim();
  return `${baseSinHorario} (${fechaNorm} ${horaNorm})`;
}

function getProgramacionItem(it) {
  const fecha = String(it?.fechaProgramada || it?.fecha_programada || it?.consultaFecha || "").slice(0, 10);
  const hora = String(it?.horaProgramada || it?.hora_programada || it?.consultaHora || "").slice(0, 5);
  return { fecha, hora };
}

function getMedicoIdProgramacionItem(it) {
  return Number(it?.medicoId || it?.medico_id || it?.consultaMedicoId || 0);
}

function buildProgramacionConflictKey(it) {
  const medicoId = getMedicoIdProgramacionItem(it);
  const slot = getProgramacionItem(it);
  if (medicoId <= 0 || !slot.fecha || !slot.hora) return "";
  return `${medicoId}|${slot.fecha}|${slot.hora}`;
}

function formatProgramacionItem(fecha, hora) {
  const f = String(fecha || "").trim();
  const h = String(hora || "").trim();
  if (!f && !h) return "";
  if (!f) return `Horario: ${h}`;
  const [y, m, d] = f.split("-");
  const fechaFmt = y && m && d ? `${d}/${m}/${y}` : f;
  return `Programado: ${fechaFmt}${h ? ` ${h}` : ""}`;
}

function limpiarSoloDigitos(value) {
  return String(value || "").replace(/\D+/g, "").trim();
}

function esErrorSinDisponibilidad(err) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("no hay disponibilidad registrada");
}

const XL_BREAKPOINT = 1280;

export default function QuoteCartPanel({ onDesktopVisibilityChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { cart, total, count, removeItem, updateQuantity, clearCart, setPatient } = useQuoteCart();
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(
    typeof window !== "undefined" ? window.innerWidth >= XL_BREAKPOINT : true
  );
  const [saving, setSaving] = useState(false);
  const [aplicarProgramacionGlobal, setAplicarProgramacionGlobal] = useState(true);
  const [fechaProgramacionGlobal, setFechaProgramacionGlobal] = useState(getLimaDate());
  const [horaProgramacionGlobal, setHoraProgramacionGlobal] = useState(getLimaTime());
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const editingCotizacionId = searchParams.get("cotizacion_id");
  const isEditingCobro = Boolean(searchParams.get("cobro_id"));
  const isEditingCotizacion = Boolean(editingCotizacionId) && !isEditingCobro;

  const hasItems = cart.items.length > 0;
  const hayServiciosProgramables = useMemo(
    () => cart.items.some((it) => esServicioProgramableParaAgenda(it?.serviceType)),
    [cart.items]
  );
  const hayConsultaProgramadaEnCarrito = useMemo(
    () => cart.items.some((it) => esConsultaProgramadaDelCarrito(it)),
    [cart.items]
  );

  const grouped = useMemo(() => {
    return cart.items.slice().sort((a, b) => String(a.source).localeCompare(String(b.source)));
  }, [cart.items]);

  const conflictoProgramacionMap = useMemo(() => {
    const out = {};
    for (const it of Array.isArray(cart?.items) ? cart.items : []) {
      const key = buildProgramacionConflictKey(it);
      if (!key) continue;
      out[key] = Number(out[key] || 0) + 1;
    }
    return out;
  }, [cart?.items]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => {
      setIsDesktopViewport(window.innerWidth >= XL_BREAKPOINT);
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isDesktopViewport && mobileOpen) {
      setMobileOpen(false);
    }
  }, [isDesktopViewport, mobileOpen]);

  useEffect(() => {
    if (!hasItems && mobileOpen) {
      setMobileOpen(false);
    }
  }, [hasItems, mobileOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (isDesktopViewport || !mobileOpen) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isDesktopViewport, mobileOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!mobileOpen) return undefined;

    const handleEsc = (event) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [mobileOpen]);

  useEffect(() => {
    const callback = typeof onDesktopVisibilityChange === "function" ? onDesktopVisibilityChange : null;
    if (!callback) return undefined;

    const visible = Boolean(hasItems && isDesktopViewport && desktopOpen);
    callback(visible);
    return () => {
      callback(false);
    };
  }, [onDesktopVisibilityChange, hasItems, isDesktopViewport, desktopOpen]);

  const renderDerivacionInfo = (it) => {
    const esLab = String(it.serviceType || "").toLowerCase() === "laboratorio";
    if (!esLab || !it.derivado) return null;

    const laboratorio = String(it.laboratorioReferencia || "").trim() || "Laboratorio externo";
    const tipo = String(it.tipoDerivacion || "").toLowerCase();
    const valor = Number(it.valorDerivacion || 0);

    let costoTexto = "Sin costo";
    if (tipo === "monto") costoTexto = `S/ ${valor.toFixed(2)}`;
    if (tipo === "porcentaje") costoTexto = `${valor.toFixed(2)}%`;

    return (
      <div className="mt-1 text-[11px] text-amber-700 font-medium">
        Derivado: {laboratorio} / {costoTexto}
      </div>
    );
  };

  const crearConsultaDesdeCarrito = async (item, overrides = {}) => {
    const tipoConsultaItem = String(item?.consultaTipoConsulta || "programada").toLowerCase();
    const esReservaSinTurno = Boolean(overrides?.forzarReservaSinTurno) || tipoConsultaItem === "reservada_sin_turno";
    const tipoConsultaPersistible = esReservaSinTurno ? "programada" : (item.consultaTipoConsulta || "programada");
    const origenCreacion = esReservaSinTurno ? "reservada_sin_turno" : "cotizador";
    const medicoConsultaId = Number(item?.consultaMedicoId || item?.medicoId || item?.medico_id || 0);
    const fechaConsulta = String(
      overrides?.consultaFecha
      || item?.consultaFecha
      || item?.fechaProgramada
      || item?.fecha_programada
      || getLimaDate()
      || ""
    ).slice(0, 10);
    const horaConsulta = String(
      overrides?.consultaHora
      || item?.consultaHora
      || item?.horaProgramada
      || item?.hora_programada
      || getLimaTime()
      || ""
    ).slice(0, 5);

    const pacienteIdConsulta = Number(overrides?.pacienteId || cart.patientId || 0);
    if (pacienteIdConsulta <= 0 || medicoConsultaId <= 0 || !fechaConsulta || !horaConsulta) {
      throw new Error("No se pudo preparar la consulta programada: faltan paciente, medico, fecha u hora");
    }

    const res = await authFetch("api_consultas.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paciente_id: pacienteIdConsulta,
        medico_id: medicoConsultaId,
        fecha: fechaConsulta,
        hora: horaConsulta,
        tipo_consulta: tipoConsultaPersistible,
        origen_creacion: origenCreacion,
      }),
    });
    const data = await res.json();
    if (!data?.success || !data?.id) {
      throw new Error(data?.error || "No se pudo agendar la consulta automáticamente");
    }
    return Number(data.id);
  };

  const construirDetalles = () => {
    const fechaGlobal = String(fechaProgramacionGlobal || "").slice(0, 10);
    const horaGlobal = String(horaProgramacionGlobal || "").slice(0, 5);

    return cart.items.map((it) => {
      const cantidad = Math.max(1, Number(it.quantity || 1));
      const precioUnitario = Number(it.unitPrice || 0);
      const esLaboratorio = String(it.serviceType || "").toLowerCase() === "laboratorio";
      const derivado = esLaboratorio && Boolean(it.derivado);
      const esConsulta = String(it.serviceType || "").toLowerCase() === "consulta";
      const consultaProgramada = esConsultaProgramadaDelCarrito(it);
      const detalle = {
        servicio_tipo: String(it.serviceType || "procedimiento").toLowerCase(),
        servicio_id: Number(it.serviceId || 0),
        descripcion: it.description || "Servicio",
        cantidad,
        precio_unitario: precioUnitario,
        subtotal: Number((precioUnitario * cantidad).toFixed(2)),
        derivado,
        tipo_derivacion: derivado ? String(it.tipoDerivacion || "") : "",
        valor_derivacion: derivado ? Number(it.valorDerivacion || 0) : 0,
        laboratorio_referencia: derivado ? String(it.laboratorioReferencia || "") : "",
        paquete_id: Number(it.packageId || 0) || null,
        paquete_codigo: String(it.packageCode || ""),
        paquete_tipo: String(it.packageType || ""),
        componentes: Array.isArray(it.componentes) ? it.componentes : [],
        cotizacion_id: Number(it.cotizacionId || 0) || null,
        consulta_id: Number(it.consultaId || it.consulta_id || 0) || null,
        medico_id: Number(it.medico_id || it.medicoId || it.consultaMedicoId || 0) || null,
        fecha_programada: String(it.fechaProgramada || it.fecha_programada || ""),
        hora_programada: String(it.horaProgramada || it.hora_programada || ""),
      };

      if (
        aplicarProgramacionGlobal
        && esServicioProgramableParaAgenda(detalle.servicio_tipo)
        && fechaGlobal
        && horaGlobal
        && !consultaProgramada
      ) {
        if (!String(detalle.fecha_programada || "").trim()) {
          detalle.fecha_programada = fechaGlobal;
        }
        if (!String(detalle.hora_programada || "").trim()) {
          detalle.hora_programada = horaGlobal;
        }
      }

      // Si el item es paquete/perfil, propagar fecha/hora al componente que no tenga programación propia.
      if (Array.isArray(detalle.componentes) && detalle.componentes.length > 0) {
        const fechaBase = String(detalle.fecha_programada || "").slice(0, 10);
        const horaBase = String(detalle.hora_programada || "").slice(0, 5);
        if (fechaBase || horaBase) {
          detalle.componentes = detalle.componentes.map((comp) => {
            if (!comp || typeof comp !== "object") return comp;
            const fechaComp = String(comp.fecha_programada || comp.fechaProgramada || "").slice(0, 10);
            const horaComp = String(comp.hora_programada || comp.horaProgramada || "").slice(0, 5);
            return {
              ...comp,
              fecha_programada: fechaComp || fechaBase,
              hora_programada: horaComp || horaBase,
            };
          });
        }
      }

      if (esConsulta) {
        detalle.medico_id = Number(it.consultaMedicoId || 0);
        detalle.consulta_id = Number(it.consultaId || 0);
      }
      return detalle;
    });
  };

  const buildDetalleKey = (d) => {
    const servicio = String(d?.servicio_tipo || "otros").toLowerCase();
    const servicioId = Number(d?.servicio_id || 0);
    const descripcion = String(d?.descripcion || "").trim().toLowerCase();
    const precio = Number(d?.precio_unitario || 0).toFixed(2);
    const derivado = Boolean(d?.derivado);
    const tipoDeriv = String(d?.tipo_derivacion || "").toLowerCase();
    const valorDeriv = Number(d?.valor_derivacion || 0).toFixed(2);
    const labRef = String(d?.laboratorio_referencia || "").trim().toLowerCase();
    const paqueteId = Number(d?.paquete_id || 0);
    const paqueteTipo = String(d?.paquete_tipo || "").toLowerCase();
    const fechaProgramada = String(d?.fecha_programada || "").slice(0, 10);
    const horaProgramada = String(d?.hora_programada || "").slice(0, 5);
    return [servicio, servicioId, descripcion, precio, derivado ? "1" : "0", tipoDeriv, valorDeriv, labRef, paqueteId, paqueteTipo, fechaProgramada, horaProgramada].join("::");
  };

  const normalizarDetalle = (d) => {
    const cantidad = Math.max(1, Number(d?.cantidad || 1));
    const precio = Number(d?.precio_unitario || 0);
    const subtotal = Number((precio * cantidad).toFixed(2));
    return {
      ...d,
      servicio_tipo: String(d?.servicio_tipo || "procedimiento").toLowerCase(),
      servicio_id: Number(d?.servicio_id || 0),
      cantidad,
      precio_unitario: precio,
      subtotal,
      derivado: Boolean(d?.derivado),
      tipo_derivacion: d?.derivado ? String(d?.tipo_derivacion || "") : "",
      valor_derivacion: d?.derivado ? Number(d?.valor_derivacion || 0) : 0,
      laboratorio_referencia: d?.derivado ? String(d?.laboratorio_referencia || "") : "",
      paquete_id: Number(d?.paquete_id || 0) || null,
      paquete_codigo: String(d?.paquete_codigo || ""),
      paquete_tipo: String(d?.paquete_tipo || ""),
      componentes: Array.isArray(d?.componentes) ? d.componentes : [],
      fecha_programada: String(d?.fecha_programada || ""),
      hora_programada: String(d?.hora_programada || ""),
    };
  };

  const mergeDetalles = (baseDetalles, cartDetalles) => {
    const map = new Map();

    for (const d of baseDetalles || []) {
      const nd = normalizarDetalle(d);
      map.set(buildDetalleKey(nd), nd);
    }

    for (const d of cartDetalles || []) {
      const nd = normalizarDetalle(d);
      const key = buildDetalleKey(nd);
      if (map.has(key)) {
        const old = map.get(key);
        const cantidad = Number(old.cantidad || 0) + Number(nd.cantidad || 0);
        const precio = Number(old.precio_unitario || nd.precio_unitario || 0);
        map.set(key, {
          ...old,
          cantidad,
          subtotal: Number((precio * cantidad).toFixed(2)),
        });
      } else {
        map.set(key, nd);
      }
    }

    return Array.from(map.values());
  };

  const obtenerCotizacionActual = async (cotizacionId) => {
    const res = await authFetch(`api_cotizaciones.php?cotizacion_id=${Number(cotizacionId)}`);
    const data = await res.json();
    if (!data?.success || !data?.cotizacion) {
      throw new Error(data?.error || "No se pudo cargar la cotizacion en edicion");
    }
    return data.cotizacion;
  };

  const registrarCotizacionCarrito = async (irACobro = false) => {
    if (saving) return;

    // En móvil, cerrar el panel del carrito antes de abrir modales de registro/cobro.
    if (!isDesktopViewport && mobileOpen) {
      setMobileOpen(false);
    }

    if (cart.items.length === 0) {
      await Swal.fire("Atencion", "El carrito no tiene paciente o items validos.", "info");
      return;
    }

    const detalles = construirDetalles();
    if (!detalles.length) {
      await Swal.fire("Atencion", "No hay detalles validos para registrar.", "info");
      return;
    }

    const agendaEntries = [];
    const agendaSeen = new Set();
    for (let i = 0; i < detalles.length; i++) {
      const d = detalles[i] || {};
      const tipo = String(d.servicio_tipo || "").toLowerCase();
      if (!esServicioProgramableParaAgenda(tipo)) {
        continue;
      }

      const cartItem = cart.items[i] || {};
      const medicoId = Number(
        d.medico_id
        || cartItem?.medico_id
        || cartItem?.medicoId
        || cartItem?.consultaMedicoId
        || 0
      );
      const fecha = String(d.fecha_programada || "").slice(0, 10);
      const hora = String(d.hora_programada || "").slice(0, 5);
      if (medicoId <= 0 || !fecha || !hora) {
        continue;
      }

      const entry = {
        tipo,
        medicoId,
        fecha,
        hora,
        consultaIdExcluir: tipo === "consulta" ? Number(d.consulta_id || 0) : 0,
        __index: i,
      };
      const dedupeKey = buildEntryKey(entry);
      if (agendaSeen.has(dedupeKey)) {
        continue;
      }
      agendaSeen.add(dedupeKey);
      agendaEntries.push(entry);
    }

    if (agendaEntries.length > 0) {
      const agendaCheck = await validarAgendaAntesDeCotizar({
        authFetch,
        baseUrl: "",
        Swal,
        entries: agendaEntries,
        onApplySuggestion: (entry, nuevaHora, nuevaFecha) => {
          const idx = Number(entry?.__index);
          if (!Number.isFinite(idx) || idx < 0 || idx >= detalles.length) {
            return;
          }

          const fechaActual = String(detalles[idx]?.fecha_programada || "").slice(0, 10);
          detalles[idx].fecha_programada = String(nuevaFecha || fechaActual || "").slice(0, 10);
          detalles[idx].hora_programada = String(nuevaHora || detalles[idx]?.hora_programada || "").slice(0, 5);
        },
      });

      if (!agendaCheck?.ok) {
        return;
      }
    }

    try {
      let pacienteRegistradoId = Number(cart.patientId || 0);
      let pacienteNombreParaPayload = String(cart.patientName || '').trim() || 'Particular';
      const dniLookupCache = {
        dni: "",
        paciente: null,
      };

      if (irACobro && pacienteRegistradoId <= 0) {
        const dniInicial = limpiarSoloDigitos(cart?.patientDni || "");
        let dni = dniInicial;
        let nombre = "";
        let apellido = "";
        let telefono = "";

        if (!/^\d{8}$/.test(dniInicial)) {
          const registro = await Swal.fire({
            title: "Registro minimo para cobro",
            html: `
              <div style="text-align:left;font-size:13px;display:grid;gap:8px;">
                <div>Para continuar con el cobro, registra datos minimos del paciente.</div>
                <input id="swal-dni" class="swal2-input" placeholder="DNI (8 digitos)" maxlength="8" />
                <input id="swal-nombre" class="swal2-input" placeholder="Nombres" />
                <input id="swal-apellido" class="swal2-input" placeholder="Apellidos" />
                <input id="swal-telefono" class="swal2-input" placeholder="Celular (opcional)" />
              </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: "Registrar y continuar",
            cancelButtonText: "Cancelar",
            didOpen: async () => {
              const dniInput = document.getElementById("swal-dni");
              const nombreInput = document.getElementById("swal-nombre");
              const apellidoInput = document.getElementById("swal-apellido");
              const telefonoInput = document.getElementById("swal-telefono");

              if (dniInput) {
                dniInput.value = limpiarSoloDigitos(cart?.patientDni || cart?.patientName);
              }

              const autocompletarDni = async () => {
                const dniInputValue = limpiarSoloDigitos(dniInput?.value || "");
                if (!/^\d{8}$/.test(dniInputValue)) return;

                try {
                  const res = await authFetch("api_pacientes_buscar.php", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tipo: "dni", valor: dniInputValue }),
                  });
                  const data = await res.json();

                  if (data?.success && Array.isArray(data?.pacientes) && data.pacientes.length > 0) {
                    const p = data.pacientes[0];
                    dniLookupCache.dni = dniInputValue;
                    dniLookupCache.paciente = p;
                    if (nombreInput) nombreInput.value = String(p?.nombre || "");
                    if (apellidoInput) apellidoInput.value = String(p?.apellido || "");
                    if (telefonoInput) telefonoInput.value = String(p?.telefono || "");
                    return;
                  }

                  dniLookupCache.dni = dniInputValue;
                  dniLookupCache.paciente = null;

                  const s = data?.sugerencia_externa;
                  if (s) {
                    if (nombreInput && !String(nombreInput.value || "").trim()) nombreInput.value = String(s?.nombre || "");
                    if (apellidoInput && !String(apellidoInput.value || "").trim()) apellidoInput.value = String(s?.apellido || "");
                  }
                } catch {
                  dniLookupCache.dni = "";
                  dniLookupCache.paciente = null;
                }
              };

              dniInput?.addEventListener("blur", autocompletarDni);
            },
            preConfirm: () => {
              const dniInputValue = limpiarSoloDigitos(document.getElementById("swal-dni")?.value || "");
              const nombreInputValue = String(document.getElementById("swal-nombre")?.value || "").trim();
              const apellidoInputValue = String(document.getElementById("swal-apellido")?.value || "").trim();
              const telefonoInputValue = limpiarSoloDigitos(document.getElementById("swal-telefono")?.value || "");

              if (!/^\d{8}$/.test(dniInputValue)) {
                Swal.showValidationMessage("Ingresa un DNI valido de 8 digitos");
                return false;
              }
              if (!nombreInputValue) {
                Swal.showValidationMessage("Ingresa nombres");
                return false;
              }
              if (!apellidoInputValue) {
                Swal.showValidationMessage("Ingresa apellidos");
                return false;
              }
              return {
                dni: dniInputValue,
                nombre: nombreInputValue,
                apellido: apellidoInputValue,
                telefono: telefonoInputValue,
              };
            },
          });

          if (!registro.isConfirmed || !registro.value) {
            return;
          }

          dni = registro.value.dni;
          nombre = registro.value.nombre;
          apellido = registro.value.apellido;
          telefono = registro.value.telefono;
        }

        let pacienteExistente = null;
        if (/^\d{8}$/.test(dniInicial) && dniInicial === dniLookupCache.dni && dniLookupCache.paciente?.id) {
          pacienteExistente = dniLookupCache.paciente;
        } else {
          const buscarExistente = await authFetch("api_pacientes_buscar.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tipo: "dni", valor: dni }),
          });
          const dataExistente = await buscarExistente.json();
          pacienteExistente = dataExistente?.success && Array.isArray(dataExistente?.pacientes)
            ? dataExistente.pacientes[0]
            : null;
        }

        if (pacienteExistente?.id) {
          pacienteRegistradoId = Number(pacienteExistente.id || 0);
          pacienteNombreParaPayload = `${String(pacienteExistente.nombre || "").trim()} ${String(pacienteExistente.apellido || "").trim()}`.trim() || pacienteNombreParaPayload;
          dni = limpiarSoloDigitos(pacienteExistente?.dni || dni);
        } else {
          if (!nombre || !apellido) {
            const sugerencia = dniLookupCache.dni === dni ? dniLookupCache.paciente : null;
            const suggestedNombre = String(sugerencia?.nombre || "").trim();
            const suggestedApellido = String(sugerencia?.apellido || "").trim();
            const tokensNombre = String(cart?.patientName || "").trim().split(/\s+/).filter(Boolean);

            nombre = nombre || suggestedNombre || tokensNombre[0] || "PACIENTE";
            apellido = apellido || suggestedApellido || tokensNombre.slice(1).join(" ") || "TEMPORAL";
          }

          const crearPaciente = await authFetch("api_pacientes.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dni,
              nombre: String(nombre || "").toUpperCase(),
              apellido: String(apellido || "").toUpperCase(),
              telefono: telefono || null,
              procedencia: "VENTANILLA EXPRESS",
              tipo_seguro: "PENDIENTE_COMPLETAR",
            }),
          });
          const dataPaciente = await crearPaciente.json();
          if (!dataPaciente?.success || !dataPaciente?.paciente?.id) {
            throw new Error(dataPaciente?.error || "No se pudo completar el registro minimo del paciente");
          }

          pacienteRegistradoId = Number(dataPaciente.paciente.id || 0);
          pacienteNombreParaPayload = `${String(dataPaciente.paciente.nombre || "").trim()} ${String(dataPaciente.paciente.apellido || "").trim()}`.trim() || pacienteNombreParaPayload;
        }

        // Una vez regularizado, el carrito deja de ser "Particular" y adopta el paciente real.
        if (pacienteRegistradoId > 0) {
          setPatient(pacienteRegistradoId, pacienteNombreParaPayload, dni);
        }
      }

      const resumenServicios = Array.from(new Set(detalles.map((d) => String(d.servicio_tipo || "otros"))));
      const confirm = await Swal.fire({
        title: irACobro ? "Registrar y cobrar cotización" : "Registrar nueva cotización",
        text: `${pacienteRegistradoId > 0 ? `Paciente #${pacienteRegistradoId}` : pacienteNombreParaPayload} | ${detalles.length} item(s) | Servicios: ${resumenServicios.join(", ")}`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: irACobro ? "Registrar y cobrar" : "Registrar cotización",
        cancelButtonText: "Cancelar",
      });
      if (!confirm.isConfirmed) {
        return;
      }

      setSaving(true);

      const fechaGlobal = String(fechaProgramacionGlobal || "").slice(0, 10);
      const horaGlobal = String(horaProgramacionGlobal || "").slice(0, 5);
      const usarProgramacionGlobal = aplicarProgramacionGlobal && Boolean(fechaGlobal) && Boolean(horaGlobal);
      const esPacienteTemporal = pacienteRegistradoId <= 0;

      // Auto-crear consultas pendientes para items de tipo consulta que aún no tienen consulta_id.
      // Se resuelve en paralelo para evitar latencia acumulada cuando hay múltiples consultas.
      const consultasPendientesCrear = [];
      for (let i = 0; i < detalles.length; i++) {
        const d = detalles[i];
        const cartItem = cart.items[i];
        const consultaProgramada = esConsultaProgramadaDelCarrito(cartItem);
        const detalleFechaFinal = String(d?.fecha_programada || "").slice(0, 10);
        const detalleHoraFinal = String(d?.hora_programada || "").slice(0, 5);
        const consultaFechaFinal = detalleFechaFinal || ((usarProgramacionGlobal && !consultaProgramada)
          ? fechaGlobal
          : String(cartItem?.consultaFecha || "").slice(0, 10));
        const consultaHoraFinal = detalleHoraFinal || ((usarProgramacionGlobal && !consultaProgramada)
          ? horaGlobal
          : String(cartItem?.consultaHora || "").slice(0, 5));

        const medicoConsultaItem = Number(cartItem?.consultaMedicoId || cartItem?.medicoId || cartItem?.medico_id || d?.medico_id || 0);
        if (
          String(d.servicio_tipo).toLowerCase() === "consulta" &&
          !esPacienteTemporal &&
          !d.consulta_id &&
          medicoConsultaItem > 0 &&
          consultaFechaFinal &&
          consultaHoraFinal
        ) {
          consultasPendientesCrear.push({
            idx: i,
            cartItem: {
              ...(cartItem || {}),
              consultaMedicoId: medicoConsultaItem,
            },
            consultaFechaFinal,
            consultaHoraFinal,
          });
        }

        if (String(d.servicio_tipo).toLowerCase() === "consulta") {
          if (consultaFechaFinal && consultaHoraFinal) {
            detalles[i].fecha_programada = consultaFechaFinal;
            detalles[i].hora_programada = consultaHoraFinal;
            detalles[i].descripcion = actualizarDescripcionConsultaProgramada(
              detalles[i].descripcion,
              consultaFechaFinal,
              consultaHoraFinal
            );
          }
          detalles[i].consulta_id = Number(detalles[i].consulta_id || cartItem?.consultaId || 0);
          detalles[i].medico_id = Number(detalles[i].medico_id || cartItem?.consultaMedicoId || 0);
        }
      }

      if (consultasPendientesCrear.length > 0) {
        const resultadosConsultas = await Promise.all(
          consultasPendientesCrear.map(async (it) => {
            let consultaId;
            try {
              consultaId = await crearConsultaDesdeCarrito(it.cartItem, {
                pacienteId: pacienteRegistradoId,
                consultaFecha: it.consultaFechaFinal,
                consultaHora: it.consultaHoraFinal,
              });
            } catch (err) {
              // Regla operativa solicitada: si no hay disponibilidad, conservar hora de cotización y continuar.
              if (!esErrorSinDisponibilidad(err)) {
                throw err;
              }
              consultaId = await crearConsultaDesdeCarrito(it.cartItem, {
                pacienteId: pacienteRegistradoId,
                consultaFecha: it.consultaFechaFinal,
                consultaHora: it.consultaHoraFinal,
                forzarReservaSinTurno: true,
              });
            }
            return { idx: it.idx, consultaId, medicoId: Number(it.cartItem?.consultaMedicoId || 0) };
          })
        );

        for (const r of resultadosConsultas) {
          if (!Number.isFinite(r?.idx)) continue;
          const idx = Number(r.idx);
          detalles[idx].consulta_id = Number(r.consultaId || 0);
          detalles[idx].medico_id = Number(r.medicoId || detalles[idx].medico_id || 0);
        }
      }

      for (let i = 0; i < detalles.length; i++) {
        const d = detalles[i];
        if (String(d?.servicio_tipo || "").toLowerCase() !== "consulta") continue;
        if (!esPacienteTemporal && Number(d?.consulta_id || 0) <= 0) {
          throw new Error("La consulta del carrito no tiene una atencion vinculada. Vuelve a agregar la consulta antes de registrar la cotizacion.");
        }
      }

      let payload;
      let cotizacionIdDestino = null;

      if (isEditingCotizacion && editingCotizacionId) {
        const cotizacionActual = await obtenerCotizacionActual(editingCotizacionId);
        if (Number(cotizacionActual?.paciente_id || 0) !== Number(cart.patientId || 0)) {
          throw new Error("El carrito pertenece a otro paciente y no puede actualizar esta cotizacion.");
        }

        const baseDetalles = Array.isArray(cotizacionActual.detalles) ? cotizacionActual.detalles : [];
        const detallesFinales = mergeDetalles(baseDetalles, detalles);
        const totalFinal = detallesFinales.reduce((acc, d) => acc + Number(d?.subtotal || 0), 0);

        payload = {
          accion: "editar",
          cotizacion_id: Number(editingCotizacionId),
          detalles: detallesFinales,
          total: Number(totalFinal || 0),
          motivo: "Actualizacion de cotizacion desde carrito en modo edicion",
        };
        cotizacionIdDestino = Number(editingCotizacionId);
      } else {
        const esCotizacionInformativa = pacienteRegistradoId <= 0;
        payload = {
          paciente_id: pacienteRegistradoId > 0 ? pacienteRegistradoId : 0,
          paciente_nombre: pacienteNombreParaPayload,
          paciente_dni: esCotizacionInformativa ? "-" : undefined,
          modo_cotizacion: esCotizacionInformativa ? "informativa" : undefined,
          solo_ticket: esCotizacionInformativa ? 1 : undefined,
          vencimiento_horas: esCotizacionInformativa ? 6 : undefined,
          total: Number(total || 0),
          detalles,
          observaciones: esCotizacionInformativa
            ? "Cotizacion informativa unificada creada desde carrito global"
            : "Cotizacion unificada creada desde carrito global",
        };
      }

      const res = await authFetch("api_cotizaciones.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      const cotizacionIdCreada = Number(data?.cotizacion_id || 0);
      const cotizacionIdFinal = cotizacionIdDestino || cotizacionIdCreada;

      if (!data?.success || !cotizacionIdFinal) {
        throw new Error(data?.error || (isEditingCotizacion ? "No se pudo actualizar la cotizacion" : "No se pudo registrar la cotizacion"));
      }

      clearCart();

      if (irACobro) {
        navigate(`/cobrar-cotizacion/${Number(cotizacionIdFinal)}`);
        return;
      }

      await Swal.fire(
        "Listo",
        isEditingCotizacion
          ? `Cotizacion #${cotizacionIdFinal} actualizada correctamente.`
          : `Cotizacion #${cotizacionIdFinal} registrada correctamente.`,
        "success"
      );
      navigate("/cotizaciones");
    } catch (err) {
      await Swal.fire("Error", err?.message || "No se pudo registrar la cotizacion", "error");
    } finally {
      setSaving(false);
    }
  };

  const renderCartBody = ({
    listMaxHeightClass = "max-h-72",
    wrapperClassName = "p-3",
  } = {}) => (
    <div className={wrapperClassName}>
      <div className="text-xs text-gray-500 mb-2">Items: {count}</div>
      <ul className={`${listMaxHeightClass} overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded`}>
        {grouped.map((it) => (
          <li key={it.key} className="p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-indigo-600 font-semibold">{it.source}</div>
                <div className="text-sm font-medium text-gray-800 truncate">{it.description}</div>
                <div className="text-xs text-gray-500">S/ {Number(it.unitPrice || 0).toFixed(2)} c/u</div>
                {(() => {
                  const slot = getProgramacionItem(it);
                  const label = formatProgramacionItem(slot.fecha, slot.hora);
                  if (!label) return null;
                  return <div className="text-[11px] text-indigo-700 mt-0.5">{label}</div>;
                })()}
                {(() => {
                  const key = buildProgramacionConflictKey(it);
                  const conflicts = key ? Number(conflictoProgramacionMap[key] || 0) : 0;
                  if (conflicts <= 1) return null;
                  return (
                    <div className="mt-1 inline-flex items-center rounded bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                      Cruce detectado: mismo medico y horario
                    </div>
                  );
                })()}
                {renderDerivacionInfo(it)}
              </div>
              <button
                onClick={() => removeItem(it.key)}
                className="text-xs text-red-600 hover:text-red-700"
                title="Quitar"
              >
                Quitar
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQuantity(it.key, Number(it.quantity || 1) - 1)}
                  className="w-6 h-6 rounded border border-gray-300 text-gray-700"
                >
                  -
                </button>
                <span className="text-sm w-6 text-center">{Number(it.quantity || 1)}</span>
                <button
                  onClick={() => updateQuantity(it.key, Number(it.quantity || 1) + 1)}
                  className="w-6 h-6 rounded border border-gray-300 text-gray-700"
                >
                  +
                </button>
              </div>
              <div className="text-sm font-semibold text-green-700">
                S/ {(Number(it.unitPrice || 0) * Number(it.quantity || 0)).toFixed(2)}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="font-semibold text-gray-700">Total</span>
        <span className="font-bold text-green-700">S/ {total.toFixed(2)}</span>
      </div>

      {hayServiciosProgramables && (
        <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5">
          <label className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
            <input
              type="checkbox"
              checked={aplicarProgramacionGlobal}
              onChange={(e) => setAplicarProgramacionGlobal(e.target.checked)}
            />
            Aplicar fecha/hora global al registrar
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="date"
              value={fechaProgramacionGlobal}
              onChange={(e) => setFechaProgramacionGlobal(e.target.value)}
              disabled={!aplicarProgramacionGlobal}
              className="rounded border border-indigo-200 px-2 py-1 text-xs disabled:bg-gray-100"
            />
            <input
              type="time"
              value={horaProgramacionGlobal}
              onChange={(e) => setHoraProgramacionGlobal(e.target.value)}
              disabled={!aplicarProgramacionGlobal}
              className="rounded border border-indigo-200 px-2 py-1 text-xs disabled:bg-gray-100"
            />
          </div>
          {hayConsultaProgramadaEnCarrito && (
            <div className="mt-2 text-[11px] text-slate-600">
              La consulta programada conserva su horario elegido con el médico. La programación global aplica al resto de servicios.
            </div>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => registrarCotizacionCarrito(true)}
          disabled={saving}
          className={`w-full py-2 rounded font-semibold ${saving ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
        >
          {saving ? "Procesando..." : "Registrar y cobrar"}
        </button>
        <button
          type="button"
          onClick={() => registrarCotizacionCarrito(false)}
          disabled={saving}
          className={`w-full py-2 rounded font-semibold ${saving ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
        >
          Registrar cotizacion
        </button>
        <button
          type="button"
          onClick={() => navigate("/cotizaciones")}
          className="w-full py-2 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
        >
          Ir a Atenciones
        </button>
        <button
          type="button"
          onClick={clearCart}
          disabled={saving}
          className={`w-full py-2 rounded font-semibold ${saving ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
        >
          Vaciar carrito
        </button>
      </div>
    </div>
  );

  if (!hasItems) return null;

  return (
    <>
      {desktopOpen ? (
        <aside className="hidden xl:block fixed right-4 top-24 z-40 w-80 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-between">
            <div>
              <div className="font-semibold">Carrito de Cotizacion</div>
              <div className="text-xs text-white/90">{cart.patientName || `Paciente #${cart.patientId || ""}`}</div>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-white/40 bg-white/15 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
              onClick={() => setDesktopOpen(false)}
              title="Ocultar carrito"
            >
              <span aria-hidden="true">◀</span>
              <span>Ocultar</span>
            </button>
          </div>
          {renderCartBody()}
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setDesktopOpen(true)}
          className="hidden xl:flex fixed right-0 top-56 z-40 items-center gap-2 rounded-l-xl border border-r-0 border-indigo-300 bg-indigo-600 px-4 py-3 text-white shadow-lg hover:bg-indigo-700"
          title="Mostrar carrito"
        >
          <span aria-hidden="true" className="text-base">◀</span>
          <span className="text-sm font-semibold">Ver carrito</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{count}</span>
        </button>
      )}

      <div className="xl:hidden fixed bottom-4 left-3 right-24 sm:right-4 z-30">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="w-full rounded-xl bg-indigo-600 text-white shadow-lg px-3 py-3 flex items-center justify-between gap-3"
          aria-label="Abrir carrito de cotizacion"
        >
          <div className="min-w-0 text-left">
            <div className="text-xs text-white/90">Carrito de cotizacion</div>
            <div className="font-semibold truncate">{cart.patientName || `Paciente #${cart.patientId || ""}`}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-white/90">{count} item(s)</div>
            <div className="font-bold">S/ {total.toFixed(2)}</div>
          </div>
        </button>
      </div>

      {mobileOpen && (
        <div className="xl:hidden fixed inset-0 z-40">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar carrito"
          />

          <aside className="absolute bottom-0 left-0 right-0 max-h-[86vh] bg-white rounded-t-2xl shadow-2xl border-t border-gray-200 flex flex-col overflow-hidden">
            <div className="pt-2 pb-1 flex items-center justify-center">
              <span className="h-1.5 w-12 rounded-full bg-gray-300" aria-hidden="true" />
            </div>

            <div className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-between">
              <div>
                <div className="font-semibold">Carrito de Cotizacion</div>
                <div className="text-xs text-white/90">{cart.patientName || `Paciente #${cart.patientId || ""}`}</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="text-white/90 hover:text-white text-sm"
                title="Cerrar"
              >
                Cerrar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {renderCartBody({
                listMaxHeightClass: "max-h-none",
                wrapperClassName: "p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]",
              })}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
