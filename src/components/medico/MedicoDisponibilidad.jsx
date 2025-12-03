import { useEffect, useState } from "react";
import useDisponibilidadMedico from "../../hooks/useDisponibilidadMedico";

// Requiere que el id del médico esté disponible (por props o contexto de sesión)
function MedicoDisponibilidad({ medicoId }) {
  const {
    disponibilidad,
    loading,
    saveDisponibilidad,
    deleteDisponibilidad
  } = useDisponibilidadMedico(medicoId);

  const [form, setForm] = useState({ dia_semana: "lunes", hora_inicio: "08:00", hora_fin: "12:00" });
  const [editId, setEditId] = useState(null);

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    await saveDisponibilidad(form, editId);
    setForm({ dia_semana: "lunes", hora_inicio: "08:00", hora_fin: "12:00" });
    setEditId(null);
  };

  const handleEdit = d => {
    setForm({ dia_semana: d.dia_semana, hora_inicio: d.hora_inicio, hora_fin: d.hora_fin });
    setEditId(d.id);
  };

  const handleDelete = async id => {
    await deleteDisponibilidad(id);
  };

  return (
    <div className="max-w-xl mx-auto p-4">
      <h2 className="text-lg font-bold mb-2">Disponibilidad semanal</h2>
      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-2 mb-4">
        <select name="dia_semana" value={form.dia_semana} onChange={handleChange} className="border rounded px-1 py-0.5 md:px-2 md:py-1 text-xs md:text-sm">
          <option value="lunes">Lunes</option>
          <option value="martes">Martes</option>
          <option value="miércoles">Miércoles</option>
          <option value="jueves">Jueves</option>
          <option value="viernes">Viernes</option>
          <option value="sábado">Sábado</option>
          <option value="domingo">Domingo</option>
        </select>
        <input type="time" name="hora_inicio" value={form.hora_inicio} onChange={handleChange} className="border rounded px-1 py-0.5 md:px-2 md:py-1 text-xs md:text-sm" required />
        <input type="time" name="hora_fin" value={form.hora_fin} onChange={handleChange} className="border rounded px-1 py-0.5 md:px-2 md:py-1 text-xs md:text-sm" required />
        <button type="submit" className="bg-blue-600 text-white rounded px-1 py-0.5 md:px-4 md:py-1 font-bold text-xs md:text-sm">
          {editId ? "Actualizar" : "Agregar"}
        </button>
        {editId && (
          <button type="button" onClick={() => { setEditId(null); setForm({ dia_semana: "lunes", hora_inicio: "08:00", hora_fin: "12:00" }); }} className="bg-gray-400 text-white rounded px-1 py-0.5 md:px-4 md:py-1 font-bold text-xs md:text-sm">Cancelar</button>
        )}
      </form>
      {loading ? <div>Cargando...</div> : (
  <table className="w-full border text-xs md:text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th>Día</th>
              <th>Inicio</th>
              <th>Fin</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {disponibilidad.map(d => (
              <tr key={d.id}>
                <td className="px-1 py-0.5 md:px-2 md:py-1">{d.dia_semana}</td>
                <td className="px-1 py-0.5 md:px-2 md:py-1">{d.hora_inicio}</td>
                <td className="px-1 py-0.5 md:px-2 md:py-1">{d.hora_fin}</td>
                <td className="px-1 py-0.5 md:px-2 md:py-1 flex gap-1 md:gap-2">
                  <button onClick={() => handleEdit(d)} className="bg-yellow-400 text-white px-1 py-0.5 md:px-2 md:py-1 rounded text-xs md:text-sm">Editar</button>
                  <button onClick={() => handleDelete(d.id)} className="bg-red-500 text-white px-1 py-0.5 md:px-2 md:py-1 rounded text-xs md:text-sm">Eliminar</button>
                </td>
              </tr>
            ))}
            {disponibilidad.length === 0 && <tr><td colSpan={4} className="text-center">Sin disponibilidad registrada</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default MedicoDisponibilidad;
