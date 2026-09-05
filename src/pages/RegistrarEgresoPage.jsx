import React, { useState, useRef } from "react";
import RegistrarEgresoForm from "../components/egresos/RegistrarEgresoForm";
import EgresosList from "../components/egresos/EgresosList";
import { authFetch } from "../utils/apiClient";

const CATEGORIA_KEYWORDS = {
  pasaje: ["pasaje", "movilidad", "taxi", "moto", "mototaxi", "bus", "micro", "combi", "transporte", "peaje"],
  servicios: ["servicio", "luz", "agua", "internet", "telefono", "recarga", "alquiler", "mantenimiento", "limpieza"],
  sueldo: ["sueldo", "planilla", "salario", "remuneracion", "pago personal", "trabajador", "colaborador"],
};

function normalizeText(value) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferCategoriaFromDescripcion(descripcion) {
  const text = normalizeText(descripcion);
  if (!text) return "";

  for (const [categoria, keywords] of Object.entries(CATEGORIA_KEYWORDS)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return categoria;
    }
  }

  return "otros";
}

function inferTipoEgresoFromCategoria(categoria) {
  return categoria === "otros" ? "otros" : "operativo";
}

function getLimaNowStrings() {
  const now = new Date();
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const hora = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return { fecha, hora };
}

function getInitialForm() {
  const { fecha, hora } = getLimaNowStrings();
  return {
    fecha,
    hora,
    tipo_egreso: "operativo",
    categoria: "",
    descripcion: "",
    monto: "",
    metodo_pago: "efectivo",
    turno: "",
    estado: "pagado",
    caja_id: "",
    observaciones: "",
  };
}

function normalizeTimeForInput(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.length >= 5 ? trimmed.slice(0, 5) : fallback;
}

export default function RegistrarEgresoPage() {
  const egresosListRef = useRef();
  const [form, setForm] = useState(getInitialForm);
  const [isCategoriaManual, setIsCategoriaManual] = useState(false);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = e => {
    const { name, value } = e.target;

    if (name === "descripcion") {
      setForm(prev => {
        const next = { ...prev, descripcion: value };
        if (!isCategoriaManual) {
          next.categoria = inferCategoriaFromDescripcion(value);
          next.tipo_egreso = inferTipoEgresoFromCategoria(next.categoria || "otros");
        }
        return next;
      });
      return;
    }

    if (name === "categoria") {
      setIsCategoriaManual(value !== "");
      setForm(prev => {
        const categoria = value;
        return {
          ...prev,
          categoria,
          tipo_egreso: inferTipoEgresoFromCategoria(categoria || "otros"),
        };
      });
      return;
    }

    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    let url = `api_egresos.php`;
    let method = "POST";
    if (editId) {
      url += `?id=${editId}`;
      method = "PUT";
    }
    const resp = await authFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify((() => {
        const categoriaResuelta = form.categoria || inferCategoriaFromDescripcion(form.descripcion) || "otros";
        return {
          ...form,
          categoria: categoriaResuelta,
          tipo_egreso: inferTipoEgresoFromCategoria(categoriaResuelta),
        };
      })()),
    });
    const data = await resp.json();
    setLoading(false);
    if (data.success) {
      // Eliminado alert de éxito en producción
      setShowForm(false);
      setEditId(null);
      setForm(getInitialForm());
      setIsCategoriaManual(false);
      if (egresosListRef.current && egresosListRef.current.fetchEgresos) {
        egresosListRef.current.fetchEgresos();
      }
    } else {
      // Eliminado alert de error en producción
    }
  };

  const [showForm, setShowForm] = useState(false);

  const handleEdit = egreso => {
    const defaults = getInitialForm();
    setForm({
      fecha: egreso.fecha || defaults.fecha,
      hora: normalizeTimeForInput(egreso.hora, defaults.hora),
      tipo_egreso: egreso.tipo_egreso || inferTipoEgresoFromCategoria(egreso.categoria || "otros"),
      categoria: egreso.categoria || "",
      descripcion: egreso.descripcion || "",
      monto: egreso.monto || "",
      metodo_pago: egreso.metodo_pago || "efectivo",
      turno: egreso.turno || "",
      estado: egreso.estado || "pagado",
      caja_id: egreso.caja_id || "",
      observaciones: egreso.observaciones || "",
    });
    setIsCategoriaManual(true);
    setEditId(egreso.id);
    setShowForm(true);
  };

  const categoriaSugerida = inferCategoriaFromDescripcion(form.descripcion);

  const usarCategoriaSugerida = () => {
    if (!categoriaSugerida) return;
    setForm(prev => ({
      ...prev,
      categoria: categoriaSugerida,
      tipo_egreso: inferTipoEgresoFromCategoria(categoriaSugerida),
    }));
    setIsCategoriaManual(false);
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
          onClick={() => { setShowForm(true); setEditId(null); setForm(getInitialForm()); setIsCategoriaManual(false); }}
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
                categoriaSugerida={categoriaSugerida}
                isCategoriaManual={isCategoriaManual}
                onUseCategoriaSugerida={usarCategoriaSugerida}
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
