import React, { useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "./DisponibilidadFormMedico.custom.css";

// Formulario para que el médico seleccione fechas y agregue uno o varios bloques de horario por fecha
function DisponibilidadFormMedico({ onSave, bloquesGuardados = [] }) {
  const [selectedDates, setSelectedDates] = useState([]); // array de fechas seleccionadas
  const [bloques, setBloques] = useState({}); // { fecha: [{hora_inicio, hora_fin}, ...] }
  // Modal de edición rápida
  const [modalFecha, setModalFecha] = useState(null); // fecha activa para modal, o null

  // Crear conjunto de fechas ya registradas en la base de datos
  const fechasRegistradas = new Set(bloquesGuardados.map(bloque => bloque.fecha));

  // Selección de fechas múltiples
  const toLocalYMD = (date) => {
    const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  };

  // Función para verificar si una fecha ya pasó
  const esFechaPasada = (dateString) => {
    const hoy = new Date();
    const fechaComparar = new Date(dateString);
    // Comparar solo las fechas, ignorando la hora
    hoy.setHours(0, 0, 0, 0);
    fechaComparar.setHours(0, 0, 0, 0);
    return fechaComparar < hoy;
  };
  const handleDateChange = (date) => {
    let dates = Array.isArray(date) ? date : [date];
    // Convertir a string YYYY-MM-DD en zona local
    dates = dates.map(d => toLocalYMD(d));
    
    // Filtrar fechas pasadas - no permitir seleccionar fechas que ya pasaron
    dates = dates.filter(fecha => !esFechaPasada(fecha));
    
    setSelectedDates(dates);
    // Inicializar bloques para nuevas fechas
    setBloques(prev => {
      const nuevo = { ...prev };
      dates.forEach(f => { if (!nuevo[f]) nuevo[f] = [{ hora_inicio: "08:00:00", hora_fin: "10:00:00" }]; });
      // Eliminar fechas quitadas
      Object.keys(nuevo).forEach(f => { if (!dates.includes(f)) delete nuevo[f]; });
      return nuevo;
    });
  };

  // Al hacer clic en un día, abrir modal de edición rápida
  const handleDayClick = (value) => {
    const fecha = toLocalYMD(value);
    
    // No permitir edición de fechas pasadas para nuevas disponibilidades
    if (esFechaPasada(fecha) && !fechasRegistradas.has(fecha)) {
      return; // Salir sin hacer nada si es una fecha pasada sin registros
    }
    
    setModalFecha(fecha);
    // Si la fecha no está en selectedDates y no es una fecha pasada, la agregamos
    if (!selectedDates.includes(fecha) && !esFechaPasada(fecha)) {
      setSelectedDates(prev => [...prev, fecha]);
      setBloques(prev => ({ ...prev, [fecha]: [{ hora_inicio: "08:00:00", hora_fin: "10:00:00" }] }));
    }
  };

  // Cambiar hora de un bloque
  const handleBloqueChange = (fecha, idx, campo, valor) => {
    setBloques(prev => {
      const nuevo = { ...prev };
      nuevo[fecha][idx][campo] = valor;
      return { ...nuevo };
    });
  };

  // Agregar bloque a una fecha
  const addBloque = (fecha) => {
    setBloques(prev => {
      const nuevo = { ...prev };
      nuevo[fecha] = [...nuevo[fecha], { hora_inicio: "08:00:00", hora_fin: "10:00:00" }];
      return nuevo;
    });
  };

  // Eliminar bloque de una fecha
  const removeBloque = (fecha, idx) => {
    setBloques(prev => {
      const nuevo = { ...prev };
      nuevo[fecha] = nuevo[fecha].filter((_, i) => i !== idx);
      return nuevo;
    });
  };

  // Guardar todos los bloques
  const handleSave = () => {
    // Generar array [{fecha, hora_inicio, hora_fin}]
    const bloquesArray = [];
    Object.entries(bloques).forEach(([fecha, arr]) => {
      arr.forEach(b => bloquesArray.push({ fecha, ...b }));
    });
    if (onSave) onSave(bloquesArray);
  };

  return (
    <div className="max-w-xl mx-auto p-4 border rounded shadow bg-white">
      <h2 className="font-bold text-lg mb-2 text-center">Definir Disponibilidad</h2>
      <div className="mb-4">
        <label className="block mb-1 font-semibold">Selecciona fechas:</label>
        <Calendar
          onChange={handleDateChange}
          value={selectedDates.length === 1 ? new Date(selectedDates[0]) : selectedDates.map(f => new Date(f))}
          selectRange={false}
          minDetail="month"
          maxDetail="month"
          allowPartialRange={false}
          showNeighboringMonth={false}
          locale="es-ES"
          selectMultiple
          tileClassName={({ date }) => {
            const ymd = toLocalYMD(date);
            let classes = [];
            if (selectedDates.includes(ymd)) classes.push('selected-multiple');
            if (bloques[ymd] && bloques[ymd].length > 0) classes.push('has-bloques');
            if (fechasRegistradas.has(ymd)) {
              if (esFechaPasada(ymd)) {
                classes.push('fecha-pasada');
              } else {
                classes.push('fecha-registrada');
              }
            }
            return classes.join(' ');
          }}
          onClickDay={handleDayClick}
        />
        
        {/* Leyenda de colores */}
        <div className="mt-3 p-2 bg-gray-50 rounded text-xs">
          <div className="font-semibold mb-1 text-gray-700">Leyenda:</div>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-100 border-2 border-green-500 rounded flex items-center justify-center">
                <span className="text-green-500 text-xs font-bold">✓</span>
              </div>
              <span>Ya registrado</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gray-100 border-2 border-gray-400 rounded flex items-center justify-center opacity-70">
                <span className="text-gray-500 text-xs font-bold">⏰</span>
              </div>
              <span>Consulta pasada</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-sky-400 rounded"></div>
              <span>Seleccionado</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded"></div>
              <span>Hoy</span>
            </div>
          </div>
        </div>
      </div>
      {selectedDates.length === 0 && <div className="text-gray-500 text-sm mb-2">Selecciona al menos una fecha en el calendario.</div>}
      {/* Modal de edición rápida de bloques para un día */}
      {modalFecha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] max-w-md relative">
            <button
              onClick={() => setModalFecha(null)}
              className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-xl font-bold"
              aria-label="Cerrar"
            >×</button>
            <div className="font-semibold mb-2 text-blue-700">Bloques para {modalFecha}</div>
            {bloques[modalFecha] && bloques[modalFecha].map((bloque, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-1">
                <input type="time" value={bloque.hora_inicio} onChange={e => handleBloqueChange(modalFecha, idx, "hora_inicio", e.target.value + ":00")}
                  className="border rounded px-2 py-1" step="1800" />
                <span>a</span>
                <input type="time" value={bloque.hora_fin} onChange={e => handleBloqueChange(modalFecha, idx, "hora_fin", e.target.value + ":00")}
                  className="border rounded px-2 py-1" step="1800" />
                <button type="button" onClick={() => removeBloque(modalFecha, idx)} className="text-red-600 hover:underline">Eliminar</button>
              </div>
            ))}
            <button type="button" onClick={() => addBloque(modalFecha)} className="text-blue-600 hover:underline text-sm mt-1">+ Agregar otro horario</button>
            <button onClick={() => setModalFecha(null)} className="bg-blue-600 text-white px-4 py-2 rounded font-bold w-full mt-4">Cerrar</button>
          </div>
        </div>
      )}
      {/* Renderizado clásico para fechas seleccionadas (opcional, puede ocultarse si solo se usa modal) */}
      {selectedDates.length > 0 && !modalFecha && selectedDates.map(fecha => (
        <div key={fecha} className="mb-4 border rounded p-2 bg-gray-50">
          <div className="font-semibold mb-1">{fecha}</div>
          {bloques[fecha].map((bloque, idx) => (
            <div key={idx} className="flex items-center gap-2 mb-1">
              <input type="time" value={bloque.hora_inicio} onChange={e => handleBloqueChange(fecha, idx, "hora_inicio", e.target.value + ":00")}
                className="border rounded px-2 py-1" step="1800" />
              <span>a</span>
              <input type="time" value={bloque.hora_fin} onChange={e => handleBloqueChange(fecha, idx, "hora_fin", e.target.value + ":00")}
                className="border rounded px-2 py-1" step="1800" />
              <button type="button" onClick={() => removeBloque(fecha, idx)} className="text-red-600 hover:underline">Eliminar</button>
            </div>
          ))}
          <button type="button" onClick={() => addBloque(fecha)} className="text-blue-600 hover:underline text-sm mt-1">+ Agregar otro horario</button>
        </div>
      ))}
      <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded font-bold w-full mt-2">Guardar Disponibilidad</button>
    </div>
  );
}

export default DisponibilidadFormMedico;
