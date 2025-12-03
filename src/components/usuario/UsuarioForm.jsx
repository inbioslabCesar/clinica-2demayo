import { useState } from "react";

const roles = [
  "administrador",
  "enfermero",
  "recepcionista",
  "laboratorista",
  "quimico"
];


function UsuarioForm({ initialData = {}, onSubmit, onCancel, loading }) {
  const esEdicion = !!initialData.id;
  const [form, setForm] = useState({
    usuario: initialData.usuario || "",
    nombre: initialData.nombre || "",
    dni: initialData.dni || "",
    profesion: initialData.profesion || "",
    rol: initialData.rol || "recepcionista",
    activo: initialData.activo !== undefined ? initialData.activo : 1,
    password: ""
  });
  const [error, setError] = useState("");

  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({
      ...f,
      [name]: type === "checkbox" ? (checked ? 1 : 0) : value
    }));
  };

  const handleSubmit = e => {
    e.preventDefault();
    if (!form.usuario || !form.nombre || !form.dni || !form.rol) {
      setError("Usuario, nombre, DNI y rol son obligatorios");
      return;
    }
    if (!esEdicion && !form.password) {
      setError("La contraseña es obligatoria al crear usuario");
      return;
    }
    setError("");
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
      <input name="usuario" value={form.usuario} onChange={handleChange} placeholder="Usuario" className="border rounded px-2 py-1" required />
      <input name="nombre" value={form.nombre} onChange={handleChange} placeholder="Nombre completo" className="border rounded px-2 py-1" required />
      <input name="dni" value={form.dni} onChange={handleChange} placeholder="DNI" className="border rounded px-2 py-1" required />
      <input name="profesion" value={form.profesion} onChange={handleChange} placeholder="Profesión" className="border rounded px-2 py-1" />
      <select name="rol" value={form.rol} onChange={handleChange} className="border rounded px-2 py-1" required>
        {roles.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
      </select>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="activo" checked={!!form.activo} onChange={handleChange} /> Activo
      </label>
      <input
        name="password"
        value={form.password}
        onChange={handleChange}
        placeholder="Contraseña"
        type="password"
        className="border rounded px-2 py-1 md:col-span-2"
        autoComplete="new-password"
        required={!esEdicion}
      />
      {esEdicion && (
        <div className="text-xs text-gray-500 md:col-span-2">Deja la contraseña vacía para no cambiarla.</div>
      )}
      {error && <div className="text-red-600 md:col-span-2">{error}</div>}
      <div className="flex gap-2 md:col-span-2">
        <button type="submit" className="bg-blue-600 text-white rounded px-4 py-2 font-bold" disabled={loading}>
          {esEdicion ? "Actualizar" : "Guardar"}
        </button>
        <button type="button" className="bg-gray-300 text-gray-800 rounded px-4 py-2 font-bold" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

export default UsuarioForm;
