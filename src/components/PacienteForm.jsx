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
      <input
        name="tipo_seguro"
        value={form.tipo_seguro}
        onChange={handleChange}
        placeholder="Tipo de seguro (opcional)"
        className="border rounded px-2 py-1 md:col-span-2"
      />
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
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-blue-50 p-4 rounded border border-blue-200"
    >
      <input
        name="dni"
        value={form.dni}
        onChange={handleChange}
        placeholder="DNI"
        className="border rounded px-2 py-1"
        required
      />
      <input
        name="historia_clinica"
        value={form.historia_clinica}
        onChange={handleChange}
        placeholder="Historia Clínica"
        className="border rounded px-2 py-1"
        required
      />
      <input
        name="nombre"
        value={form.nombre}
        onChange={handleChange}
        placeholder="Nombre"
        className="border rounded px-2 py-1"
        required
      />
      <input
        name="apellido"
        value={form.apellido}
        onChange={handleChange}
        placeholder="Apellido"
        className="border rounded px-2 py-1"
        required
      />
      <input
        name="fecha_nacimiento"
        value={form.fecha_nacimiento}
        onChange={handleChange}
        placeholder="Fecha de nacimiento"
        type="date"
        className="border rounded px-2 py-1"
      />
      <div className="flex gap-2 md:col-span-2">
        <input
          name="edad"
          value={form.edad}
          onChange={handleChange}
          placeholder="Edad"
          className="border rounded px-2 py-1 w-24"
        />
        <select
          name="edad_unidad"
          value={form.edad_unidad}
          onChange={handleChange}
          className="border rounded px-2 py-1"
        >
          <option value="días">Días</option>
          <option value="meses">Meses</option>
          <option value="años">Años</option>
        </select>
      </div>
      <input
        name="procedencia"
        value={form.procedencia}
        onChange={handleChange}
        placeholder="Procedencia"
        className="border rounded px-2 py-1 md:col-span-2"
      />
      <input
        name="tipo_seguro"
        value={form.tipo_seguro}
        onChange={handleChange}
        placeholder="Tipo de seguro Ejem:(sis, essalud)"
        className="border rounded px-2 py-1 md:col-span-2"
      />
      <select
        name="sexo"
        value={form.sexo}
        onChange={handleChange}
        className="border rounded px-2 py-1"
      >
        <option value="M">Masculino</option>
        <option value="F">Femenino</option>
        <option value="Otro">Otro</option>
      </select>
      <input
        name="direccion"
        value={form.direccion}
        onChange={handleChange}
        placeholder="Dirección"
        className="border rounded px-2 py-1 md:col-span-2"
      />
      <input
        name="telefono"
        value={form.telefono}
        onChange={handleChange}
        placeholder="Teléfono"
        className="border rounded px-2 py-1"
      />
      <input
        name="email"
        value={form.email}
        onChange={handleChange}
        placeholder="Email"
        className="border rounded px-2 py-1"
      />
      {error && <div className="text-red-600 md:col-span-2">{error}</div>}
      <button
        type="submit"
        className="bg-purple-800 text-white rounded px-4 py-2 font-bold md:col-span-2"
        disabled={loading}
      >
        {loading
          ? (form.id ? "Actualizando..." : "Registrando...")
          : (form.id ? "Actualizar Paciente" : "Registrar Paciente")}
      </button>
    </form>
  );
}

export default PacienteForm;
