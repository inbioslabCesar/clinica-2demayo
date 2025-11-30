import React, { useState, useRef } from "react";
import RegistrarEgresoForm from "../components/egresos/RegistrarEgresoForm";
import EgresosList from "../components/EgresosList";

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
      credentials: "include",
      body: JSON.stringify(form),
    });
    const data = await resp.json();
    setLoading(false);
    if (data.success) {
      // Eliminado alert de éxito en producción
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
      // Eliminado alert de error en producción
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
    <div className="w-full max-w-[1600px] mx-auto px-2 sm:px-6 py-4">
      <h1 className="text-xl sm:text-2xl font-bold text-blue-800 text-center mb-6 flex items-center justify-center gap-2">
        <span className="inline-block bg-blue-100 text-blue-700 rounded-full p-2 text-2xl">💸</span>
        Registro y Gestión de Egresos
      </h1>
      <div className="flex flex-col sm:flex-row justify-center items-stretch sm:items-center gap-2 sm:gap-4 mt-8 mb-4">
        <button
          className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 sm:px-6 sm:py-3 rounded shadow hover:bg-blue-700 font-semibold text-base sm:text-lg transition"
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
          <span className="inline-block mr-2">➕</span> Registrar Egreso
        </button>
      </div>
      {/* Modal para el formulario */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-2">
          <div className="w-full max-w-md sm:max-w-lg bg-white rounded-xl shadow-lg relative p-4 sm:p-8 flex flex-col">
            <button
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 text-2xl font-bold focus:outline-none"
              onClick={() => { setShowForm(false); setEditId(null); }}
              title="Cerrar"
              aria-label="Cerrar"
            >
              ×
            </button>
            <h2 className="text-lg sm:text-2xl font-bold mb-4 text-blue-700 text-center">{editId ? "Editar Egreso" : "Registrar Egreso"}</h2>
            <div className="flex flex-col gap-2">
              <RegistrarEgresoForm
                form={form}
                onChange={handleChange}
                onSubmit={handleSubmit}
                loading={loading}
                editId={editId}
              />
            </div>
          </div>
        </div>
      )}
      <div className="mt-8">
        <EgresosList ref={egresosListRef} onEdit={handleEdit} />
      </div>
    </div>
  );
}
