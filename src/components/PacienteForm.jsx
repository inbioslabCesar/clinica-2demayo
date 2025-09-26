import React, { useState } from "react";
import { BASE_URL } from "../config/config";

function PacienteForm({ initialData = {}, onRegistroExitoso }) {
  const [form, setForm] = useState({
    id: initialData.id || undefined,
    dni: initialData.dni || "",
    nombre: initialData.nombre || "",
    apellido: initialData.apellido || "",
    historia_clinica: initialData.historia_clinica || "",
    fecha_nacimiento: initialData.fecha_nacimiento || "",
    edad: initialData.edad || "",
    edad_unidad: initialData.edad_unidad || "años",
    procedencia: initialData.procedencia || "",
    tipo_seguro: initialData.tipo_seguro || "",
    sexo: initialData.sexo || "M",
    direccion: initialData.direccion || "",
    telefono: initialData.telefono || "",
    email: initialData.email || "",
  });

  React.useEffect(() => {
    setForm({
      id: initialData.id || undefined,
      dni: initialData.dni || "",
      nombre: initialData.nombre || "",
      apellido: initialData.apellido || "",
      historia_clinica: initialData.historia_clinica || "",
      fecha_nacimiento: initialData.fecha_nacimiento || "",
      edad: initialData.edad || "",
      edad_unidad: initialData.edad_unidad || "años",
      procedencia: initialData.procedencia || "",
      tipo_seguro: initialData.tipo_seguro || "",
      sexo: initialData.sexo || "M",
      direccion: initialData.direccion || "",
      telefono: initialData.telefono || "",
      email: initialData.email || "",
    });
  }, [initialData]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        BASE_URL + "api_pacientes.php",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json();
      if (data.success && data.paciente) {
        onRegistroExitoso(data.paciente);
      } else {
        setError(data.error || (form.id ? "Error al actualizar paciente" : "Error al registrar paciente"));
      }
    } catch {
      setError(form.id ? "Error de conexión al actualizar" : "Error de conexión al registrar");
    }
    setLoading(false);
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-purple-800 mb-4">
        {form.id ? "Editar Paciente" : "Registrar Nuevo Paciente"}
      </h2>
      
      <form
        onSubmit={handleSubmit}
        className="space-y-4 bg-blue-50 p-4 rounded border border-blue-200 max-h-[70vh] overflow-y-auto"
      >
        {/* Sección: Información Básica */}
        <div className="bg-white rounded-lg p-4 border border-blue-300">
          <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Información Básica
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">DNI *</label>
              <input
                name="dni"
                value={form.dni}
                onChange={handleChange}
                placeholder="Documento de identidad"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Historia Clínica *</label>
              <input
                name="historia_clinica"
                value={form.historia_clinica}
                onChange={handleChange}
                placeholder="Número de historia clínica"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                name="nombre"
                value={form.nombre}
                onChange={handleChange}
                placeholder="Nombres del paciente"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Apellido *</label>
              <input
                name="apellido"
                value={form.apellido}
                onChange={handleChange}
                placeholder="Apellidos del paciente"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sexo *</label>
              <select
                name="sexo"
                value={form.sexo}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
          </div>
        </div>

        {/* Sección: Datos de Edad */}
        <div className="bg-white rounded-lg p-4 border border-blue-300">
          <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Información de Edad
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Nacimiento</label>
              <input
                name="fecha_nacimiento"
                value={form.fecha_nacimiento}
                onChange={handleChange}
                type="date"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Edad</label>
              <div className="flex gap-2">
                <input
                  name="edad"
                  value={form.edad}
                  onChange={handleChange}
                  placeholder="Edad"
                  type="number"
                  className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <select
                  name="edad_unidad"
                  value={form.edad_unidad}
                  onChange={handleChange}
                  className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="días">Días</option>
                  <option value="meses">Meses</option>
                  <option value="años">Años</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Sección: Información Adicional */}
        <div className="bg-white rounded-lg p-4 border border-blue-300">
          <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            Información Adicional
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Procedencia</label>
              <input
                name="procedencia"
                value={form.procedencia}
                onChange={handleChange}
                placeholder="Ciudad o lugar de procedencia"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Seguro</label>
              <input
                name="tipo_seguro"
                value={form.tipo_seguro}
                onChange={handleChange}
                placeholder="Ej: SIS, EsSalud, Particular, etc."
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
              <textarea
                name="direccion"
                value={form.direccion}
                onChange={handleChange}
                placeholder="Dirección completa del paciente"
                rows="2"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Sección: Contacto */}
        <div className="bg-white rounded-lg p-4 border border-blue-300">
          <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Información de Contacto
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input
                name="telefono"
                value={form.telefono}
                onChange={handleChange}
                placeholder="Número de contacto"
                type="tel"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="Correo electrónico"
                type="email"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Mensaje de error */}
        {error && (
          <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-3 rounded-lg">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          </div>
        )}

        {/* Botón de envío */}
        <div className="sticky bottom-0 bg-blue-50 p-4 -mx-4 -mb-4 border-t border-blue-200">
          <button
            type="submit"
            className="w-full bg-purple-800 hover:bg-purple-900 text-white rounded-lg px-4 py-3 font-bold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {form.id ? "Actualizando..." : "Registrando..."}
              </div>
            ) : (
              form.id ? "Actualizar Paciente" : "Registrar Paciente"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default PacienteForm;
