import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BASE_URL } from "../../config/config";
import DisponibilidadMedicos from "../medico/DisponibilidadMedicos";
import FormularioAgendarConsulta from "./FormularioAgendarConsulta";
import ResumenConsultaAgendada from "../comunes/ResumenConsultaAgendada";
import { useQuoteCart } from "../../context/QuoteCartContext";
import {
  FaCalendarAlt,
  FaUserMd,
  FaClipboardList,
  FaUser,
  FaRegClock,
} from "react-icons/fa";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

function AgendarConsulta({ pacienteId, consultaId = null, cotizacionId = null, isEditIntent = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qs = new URLSearchParams(location.search);
  const cotizacionIdNum = Number(cotizacionId || qs.get("cotizacion_id") || 0);
  const origenFlujo = String(qs.get("origen") || "");
  const accionFlujo = String(qs.get("accion") || "");
  const backTo = String(qs.get("back_to") || "");
  const hasEditIntent = Boolean(isEditIntent || consultaId || (qs.get("modo") === "editar" && cotizacionIdNum > 0));
  const [resolvedConsultaId, setResolvedConsultaId] = useState(Number(consultaId || 0));
  const consultaIdNum = Number(resolvedConsultaId || 0);
  const isEditingConsulta = hasEditIntent;
  const [tipoConsulta, setTipoConsulta] = useState("programada");
  const [detallesConsulta, setDetallesConsulta] = useState([]);
  const [totalConsulta, setTotalConsulta] = useState(0);
  const [medicos, setMedicos] = useState([]);
  const [medicosConTarifa, setMedicosConTarifa] = useState([]);
  const [tarifasConsulta, setTarifasConsulta] = useState([]);
  const [coverageByTarifa, setCoverageByTarifa] = useState({});
  const [medicoId, setMedicoId] = useState("");
  const [horariosDisponibles, setHorariosDisponibles] = useState([]);
  // Inicializar fecha con la fecha actual de Lima
  const getLimaDate = () => {
    const now = new Date();
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now);

    const year = partes.find((p) => p.type === 'year')?.value;
    const month = partes.find((p) => p.type === 'month')?.value;
    const day = partes.find((p) => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  };
  const [fecha, setFecha] = useState(getLimaDate());
  const [hora, setHora] = useState("");
  const [msg, setMsg] = useState("");
  const [consultaCreada, setConsultaCreada] = useState(null);
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [pacienteInfo, setPacienteInfo] = useState(null);
  const [cargandoHorarios, setCargandoHorarios] = useState(false);
  const [refreshDisponibilidadKey, setRefreshDisponibilidadKey] = useState(0);
  const [processingAction, setProcessingAction] = useState("");
  const [cargandoConsultaEdicion, setCargandoConsultaEdicion] = useState(false);
  const [consultasDisponibles, setConsultasDisponibles] = useState([]);
  const [modoAgregarConsulta, setModoAgregarConsulta] = useState(false);
  const vieneDeReprogramacionRecordatorios = (origenFlujo === "recordatorios" && accionFlujo === "reprogramar");
  const { cart, addItems, count: cartCount } = useQuoteCart();
  const MySwal = withReactContent(Swal);

  const sincronizarRecordatorioPostReprogramacion = async (consultaIdFinal) => {
    if (!vieneDeReprogramacionRecordatorios || Number(consultaIdFinal || 0) <= 0) return { ok: true, skipped: true };

    const observacionBase = `Cita reprogramada para ${fecha} ${String(hora || "").slice(0, 5)}.`;
    const response = await fetch(`${BASE_URL}api_recordatorios_citas.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        consulta_id: Number(consultaIdFinal),
        estado: "pendiente",
        observacion: observacionBase,
        fecha_proximo_contacto: "",
      }),
    });

    const result = await response.json();
    if (!result?.success) {
      throw new Error(result?.error || "No se pudo sincronizar el recordatorio tras reprogramar");
    }
    return { ok: true };
  };

  useEffect(() => {
    const fromProp = Number(consultaId || 0);
    if (fromProp > 0) {
      setResolvedConsultaId(fromProp);
    }
  }, [consultaId]);

  const obtenerTarifaConsulta = async (medicoIdSeleccionado) => {
    const tarifasLocales = Array.isArray(tarifasConsulta) ? tarifasConsulta : [];
    let tarifa = tarifasLocales.find(
      (t) =>
        t.servicio_tipo === "consulta" &&
        Number(t.activo) === 1 &&
        Number(t.medico_id) === Number(medicoIdSeleccionado)
    );

    if (tarifa) return tarifa;

    const r = await fetch(BASE_URL + "api_tarifas.php", { credentials: "include" });
    const data = await r.json();
    if (!data.success || !Array.isArray(data.tarifas)) {
      throw new Error("No se pudo obtener la tarifa de consulta");
    }

    tarifa = data.tarifas.find(
      (t) =>
        t.servicio_tipo === "consulta" &&
        Number(t.activo) === 1 &&
        Number(t.medico_id) === Number(medicoIdSeleccionado)
    );

    if (!tarifa) {
      tarifa = data.tarifas.find(
        (t) =>
          t.servicio_tipo === "consulta" &&
          Number(t.activo) === 1 &&
          (!t.medico_id || t.medico_id === null)
      );
    }

    if (!tarifa) {
      throw new Error("No hay tarifa activa para la consulta seleccionada");
    }

    return tarifa;
  };

  const getCoberturaTarifaConsulta = (tarifaId) => coverageByTarifa[Number(tarifaId)] || null;

  const getPrecioConsultaNeto = (tarifa) => {
    const cobertura = getCoberturaTarifaConsulta(tarifa?.id);
    if (String(cobertura?.origen_cobro || "") === "contrato") {
      return 0;
    }
    return Number(tarifa?.precio_particular || 0);
  };

  const construirDetalleConsulta = (tarifa, consultaInfo) => {
    const precio = getPrecioConsultaNeto(tarifa);
    if (!Number.isFinite(precio) || precio < 0) {
      throw new Error("La tarifa de consulta no tiene un precio válido");
    }

    return {
      servicio_tipo: "consulta",
      servicio_id: Number(tarifa.id) || null,
      tarifa_id: Number(tarifa.id) || null,
      descripcion: tarifa.descripcion || "Consulta médica",
      cantidad: 1,
      precio_unitario: precio,
      subtotal: precio,
      consulta_id: consultaInfo.id,
      medico_id: consultaInfo.medico_id,
      medico_nombre: consultaInfo.medico_nombre,
      medico_especialidad: consultaInfo.medico_especialidad,
      paciente_id: consultaInfo.paciente_id,
      fecha: consultaInfo.fecha,
    };
  };

  const registrarCotizacionConsulta = async (consultaInfo, detalle, total) => {
    const response = await fetch(`${BASE_URL}api_cotizaciones.php`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paciente_id: Number(consultaInfo.paciente_id),
        total: Number(total),
        detalles: [detalle],
        observaciones: `Cotización de consulta #${consultaInfo.id} (${consultaInfo.fecha} ${consultaInfo.hora})`,
      }),
    });

    const result = await response.json();
    if (!result?.success || !result?.cotizacion_id) {
      throw new Error(result?.error || "No se pudo registrar la cotización de la consulta");
    }

    return Number(result.cotizacion_id);
  };

  const obtenerMontoCobro = async (cobroId, fallbackMonto = 0) => {
    try {
      const response = await fetch(`${BASE_URL}api_cobros.php?cobro_id=${Number(cobroId)}`, {
        credentials: "include",
      });
      const result = await response.json();
      const monto = Number(result?.cobro?.total);
      if (result?.success && Number.isFinite(monto) && monto > 0) {
        return monto;
      }
    } catch {
      // usar fallback
    }
    return Number(fallbackMonto) > 0 ? Number(fallbackMonto) : 0;
  };

  const registrarAbonoCotizacion = async (cotizacionId, cobroId, monto) => {
    const usuarioSesion = JSON.parse(sessionStorage.getItem("usuario") || "{}");
    const usuarioId = Number(usuarioSesion?.id || 0);
    const response = await fetch(`${BASE_URL}api_cotizaciones.php`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accion: "registrar_abono",
        cotizacion_id: Number(cotizacionId),
        usuario_id: usuarioId > 0 ? usuarioId : undefined,
        cobro_id: Number(cobroId),
        monto: Number(monto),
        descripcion: `Abono por cobro de consulta #${consultaCreada?.id || ""}`.trim(),
      }),
    });

    const result = await response.json();
    if (!result?.success) {
      throw new Error(result?.error || "No se pudo registrar el abono de la cotización");
    }
  };

  const cancelarConsultaAgendada = async (consultaId) => {
    const response = await fetch(`${BASE_URL}api_consultas.php`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: Number(consultaId),
        estado: "cancelada",
      }),
    });

    const result = await response.json();
    if (!result?.success) {
      throw new Error(result?.error || "No se pudo cancelar la consulta agendada");
    }
  };

  const anularCotizacionConsulta = async (cotizacionId, motivo = "Cancelación de consulta antes del pago") => {
    if (!cotizacionId) return;

    const response = await fetch(`${BASE_URL}api_cotizaciones.php`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accion: "anular",
        cotizacion_id: Number(cotizacionId),
        motivo,
      }),
    });

    const result = await response.json();
    if (!result?.success) {
      throw new Error(result?.error || "No se pudo anular la cotización de la consulta");
    }
  };

  useEffect(() => {
    // Cargar médicos y tarifas, luego filtrar
    Promise.all([
      fetch(BASE_URL + "api_medicos.php", { credentials: "include" }).then(r => r.json()),
      fetch(BASE_URL + "api_tarifas.php", { credentials: "include" }).then(r => r.json())
    ]).then(([medicosData, tarifasData]) => {
      const medicosList = Array.isArray(medicosData?.medicos) ? medicosData.medicos : [];
      setMedicos(medicosList);
      const tarifasConsultaFiltradas = (Array.isArray(tarifasData?.tarifas) ? tarifasData.tarifas : [])
        .filter(t => t.servicio_tipo === "consulta" && Number(t.activo) === 1 && t.medico_id);
      setTarifasConsulta(tarifasConsultaFiltradas);
      const idsMedicosConTarifa = tarifasConsultaFiltradas.map(t => String(t.medico_id));
      const filtrados = medicosList.filter(m => idsMedicosConTarifa.includes(String(m.id)));
      setMedicosConTarifa(filtrados.length > 0 ? filtrados : medicosList);
    }).catch(() => {
      setMedicos([]);
      setTarifasConsulta([]);
      setMedicosConTarifa([]);
      setCoverageByTarifa({});
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const cargarCoberturaConsulta = async () => {
      const tarifas = Array.isArray(tarifasConsulta) ? tarifasConsulta : [];
      if (!pacienteId || tarifas.length === 0 || !fecha) {
        if (!cancelled) setCoverageByTarifa({});
        return;
      }

      const entradas = await Promise.all(
        tarifas.map(async (tarifa) => {
          const tarifaId = Number(tarifa?.id || 0);
          if (tarifaId <= 0) return [tarifaId, null];
          try {
            const res = await fetch(
              `${BASE_URL}api_contratos.php?accion=validar_cobertura&paciente_id=${Number(pacienteId)}&servicio_tipo=consulta&servicio_id=${tarifaId}&cantidad=1&fecha_ref=${encodeURIComponent(String(fecha))}`,
              { credentials: "include" }
            );
            const data = await res.json();
            return [tarifaId, data?.cobertura || null];
          } catch {
            return [tarifaId, null];
          }
        })
      );

      if (!cancelled) {
        const sane = entradas.filter(([id]) => Number(id) > 0);
        setCoverageByTarifa(Object.fromEntries(sane));
      }
    };

    cargarCoberturaConsulta();
    return () => { cancelled = true; };
  }, [pacienteId, tarifasConsulta, fecha]);

  // Cargar horarios disponibles cuando se selecciona médico y fecha
  useEffect(() => {
    if (medicoId && fecha) {
      setCargandoHorarios(true);

      const params = new URLSearchParams({
        medico_id: String(medicoId),
        fecha: String(fecha),
      });
      if (isEditingConsulta && consultaIdNum > 0) {
        params.set("consulta_id", String(consultaIdNum));
      }

      fetch(`${BASE_URL}api_horarios_disponibles.php?${params.toString()}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            setHorariosDisponibles(data.horarios_disponibles || []);
          } else {
            setHorariosDisponibles([]);
            console.error("Error:", data.error);
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          setHorariosDisponibles([]);
        })
        .finally(() => setCargandoHorarios(false));
    } else {
      setHorariosDisponibles([]);
    }
  }, [medicoId, fecha, refreshDisponibilidadKey, isEditingConsulta, consultaIdNum]);

  useEffect(() => {
    // Cargar información del paciente
    if (pacienteId) {
      fetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.paciente) {
            setPacienteInfo(data.paciente);
          }
        })
        .catch(console.error);
    }
  }, [pacienteId]);

  useEffect(() => {
    if (!isEditingConsulta) return;

    const resolverConsultaDesdeCotizacion = async () => {
      if (consultaIdNum > 0 || cotizacionIdNum <= 0) return;

      setCargandoConsultaEdicion(true);
      setMsg("");
      try {
        // Cargar todos los detalles de la cotización para ver cuántas consultas hay
        const resCot = await fetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${cotizacionIdNum}`, {
          credentials: "include",
        });
        const dataCot = await resCot.json();
        const detalles = dataCot?.cotizacion?.detalles || [];
        const detallesConsulta = detalles.filter(
          (d) => String(d.servicio_tipo || "").toLowerCase() === "consulta"
        );

        if (detallesConsulta.length === 0) return;

        if (detallesConsulta.length === 1) {
          // Solo una consulta: carga directa
          const det = detallesConsulta[0];
          const cId = Number(det.consulta_id || 0);
          if (cId > 0) {
            setResolvedConsultaId(cId);
          } else {
            const mId = Number(det.medico_id || 0);
            if (mId > 0) setMedicoId(String(mId));
            const m = String(det.descripcion || "").match(/\((\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\)/);
            if (m) { setFecha(m[1]); setHora(m[2]); }
          }
        } else {
          // Múltiples consultas: mostrar selector
          setConsultasDisponibles(detallesConsulta);
        }
      } catch (error) {
        setMsg(error?.message || "No se pudo resolver la consulta vinculada a la cotización");
      } finally {
        setCargandoConsultaEdicion(false);
      }
    };

    resolverConsultaDesdeCotizacion();
  }, [consultaIdNum, cotizacionIdNum, isEditingConsulta]);

  useEffect(() => {
    if (!isEditingConsulta || consultaIdNum <= 0) return;

    const cargarConsulta = async () => {
      setCargandoConsultaEdicion(true);
      setMsg("");
      try {
        const res = await fetch(`${BASE_URL}api_consultas.php?consulta_id=${consultaIdNum}`, {
          credentials: "include",
        });
        const data = await res.json();
        const consulta = data?.consultas?.[0];

        if (!data?.success || !consulta) {
          throw new Error(data?.error || "No se encontró la consulta a editar");
        }

        setMedicoId(String(consulta.medico_id || ""));
        setFecha(String(consulta.fecha || "").slice(0, 10));
        setHora(String(consulta.hora || "").slice(0, 5));
        setTipoConsulta(consulta.tipo_consulta || "programada");
      } catch (error) {
        setMsg(error?.message || "No se pudo cargar la consulta para edición");
      } finally {
        setCargandoConsultaEdicion(false);
      }
    };

    cargarConsulta();
  }, [consultaIdNum, isEditingConsulta]);

  const seleccionarConsultaParaEditar = (detalle) => {
    setConsultasDisponibles([]);
    setModoAgregarConsulta(false);
    const cId = Number(detalle.consulta_id || 0);
    if (cId > 0) {
      setResolvedConsultaId(cId);
    } else {
      const mId = Number(detalle.medico_id || 0);
      if (mId > 0) setMedicoId(String(mId));
      const m = String(detalle.descripcion || "").match(/\((\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\)/);
      if (m) { setFecha(m[1]); setHora(m[2]); }
    }
  };

  const recargarConsultasDisponibles = async () => {
    if (cotizacionIdNum <= 0) return;
    try {
      const res = await fetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${cotizacionIdNum}`, {
        credentials: "include",
      });
      const data = await res.json();
      const detalles = data?.cotizacion?.detalles || [];
      const detallesActivos = detalles.filter(
        (d) =>
          String(d.servicio_tipo || "").toLowerCase() === "consulta" &&
          String(d.estado_item || "activo").toLowerCase() !== "eliminado"
      );
      if (detallesActivos.length === 0) {
        setConsultasDisponibles([]);
        setModoAgregarConsulta(false);
      } else if (detallesActivos.length === 1) {
        // Si solo queda una, mostrar el selector igual para que el usuario decida
        setConsultasDisponibles(detallesActivos);
      } else {
        setConsultasDisponibles(detallesActivos);
      }
    } catch {
      // ignorar error de recarga silenciosa
    }
  };

  const eliminarConsultaDeSelector = async (detalle) => {
    const especialidad = String(detalle.descripcion || "Consulta")
      .replace(/\s*-\s*.+?\s*\(\d{4}-\d{2}-\d{2}[^)]*\)\s*$/, "")
      .trim();
    const result = await MySwal.fire({
      icon: "warning",
      title: "¿Eliminar esta consulta?",
      html: `<p>Se eliminará <strong>${especialidad}</strong> de la cotización y el monto se descontará del total.</p>`,
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`${BASE_URL}api_cotizaciones.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          accion: "eliminar_detalle",
          cotizacion_id: cotizacionIdNum,
          detalle_id: Number(detalle.id || 0),
          motivo: "Eliminación de consulta desde edición",
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "No se pudo eliminar la consulta");

      await MySwal.fire({
        icon: "success",
        title: "Consulta eliminada",
        text: `Nuevo total: S/ ${Number(data.nuevo_total || 0).toFixed(2)}`,
        confirmButtonText: "Aceptar",
        confirmButtonColor: "#2563eb",
      });
      await recargarConsultasDisponibles();
    } catch (err) {
      MySwal.fire({ icon: "error", title: "Error", text: err.message });
    }
  };

  const agregarNuevaConsultaACotizacion = async () => {
    if (!pacienteId || !medicoId || !fecha || !hora) {
      setMsg("Completa todos los campos para agregar la consulta");
      return;
    }
    setProcessingAction("agregar");
    setMsg("");
    try {
      const tarifa = await obtenerTarifaConsulta(medicoId);
      const precio = getPrecioConsultaNeto(tarifa);
      if (!Number.isFinite(precio) || precio < 0) {
        throw new Error("La tarifa de consulta no tiene un precio válido");
      }

      // Crear la consulta clínica
      const resConsulta = await fetch(`${BASE_URL}api_consultas.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          accion: "crear",
          paciente_id: Number(pacienteId),
          medico_id: Number(medicoId),
          fecha,
          hora,
          tipo_consulta: tipoConsulta || "programada",
            origen_creacion: "cotizador",
        }),
      });
      const dataConsulta = await resConsulta.json();
      if (!dataConsulta.success && !dataConsulta.consulta_id && !dataConsulta.id) {
        throw new Error(dataConsulta.error || "No se pudo crear la consulta");
      }
      const nuevaConsultaId = Number(dataConsulta.consulta_id || dataConsulta.id || 0);

      const medicoSeleccionado = medicos.find((m) => String(m.id) === String(medicoId));
      const medicoNombre = `${medicoSeleccionado?.nombre || medicoSeleccionado?.nombres || ""} ${
        medicoSeleccionado?.apellido || medicoSeleccionado?.apellidos || ""
      }`.trim();

      const descripcion = `${tarifa.descripcion || "Consulta médica"} - ${medicoNombre} (${fecha} ${hora})`;

      // Agregar el detalle a la cotización
      const resDetalle = await fetch(`${BASE_URL}api_cotizaciones.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          accion: "agregar_detalle",
          cotizacion_id: cotizacionIdNum,
          motivo: "Agregar consulta desde edición",
          detalle: {
            servicio_tipo: "consulta",
            servicio_id: Number(tarifa.id || 0),
            descripcion,
            cantidad: 1,
            precio_unitario: precio,
            subtotal: precio,
            consulta_id: nuevaConsultaId,
            medico_id: Number(medicoId),
          },
        }),
      });
      const dataDetalle = await resDetalle.json();
      if (!dataDetalle.success) throw new Error(dataDetalle.error || "No se pudo agregar la consulta a la cotización");

      await MySwal.fire({
        icon: "success",
        title: "Consulta agregada",
        text: `La consulta fue agregada. Nuevo total: S/ ${Number(dataDetalle.nuevo_total || 0).toFixed(2)}`,
        confirmButtonText: "Aceptar",
        confirmButtonColor: "#2563eb",
      });

      setModoAgregarConsulta(false);
      setMedicoId("");
      setFecha(getLimaDate());
      setHora("");
      await recargarConsultasDisponibles();
    } catch (err) {
      setMsg(err.message || "Error al agregar la consulta");
    } finally {
      setProcessingAction("");
    }
  };

  const actualizarConsultaExistente = async () => {
    if (!pacienteId || !medicoId || !fecha || !hora) {
      setMsg("Completa todos los campos");
      return;
    }

    setProcessingAction("editar");
    setMsg("");
    try {
      let consultaFinalId = consultaIdNum;

      if (consultaIdNum <= 0) {
        // No hay consulta vinculada: crear una nueva y vincularla a la cotización
        const resCrear = await fetch(`${BASE_URL}api_consultas.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            paciente_id: Number(pacienteId),
            medico_id: Number(medicoId),
            fecha,
            hora,
            tipo_consulta: tipoConsulta,
            origen_creacion: "cotizador",
          }),
        });
        const dataCrear = await resCrear.json();
        if (!dataCrear?.success || !dataCrear?.id) {
          throw new Error(dataCrear?.error || "No se pudo agendar la consulta");
        }
        consultaFinalId = Number(dataCrear.id);

        // Vincular la consulta al detalle de la cotización
        if (cotizacionIdNum > 0) {
          await fetch(`${BASE_URL}api_cotizaciones.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              accion: "vincular_consulta",
              cotizacion_id: cotizacionIdNum,
              consulta_id: consultaFinalId,
              medico_id: Number(medicoId),
            }),
          });
        }

        setRefreshDisponibilidadKey((prev) => prev + 1);
        await MySwal.fire({
          icon: "success",
          title: "Consulta agendada",
          text: `Se agendó la consulta #${consultaFinalId} y se vinculó a la cotización #${cotizacionIdNum}.`,
          confirmButtonText: "Aceptar",
          confirmButtonColor: "#2563eb",
        });
        try {
          await sincronizarRecordatorioPostReprogramacion(consultaFinalId);
        } catch {
          // No bloquear la navegación principal por falla de sincronización de recordatorio.
        }
        navigate(backTo || (cotizacionIdNum > 0 ? "/cotizaciones" : "/lista-consultas"));
        return;
      }

      const response = await fetch(`${BASE_URL}api_consultas.php`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: consultaIdNum,
          cotizacion_id: cotizacionIdNum > 0 ? cotizacionIdNum : undefined,
          medico_id: Number(medicoId),
          fecha,
          hora,
          tipo_consulta: tipoConsulta,
        }),
      });

      const result = await response.json();
      if (!result?.success) {
        throw new Error(result?.error || "No se pudo actualizar la consulta");
      }

      const cotizacionSync = result?.cotizacion_sync;
      const syncFallida = cotizacionIdNum > 0 && cotizacionSync && cotizacionSync.ok === false;

      setRefreshDisponibilidadKey((prev) => prev + 1);

      await MySwal.fire({
        icon: "success",
        title: "Consulta actualizada",
        text: syncFallida
          ? `Se actualizó la consulta #${consultaIdNum}, pero no se pudo sincronizar el precio de la cotización (${cotizacionSync?.reason || "sin detalle"}).`
          : `Se actualizó la consulta #${consultaIdNum} correctamente.`,
        confirmButtonText: "Aceptar",
        confirmButtonColor: "#2563eb",
      });

      try {
        await sincronizarRecordatorioPostReprogramacion(consultaIdNum);
      } catch (e) {
        await MySwal.fire({
          icon: "warning",
          title: "Consulta reprogramada con observación",
          text: e?.message || "No se pudo sincronizar el recordatorio automáticamente.",
          confirmButtonText: "Entendido",
        });
      }

      navigate(backTo || (cotizacionIdNum > 0 ? "/cotizaciones" : "/lista-consultas"));
    } catch (error) {
      setMsg(error?.message || "Error al actualizar la consulta");
    } finally {
      setProcessingAction("");
    }
  };

  const validarCajaParaEspontanea = async () => {
    if (tipoConsulta !== "espontanea") return true;

    const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
    const usuarioSesionId = Number(usuario?.id || 0);
    let cajaAbierta = null;
    try {
      const cajaRes = await fetch(BASE_URL + "api_caja_actual.php", { credentials: "include" });
      const cajaData = await cajaRes.json();
      const usuarioCajaId = Number(cajaData?.caja?.usuario_id || 0);
      if (cajaData.success && cajaData.caja && usuarioSesionId > 0 && usuarioCajaId === usuarioSesionId) {
        cajaAbierta = cajaData.caja;
      }
    } catch {
      cajaAbierta = null;
    }

    if (!cajaAbierta) {
      setMsg("Debes abrir tu caja antes de agendar una consulta espontánea.");
      return false;
    }

    return true;
  };

  const crearConsultaYDetalle = async () => {
    const res = await fetch(BASE_URL + "api_consultas.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        paciente_id: pacienteId,
        medico_id: medicoId,
        fecha,
        hora,
        tipo_consulta: tipoConsulta,
      }),
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "Error al agendar");
    }

    // Refrescar disponibilidad inmediatamente para reflejar cupos consumidos
    setRefreshDisponibilidadKey((prev) => prev + 1);

    const medicoSeleccionado = medicos.find(
      (m) => String(m.id) === String(medicoId)
    );
    const nombreCompleto = `${medicoSeleccionado?.nombre} ${
      medicoSeleccionado?.apellido || ""
    }`.trim();
    const consultaInfo = {
      id: data.consulta_id || data.id,
      medico_id: medicoId,
      medico_nombre: nombreCompleto,
      tipo_consulta: tipoConsulta,
      medico_especialidad: medicoSeleccionado?.especialidad,
      fecha,
      hora,
      paciente_id: pacienteId,
    };

    const tarifa = await obtenerTarifaConsulta(medicoId);
    const detalleConsulta = construirDetalleConsulta(tarifa, consultaInfo);
    const total = Number(detalleConsulta.subtotal || 0);

    return { consultaInfo, detalleConsulta, total };
  };

  const procesarAgendaConsulta = async (accion = "cobrar") => {
    setMsg("");
    if (!pacienteId || !medicoId || !fecha || !hora) {
      setMsg("Completa todos los campos");
      return;
    }

    if (!(await validarCajaParaEspontanea())) {
      return;
    }

    setProcessingAction(accion);
    try {
      const { consultaInfo, detalleConsulta, total } = await crearConsultaYDetalle();
      const cotizacionId = await registrarCotizacionConsulta(
        consultaInfo,
        detalleConsulta,
        total
      );

      setDetallesConsulta([detalleConsulta]);
      setTotalConsulta(total);
      setConsultaCreada({ ...consultaInfo, cotizacion_id: cotizacionId });

      if (accion === "cobrar" && Number(total) <= 0) {
        setMsg("");
        await MySwal.fire({
          icon: "success",
          title: "Consulta agendada",
          html: `
            <div class="text-left">
              <p><strong>Consulta ID:</strong> ${consultaInfo.id}</p>
              <p><strong>Cotización ID:</strong> ${cotizacionId}</p>
              <p><strong>Total:</strong> S/ 0.00</p>
              <p>La consulta quedó registrada sin cobro manual.</p>
            </div>
          `,
          confirmButtonText: "Aceptar",
          confirmButtonColor: "#2563eb",
        });
        navigate(backTo || "/lista-consultas");
        return;
      }

      if (accion === "cotizar") {
        setMsg("");

        await MySwal.fire({
          icon: "success",
          title: "Consulta agendada y cotizada",
          html: `
            <div class="text-left">
              <p><strong>Consulta ID:</strong> ${consultaInfo.id}</p>
              <p><strong>Cotización ID:</strong> ${cotizacionId}</p>
              <p><strong>Médico:</strong> ${consultaInfo.medico_nombre}</p>
              <p><strong>Fecha:</strong> ${consultaInfo.fecha}</p>
              <p><strong>Hora:</strong> ${consultaInfo.hora}</p>
            </div>
          `,
          confirmButtonText: "Aceptar",
          confirmButtonColor: "#2563eb",
        });

        navigate("/cotizaciones");
        return;
      }

      setMostrarCobro(true);
      setMsg("");
    } catch (error) {
      console.error("Error:", error);
      setMsg(error?.message || "Error de conexión");
    } finally {
      setProcessingAction("");
    }
  };

  const handleCotizar = async () => {
    if (modoAgregarConsulta) {
      await agregarNuevaConsultaACotizacion();
      return;
    }
    if (isEditingConsulta) {
      await actualizarConsultaExistente();
      return;
    }
    await procesarAgendaConsulta("cotizar");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (modoAgregarConsulta) {
      await agregarNuevaConsultaACotizacion();
      return;
    }
    if (isEditingConsulta) {
      await actualizarConsultaExistente();
      return;
    }
    await procesarAgendaConsulta("cobrar");
  };

  const agregarConsultaAlCarrito = async () => {
    setMsg("");

    if (!pacienteId || !medicoId || !fecha || !hora) {
      setMsg("Completa todos los campos para agregar al carrito");
      return;
    }

    const pacienteCartId = Number(cart?.patientId || 0);
    const pacienteActualId = Number(pacienteId || 0);
    if (pacienteCartId > 0 && pacienteCartId !== pacienteActualId) {
      await MySwal.fire({
        icon: "warning",
        title: "Carrito con otro paciente",
        text: "El carrito actual pertenece a otro paciente. Finaliza o limpia el carrito para continuar.",
        confirmButtonText: "Entendido",
      });
      return;
    }

    try {
      const tarifa = await obtenerTarifaConsulta(medicoId);
      const precio = getPrecioConsultaNeto(tarifa);
      if (!Number.isFinite(precio) || precio < 0) {
        throw new Error("La tarifa de consulta no tiene un precio válido");
      }

      const medicoSeleccionado = medicos.find((m) => String(m.id) === String(medicoId));
      const medicoNombre = `${medicoSeleccionado?.nombre || medicoSeleccionado?.nombres || ""} ${
        medicoSeleccionado?.apellido || medicoSeleccionado?.apellidos || ""
      }`.trim();

      const descripcionServicio = tarifa.descripcion || "Consulta médica";

      const existeEnCarrito = Array.isArray(cart?.items) && cart.items.some((it) => (
        String(it?.serviceType || "").toLowerCase() === "consulta" &&
        Number(it?.serviceId || 0) === Number(tarifa.id || 0) &&
        Number(it?.unitPrice || 0) === Number(precio || 0)
      ));

      if (cotizacionIdNum > 0 && existeEnCarrito) {
        await MySwal.fire({
          icon: "info",
          title: "Sin cambios",
          text: "La consulta seleccionada ya está en el carrito para esta edición.",
          confirmButtonText: "Aceptar",
        });
        return;
      }

      addItems({
        patientId: pacienteActualId,
        patientName: pacienteInfo
          ? `${pacienteInfo.nombres || pacienteInfo.nombre || ""} ${pacienteInfo.apellidos || pacienteInfo.apellido || ""}`.trim()
          : `Paciente #${pacienteActualId}`,
        items: [
          {
            serviceType: "consulta",
            serviceId: Number(tarifa.id || 0),
            description: `${descripcionServicio} - ${medicoNombre || "Sin médico"} (${fecha} ${hora})`,
            quantity: 1,
            unitPrice: Number(precio),
            source: "consulta",
            consultaMedicoId: Number(medicoId),
            consultaFecha: fecha,
            consultaHora: hora,
            consultaTipoConsulta: tipoConsulta,
            consultaId: consultaIdNum > 0 ? Number(consultaIdNum) : null,
          },
        ],
      });

      await MySwal.fire({
        icon: "success",
        title: "Agregado al carrito",
        text: cotizacionIdNum > 0
          ? "Consulta agregada al carrito para actualizar la cotización."
          : "Consulta agregada al carrito correctamente.",
        confirmButtonText: "Aceptar",
      });
    } catch (error) {
      setMsg(error?.message || "No se pudo agregar la consulta al carrito");
    }
  };

  const manejarCobroCompleto = async (cobroId, _servicio, cobroResumen = null) => {
    setMostrarCobro(false);

    let cotizacionId = consultaCreada?.cotizacion_id
      ? Number(consultaCreada.cotizacion_id)
      : null;
    let errorCotizacion = null;

    try {
      if (cotizacionId) {
        const montoResumen = Number(cobroResumen?.total_cobrado);
        const montoFallback = Number.isFinite(montoResumen) && montoResumen > 0
          ? montoResumen
          : totalConsulta;
        const montoCobrado = montoFallback > 0
          ? montoFallback
          : await obtenerMontoCobro(cobroId, totalConsulta);
        if (montoCobrado > 0) {
          await registrarAbonoCotizacion(cotizacionId, cobroId, montoCobrado);
        }
      }
    } catch (error) {
      errorCotizacion = error?.message || "No se pudo sincronizar la cotización con el cobro";
    }

    MySwal.fire({
      icon: "success",
      title: "¡Consulta Agendada y Pagada!",
      html: `
        <div class="text-left">
          <p><strong>Consulta:</strong> ${consultaCreada.medico_nombre}</p>
          <p><strong>Especialidad:</strong> ${consultaCreada.medico_especialidad}</p>
          <p><strong>Fecha:</strong> ${consultaCreada.fecha}</p>
          <p><strong>Hora:</strong> ${consultaCreada.hora}</p>
          <p><strong>Cobro ID:</strong> ${cobroId}</p>
          ${cotizacionId ? `<p><strong>Cotización ID:</strong> ${cotizacionId}</p>` : ""}
        </div>
      `,
      confirmButtonColor: "#22c55e",
      confirmButtonText: "Aceptar",
    });

    if (errorCotizacion) {
      await MySwal.fire({
        icon: "warning",
        title: "Pago registrado con observación",
        text: `${errorCotizacion}. Revisa la cotización de esta consulta en el módulo de Cotizaciones.`,
        confirmButtonText: "Entendido",
      });

      // Aunque haya observación en la sincronización, llevar al listado de cotizaciones
      navigate("/cotizaciones");
      return;
    }

    // Resetear formulario
    setFecha(getLimaDate());
    setHora("");
    setMedicoId("");
    setDetallesConsulta([]);
    setTotalConsulta(0);
    setConsultaCreada(null);

    // Flujo esperado: luego de cobrar una consulta, regresar a Cotizaciones.
    navigate("/cotizaciones");
  };

  const manejarCancelarCobro = () => {
    MySwal.fire({
      title: "Cancelar proceso",
      text: "Se cancelará la cita y se anulará la cotización asociada. ¿Deseas continuar?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, cancelar todo",
      cancelButtonText: "Volver",
      confirmButtonColor: "#dc2626",
    }).then(async (decision) => {
      if (!decision.isConfirmed) return;

      const consultaId = consultaCreada?.id;
      const cotizacionId = consultaCreada?.cotizacion_id;
      let errorProceso = null;

      try {
        if (consultaId) {
          await cancelarConsultaAgendada(consultaId);
        }
        if (cotizacionId) {
          await anularCotizacionConsulta(
            cotizacionId,
            `Cancelación de consulta #${consultaId || ""} antes del pago`.trim()
          );
        }
      } catch (error) {
        errorProceso = error?.message || "No se pudo completar la cancelación automática";
      }

      setMostrarCobro(false);
      setDetallesConsulta([]);
      setTotalConsulta(0);
      setConsultaCreada(null);
      setHora("");
      setMedicoId("");

      // Refrescar disponibilidad para devolver el cupo liberado tras cancelación
      setRefreshDisponibilidadKey((prev) => prev + 1);

      if (errorProceso) {
        await MySwal.fire({
          title: "Cancelación parcial",
          text: `${errorProceso}. Revisa manualmente consulta/cotización para completar la reversa.`,
          icon: "warning",
          confirmButtonText: "Entendido",
        });
        return;
      }

      await MySwal.fire({
        title: "Proceso cancelado",
        text: "La cita y la cotización fueron canceladas correctamente.",
        icon: "success",
        confirmButtonText: "Entendido",
      });
    });
  };

  // Si se está mostrando el módulo de cobro, renderizar el resumen y cobro
  if (!isEditingConsulta && mostrarCobro && consultaCreada && pacienteInfo) {
    return (
      <ResumenConsultaAgendada
        consultaCreada={consultaCreada}
        pacienteInfo={pacienteInfo}
        detallesConsulta={detallesConsulta}
        totalConsulta={totalConsulta}
        manejarCobroCompleto={manejarCobroCompleto}
        manejarCancelarCobro={manejarCancelarCobro}
      />
    );
  }

  return (
    <div className={`w-full flex flex-col py-4 px-2 md:px-0 bg-gradient-to-br from-gray-50 to-blue-50 min-h-[80vh] transition-all ${cartCount > 0 ? "xl:pr-[24rem]" : ""}`}>
      {!(new URLSearchParams(window.location.search).get('cobro_id') || new URLSearchParams(window.location.search).get('cotizacion_id')) && (
        <button
          onClick={() => navigate('/seleccionar-servicio', { state: { pacienteId } })}
          className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 self-end mb-3"
        >
          Volver
        </button>
      )}
      <div className="w-full max-w-[1500px] mx-auto grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5 xl:gap-6 items-start">
        {/* Tarjeta disponibilidad */}
        <div className="w-full min-w-0">
          <div className="bg-white rounded-2xl shadow-xl border border-blue-200 p-4 md:p-5 lg:p-6 w-full transition-all">
            <div className="flex items-center gap-2 mb-4">
              <FaUserMd className="text-2xl text-blue-600" />
              <h3 className="text-xl font-bold text-blue-700">
                Disponibilidad de Médicos
              </h3>
            </div>
            <DisponibilidadMedicos refreshKey={refreshDisponibilidadKey} />
          </div>
        </div>
        {/* Tarjeta formulario / selector */}
        <div className="w-full xl:max-w-[430px]">
          {isEditingConsulta && cargandoConsultaEdicion && (
            <div className="mb-3 rounded border border-blue-200 bg-blue-50 text-blue-800 px-3 py-2 text-sm">
              Cargando datos de la consulta para edición...
            </div>
          )}
          {isEditingConsulta && consultasDisponibles.length > 0 && !modoAgregarConsulta ? (
            <div className="bg-white rounded-2xl shadow-xl border border-blue-200 p-5">
              <h3 className="text-lg font-bold text-blue-700 mb-1">Consultas en esta cotización</h3>
              <p className="text-sm text-gray-500 mb-4">Esta cotización tiene {consultasDisponibles.length} consulta{consultasDisponibles.length !== 1 ? "s" : ""}. Selecciona una acción.</p>
              <div className="flex flex-col gap-3">
                {consultasDisponibles.map((d, i) => {
                  const medico = String(d.medico_nombre_completo || "").trim();
                  const desc = String(d.descripcion || "Consulta");
                  const especialidad = desc.replace(/\s*-\s*.+?\s*\(\d{4}-\d{2}-\d{2}[^)]*\)\s*$/, "").trim() || desc;
                  const fechaMatch = desc.match(/\((\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\)/);
                  const precio = Number(d.subtotal || d.precio_unitario || 0);
                  return (
                    <div key={i} className="border border-blue-100 rounded-xl p-4 bg-blue-50/40">
                      <div className="font-semibold text-blue-900 text-sm mb-1">{especialidad}</div>
                      {medico && (
                        <div className="text-xs text-gray-600 mb-0.5">👨‍⚕️ {medico}</div>
                      )}
                      {fechaMatch && (
                        <div className="text-xs text-gray-500 mb-0.5">📅 {fechaMatch[1]} a las {fechaMatch[2]}</div>
                      )}
                      {precio > 0 && (
                        <div className="text-xs text-green-700 font-medium mb-2">S/ {precio.toFixed(2)}</div>
                      )}
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => seleccionarConsultaParaEditar(d)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-3 rounded-lg transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => eliminarConsultaDeSelector(d)}
                          className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-bold py-2 px-3 rounded-lg transition-colors"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => {
                  setModoAgregarConsulta(true);
                  setMedicoId("");
                  setFecha(getLimaDate());
                  setHora("");
                  setMsg("");
                }}
                className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-2.5 px-4 rounded-lg transition-colors"
              >
                + Agregar otra consulta
              </button>
            </div>
          ) : (
          <>
            {modoAgregarConsulta && (
              <div className="mb-3">
                <button
                  onClick={() => { setModoAgregarConsulta(false); setMsg(""); }}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
                >
                  ← Volver al selector de consultas
                </button>
                <p className="text-xs text-gray-500 mt-1">Completa el formulario para agregar una nueva consulta a esta cotización.</p>
              </div>
            )}
          <FormularioAgendarConsulta
            tipoConsulta={tipoConsulta}
            setTipoConsulta={setTipoConsulta}
            medicos={medicosConTarifa}
            tarifas={tarifasConsulta}
            coverageByTarifa={coverageByTarifa}
            medicoId={medicoId}
            setMedicoId={setMedicoId}
            fecha={fecha}
            setFecha={setFecha}
            hora={hora}
            setHora={setHora}
            horariosDisponibles={horariosDisponibles}
            cargandoHorarios={cargandoHorarios}
            handleSubmit={handleSubmit}
            onCotizar={handleCotizar}
            onAgregarCarrito={agregarConsultaAlCarrito}
            isEditingConsulta={isEditingConsulta && !modoAgregarConsulta}
            isEditingCotizacion={cotizacionIdNum > 0}
            processingAction={processingAction}
            msg={msg}
          />
          </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AgendarConsulta;
