import React, { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { BASE_URL } from "../config/config";

const ESTADOS = ["borrador", "activo", "inactivo", "archivado"];
const SERVICE_TYPES = ["consulta", "ecografia", "rayosx", "procedimiento", "operacion", "laboratorio", "farmacia"];

const EMPTY_PLANTILLA = {
  id: 0,
  codigo: "",
  nombre: "",
  descripcion: "",
  estado: "borrador",
  duracion_dias: "",
  pago_unico_monto: 0,
  dias_anticipacion_liquidacion: 7,
  items: [],
};

const EMPTY_ITEM = {
  servicio_tipo: "consulta",
  servicio_id: "",
  servicio_search: "",
  descripcion_snapshot: "",
  medico_nombre_completo: "",
  precio_particular: "",
  fuente: "",
  cantidad_incluida: 1,
  orden_programado: 1,
  regla_uso: "programado",
  offset_tipo: "ninguno",
  offset_valor: 0,
  offset_unidad: "semanas",
};

const EMPTY_CONTRATO = {
  id: 0,
  paciente_id: "",
  plantilla_id: "",
  fecha_inicio: "",
  fecha_fin: "",
  monto_total: "",
  saldo_pendiente: "",
  dias_anticipacion_liquidacion: 7,
  anchor_tipo: "ninguno",
  anchor_fecha: "",
  estado: "activo",
  observaciones: "",
};

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function formatMoney(v) {
  const amount = n(v);
  if (amount <= 0) return "-";
  return `S/ ${amount.toFixed(2)}`;
}

export default function ContratosPage() {
  const [q, setQ] = useState("");
  const [qAplicado, setQAplicado] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [estadoFilterAplicado, setEstadoFilterAplicado] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagePlantilla, setPagePlantilla] = useState(1);
  const [limitPlantilla, setLimitPlantilla] = useState(10);
  const [totalPlantillas, setTotalPlantillas] = useState(0);
  const [form, setForm] = useState(EMPTY_PLANTILLA);
  const [itemDraft, setItemDraft] = useState(EMPTY_ITEM);
  const [saving, setSaving] = useState(false);
  const [catalogRows, setCatalogRows] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [formContrato, setFormContrato] = useState(EMPTY_CONTRATO);
  const [savingContrato, setSavingContrato] = useState(false);
  const [regenerarAgenda, setRegenerarAgenda] = useState(true);
  const [pacienteSearch, setPacienteSearch] = useState("");
  const [pacienteResultados, setPacienteResultados] = useState([]);
  const [loadingPacientes, setLoadingPacientes] = useState(false);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [mostrarResultadosPaciente, setMostrarResultadosPaciente] = useState(false);
  const [contratos, setContratos] = useState([]);
  const [qContrato, setQContrato] = useState("");
  const [qContratoAplicado, setQContratoAplicado] = useState("");
  const [pageContrato, setPageContrato] = useState(1);
  const [limitContrato, setLimitContrato] = useState(10);
  const [totalContratos, setTotalContratos] = useState(0);
  const [loadingContratos, setLoadingContratos] = useState(false);

  const totalItems = useMemo(() => (Array.isArray(form.items) ? form.items.length : 0), [form.items]);
  const totalPagesPlantillas = useMemo(() => Math.max(1, Math.ceil(n(totalPlantillas) / Math.max(1, n(limitPlantilla)))), [limitPlantilla, totalPlantillas]);
  const totalPagesContratos = useMemo(() => Math.max(1, Math.ceil(n(totalContratos) / Math.max(1, n(limitContrato)))), [limitContrato, totalContratos]);

  const loadPlantillas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("accion", "plantillas");
      params.set("include_items", "1");
      params.set("page", String(pagePlantilla));
      params.set("limit", String(limitPlantilla));
      if (qAplicado.trim()) params.set("q", qAplicado.trim());
      if (estadoFilterAplicado) params.set("estado", estadoFilterAplicado);

      const res = await fetch(`${BASE_URL}api_contratos.php?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo cargar plantillas");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotalPlantillas(Number(data.total || 0));
    } catch (err) {
      Swal.fire("Error", err?.message || "No se pudo cargar plantillas", "error");
      setTotalPlantillas(0);
    } finally {
      setLoading(false);
    }
  }, [estadoFilterAplicado, limitPlantilla, pagePlantilla, qAplicado]);

  const loadContratos = useCallback(async () => {
    setLoadingContratos(true);
    try {
      const params = new URLSearchParams();
      params.set("accion", "contratos_paciente");
      params.set("page", String(pageContrato));
      params.set("limit", String(limitContrato));
      if (String(qContratoAplicado || "").trim()) params.set("q", String(qContratoAplicado).trim());

      const res = await fetch(`${BASE_URL}api_contratos.php?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo cargar contratos");
      setContratos(Array.isArray(data.rows) ? data.rows : []);
      setTotalContratos(Number(data.total || 0));
    } catch {
      setContratos([]);
      setTotalContratos(0);
    } finally {
      setLoadingContratos(false);
    }
  }, [limitContrato, pageContrato, qContratoAplicado]);

  useEffect(() => {
    loadPlantillas();
  }, [loadPlantillas]);

  useEffect(() => {
    loadContratos();
  }, [loadContratos]);

  const buscarPacientes = useCallback(async (termino) => {
    const qPaciente = String(termino || "").trim();
    if (qPaciente.length < 2) {
      setPacienteResultados([]);
      return;
    }

    setLoadingPacientes(true);
    try {
      const params = new URLSearchParams();
      params.set("busqueda", qPaciente);
      params.set("page", "1");
      params.set("limit", "8");

      const res = await fetch(`${BASE_URL}api_pacientes.php?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo buscar pacientes");
      setPacienteResultados(Array.isArray(data.pacientes) ? data.pacientes : []);
    } catch {
      setPacienteResultados([]);
    } finally {
      setLoadingPacientes(false);
    }
  }, []);

  useEffect(() => {
    if (!mostrarResultadosPaciente) return;
    const handle = setTimeout(() => {
      buscarPacientes(pacienteSearch);
    }, 250);
    return () => clearTimeout(handle);
  }, [buscarPacientes, mostrarResultadosPaciente, pacienteSearch]);

  const buscarCatalogoServicios = useCallback(async (tipo, qSearch = "") => {
    const servicioTipo = String(tipo || "").trim().toLowerCase();
    const termino = String(qSearch || "").trim();
    if (!servicioTipo) {
      setCatalogRows([]);
      return;
    }

    // Evita cargas masivas: para tipos con alto volumen exigimos criterio minimo.
    if (termino.length < 2) {
      setCatalogRows([]);
      Swal.fire("Atencion", "Escribe al menos 2 caracteres para buscar el servicio", "warning");
      return;
    }

    setCatalogLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("accion", "catalogo_servicios");
      params.set("servicio_tipo", servicioTipo);
      params.set("limit", "12");
      params.set("q", termino);

      const res = await fetch(`${BASE_URL}api_contratos.php?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo cargar catalogo");
      setCatalogRows(Array.isArray(data.rows) ? data.rows : []);
    } catch {
      setCatalogRows([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const addItem = () => {
    if (!String(itemDraft.descripcion_snapshot || "").trim()) {
      Swal.fire("Atencion", "Descripcion del item requerida", "warning");
      return;
    }
    if (n(itemDraft.servicio_id) <= 0) {
      Swal.fire("Atencion", "Servicio ID debe ser mayor a 0", "warning");
      return;
    }
    const next = {
      ...itemDraft,
      servicio_id: n(itemDraft.servicio_id),
      medico_nombre_completo: String(itemDraft.medico_nombre_completo || "").trim(),
      precio_particular: n(itemDraft.precio_particular),
      fuente: String(itemDraft.fuente || "").trim(),
      cantidad_incluida: Math.max(0.01, n(itemDraft.cantidad_incluida)),
      orden_programado: Math.max(1, n(itemDraft.orden_programado || totalItems + 1)),
      offset_tipo: itemDraft.offset_tipo || "ninguno",
      offset_valor: Math.max(0, n(itemDraft.offset_valor)),
      offset_unidad: itemDraft.offset_unidad || "semanas",
    };
    setForm((prev) => ({ ...prev, items: [...(prev.items || []), next] }));
    setItemDraft({ ...EMPTY_ITEM, orden_programado: totalItems + 2 });
    setCatalogRows([]);
  };

  const removeItem = (idx) => {
    setForm((prev) => ({ ...prev, items: (prev.items || []).filter((_, i) => i !== idx) }));
  };

  const savePlantilla = async () => {
    if (!String(form.nombre || "").trim()) {
      Swal.fire("Atencion", "Nombre requerido", "warning");
      return;
    }
    if (!Array.isArray(form.items) || form.items.length === 0) {
      Swal.fire("Atencion", "Agrega al menos un item", "warning");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        accion: "guardar_plantilla",
        ...form,
        duracion_dias: n(form.duracion_dias),
        pago_unico_monto: n(form.pago_unico_monto),
        dias_anticipacion_liquidacion: Math.max(1, n(form.dias_anticipacion_liquidacion)),
      };

      const res = await fetch(`${BASE_URL}api_contratos.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo guardar plantilla");

      Swal.fire("Listo", "Plantilla guardada", "success");
      setForm(EMPTY_PLANTILLA);
      setItemDraft(EMPTY_ITEM);
      setPagePlantilla(1);
      loadPlantillas();
    } catch (err) {
      Swal.fire("Error", err?.message || "No se pudo guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  const editPlantilla = (row) => {
    setForm({
      id: Number(row.id || 0),
      codigo: row.codigo || "",
      nombre: row.nombre || "",
      descripcion: row.descripcion || "",
      estado: row.estado || "borrador",
      duracion_dias: n(row.duracion_dias),
      pago_unico_monto: n(row.pago_unico_monto),
      dias_anticipacion_liquidacion: Math.max(1, n(row.dias_anticipacion_liquidacion || 7)),
      items: Array.isArray(row.items) ? row.items : [],
    });
  };

  const cambiarEstadoPlantilla = async (id, estado) => {
    try {
      const res = await fetch(`${BASE_URL}api_contratos.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "estado_plantilla", id, estado }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo cambiar estado");
      setPagePlantilla(1);
      loadPlantillas();
    } catch (err) {
      Swal.fire("Error", err?.message || "No se pudo cambiar estado", "error");
    }
  };

  const saveContratoPaciente = async () => {
    if (n(formContrato.paciente_id) <= 0 || n(formContrato.plantilla_id) <= 0) {
      Swal.fire("Atencion", "Paciente ID y Plantilla son obligatorios", "warning");
      return;
    }
    if (!formContrato.fecha_inicio || !formContrato.fecha_fin) {
      Swal.fire("Atencion", "Fecha inicio y fin son obligatorias", "warning");
      return;
    }

    setSavingContrato(true);
    try {
      const payload = {
        accion: "guardar_contrato_paciente",
        ...formContrato,
        regenerar_agenda: regenerarAgenda ? 1 : 0,
        paciente_id: n(formContrato.paciente_id),
        plantilla_id: n(formContrato.plantilla_id),
        monto_total: n(formContrato.monto_total),
        saldo_pendiente: formContrato.saldo_pendiente === "" ? n(formContrato.monto_total) : n(formContrato.saldo_pendiente),
        dias_anticipacion_liquidacion: Math.max(0, n(formContrato.dias_anticipacion_liquidacion)),
        anchor_tipo: formContrato.anchor_tipo || "ninguno",
        anchor_fecha: (formContrato.anchor_tipo !== "ninguno" && formContrato.anchor_fecha) ? formContrato.anchor_fecha : null,
      };

      const res = await fetch(`${BASE_URL}api_contratos.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo guardar contrato");

      const agendaMsg = Number(data?.agenda_insertada || 0) > 0
        ? ` y ${Number(data.agenda_insertada)} eventos de agenda generados`
        : "";
      Swal.fire("Listo", `Contrato de paciente guardado${agendaMsg}`, "success");
      setFormContrato(EMPTY_CONTRATO);
      setPacienteSearch("");
      setPacienteResultados([]);
      setPacienteSeleccionado(null);
      setMostrarResultadosPaciente(false);
      setPageContrato(1);
      loadContratos();
    } catch (err) {
      Swal.fire("Error", err?.message || "No se pudo guardar contrato", "error");
    } finally {
      setSavingContrato(false);
    }
  };

  const editarContratoPaciente = (row) => {
    const nombre = String(row?.paciente_nombre || "").trim();
    const apellido = String(row?.paciente_apellido || "").trim();
    const full = `${nombre} ${apellido}`.trim();
    setFormContrato({
      id: Number(row?.id || 0),
      paciente_id: String(row?.paciente_id || ""),
      plantilla_id: String(row?.plantilla_id || ""),
      fecha_inicio: row?.fecha_inicio || "",
      fecha_fin: row?.fecha_fin || "",
      monto_total: String(row?.monto_total ?? ""),
      saldo_pendiente: String(row?.saldo_pendiente ?? ""),
      dias_anticipacion_liquidacion: (() => {
        const fechaFin = String(row?.fecha_fin || "").trim();
        const fechaLimite = String(row?.fecha_limite_liquidacion || "").trim();
        if (!fechaFin || !fechaLimite) return 7;
        const fin = new Date(`${fechaFin}T00:00:00`);
        const limite = new Date(`${fechaLimite}T00:00:00`);
        const diff = Math.round((fin.getTime() - limite.getTime()) / 86400000);
        return Number.isFinite(diff) && diff >= 0 ? diff : 7;
      })(),
      anchor_tipo: row?.anchor_tipo || "ninguno",
      anchor_fecha: row?.anchor_fecha || "",
      estado: row?.estado || "activo",
      observaciones: row?.observaciones || "",
    });
    setPacienteSeleccionado({
      id: Number(row?.paciente_id || 0),
      nombre,
      apellido,
      dni: row?.dni || "",
      historia_clinica: row?.historia_clinica || "",
    });
    setPacienteSearch(full ? `${full} (ID: ${row?.paciente_id || ""})` : `ID: ${row?.paciente_id || ""}`);
    setMostrarResultadosPaciente(false);
    setPacienteResultados([]);
  };

  const seleccionarPacienteContrato = (paciente) => {
    const id = Number(paciente?.id || 0);
    const nombre = String(paciente?.nombre || "").trim();
    const apellido = String(paciente?.apellido || "").trim();
    const dni = String(paciente?.dni || "").trim();
    const hc = String(paciente?.historia_clinica || "").trim();
    const full = `${nombre} ${apellido}`.trim();

    setFormContrato((prev) => ({ ...prev, paciente_id: id > 0 ? String(id) : "" }));
    setPacienteSeleccionado({ id, nombre, apellido, dni, historia_clinica: hc });
    setPacienteSearch(`${full}${dni ? ` | DNI: ${dni}` : ""}${hc ? ` | HC: ${hc}` : ""}`.trim());
    setPacienteResultados([]);
    setMostrarResultadosPaciente(false);
  };

  const limpiarPacienteContrato = () => {
    setFormContrato((prev) => ({ ...prev, paciente_id: "" }));
    setPacienteSearch("");
    setPacienteResultados([]);
    setPacienteSeleccionado(null);
    setMostrarResultadosPaciente(false);
  };

  const limpiarFormularioContrato = () => {
    setFormContrato(EMPTY_CONTRATO);
    limpiarPacienteContrato();
  };

  const cambiarEstadoContrato = async (id, estado) => {
    try {
      const estadoDestino = String(estado || "").toLowerCase();
      if (["finalizado", "cancelado"].includes(estadoDestino)) {
        const accion = estadoDestino === "cancelado" ? "cancelar" : "finalizar";
        const warning = estadoDestino === "cancelado"
          ? "Se cancelaran los eventos pendientes del contrato."
          : "Este cambio marcara el contrato como finalizado.";
        const cf = await Swal.fire({
          title: `Confirmar ${accion}`,
          text: warning,
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: `Si, ${accion}`,
          cancelButtonText: "No",
        });
        if (!cf.isConfirmed) return;
      }

      const res = await fetch(`${BASE_URL}api_contratos.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "estado_contrato_paciente", id, estado }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo cambiar estado");
      loadContratos();
    } catch (err) {
      Swal.fire("Error", err?.message || "No se pudo cambiar estado", "error");
    }
  };

  const seleccionarServicio = (item) => {
    setItemDraft((prev) => ({
      ...prev,
      servicio_id: Number(item?.id || 0),
      descripcion_snapshot: String(item?.descripcion || ""),
      medico_nombre_completo: String(item?.medico_nombre_completo || "").trim(),
      precio_particular: n(item?.precio_particular),
      fuente: String(item?.fuente || "").trim(),
    }));
  };

  const cambiarTipoServicio = (value) => {
    setItemDraft((p) => ({
      ...p,
      servicio_tipo: value,
      servicio_search: "",
      servicio_id: "",
      descripcion_snapshot: "",
      medico_nombre_completo: "",
      precio_particular: "",
      fuente: "",
    }));
    setCatalogRows([]);
  };

  return (
    <div className="max-w-full mx-auto p-4 md:p-8 space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 shadow p-4 md:p-6">
        <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--color-primary-dark)" }}>Contratos Dinamicos</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} className="border rounded px-3 py-2" placeholder="Buscar codigo o nombre" />
          <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} className="border rounded px-3 py-2">
            <option value="">Todos los estados</option>
            {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => { setPagePlantilla(1); setQAplicado(q); setEstadoFilterAplicado(estadoFilter); }} className="bg-blue-600 text-white rounded px-3 py-2 hover:bg-blue-700">Filtrar</button>
          <button onClick={() => setForm(EMPTY_PLANTILLA)} className="bg-gray-100 text-gray-700 rounded px-3 py-2 hover:bg-gray-200">Nueva plantilla</button>
        </div>

        <div className="mb-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-sm text-gray-600">
          <div>Total plantillas: {totalPlantillas}</div>
          <div className="flex items-center gap-2">
            <span>Por pagina</span>
            <select className="border rounded px-2 py-1" value={limitPlantilla} onChange={(e) => { setLimitPlantilla(Number(e.target.value) || 10); setPagePlantilla(1); }}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        <div className="overflow-auto border rounded mb-6">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">Codigo</th>
                <th className="px-2 py-2 text-left">Nombre</th>
                <th className="px-2 py-2 text-left">Estado</th>
                <th className="px-2 py-2 text-right">Pago unico</th>
                <th className="px-2 py-2 text-center">Items</th>
                <th className="px-2 py-2 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-2 py-3 text-center text-gray-500">Cargando...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-2 py-3 text-center text-gray-500">Sin plantillas</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-2">{r.codigo}</td>
                  <td className="px-2 py-2">{r.nombre}</td>
                  <td className="px-2 py-2">{r.estado}</td>
                  <td className="px-2 py-2 text-right">S/ {n(r.pago_unico_monto).toFixed(2)}</td>
                  <td className="px-2 py-2 text-center">{Array.isArray(r.items) ? r.items.length : 0}</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => editPlantilla(r)} className="px-2 py-1 rounded bg-blue-100 text-blue-700">Editar</button>
                      <button onClick={() => cambiarEstadoPlantilla(r.id, r.estado === "activo" ? "inactivo" : "activo")} className="px-2 py-1 rounded bg-amber-100 text-amber-700">
                        {r.estado === "activo" ? "Inactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-end gap-2">
          <button
            className="px-3 py-1 rounded border bg-white disabled:opacity-50"
            disabled={pagePlantilla <= 1}
            onClick={() => setPagePlantilla((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span className="text-sm text-gray-600">Pagina {pagePlantilla} de {totalPagesPlantillas}</span>
          <button
            className="px-3 py-1 rounded border bg-white disabled:opacity-50"
            disabled={pagePlantilla >= totalPagesPlantillas}
            onClick={() => setPagePlantilla((p) => Math.min(totalPagesPlantillas, p + 1))}
          >
            Siguiente
          </button>
        </div>

        <h3 className="text-lg font-semibold mb-2">Editor de plantilla</h3>
        <p className="text-xs text-slate-500 mb-2">Completa los datos base del plan. Los campos numéricos ahora muestran su significado para evitar confusión.</p>
        <div className="mb-3 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          La plantilla no tiene vigencia propia. La vigencia real se define al crear el contrato del paciente con Fecha inicio y Fecha fin.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
          <label className="text-xs text-slate-600">
            Codigo de plantilla
            <input className="border rounded px-2 py-2 mt-1 w-full" placeholder="Ej: CTR-PRENATAL-2026" value={form.codigo} onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))} />
          </label>
          <label className="text-xs text-slate-600">
            Nombre del plan
            <input className="border rounded px-2 py-2 mt-1 w-full" placeholder="Ej: Plan Controles Prenatales" value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} />
          </label>
          <label className="text-xs text-slate-600">
            Estado de plantilla
            <select className="border rounded px-2 py-2 mt-1 w-full" value={form.estado} onChange={(e) => setForm((p) => ({ ...p, estado: e.target.value }))}>
              {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Pago unico del contrato (S/)
            <input className="border rounded px-2 py-2 mt-1 w-full" type="number" min="0" step="0.01" placeholder="Ej: 1500.00" value={form.pago_unico_monto} onChange={(e) => setForm((p) => ({ ...p, pago_unico_monto: e.target.value }))} />
          </label>
          <label className="text-xs text-slate-600 md:col-span-2">
            Descripcion del plan
            <input className="border rounded px-2 py-2 mt-1 w-full" placeholder="Describe que incluye el contrato" value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} />
          </label>
          <label className="text-xs text-slate-600">
            Duracion referencial (opcional)
            <input className="border rounded px-2 py-2 mt-1 w-full" type="number" min="0" placeholder="Ej: 270 dias (solo referencia)" value={form.duracion_dias} onChange={(e) => setForm((p) => ({ ...p, duracion_dias: e.target.value }))} />
          </label>
        </div>

        <div className="border rounded p-3 mb-3">
          <h4 className="font-semibold mb-2">Agregar item</h4>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2">
            <select className="border rounded px-2 py-2" value={itemDraft.servicio_tipo} onChange={(e) => cambiarTipoServicio(e.target.value)}>
              {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              className="border rounded px-2 py-2"
              placeholder="Buscar servicio (min. 2 letras)"
              value={itemDraft.servicio_search || ""}
              onChange={(e) => setItemDraft((p) => ({ ...p, servicio_search: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") buscarCatalogoServicios(itemDraft.servicio_tipo, itemDraft.servicio_search || "");
              }}
            />
            <button className="bg-cyan-600 text-white rounded px-3 py-2 hover:bg-cyan-700" onClick={() => buscarCatalogoServicios(itemDraft.servicio_tipo, itemDraft.servicio_search || "")}>Buscar</button>
            <input className="border rounded px-2 py-2" type="number" min="1" placeholder="Servicio ID" value={itemDraft.servicio_id} onChange={(e) => setItemDraft((p) => ({ ...p, servicio_id: e.target.value }))} />
            <input className="border rounded px-2 py-2 md:col-span-2" placeholder="Descripcion" value={itemDraft.descripcion_snapshot} onChange={(e) => setItemDraft((p) => ({ ...p, descripcion_snapshot: e.target.value }))} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2">
            <label className="text-xs text-slate-600">
              Cantidad incluida
              <input className="border rounded px-2 py-2 mt-1 w-full" type="number" min="0.01" step="0.01" placeholder="Ej: 1" value={itemDraft.cantidad_incluida} onChange={(e) => setItemDraft((p) => ({ ...p, cantidad_incluida: e.target.value }))} />
            </label>
            <label className="text-xs text-slate-600">
              Orden en la programacion
              <input className="border rounded px-2 py-2 mt-1 w-full" type="number" min="1" placeholder="Ej: 1, 2, 3..." value={itemDraft.orden_programado} onChange={(e) => setItemDraft((p) => ({ ...p, orden_programado: e.target.value }))} />
            </label>
            <label className="text-xs text-slate-600">
              Programacion por anchor
              <select className="border rounded px-2 py-2 mt-1 w-full" value={itemDraft.offset_tipo} onChange={(e) => setItemDraft((p) => ({ ...p, offset_tipo: e.target.value }))}>
                <option value="ninguno">Ninguno (orden × 7 dias)</option>
                <option value="relativo_anchor">Relativo al anchor</option>
                <option value="semana_gestacional">Semana gestacional (FUR)</option>
              </select>
            </label>
            {itemDraft.offset_tipo !== "ninguno" && (
              <>
                <label className="text-xs text-slate-600">
                  {itemDraft.offset_tipo === "semana_gestacional" ? "Semana" : "Cantidad"}
                  <input className="border rounded px-2 py-2 mt-1 w-full" type="number" min="0" step="1"
                    placeholder={itemDraft.offset_tipo === "semana_gestacional" ? "Ej: 12" : "Ej: 2"}
                    value={itemDraft.offset_valor}
                    onChange={(e) => setItemDraft((p) => ({ ...p, offset_valor: e.target.value }))} />
                </label>
                {itemDraft.offset_tipo === "relativo_anchor" && (
                  <label className="text-xs text-slate-600">
                    Unidad
                    <select className="border rounded px-2 py-2 mt-1 w-full" value={itemDraft.offset_unidad} onChange={(e) => setItemDraft((p) => ({ ...p, offset_unidad: e.target.value }))}>
                      <option value="dias">Dias</option>
                      <option value="semanas">Semanas</option>
                      <option value="meses">Meses</option>
                    </select>
                  </label>
                )}
              </>
            )}
            <button className="bg-green-600 text-white rounded px-3 py-2 hover:bg-green-700 self-end" onClick={addItem}>Agregar</button>
          </div>

          <div className="overflow-auto border rounded mb-3">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 text-left">ID</th>
                  <th className="px-2 py-2 text-left">Descripcion</th>
                  <th className="px-2 py-2 text-left">Medico / Responsable</th>
                  <th className="px-2 py-2 text-right">Precio</th>
                  <th className="px-2 py-2 text-left">Fuente</th>
                  <th className="px-2 py-2 text-right">Accion</th>
                </tr>
              </thead>
              <tbody>
                {catalogLoading ? (
                  <tr><td colSpan={6} className="px-2 py-2 text-center text-gray-500">Buscando...</td></tr>
                ) : catalogRows.length === 0 ? (
                  <tr><td colSpan={6} className="px-2 py-2 text-center text-gray-500">Escribe al menos 2 letras y presiona Buscar</td></tr>
                ) : catalogRows.map((r) => (
                  <tr key={`${r.fuente}-${r.id}`} className="border-t">
                    <td className="px-2 py-2">{r.id}</td>
                    <td className="px-2 py-2">{r.descripcion}</td>
                    <td className="px-2 py-2">{String(r.medico_nombre_completo || "").trim() || "General"}</td>
                    <td className="px-2 py-2 text-right">{formatMoney(r.precio_particular)}</td>
                    <td className="px-2 py-2">{r.fuente}</td>
                    <td className="px-2 py-2 text-right">
                      <button className="px-2 py-1 rounded bg-indigo-100 text-indigo-700" onClick={() => seleccionarServicio(r)}>Seleccionar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-auto border rounded">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 text-left">Tipo</th>
                  <th className="px-2 py-2 text-left">Servicio ID</th>
                  <th className="px-2 py-2 text-left">Descripcion</th>
                  <th className="px-2 py-2 text-left">Medico / Responsable</th>
                  <th className="px-2 py-2 text-right">Precio</th>
                  <th className="px-2 py-2 text-right">Cant</th>
                  <th className="px-2 py-2 text-left">Offset / Programacion</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(form.items || []).length === 0 ? (
                  <tr><td colSpan={8} className="px-2 py-2 text-center text-gray-500">Sin items</td></tr>
                ) : (form.items || []).map((it, idx) => {
                  const offsetLabel = (() => {
                    if (!it.offset_tipo || it.offset_tipo === "ninguno") return `Orden ${it.orden_programado || idx+1}`;
                    if (it.offset_tipo === "semana_gestacional") return `Sem. gest. ${it.offset_valor}`;
                    return `+${it.offset_valor} ${it.offset_unidad} desde anchor`;
                  })();
                  const medicoItem = String(it.medico_nombre_completo || "").trim() || "General";
                  return (
                  <tr key={`${it.servicio_tipo}-${it.servicio_id}-${idx}`} className="border-t">
                    <td className="px-2 py-2">{it.servicio_tipo}</td>
                    <td className="px-2 py-2">{it.servicio_id}</td>
                    <td className="px-2 py-2">{it.descripcion_snapshot}</td>
                    <td className="px-2 py-2">{medicoItem}</td>
                    <td className="px-2 py-2 text-right">{formatMoney(it.precio_particular)}</td>
                    <td className="px-2 py-2 text-right">{n(it.cantidad_incluida).toFixed(2)}</td>
                    <td className="px-2 py-2 text-slate-500">{offsetLabel}</td>
                    <td className="px-2 py-2 text-right"><button className="px-2 py-1 rounded bg-red-100 text-red-700" onClick={() => removeItem(idx)}>Quitar</button></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex gap-2 justify-end mb-8">
          <button className="px-4 py-2 rounded bg-gray-100 text-gray-700" onClick={() => setForm(EMPTY_PLANTILLA)}>Limpiar</button>
          <button className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50" onClick={savePlantilla} disabled={saving}>{saving ? "Guardando..." : "Guardar plantilla"}</button>
        </div>

        <h3 className="text-lg font-semibold mb-2">Crear / editar contrato de paciente</h3>
        <p className="text-xs text-slate-500 mb-2">Aqui si defines la vigencia real del contrato del paciente (fecha inicio y fecha fin).</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
          <div className="relative md:col-span-2">
            <input
              className="border rounded px-2 py-2 w-full"
              placeholder="Buscar paciente por nombre, DNI o HC"
              value={pacienteSearch}
              onFocus={() => setMostrarResultadosPaciente(true)}
              onChange={(e) => {
                setPacienteSearch(e.target.value);
                setMostrarResultadosPaciente(true);
                setPacienteSeleccionado(null);
                setFormContrato((p) => ({ ...p, paciente_id: "" }));
              }}
            />
            {mostrarResultadosPaciente && (
              <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto border rounded bg-white shadow">
                {loadingPacientes ? (
                  <div className="px-3 py-2 text-sm text-gray-500">Buscando pacientes...</div>
                ) : String(pacienteSearch || "").trim().length < 2 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">Escribe al menos 2 caracteres</div>
                ) : pacienteResultados.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">Sin resultados</div>
                ) : pacienteResultados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-b-0"
                    onClick={() => seleccionarPacienteContrato(p)}
                  >
                    <div className="text-sm font-medium text-slate-800">{p.nombre} {p.apellido}</div>
                    <div className="text-xs text-slate-500">ID: {p.id} | DNI: {p.dni || "-"} | HC: {p.historia_clinica || "-"}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <input className="border rounded px-2 py-2 w-full bg-slate-50" type="text" placeholder="Paciente ID" value={formContrato.paciente_id} readOnly />
            <button type="button" className="px-3 py-2 rounded bg-gray-100 text-gray-700" onClick={limpiarPacienteContrato}>Limpiar</button>
          </div>
          <select className="border rounded px-2 py-2" value={formContrato.plantilla_id} onChange={(e) => setFormContrato((p) => ({ ...p, plantilla_id: e.target.value }))}>
            <option value="">Selecciona plantilla</option>
            {rows.map((r) => <option key={r.id} value={r.id}>{r.codigo} - {r.nombre}</option>)}
          </select>
          <input className="border rounded px-2 py-2" type="date" value={formContrato.fecha_inicio} onChange={(e) => setFormContrato((p) => ({ ...p, fecha_inicio: e.target.value }))} />
          <input className="border rounded px-2 py-2" type="date" value={formContrato.fecha_fin} onChange={(e) => setFormContrato((p) => ({ ...p, fecha_fin: e.target.value }))} />
          <input className="border rounded px-2 py-2" type="number" min="0" step="0.01" placeholder="Monto total" value={formContrato.monto_total} onChange={(e) => setFormContrato((p) => ({ ...p, monto_total: e.target.value }))} />
          <input className="border rounded px-2 py-2" type="number" min="0" step="0.01" placeholder="Saldo pendiente (opcional)" value={formContrato.saldo_pendiente} onChange={(e) => setFormContrato((p) => ({ ...p, saldo_pendiente: e.target.value }))} />
          <input className="border rounded px-2 py-2" type="number" min="0" placeholder="Dias previos para liquidar" value={formContrato.dias_anticipacion_liquidacion} onChange={(e) => setFormContrato((p) => ({ ...p, dias_anticipacion_liquidacion: e.target.value }))} />

          {/* Anchor clinico — punto de referencia para cronograma dinamico */}
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="text-xs text-slate-600 flex flex-col">
              Anchor clinico
              <select className="border rounded px-2 py-2 mt-1" value={formContrato.anchor_tipo} onChange={(e) => setFormContrato((p) => ({ ...p, anchor_tipo: e.target.value, anchor_fecha: "" }))}>
                <option value="ninguno">Ninguno (usa fecha inicio)</option>
                <option value="fur">FUR — Fecha Ultima Regla</option>
                <option value="fecha_cirugia">Fecha de cirugia programada</option>
                <option value="fecha_parto_estimada">Fecha probable de parto (FPP)</option>
                <option value="fecha_inicio_tratamiento">Inicio de tratamiento</option>
              </select>
            </label>
            {formContrato.anchor_tipo !== "ninguno" && (
              <label className="text-xs text-slate-600 flex flex-col">
                Fecha del anchor
                <input className="border rounded px-2 py-2 mt-1" type="date"
                  value={formContrato.anchor_fecha}
                  onChange={(e) => setFormContrato((p) => ({ ...p, anchor_fecha: e.target.value }))} />
              </label>
            )}
          </div>
          <select className="border rounded px-2 py-2" value={formContrato.estado} onChange={(e) => setFormContrato((p) => ({ ...p, estado: e.target.value }))}>
            <option value="pendiente">pendiente</option>
            <option value="activo">activo</option>
            <option value="finalizado">finalizado</option>
            <option value="liquidado">liquidado</option>
            <option value="cancelado">cancelado</option>
          </select>
          <input className="border rounded px-2 py-2" placeholder="Observaciones" value={formContrato.observaciones} onChange={(e) => setFormContrato((p) => ({ ...p, observaciones: e.target.value }))} />
        </div>

        {pacienteSeleccionado && (
          <div className="mb-2 text-xs text-slate-600 bg-slate-50 border rounded px-3 py-2">
            Paciente seleccionado: {pacienteSeleccionado.nombre} {pacienteSeleccionado.apellido} | ID: {pacienteSeleccionado.id} | DNI: {pacienteSeleccionado.dni || "-"} | HC: {pacienteSeleccionado.historia_clinica || "-"}
          </div>
        )}

        <label className="inline-flex items-center gap-2 mb-3 text-sm text-gray-700">
          <input type="checkbox" checked={regenerarAgenda} onChange={(e) => setRegenerarAgenda(e.target.checked)} />
          Regenerar agenda automatica al guardar
        </label>

        <div className="flex gap-2 justify-end mb-4">
          <button className="px-4 py-2 rounded bg-gray-100 text-gray-700" onClick={limpiarFormularioContrato}>Limpiar</button>
          <button className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-50" onClick={saveContratoPaciente} disabled={savingContrato}>{savingContrato ? "Guardando..." : "Guardar contrato paciente"}</button>
        </div>

        <div className="mb-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            className="border rounded px-2 py-2 md:col-span-2"
            placeholder="Filtrar contratos por paciente, ID, plantilla o codigo"
            value={qContrato}
            onChange={(e) => setQContrato(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={() => { setPageContrato(1); setQContratoAplicado(qContrato); }}>Buscar</button>
            <button className="px-3 py-2 rounded bg-gray-100 text-gray-700" onClick={() => { setQContrato(""); setQContratoAplicado(""); setPageContrato(1); }}>Limpiar</button>
          </div>
        </div>

        <div className="mb-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-sm text-gray-600">
          <div>Total contratos: {totalContratos}</div>
          <div className="flex items-center gap-2">
            <span>Por pagina</span>
            <select className="border rounded px-2 py-1" value={limitContrato} onChange={(e) => { setLimitContrato(Number(e.target.value) || 10); setPageContrato(1); }}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        <div className="overflow-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">ID</th>
                <th className="px-2 py-2 text-left">Paciente</th>
                <th className="px-2 py-2 text-left">Plantilla</th>
                <th className="px-2 py-2 text-left">Periodo</th>
                <th className="px-2 py-2 text-right">Saldo</th>
                <th className="px-2 py-2 text-left">Estado</th>
                <th className="px-2 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loadingContratos ? (
                <tr><td colSpan={7} className="px-2 py-3 text-center text-gray-500">Cargando...</td></tr>
              ) : contratos.length === 0 ? (
                <tr><td colSpan={7} className="px-2 py-3 text-center text-gray-500">Sin contratos</td></tr>
              ) : contratos.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-2 py-2">#{c.id}</td>
                  <td className="px-2 py-2">{c.paciente_id} {String(c.paciente_nombre || "").trim()} {String(c.paciente_apellido || "").trim()}</td>
                  <td className="px-2 py-2">{c.plantilla_codigo} - {c.plantilla_nombre}</td>
                  <td className="px-2 py-2">{c.fecha_inicio} a {c.fecha_fin}</td>
                  <td className="px-2 py-2 text-right">S/ {n(c.saldo_pendiente).toFixed(2)}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <span>{c.estado}</span>
                      {Number(c.hc_nodos_completados) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 whitespace-nowrap">
                          {Number(c.hc_nodos_completados)} HC
                          {Number(c.agenda_total) > 0 ? ` / ${Number(c.agenda_total)} citas` : ""}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button className="px-2 py-1 rounded bg-blue-100 text-blue-700" onClick={() => editarContratoPaciente(c)}>Editar</button>
                      <button className="px-2 py-1 rounded bg-emerald-100 text-emerald-700" onClick={() => cambiarEstadoContrato(c.id, "activo")}>Activar</button>
                      <button className="px-2 py-1 rounded bg-violet-100 text-violet-700" onClick={() => cambiarEstadoContrato(c.id, "finalizado")}>Finalizar</button>
                      <button className="px-2 py-1 rounded bg-red-100 text-red-700" onClick={() => cambiarEstadoContrato(c.id, "cancelado")}>Cancelar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            className="px-3 py-1 rounded border bg-white disabled:opacity-50"
            disabled={pageContrato <= 1}
            onClick={() => setPageContrato((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span className="text-sm text-gray-600">Pagina {pageContrato} de {totalPagesContratos}</span>
          <button
            className="px-3 py-1 rounded border bg-white disabled:opacity-50"
            disabled={pageContrato >= totalPagesContratos}
            onClick={() => setPageContrato((p) => Math.min(totalPagesContratos, p + 1))}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
