import React, { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";
import DisponibilidadMedicos from "./DisponibilidadMedicos";
import FormularioAgendarConsulta from "./FormularioAgendarConsulta";
import ResumenConsultaAgendada from "./ResumenConsultaAgendada";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

function AgendarConsulta({ pacienteId }) {
  const [tipoConsulta, setTipoConsulta] = useState('programada');
  const [detallesConsulta, setDetallesConsulta] = useState([]);
const [totalConsulta, setTotalConsulta] = useState(0);
  const [medicos, setMedicos] = useState([]);
  const [medicoId, setMedicoId] = useState("");
  const [horariosDisponibles, setHorariosDisponibles] = useState([]);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [msg, setMsg] = useState("");
  const [consultaCreada, setConsultaCreada] = useState(null);
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [pacienteInfo, setPacienteInfo] = useState(null);
  const [cargandoHorarios, setCargandoHorarios] = useState(false);
  const MySwal = withReactContent(Swal);

  useEffect(() => {
    if (mostrarCobro && consultaCreada) {
      fetch(BASE_URL + "api_tarifas.php", { credentials: "include" })
        .then(r => r.json())
        .then(data => {
          if (data.success && Array.isArray(data.tarifas)) {
            // Buscar tarifa específica del médico (comparar como número)
            let tarifa = data.tarifas.find(
              t => t.servicio_tipo === 'consulta' && t.activo === 1 && Number(t.medico_id) === Number(consultaCreada.medico_id)
            );
            // Si no existe, buscar tarifa general (medico_id null o vacío)
            if (!tarifa) {
              tarifa = data.tarifas.find(
                t => t.servicio_tipo === 'consulta' && t.activo === 1 && (!t.medico_id || t.medico_id === null)
              );
            }
            if (tarifa) {
              const detalle = {
                servicio_tipo: 'consulta',
                servicio_id: consultaCreada.id,
                descripcion: tarifa.descripcion, // Usar descripción exacta de la tarifa
                cantidad: 1,
                precio_unitario: parseFloat(tarifa.precio_particular) || 0,
                subtotal: parseFloat(tarifa.precio_particular) || 0,
                consulta_id: consultaCreada.id,
                medico_id: consultaCreada.medico_id,
                paciente_id: consultaCreada.paciente_id
              };
              setDetallesConsulta([detalle]);
              setTotalConsulta(detalle.subtotal);
            } else {
              setDetallesConsulta([]);
              setTotalConsulta(0);
            }
          }
        });
    } else {
      setDetallesConsulta([]);
      setTotalConsulta(0);
    }
  }, [mostrarCobro, consultaCreada]);

  useEffect(() => {
    fetch(BASE_URL + "api_medicos.php")
      .then(r => r.json())
      .then(data => setMedicos(data.medicos || []));
  }, []);

  // Cargar horarios disponibles cuando se selecciona médico y fecha
  useEffect(() => {
    if (medicoId && fecha) {
      setCargandoHorarios(true);
      fetch(`${BASE_URL}api_horarios_disponibles.php?medico_id=${medicoId}&fecha=${fecha}`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setHorariosDisponibles(data.horarios_disponibles || []);
          } else {
            setHorariosDisponibles([]);
            console.error('Error:', data.error);
          }
        })
        .catch(error => {
          console.error('Error:', error);
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
        .then(r => r.json())
        .then(data => {
          if (data.success && data.paciente) {
            setPacienteInfo(data.paciente);
          }
        })
        .catch(console.error);
    }
  }, [pacienteId]);

  const handleSubmit = async e => {
    e.preventDefault();
    setMsg("");
    if (!pacienteId || !medicoId || !fecha || !hora) {
      setMsg("Completa todos los campos");
      return;
    }
    
    try {
      const res = await fetch(BASE_URL + "api_consultas.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          paciente_id: pacienteId, 
          medico_id: medicoId, 
          fecha, 
          hora,
          tipo_consulta: tipoConsulta,
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        // Guardar información de la consulta creada
        const medicoSeleccionado = medicos.find(m => String(m.id) === String(medicoId));
        const nombreCompleto = `${medicoSeleccionado?.nombre} ${medicoSeleccionado?.apellido || ''}`.trim();
        setConsultaCreada({
          id: data.consulta_id || data.id,
          medico_id: medicoId,
          medico_nombre: nombreCompleto,
          tipo_consulta: tipoConsulta,
          medico_especialidad: medicoSeleccionado?.especialidad,
          fecha,
          hora,
          paciente_id: pacienteId
        });
        
        // Mostrar módulo de cobro
        setMostrarCobro(true);
        setMsg("");
      } else {
        setMsg(data.error || "Error al agendar");
      }
    } catch (error) {
      console.error('Error:', error);
      setMsg("Error de conexión");
    }
  };

  const manejarCobroCompleto = async (cobroId, _servicio) => {
    setMostrarCobro(false);
    
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
        </div>
      `,
      confirmButtonColor: "#22c55e",
      confirmButtonText: "Aceptar"
    });

    // Resetear formulario
    setFecha("");
    setHora("");
    setMedicoId("");
    setConsultaCreada(null);
  };

  const manejarCancelarCobro = () => {
    setMostrarCobro(false);
    MySwal.fire({
      title: 'Cobro Cancelado',
      text: 'La consulta fue agendada pero no se realizó el cobro. Puede cobrarse posteriormente.',
      icon: 'info',
      confirmButtonText: 'Entendido'
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
    <div className="max-w-2xl mx-auto p-2 md:p-8 w-full overflow-x-auto">
      <DisponibilidadMedicos />
      <h2 className="text-xl md:text-2xl font-bold mb-4 text-center">Agendar Consulta Médica</h2>
      <FormularioAgendarConsulta
        tipoConsulta={tipoConsulta}
        setTipoConsulta={setTipoConsulta}
        medicos={medicos}
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
  );
}

export default AgendarConsulta;
