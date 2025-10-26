import React, { useState } from "react";
import { BASE_URL } from "../config/config";

function PacienteForm({ initialData = {}, onRegistroExitoso }) {
  const [form, setForm] = useState({
    id: initialData.id || undefined,
    dni: initialData.dni || "",
    tipo_documento: initialData.tipo_documento || "dni", // nuevo campo
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
      tipo_documento: initialData.tipo_documento || "dni",
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
  // Validación en tiempo real para edad máxima
  React.useEffect(() => {
    if (form.edad_unidad === "años" && form.edad && Number(form.edad) > 150) {
      setError("La edad no puede superar los 150 años.");
    } else {
      setError("");
    }
  }, [form.edad, form.edad_unidad]);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "tipo_documento") {
      // Si cambia el tipo de documento y es "sin_documento", limpiar el campo dni
      setForm({
        ...form,
        tipo_documento: value,
        dni: value === "sin_documento" ? "" : form.dni,
      });
      return;
    }
    if (name === "dni" && form.tipo_documento === "sin_documento") {
      // No permitir edición manual si es sin documento
      return;
    }
    if (name === "fecha_nacimiento" && value) {
      const hoy = new Date();
      const fechaNac = new Date(value);
      let edad = "";
      let unidad = "años";
      // Calcular diferencia en milisegundos
      const diffMs = hoy - fechaNac;
      const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDias < 0) {
        edad = "";
      } else if (diffDias < 31) {
        edad = diffDias;
        unidad = "días";
      } else if (diffDias < 365) {
        // Calcular meses
        const diffMeses =
          (hoy.getFullYear() - fechaNac.getFullYear()) * 12 +
          hoy.getMonth() -
          fechaNac.getMonth();
        edad = diffMeses;
        unidad = "meses";
      } else {
        // Calcular años
        let diffAnios = hoy.getFullYear() - fechaNac.getFullYear();
        const m = hoy.getMonth() - fechaNac.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < fechaNac.getDate())) {
          diffAnios--;
        }
        edad = diffAnios;
        unidad = "años";
      }
      setForm({
        ...form,
        fecha_nacimiento: value,
        edad: edad,
        edad_unidad: unidad,
      });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    let formToSend = { ...form };
    // Validar según tipo de documento
    if (formToSend.tipo_documento === "dni") {
      if (!/^\d{8}$/.test(formToSend.dni)) {
        setError("El DNI debe tener exactamente 8 dígitos.");
        setLoading(false);
        return;
      }
    } else if (formToSend.tipo_documento === "carnet_extranjeria") {
      if (!/^\d{12}$/.test(formToSend.dni)) {
        setError("El Carnet de extranjería debe tener exactamente 12 dígitos.");
        setLoading(false);
        return;
      }
    } else if (formToSend.tipo_documento === "sin_documento") {
      // Genera un DNI provisional de 8 dígitos, por ejemplo: 99990001
      formToSend.dni = (99990000 + Math.floor(Math.random() * 100)).toString();
    }
    try {
      const res = await fetch(BASE_URL + "api_pacientes.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToSend),
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.paciente) {
        onRegistroExitoso(data.paciente);
      } else {
        setError(
          data.error ||
            (form.id
              ? "Error al actualizar paciente"
              : "Error al registrar paciente")
        );
      }
    } catch {
      setError(
        form.id
          ? "Error de conexión al actualizar"
          : "Error de conexión al registrar"
      );
    }
    setLoading(false);
  };

  return (
    <div>
      <h2
        className="text-2xl font-extrabold mb-6 flex items-center gap-3 justify-center bg-gradient-to-r from-purple-700 via-pink-500 to-blue-500 text-white rounded-xl shadow-lg py-4 px-6 animate__animated animate__fadeInDown"
        style={{ boxShadow: '0 4px 16px rgba(80,0,120,0.12)' }}
      >
        <svg
          className="w-8 h-8 text-white drop-shadow"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 7v4m0 4h.01"
          />
        </svg>
        {form.id ? "Editar Paciente" : "Registrar Nuevo Paciente"}
      </h2>
      {error && (
        <div className="mb-3 p-2 bg-red-100 text-red-700 rounded text-center font-semibold">
          {error}
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="space-y-4 bg-blue-50 p-4 rounded border border-blue-200 max-h-[70vh] overflow-y-auto"
      >
        {/* Sección: Información Básica */}
        <div className="bg-white rounded-lg p-4 border border-blue-300">
          <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center gap-2">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            Información Básica
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de documento
              </label>
              <select
                name="tipo_documento"
                value={form.tipo_documento}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="dni">DNI</option>
                <option value="carnet_extranjeria">Carnet de extranjería</option>
                <option value="sin_documento">Sin documento</option>
              </select>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {form.tipo_documento === "dni"
                  ? "DNI"
                  : form.tipo_documento === "carnet_extranjeria"
                  ? "Carnet de extranjería"
                  : "DNI Provisional"}
              </label>
              <input
                name="dni"
                value={form.dni}
                onChange={handleChange}
                placeholder={
                  form.tipo_documento === "dni"
                    ? "Documento de identidad (8 dígitos)"
                    : form.tipo_documento === "carnet_extranjeria"
                    ? "Carnet de extranjería (12 dígitos)"
                    : "Se genera automáticamente"
                }
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
                disabled={form.tipo_documento === "sin_documento"}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Historia Clínica{" "}
                <span className="text-xs text-gray-500">
                  (Se genera automáticamente si está vacío)
                </span>
              </label>
              <input
                name="historia_clinica"
                value={form.historia_clinica}
                onChange={handleChange}
                placeholder="HC##### (opcional - se genera automáticamente)"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre *
              </label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Apellido *
              </label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sexo *
              </label>
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
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Información de Edad
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de Nacimiento
              </label>
              <input
                name="fecha_nacimiento"
                value={form.fecha_nacimiento}
                onChange={handleChange}
                type="date"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Edad
              </label>
              <div className="flex gap-2">
                <input
                  name="edad"
                  value={form.edad}
                  onChange={handleChange}
                  placeholder="Edad"
                  type="number"
                  className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={!!form.fecha_nacimiento}
                />
                <select
                  name="edad_unidad"
                  value={form.edad_unidad}
                  onChange={handleChange}
                  className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={!!form.fecha_nacimiento}
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
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            Información Adicional
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Procedencia
              </label>
              <input
                name="procedencia"
                value={form.procedencia}
                onChange={handleChange}
                placeholder="Ciudad o lugar de procedencia"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dirección
              </label>
              <textarea
                name="direccion"
                value={form.direccion}
                onChange={handleChange}
                placeholder="Dirección completa del paciente"
                rows="2"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Seguro
              </label>
              <input
                name="tipo_seguro"
                value={form.tipo_seguro}
                onChange={handleChange}
                placeholder="Ej: SIS, EsSalud, Particular, etc."
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Sección: Contacto */}
        <div className="bg-white rounded-lg p-4 border border-blue-300">
          <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center gap-2">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
            Información de Contacto
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Teléfono
              </label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
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

        {/* Botón de envío */}
        <div className="sticky bottom-0 bg-blue-50 p-4 -mx-4 -mb-4 border-t border-blue-200">
          <button
            type="submit"
            className="w-full bg-purple-800 hover:bg-purple-900 text-white rounded-lg px-4 py-3 font-bold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                {form.id ? "Actualizando..." : "Registrando..."}
              </div>
            ) : form.id ? (
              "Actualizar Paciente"
            ) : (
              "Registrar Paciente"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default PacienteForm;
