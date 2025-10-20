import React, { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";
import DisponibilidadMedicos from "./DisponibilidadMedicos";
import CobroModuloFinal from "./CobroModuloFinal";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

function AgendarConsulta({ pacienteId }) {
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
                descripcion: tarifa.descripcion || `Consulta - ${consultaCreada.medico_nombre}`,
                cantidad: 1,
                precio_unitario: parseFloat(tarifa.precio_particular) || 0,
                subtotal: parseFloat(tarifa.precio_particular) || 0
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
          estado: 'programada'
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

  // Si se está mostrando el módulo de cobro, renderizarlo
  if (mostrarCobro && consultaCreada && pacienteInfo) {
  return (
    <div className="max-w-2xl mx-auto p-2 md:p-8 w-full">
      <div className="bg-blue-50 p-4 rounded-lg mb-4 border border-blue-200">
        <h3 className="font-semibold text-blue-800 mb-2">✅ Consulta Agendada Exitosamente</h3>
        <div className="text-sm text-blue-600">
          <p><strong>Médico:</strong> {consultaCreada.medico_nombre} ({consultaCreada.medico_especialidad})</p>
          <p><strong>Fecha:</strong> {consultaCreada.fecha} - <strong>Hora:</strong> {consultaCreada.hora}</p>
          <p><strong>Paciente:</strong> {pacienteInfo.nombre} {pacienteInfo.apellido}</p>
        </div>
      </div>
      <CobroModuloFinal
        paciente={pacienteInfo}
        servicio={{
          key: "consulta",
          label: `Consulta - ${consultaCreada.medico_nombre}`,
          medico_id: consultaCreada.medico_id,
          consulta_id: consultaCreada.id
        }}
        detalles={detallesConsulta}
        total={totalConsulta}
        onCobroCompleto={manejarCobroCompleto}
        onCancelar={manejarCancelarCobro}
      />
    </div>
  );
}

  return (
  <div className="max-w-2xl mx-auto p-2 md:p-8 w-full overflow-x-auto">
      <DisponibilidadMedicos />
      <h2 className="text-xl md:text-2xl font-bold mb-4 text-center">Agendar Consulta Médica</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 md:gap-4 mb-4 bg-white rounded-lg shadow border border-blue-200 p-2 md:p-8 w-full max-w-full text-xs md:text-base">
        <label className="font-semibold mb-1" htmlFor="medico-select">Médico</label>
        <select 
          id="medico-select"
          value={medicoId} 
          onChange={e => {
            setMedicoId(e.target.value);
            setHora(""); // Resetear hora cuando cambia médico
          }} 
          className="border rounded px-3 py-2 md:px-4 md:py-3 text-base md:text-lg" 
          required
        >
          <option value="">Selecciona un médico</option>
          {medicos.map(medico => (
            <option key={medico.id} value={medico.id}>
              Dr(a). {medico.nombre} {medico.apellido || ''} - {medico.especialidad}
            </option>
          ))}
        </select>

        <label className="font-semibold mb-1" htmlFor="fecha-consulta">Fecha de la consulta</label>
        <input 
          id="fecha-consulta" 
          type="date" 
          value={fecha} 
          onChange={e => {
            setFecha(e.target.value);
            setHora(""); // Resetear hora cuando cambia fecha
          }} 
          className="border rounded px-3 py-2 md:px-4 md:py-3 text-base md:text-lg" 
          required 
        />

        <label className="font-semibold mb-1" htmlFor="hora-select">Horario disponible</label>
        <select
          id="hora-select"
          value={hora}
          onChange={e => setHora(e.target.value)}
          className="border rounded px-3 py-2 md:px-4 md:py-3 text-base md:text-lg"
          required
          disabled={!medicoId || !fecha || cargandoHorarios}
        >
          <option value="">
            {cargandoHorarios ? "Cargando horarios..." : 
             !medicoId || !fecha ? "Selecciona médico y fecha primero" :
             horariosDisponibles.length === 0 ? "No hay horarios disponibles" :
             "Selecciona un horario"}
          </option>
          {horariosDisponibles.map(horario => (
            <option key={`${horario.medico_id}-${horario.hora}`} value={horario.hora}>
              {horario.hora} - {horario.medico_nombre}
            </option>
          ))}
        </select>

        <button type="submit" className="bg-green-600 text-white rounded px-4 py-2 md:px-6 md:py-3 font-bold text-base md:text-lg">
          Agendar Consulta
        </button>
      </form>
  {msg && <div className="mt-2 text-base md:text-lg text-center text-green-700">{msg}</div>}
    </div>
  );
}

export default AgendarConsulta;
