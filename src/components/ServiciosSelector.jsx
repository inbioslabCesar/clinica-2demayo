
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";
import Swal from 'sweetalert2';

const servicios = [
  { key: "consulta", label: "Consulta Médica" },
  { key: "laboratorio", label: "Laboratorio" },
  { key: "farmacia", label: "Farmacia" },
  { key: "rayosx", label: "Rayos X" },
  { key: "ecografia", label: "Ecografía" },
  { key: "ocupacional", label: "Medicina Ocupacional" },
];


// Se espera que usuario_id esté disponible en localStorage/session o como prop
function ServiciosSelector({ paciente }) {
  const navigate = useNavigate();
  const [medicos, setMedicos] = useState([]);
  const [disponibilidad, setDisponibilidad] = useState([]);
  const [consultas, setConsultas] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Cargar médicos, disponibilidad y consultas solo para consulta médica
    setLoading(true);
    Promise.all([
      fetch(BASE_URL + "api_medicos.php").then(r => r.json()),
      fetch(BASE_URL + "api_disponibilidad_medicos.php").then(r => r.json()),
      fetch(BASE_URL + "api_consultas.php").then(r => r.json())
    ]).then(([m, d, c]) => {
      setMedicos(m.medicos || []);
      setDisponibilidad(d.disponibilidad || []);
      setConsultas(c.consultas || []);
      setLoading(false);
    });
  }, []);
  const handleSeleccion = async (servicio) => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario')) || JSON.parse(sessionStorage.getItem('medico'));
    if (!usuario || !usuario.id) {
      alert('No se encontró el usuario logueado.');
      return;
    }
    try {
  const res = await fetch(BASE_URL + 'api_atenciones.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paciente_id: paciente.id,
          usuario_id: usuario.id,
          servicio: servicio.key,
          observaciones: ''
        })
      });
      const data = await res.json();
      if (data.success) {
        if (servicio.key === "consulta") {
          Swal.fire({
            title: 'Atención registrada',
            text: '¿Desea agendar la consulta médica ahora?',
            icon: 'success',
            showCancelButton: true,
            confirmButtonText: 'Sí, agendar',
            cancelButtonText: 'No'
          }).then((result) => {
            if (result.isConfirmed) {
              navigate("/agendar-consulta", { state: { pacienteId: paciente.id } });
            }
          });
        } else {
          Swal.fire({
            title: 'Atención registrada',
            text: `Atención registrada para ${servicio.label}.`,
            icon: 'success',
            confirmButtonText: 'OK'
          });
        }
      } else {
        Swal.fire({
          title: 'Error',
          text: data.error || 'Error al registrar atención',
          icon: 'error',
          confirmButtonText: 'OK'
        });
      }
    } catch (err) {
      alert('Error de conexión con el servidor.');
    }
  };

  return (
    <div className="flex flex-wrap gap-3 justify-center mb-4">
      {servicios.map(servicio => (
        <button
          key={servicio.key}
          onClick={() => handleSeleccion(servicio)}
          className="bg-purple-800 text-white px-4 py-2 rounded shadow hover:bg-blue-500 font-bold"
        >
          {servicio.label}
        </button>
      ))}
    </div>
  );
}

export default ServiciosSelector;
