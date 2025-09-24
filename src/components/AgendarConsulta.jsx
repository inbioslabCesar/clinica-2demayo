import React, { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";
import DisponibilidadMedicos from "./DisponibilidadMedicos";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
function AgendarConsulta({ pacienteId }) {
  const [medicos, setMedicos] = useState([]);
  const [medicoId, setMedicoId] = useState("");
  const [disponibilidad, setDisponibilidad] = useState([]);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [msg, setMsg] = useState("");
  const MySwal = withReactContent(Swal);

  useEffect(() => {
    fetch(BASE_URL + "api_medicos.php")
      .then(r => r.json())
      .then(data => setMedicos(data.medicos || []));
  }, []);

  useEffect(() => {
    // Cargar disponibilidad de todos los médicos
    fetch(BASE_URL + "api_disponibilidad_medicos.php")
      .then(r => r.json())
      .then(data => setDisponibilidad(data.disponibilidad || []));
  }, []);

  const handleSubmit = async e => {
    e.preventDefault();
    setMsg("");
    if (!pacienteId || !medicoId || !fecha || !hora) {
      setMsg("Completa todos los campos");
      return;
    }
    const res = await fetch(BASE_URL + "api_consultas.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paciente_id: pacienteId, medico_id: medicoId, fecha, hora })
    });
    const data = await res.json();
    if (data.success) {
      setMsg("");
      MySwal.fire({
        icon: "success",
        title: "Consulta agendada",
        text: "¡La consulta fue agendada exitosamente! El paciente ya tiene su cita registrada.",
        confirmButtonColor: "#22c55e"
      });
    } else {
      setMsg(data.error || "Error al agendar");
    }
  };

  return (
  <div className="max-w-2xl mx-auto p-2 md:p-8 w-full overflow-x-auto">
      <DisponibilidadMedicos />
      <h2 className="text-xl md:text-2xl font-bold mb-4 text-center">Agendar Consulta Médica</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 md:gap-4 mb-4 bg-white rounded-lg shadow border border-blue-200 p-2 md:p-8 w-full max-w-full text-xs md:text-base">
        <label className="font-semibold mb-1" htmlFor="fecha-consulta">Fecha de la consulta <span className="text-gray-500">(dd/mm/aaaa)</span></label>
        <input id="fecha-consulta" type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="border rounded px-3 py-2 md:px-4 md:py-3 text-base md:text-lg" required />
        <select
          value={hora ? `${medicoId}|${hora}` : ""}
          onChange={e => {
            const [mid, h] = e.target.value.split("|");
            setMedicoId(mid);
            setHora(h);
          }}
          className="border rounded px-3 py-2 md:px-4 md:py-3 text-base md:text-lg"
          required
        >
          <option value="">Selecciona médico y horario</option>
          {disponibilidad
            .filter(d => !fecha || d.fecha === fecha)
            .map(d => {
              const medico = medicos.find(m => m.id == d.medico_id);
              if (!medico) return null;
              // Generar opciones de hora entre hora_inicio y hora_fin, cada 30 min
              const options = [];
              let [h, m] = d.hora_inicio.split(":").map(Number);
              const [hFin, mFin] = d.hora_fin.split(":").map(Number);
              while (h < hFin || (h === hFin && m < mFin)) {
                const horaStr = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
                options.push(
                  <option key={horaStr + d.id + medico.id} value={`${medico.id}|${horaStr}`}>
                    {medico.nombre} ({medico.especialidad}) - {horaStr}
                  </option>
                );
                m += 30;
                if (m >= 60) { h++; m = 0; }
              }
              return options;
            })}
        </select>
        <button type="submit" className="bg-green-600 text-white rounded px-4 py-2 md:px-6 md:py-3 font-bold text-base md:text-lg">Agendar</button>
      </form>
  {msg && <div className="mt-2 text-base md:text-lg text-center text-green-700">{msg}</div>}
    </div>
  );
}

export default AgendarConsulta;
