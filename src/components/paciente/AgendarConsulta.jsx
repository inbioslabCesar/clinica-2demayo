import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../../config/config";
import DisponibilidadMedicos from "../medico/DisponibilidadMedicos";
import FormularioAgendarConsulta from "./FormularioAgendarConsulta";
import ResumenConsultaAgendada from "../comunes/ResumenConsultaAgendada";
import {
  FaCalendarAlt,
  FaUserMd,
  FaClipboardList,
  FaUser,
  FaRegClock,
} from "react-icons/fa";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

function AgendarConsulta({ pacienteId }) {
  const navigate = useNavigate();
  const [tipoConsulta, setTipoConsulta] = useState("programada");
  const [detallesConsulta, setDetallesConsulta] = useState([]);
  const [totalConsulta, setTotalConsulta] = useState(0);
  const [medicos, setMedicos] = useState([]);
  const [medicosConTarifa, setMedicosConTarifa] = useState([]);
  const [tarifasConsulta, setTarifasConsulta] = useState([]);
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
  const MySwal = withReactContent(Swal);

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

  const construirDetalleConsulta = (tarifa, consultaInfo) => {
    const precio = parseFloat(tarifa.precio_particular) || 0;
    if (precio <= 0) {
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
    const response = await fetch(`${BASE_URL}api_cotizaciones.php`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accion: "registrar_abono",
        cotizacion_id: Number(cotizacionId),
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
      fetch(BASE_URL + "api_medicos.php").then(r => r.json()),
      fetch(BASE_URL + "api_tarifas.php").then(r => r.json())
    ]).then(([medicosData, tarifasData]) => {
      const medicosList = medicosData.medicos || [];
      setMedicos(medicosList);
      const tarifasConsultaFiltradas = (tarifasData.tarifas || []).filter(t => t.servicio_tipo === "consulta" && t.activo === 1 && t.medico_id);
      setTarifasConsulta(tarifasConsultaFiltradas);
      const idsMedicosConTarifa = tarifasConsultaFiltradas.map(t => String(t.medico_id));
      const filtrados = medicosList.filter(m => idsMedicosConTarifa.includes(String(m.id)));
      setMedicosConTarifa(filtrados);
    });
  }, []);

  // Cargar horarios disponibles cuando se selecciona médico y fecha
  useEffect(() => {
    if (medicoId && fecha) {
      setCargandoHorarios(true);
      fetch(
        `${BASE_URL}api_horarios_disponibles.php?medico_id=${medicoId}&fecha=${fecha}`
      )
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
  }, [medicoId, fecha]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    if (!pacienteId || !medicoId || !fecha || !hora) {
      setMsg("Completa todos los campos");
      return;
    }

    // Solo validar caja abierta para consultas espontáneas
    if (tipoConsulta === "espontanea") {
      const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
      let cajaAbierta = null;
      try {
        const cajaRes = await fetch(BASE_URL + "api_caja_actual.php", { credentials: "include" });
        const cajaData = await cajaRes.json();
        if (cajaData.success && cajaData.caja && cajaData.caja.usuario_id === usuario.id) {
          cajaAbierta = cajaData.caja;
        }
      } catch {
        cajaAbierta = null;
      }
      if (!cajaAbierta) {
        setMsg("Debes abrir tu caja antes de agendar una consulta espontánea.");
        return;
      }
    }

    try {
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

      if (data.success) {
        // Guardar información de la consulta creada
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

        setDetallesConsulta([detalleConsulta]);
        setTotalConsulta(total);

        setConsultaCreada({ ...consultaInfo, cotizacion_id: null });
        setMostrarCobro(true);
        setMsg("");
      } else {
        setMsg(data.error || "Error al agendar");
      }
    } catch (error) {
      console.error("Error:", error);
      setMsg("Error de conexión");
    }
  };

  const manejarCobroCompleto = async (cobroId, _servicio) => {
    setMostrarCobro(false);

    let cotizacionId = consultaCreada?.cotizacion_id
      ? Number(consultaCreada.cotizacion_id)
      : null;
    let errorCotizacion = null;

    try {
      if (!cotizacionId) {
        const detalle = detallesConsulta[0];
        if (detalle) {
          cotizacionId = await registrarCotizacionConsulta(
            consultaCreada,
            detalle,
            totalConsulta
          );
        }
      }

      if (cotizacionId) {
        const montoCobrado = await obtenerMontoCobro(cobroId, totalConsulta);
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
    }

    // Resetear formulario
    setFecha(getLimaDate());
    setHora("");
    setMedicoId("");
    setDetallesConsulta([]);
    setTotalConsulta(0);
    setConsultaCreada(null);
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
  if (mostrarCobro && consultaCreada && pacienteInfo) {
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
    <div className="w-full flex flex-col py-4 px-2 md:px-0 bg-gradient-to-br from-gray-50 to-blue-50 min-h-[80vh]">
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
            <DisponibilidadMedicos />
          </div>
        </div>
        {/* Tarjeta formulario alineada a la derecha */}
        <div className="w-full xl:max-w-[430px]">
          <FormularioAgendarConsulta
            tipoConsulta={tipoConsulta}
            setTipoConsulta={setTipoConsulta}
            medicos={medicosConTarifa}
            tarifas={tarifasConsulta}
            medicoId={medicoId}
            setMedicoId={setMedicoId}
            fecha={fecha}
            setFecha={setFecha}
            hora={hora}
            setHora={setHora}
            horariosDisponibles={horariosDisponibles}
            cargandoHorarios={cargandoHorarios}
            handleSubmit={handleSubmit}
            msg={msg}
          />
        </div>
      </div>
    </div>
  );
}

export default AgendarConsulta;
