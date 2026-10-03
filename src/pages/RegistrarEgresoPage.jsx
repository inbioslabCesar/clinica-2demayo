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

function inferTurnoFromHora(hora) {
  if (typeof hora !== "string") return "mañana";
  const hh = Number(hora.slice(0, 2));
  if (!Number.isFinite(hh)) return "mañana";
  if (hh >= 6 && hh < 14) return "mañana";
  if (hh >= 14 && hh < 20) return "tarde";
  return "noche";
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
    turno: inferTurnoFromHora(hora),
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
    try {
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

      let data = null;
      try {
        data = await resp.json();
      } catch (_) {
        data = { success: false, error: `Respuesta invalida del servidor (${resp.status})` };
      }

      setLoading(false);
      if (data.success) {
        setShowForm(false);
        setEditId(null);
        setForm(getInitialForm());
        setIsCategoriaManual(false);
        if (egresosListRef.current && egresosListRef.current.fetchEgresos) {
          egresosListRef.current.fetchEgresos({ resetPage: true });
        }
      } else {
        alert(data.error || "No se pudo registrar el egreso");
      }
    } catch (err) {
      setLoading(false);
      alert("Error de conexion al registrar egreso");
      console.error("Error guardando egreso:", err);
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
      descripcion: egreso.descripcion || egreso.concepto || "",
      monto: egreso.monto || "",
      metodo_pago: egreso.metodo_pago || "efectivo",
      turno: egreso.turno || inferTurnoFromHora(normalizeTimeForInput(egreso.hora, defaults.hora)),
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
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-cyan-100 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="mb-5 rounded-3xl border border-cyan-100 bg-white/90 p-4 shadow-xl backdrop-blur sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-2xl text-white shadow-lg shadow-rose-200">
                💸
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Panel financiero</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Registro y Gestión de Egresos</h1>
                <p className="mt-1 text-sm text-slate-600">Controla gastos operativos, sueldos y pagos de servicios de la clínica.</p>
              </div>
            </div>
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:from-blue-700 hover:to-cyan-600 sm:w-auto"
              onClick={() => { setShowForm(true); setEditId(null); setForm(getInitialForm()); setIsCategoriaManual(false); }}
            >
              <span className="text-lg">➕</span> Registrar Egreso
            </button>
          </div>
        </div>

        {/* Modal para el formulario */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm">
            <div className="relative flex w-full max-h-[92vh] max-w-md flex-col overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:p-8">
              <button
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none"
                onClick={() => { setShowForm(false); setEditId(null); }}
                title="Cerrar"
                aria-label="Cerrar"
              >
                <span className="text-xl leading-none">×</span>
              </button>
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-xl text-white shadow-md shadow-blue-200">
                  {editId ? "✏️" : "💸"}
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">{editId ? "Editar registro" : "Nuevo registro"}</p>
                  <h2 className="text-lg font-bold text-slate-900 sm:text-xl">{editId ? "Editar Egreso" : "Registrar Egreso"}</h2>
                </div>
              </div>
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
        )}

        <EgresosList ref={egresosListRef} onEdit={handleEdit} />
      </div>
    </div>
  );
}
