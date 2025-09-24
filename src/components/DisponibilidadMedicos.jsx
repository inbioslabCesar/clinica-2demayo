import React, { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

function DisponibilidadMedicos() {
  const [medicos, setMedicos] = useState([]);
  const [disponibilidad, setDisponibilidad] = useState([]);
  const [consultas, setConsultas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [page, setPage] = useState(1);
  const [selectedDate, setSelectedDate] = useState(new Date());
    // --- Lógica de colores y uso de médicos, protegida y después de hooks ---
    const colorPalette = [
      '#22c55e', // verde
      '#3b82f6', // azul
      '#f59e42', // naranja
      '#e11d48', // rojo
      '#a21caf', // morado
      '#facc15', // amarillo
      '#0ea5e9', // celeste
      '#14b8a6', // teal
      '#6366f1', // indigo
      '#f472b6', // pink
    ];
    const medicosSafe = Array.isArray(medicos) ? medicos : [];
    const medicoColors = medicosSafe.reduce((acc, m, i) => {
      acc[m.id] = colorPalette[i % colorPalette.length];
      return acc;
    }, {});

    // (Eliminadas las declaraciones duplicadas)
  useEffect(() => {
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

  // Agrupar disponibilidad por fecha (YYYY-MM-DD)
  const disponibilidadPorFecha = {};
  disponibilidad.forEach(bloque => {
    if (bloque.fecha) {
      if (!disponibilidadPorFecha[bloque.fecha]) disponibilidadPorFecha[bloque.fecha] = [];
      disponibilidadPorFecha[bloque.fecha].push(bloque);
    }
  });
  function getBloquesParaFecha(date) {
    const yyyyMMdd = date.toISOString().slice(0, 10);
    // Buscar bloques con fecha exacta para ese día
    const bloquesFecha = disponibilidad.filter(b => b.fecha === yyyyMMdd);
    if (bloquesFecha.length > 0) {
      return bloquesFecha;
    }
    // Si no hay bloques con fecha exacta, buscar los recurrentes por día de semana
    const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const dia = dias[date.getDay()];
    return disponibilidad.filter(b => b.dia_semana === dia && !b.fecha);
  }
  const bloquesHoy = getBloquesParaFecha(selectedDate);
  const medicosHoy = medicosSafe.filter(medico => bloquesHoy.some(b => b.medico_id == medico.id));

  const texto = busqueda.trim().toLowerCase();

  // Filtrar bloques según búsqueda, y paginar por bloques
  let bloquesFiltrados = [];
  if (texto) {
    bloquesFiltrados = disponibilidad.filter(b => {
      const medico = medicosSafe.find(m => m.id == b.medico_id);
      if (!medico) return false;
      return (
        (medico.nombre && medico.nombre.toLowerCase().includes(texto)) ||
        (medico.especialidad && medico.especialidad.toLowerCase().includes(texto))
      );
    });
  } else {
    bloquesFiltrados = bloquesHoy;
  }

  // Ya no se usa paginación, se muestran todos los bloques filtrados
  const bloquesPagina = bloquesFiltrados;

  return (
    <div className="mb-6">
      <h3 className="font-bold text-lg mb-2 text-center">Disponibilidad de Médicos</h3>
      <div className="flex flex-col md:flex-row gap-4 mb-4 items-start">
        <Calendar
          onChange={setSelectedDate}
          value={selectedDate}
          className="border rounded shadow !text-base w-full max-w-xs md:!text-base md:w-[350px] md:h-[350px] !h-[320px] md:!h-[350px]"
          tileContent={({ date, view }) => {
            if (view !== 'month') return null;
            const bloques = getBloquesParaFecha(date);
            if (!bloques.length) return null;
            // Obtener médicos únicos para ese día
            const medicosUnicos = [...new Set(bloques.map(b => b.medico_id))];
            return (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
                {medicosUnicos.map((medicoId, i) => (
                  <span key={medicoId}
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: medicoColors[medicoId] || '#888',
                      marginLeft: i > 0 ? 2 : 0
                    }}
                  />
                ))}
              </div>
            );
          }}
        />
        <div className="flex-1 w-full">
          <div className="flex justify-end mb-2">
            <input
              type="text"
              placeholder="Buscar por nombre o especialidad..."
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setPage(1); }}
              className="border rounded px-3 py-1"
            />
          </div>
          {loading ? <div>Cargando...</div> : (
            <div className="overflow-x-auto" style={{ maxHeight: 260, minHeight: 80 }}>
              <table className="min-w-full text-[11px] md:text-sm border">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-1 py-0.5 md:px-2 md:py-1">Médico</th>
                    <th className="px-1 py-0.5 md:px-2 md:py-1">Especialidad</th>
                    <th className="px-1 py-0.5 md:px-2 md:py-1">Horario</th>
                    <th className="px-1 py-0.5 md:px-2 md:py-1">Cupos libres</th>
                  </tr>
                </thead>
                <tbody>
                  {bloquesPagina.map((bloque, i) => {
                    const medico = medicosSafe.find(m => m.id == bloque.medico_id);
                    if (!medico) return null;
                    let fechaBloque = bloque.fecha;
                    if (!fechaBloque && bloque.dia_semana) {
                      fechaBloque = bloque.dia_semana;
                    }
                    const horaIni = bloque.hora_inicio.split(":").map(Number);
                    const horaFin = bloque.hora_fin.split(":").map(Number);
                    let slots = 0;
                    let h = horaIni[0], m = horaIni[1];
                    while (h < horaFin[0] || (h === horaFin[0] && m < horaFin[1])) {
                      slots++;
                      m += 30;
                      if (m >= 60) { h++; m = 0; }
                    }
                    const agendadas = consultas.filter(c => c.medico_id == medico.id &&
                      (bloque.fecha ? c.fecha === bloque.fecha : true) &&
                      c.hora >= bloque.hora_inicio && c.hora < bloque.hora_fin && c.estado === 'pendiente');
                    const cupos = slots - agendadas.length;
                    return (
                      <tr key={bloque.medico_id + '-' + i} className={cupos > 0 ? "bg-green-50" : "bg-yellow-100"}>
                        <td className="px-0.5 py-0.5 md:px-2 md:py-1 font-bold" style={{ color: medicoColors[medico.id] || undefined }}>{medico.nombre}</td>
                        <td className="px-0.5 py-0.5 md:px-2 md:py-1">{medico.especialidad}</td>
                        <td className="px-0.5 py-0.5 md:px-2 md:py-1">{bloque.hora_inicio} - {bloque.hora_fin} {fechaBloque ? <span className="text-xs text-gray-500 ml-1">({fechaBloque})</span> : null}</td>
                        <td className="px-0.5 py-0.5 md:px-2 md:py-1 font-bold">{cupos > 0 ? cupos : 'Sin cupos'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Sin paginación, solo scroll interno */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DisponibilidadMedicos;
