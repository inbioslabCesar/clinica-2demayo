import React, { useState, useRef } from "react";
import EgresosList from "../components/EgresosList";
import { useNavigate } from "react-router-dom";

export default function RegistrarEgresoPage() {
  const egresosListRef = useRef();
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    hora: new Date().toLocaleTimeString().slice(0, 5),
    tipo_egreso: "",
    categoria: "",
    descripcion: "",
    monto: "",
    metodo_pago: "efectivo",
    turno: "",
    estado: "pagado",
    caja_id: "",
    observaciones: "",
  });
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    let url = "/api_egresos.php";
    let method = "POST";
    if (editId) {
      url += `?id=${editId}`;
      method = "PUT";
    }
    const resp = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await resp.json();
    setLoading(false);
    if (data.success) {
      alert(editId ? "Egreso actualizado correctamente" : "Egreso registrado correctamente");
      setShowForm(false);
      setEditId(null);
      setForm({
        fecha: new Date().toISOString().slice(0, 10),
        hora: new Date().toLocaleTimeString().slice(0, 5),
        tipo_egreso: "",
        categoria: "",
        descripcion: "",
        monto: "",
        metodo_pago: "efectivo",
        turno: "",
        estado: "pagado",
        caja_id: "",
        observaciones: "",
      });
      if (egresosListRef.current && egresosListRef.current.fetchEgresos) {
        egresosListRef.current.fetchEgresos();
      }
    } else {
      alert(data.error || "Error al registrar egreso");
    }
  };

  const [showForm, setShowForm] = useState(false);

  const handleEdit = egreso => {
    setForm({
      fecha: egreso.fecha || new Date().toISOString().slice(0, 10),
      hora: egreso.hora || new Date().toLocaleTimeString().slice(0, 5),
      tipo_egreso: egreso.tipo_egreso || "",
      categoria: egreso.categoria || "",
      descripcion: egreso.descripcion || "",
      monto: egreso.monto || "",
      metodo_pago: egreso.metodo_pago || "efectivo",
      turno: egreso.turno || "",
      estado: egreso.estado || "pagado",
      caja_id: egreso.caja_id || "",
      observaciones: egreso.observaciones || "",
    });
    setEditId(egreso.id);
    setShowForm(true);
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto p-6">
      <div className="flex justify-center mt-8 mb-4">
        <button
          className="bg-blue-600 text-white px-6 py-3 rounded shadow hover:bg-blue-700 font-semibold text-lg"
          onClick={() => { setShowForm(true); setEditId(null); setForm({
            fecha: new Date().toISOString().slice(0, 10),
            hora: new Date().toLocaleTimeString().slice(0, 5),
            tipo_egreso: "",
            categoria: "",
            descripcion: "",
            monto: "",
            metodo_pago: "efectivo",
            turno: "",
            estado: "pagado",
            caja_id: "",
            observaciones: "",
          }); }}
        >
          Registrar Egreso
        </button>
      </div>
      {/* Modal para el formulario */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="max-w-lg w-full p-6 bg-white rounded shadow relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 text-xl font-bold"
              onClick={() => { setShowForm(false); setEditId(null); }}
              title="Cerrar"
            >
              ×
            </button>
            <h2 className="text-xl font-bold mb-4">{editId ? "Editar Egreso" : "Registrar Egreso"}</h2>
            <form onSubmit={handleSubmit}>
              <input name="monto" type="number" required placeholder="Monto" value={form.monto} onChange={handleChange} className="input mb-2 w-full" />
              <input name="descripcion" required placeholder="Descripción" value={form.descripcion} onChange={handleChange} className="input mb-2 w-full" />
              <select name="categoria" required value={form.categoria} onChange={handleChange} className="input mb-2 w-full">
                <option value="">Categoría</option>
                <option value="pasaje">Pasaje</option>
                <option value="servicios">Pago de servicios</option>
                <option value="sueldo">Pago de sueldo</option>
                <option value="otros">Otros</option>
              </select>
              <select name="tipo_egreso" required value={form.tipo_egreso} onChange={handleChange} className="input mb-2 w-full">
                <option value="">Tipo de Egreso</option>
                <option value="operativo">Operativo</option>
                <option value="otros">Otros</option>
              </select>
              <select name="turno" required value={form.turno} onChange={handleChange} className="input mb-2 w-full">
                <option value="">Turno</option>
                <option value="mañana">Mañana</option>
                <option value="tarde">Tarde</option>
                <option value="noche">Noche</option>
              </select>
              <select name="metodo_pago" required value={form.metodo_pago} onChange={handleChange} className="input mb-2 w-full">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="yape">Yape</option>
                <option value="plin">Plin</option>
              </select>
              <input name="fecha" type="date" required value={form.fecha} onChange={handleChange} className="input mb-2 w-full" />
              <input name="hora" type="time" required value={form.hora} onChange={handleChange} className="input mb-2 w-full" />
              <textarea name="observaciones" placeholder="Observaciones" value={form.observaciones} onChange={handleChange} className="input mb-2 w-full" />
              <button type="submit" className="btn btn-primary w-full" disabled={loading}>{editId ? "Actualizar" : "Registrar"}</button>
            </form>
          </div>
        </div>
      )}
      <div className="mt-8">
        <EgresosList ref={egresosListRef} onEdit={handleEdit} />
      </div>
    </div>
  );
}
