import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import { BASE_URL } from "../config/config";
import { useQuoteCart } from "../context/QuoteCartContext";

const SERVICE_TYPE_LABELS = {
  consulta: "Consulta",
  ecografia: "Ecografia",
  rayosx: "Rayos X",
  procedimiento: "Procedimiento",
  operacion: "Operacion",
  laboratorio: "Laboratorio",
  farmacia: "Farmacia",
};

const COMPONENT_FILTER_OPTIONS = [
  { value: "consulta", label: "Incluye Consulta" },
  { value: "ecografia", label: "Incluye Ecografia" },
  { value: "rayosx", label: "Incluye Rayos X" },
  { value: "procedimiento", label: "Incluye Procedimiento" },
  { value: "operacion", label: "Incluye Operacion" },
  { value: "laboratorio", label: "Incluye Laboratorio" },
  { value: "farmacia", label: "Incluye Farmacia" },
];

const LIST_INITIAL_VISIBLE = 12;
const LIST_LOAD_STEP = 12;

function normalizeServiceType(value) {
  const base = String(value || "").toLowerCase().trim();
  if (!base) return "procedimiento";
  if (base === "rayos_x" || base === "rayos x" || base === "rx") return "rayosx";
  if (base === "operaciones") return "operacion";
  if (base === "procedimientos") return "procedimiento";
  return base;
}

function buildPackageComponents(pkg, cotizacionId) {
  const items = Array.isArray(pkg?.items) ? pkg.items : [];
  return items
    .map((it) => {
      const cantidad = Math.max(1, Number(it.cantidad || 1));
      const precio = Number(it.precio_lista_snapshot || 0);
      const subtotalBase = Number(it.subtotal_snapshot || precio * cantidad);
      return {
        source_type: String(it.source_type || "procedimiento"),
        source_id: Number(it.source_id || 0),
        servicio_tipo: normalizeServiceType(it.source_type),
        servicio_id: Number(it.source_id || 0),
        descripcion_snapshot: String(it.descripcion_snapshot || ""),
        descripcion: String(it.descripcion_snapshot || "Item"),
        cantidad,
        precio_lista_snapshot: precio,
        precio_unitario: precio,
        subtotal_snapshot: Number(subtotalBase.toFixed(2)),
        subtotal: Number(subtotalBase.toFixed(2)),
        es_derivado: Boolean(it.es_derivado),
        derivado: Boolean(it.es_derivado),
        laboratorio_referencia: String(it.laboratorio_referencia || ""),
        tipo_derivacion: String(it.tipo_derivacion || ""),
        valor_derivacion: Number(it.valor_derivacion || 0),
        medico_id: Number(it.medico_id || 0) || null,
        honorario_regla: it.honorario_regla || null,
        cotizacion_id: Number(cotizacionId || 0) || null,
      };
    })
    .filter((it) => it.servicio_id > 0 || String(it.descripcion || "").trim() !== "");
}

function getPackageServiceBadges(pkg) {
  const items = Array.isArray(pkg?.items) ? pkg.items : [];
  const seen = new Set();
  const badges = [];

  for (const it of items) {
    const normalized = normalizeServiceType(it?.source_type || it?.servicio_tipo || "");
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    badges.push(SERVICE_TYPE_LABELS[normalized] || normalized);
  }

  return badges;
}

function getPackageServiceTypes(pkg) {
  const items = Array.isArray(pkg?.items) ? pkg.items : [];
  const setTypes = new Set();
  for (const it of items) {
    const normalized = normalizeServiceType(it?.source_type || it?.servicio_tipo || "");
    if (normalized) setTypes.add(normalized);
  }
  return Array.from(setTypes);
}

function buildDetalleKey(detalle) {
  const tipo = normalizeServiceType(detalle?.servicio_tipo || detalle?.source_type || "");
  const servicioId = Number(detalle?.servicio_id || detalle?.source_id || 0);
  const descripcion = String(detalle?.descripcion || detalle?.descripcion_snapshot || "").trim().toLowerCase();
  const cantidad = Number(detalle?.cantidad || 1).toFixed(2);
  const precioUnitario = Number(detalle?.precio_unitario ?? detalle?.precio_lista_snapshot ?? 0).toFixed(2);
  return `${tipo}::${servicioId}::${descripcion}::${cantidad}::${precioUnitario}`;
}

export default function CotizarPaquetesPerfilesPage() {
  const { pacienteId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { cart, addItems, count: cartCount } = useQuoteCart();

  const [paciente, setPaciente] = useState(null);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [search, setSearch] = useState("");
  const [componentFilters, setComponentFilters] = useState([]);
  const [componentFilterMode, setComponentFilterMode] = useState("any");
  const [loading, setLoading] = useState(false);
  const [schemaWarning, setSchemaWarning] = useState(null);
  const [visibleCount, setVisibleCount] = useState(LIST_INITIAL_VISIBLE);

  const sp = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const cotizacionId = Number(sp.get("cotizacion_id") || 0);
  const isEditingCotizacion = cotizacionId > 0 && !Boolean(sp.get("cobro_id"));

  useEffect(() => {
    const qParam = String(sp.get("q") || "").trim();
    const matchParam = String(sp.get("match") || "any").toLowerCase();
    const compsRaw = String(sp.get("comp") || "").trim();

    if (qParam) setSearch(qParam);
    if (["any", "all"].includes(matchParam)) setComponentFilterMode(matchParam);
    if (compsRaw) {
      const parsed = compsRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => COMPONENT_FILTER_OPTIONS.some((o) => o.value === s));
      if (parsed.length > 0) setComponentFilters(Array.from(new Set(parsed)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(location.search);
    const qValue = String(search || "").trim();
    if (qValue) next.set("q", qValue);
    else next.delete("q");

    if (componentFilterMode && componentFilterMode !== "any") next.set("match", componentFilterMode);
    else next.delete("match");

    if (componentFilters.length > 0) next.set("comp", componentFilters.join(","));
    else next.delete("comp");

    const current = new URLSearchParams(location.search).toString();
    const upcoming = next.toString();
    if (current !== upcoming) {
      navigate(`${location.pathname}${upcoming ? `?${upcoming}` : ""}`, { replace: true });
    }
  }, [search, componentFilters, componentFilterMode, location.pathname, location.search, navigate]);

  useEffect(() => {
    fetch(`${BASE_URL}api_pacientes.php?id=${Number(pacienteId)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data?.paciente) {
          setPaciente(data.paciente);
        }
      })
      .catch(() => {});
  }, [pacienteId]);

  const loadPackages = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("accion", "activos");
      params.set("include_items", "1");
      params.set("limit", "100");
      if (search.trim()) params.set("q", search.trim());

      const res = await fetch(`${BASE_URL}api_paquetes_perfiles.php?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo cargar paquetes/perfiles");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      if (data?.schema_ready === false) {
        setSchemaWarning({
          message: data?.warning || "Flujo de perfiles no instalado.",
          missingTables: Array.isArray(data?.missing_tables) ? data.missing_tables : [],
          hint: data?.hint || "",
        });
      } else {
        setSchemaWarning(null);
      }
    } catch (e) {
      setSchemaWarning(null);
      Swal.fire("Error", e?.message || "No se pudo cargar paquetes/perfiles", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPackages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelected = (id) => {
    const nid = Number(id);
    setSelected((prev) => (prev.includes(nid) ? prev.filter((x) => x !== nid) : [...prev, nid]));
    setQuantities((prev) => ({ ...prev, [nid]: Math.max(1, Number(prev[nid] || 1)) }));
  };

  const selectedRows = useMemo(() => {
    return rows.filter((r) => selected.includes(Number(r.id)));
  }, [rows, selected]);

  const toggleComponentFilter = (typeValue) => {
    const val = String(typeValue || "").trim();
    if (!val) return;
    setComponentFilters((prev) => (
      prev.includes(val)
        ? prev.filter((v) => v !== val)
        : [...prev, val]
    ));
  };

  const filteredRows = useMemo(() => {
    if (componentFilters.length === 0) return rows;
    return rows.filter((r) => {
      const types = getPackageServiceTypes(r);
      if (componentFilterMode === "all") {
        return componentFilters.every((f) => types.includes(f));
      }
      return componentFilters.some((f) => types.includes(f));
    });
  }, [rows, componentFilters, componentFilterMode]);

  const visibleRows = useMemo(() => filteredRows.slice(0, visibleCount), [filteredRows, visibleCount]);

  const total = useMemo(() => {
    return selectedRows.reduce((acc, row) => {
      const qty = Math.max(1, Number(quantities[row.id] || 1));
      return acc + Number(row.precio_global_venta || 0) * qty;
    }, 0);
  }, [selectedRows, quantities]);

  useEffect(() => {
    setVisibleCount(LIST_INITIAL_VISIBLE);
  }, [rows, search, componentFilters, componentFilterMode]);

  const buildSelectedPackageEntries = () => {
    return selectedRows.map((row) => {
      const qty = Math.max(1, Number(quantities[row.id] || 1));
      const price = Number(row.precio_global_venta || 0);
      const components = buildPackageComponents(row, cotizacionId).map((it) => ({
        ...it,
        cantidad: Number((it.cantidad * qty).toFixed(2)),
        subtotal: Number((it.subtotal * qty).toFixed(2)),
        subtotal_snapshot: Number((it.subtotal_snapshot * qty).toFixed(2)),
      }));

      return {
        serviceType: String(row.tipo || "paquete").toLowerCase() === "perfil" ? "perfil" : "paquete",
        serviceId: Number(row.id),
        description: String(row.nombre || "Paquete/Perfil"),
        quantity: qty,
        unitPrice: price,
        source: "paquete",
        packageId: Number(row.id),
        packageCode: String(row.codigo || ""),
        packageType: String(row.tipo || "paquete"),
        componentes: components,
        cotizacionId,
      };
    });
  };

  const addToCart = () => {
    if (selectedRows.length === 0) {
      Swal.fire("Atencion", "Selecciona al menos un paquete/perfil.", "info");
      return;
    }

    const existsInCart = (row) => {
      return Array.isArray(cart?.items) && cart.items.some((it) => (
        Number(it?.serviceId || 0) === Number(row.id)
        && ["paquete", "perfil"].includes(String(it?.serviceType || "").toLowerCase())
      ));
    };

    const detailItems = buildSelectedPackageEntries().filter((row) => !existsInCart({ id: row.serviceId }));

    if (detailItems.length === 0) {
      Swal.fire("Atencion", "Los paquetes seleccionados ya estan en el carrito.", "info");
      return;
    }

    addItems({
      patientId: Number(pacienteId),
      patientName: paciente
        ? `${paciente.nombres || paciente.nombre || ""} ${paciente.apellidos || paciente.apellido || ""}`.trim()
        : `Paciente #${pacienteId}`,
      items: detailItems,
    });

    Swal.fire("Listo", `Se agregaron ${detailItems.length} paquete(s)/perfil(es) al carrito.`, "success");
  };

  const registrarCotizacion = async ({ irACobro = false } = {}) => {
    if (selectedRows.length === 0) {
      Swal.fire("Atencion", "Selecciona al menos un paquete/perfil.", "info");
      return;
    }

    try {
      const paquetesSeleccionados = buildSelectedPackageEntries();
      const detallesPaquete = paquetesSeleccionados.map((it) => ({
        servicio_tipo: it.serviceType,
        servicio_id: it.serviceId,
        descripcion: it.description,
        cantidad: Number(it.quantity || 1),
        precio_unitario: Number(it.unitPrice || 0),
        subtotal: Number((Number(it.quantity || 1) * Number(it.unitPrice || 0)).toFixed(2)),
        paquete_id: it.packageId,
        paquete_codigo: it.packageCode,
        paquete_tipo: it.packageType,
        componentes: Array.isArray(it.componentes) ? it.componentes : [],
        cotizacion_id: Number(it.cotizacionId || 0) || null,
      }));

      let detallesFinales = detallesPaquete;
      if (isEditingCotizacion && cotizacionId > 0) {
        const resGet = await fetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${Number(cotizacionId)}`, {
          credentials: "include",
        });
        const dataGet = await resGet.json();
        if (!dataGet?.success || !dataGet?.cotizacion) {
          throw new Error(dataGet?.error || "No se pudo cargar la cotizacion para actualizar");
        }
        const base = Array.isArray(dataGet.cotizacion.detalles) ? dataGet.cotizacion.detalles : [];

        const componentKeys = new Set();
        for (const p of detallesPaquete) {
          const comps = Array.isArray(p?.componentes) ? p.componentes : [];
          for (const c of comps) {
            componentKeys.add(buildDetalleKey(c));
          }
        }

        const baseSinComponentesRepetidos = base.filter((d) => !componentKeys.has(buildDetalleKey(d)));
        detallesFinales = [...baseSinComponentesRepetidos, ...detallesPaquete];
      }

      const totalFinal = detallesFinales.reduce((acc, d) => acc + Number(d?.subtotal || 0), 0);
      const payload = isEditingCotizacion && cotizacionId > 0
        ? {
            accion: "editar",
            cotizacion_id: Number(cotizacionId),
            detalles: detallesFinales,
            total: Number(totalFinal.toFixed(2)),
            motivo: "Edicion desde cotizador de Paquetes/Perfiles",
          }
        : {
            paciente_id: Number(pacienteId),
            detalles: detallesFinales,
            total: Number(totalFinal.toFixed(2)),
            observaciones: "Cotizacion registrada desde cotizador de Paquetes/Perfiles",
          };

      const res = await fetch(`${BASE_URL}api_cotizaciones.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo registrar la cotizacion");
      }

      const cotizacionDestino = Number(data?.cotizacion_id || cotizacionId || 0);
      Swal.fire("Listo", isEditingCotizacion ? "Cotizacion actualizada." : "Cotizacion registrada.", "success").then(() => {
        if (irACobro && cotizacionDestino > 0) {
          navigate(`/cobrar-cotizacion/${cotizacionDestino}`);
          return;
        }

        if (isEditingCotizacion && cotizacionDestino > 0) {
          navigate(`/seleccionar-servicio?paciente_id=${Number(pacienteId)}&cotizacion_id=${cotizacionDestino}&modo=editar&back_to=/cotizaciones`, {
            state: { pacienteId: Number(pacienteId), cotizacionId: cotizacionDestino, backTo: "/cotizaciones", modo: "editar" },
          });
          return;
        }

        navigate("/cotizaciones");
      });
    } catch (e) {
      Swal.fire("Error", e?.message || "No se pudo registrar la cotizacion", "error");
    }
  };

  return (
    <div className={`max-w-7xl mx-auto p-6 bg-white rounded-xl shadow-lg mt-8 transition-all ${cartCount > 0 ? "xl:mr-[22rem]" : ""}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">📦</span>
          <h2 className="text-2xl font-bold text-blue-800">Cotizador de Paquetes y Perfiles</h2>
          {isEditingCotizacion && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded border border-yellow-300">
              Editando cotizacion #{cotizacionId}
            </span>
          )}
        </div>
        <button
          onClick={() => {
            if (isEditingCotizacion) {
              navigate(`/seleccionar-servicio?paciente_id=${Number(pacienteId)}&cotizacion_id=${cotizacionId}&modo=editar&back_to=/cotizaciones`, {
                state: { pacienteId: Number(pacienteId), cotizacionId, backTo: "/cotizaciones", modo: "editar" },
              });
            } else {
              navigate("/seleccionar-servicio", { state: { pacienteId: Number(pacienteId) } });
            }
          }}
          className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
        >
          Volver
        </button>
      </div>

      <div className="mb-4 text-gray-700">
        <b>Paciente:</b> {paciente ? `${paciente.nombre || paciente.nombres || ""} ${paciente.apellido || paciente.apellidos || ""}`.trim() : `ID ${pacienteId}`}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <input
          type="text"
          className="border rounded px-3 py-2 md:col-span-2"
          placeholder="Buscar paquete/perfil por nombre o codigo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border rounded px-3 py-2"
          value={componentFilterMode}
          onChange={(e) => setComponentFilterMode(String(e.target.value || "any"))}
        >
          <option value="any">Coincide con cualquiera</option>
          <option value="all">Debe incluir todos</option>
        </select>
        <button
          type="button"
          className="bg-blue-600 text-white rounded px-3 py-2 hover:bg-blue-700"
          onClick={loadPackages}
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-600">Filtro rapido por componente:</span>
        {COMPONENT_FILTER_OPTIONS.map((opt) => {
          const isActive = componentFilters.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleComponentFilter(opt.value)}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${isActive ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
            >
              {opt.label.replace("Incluye ", "")}
            </button>
          );
        })}
        {componentFilters.length > 0 && (
          <button
            type="button"
            onClick={() => setComponentFilters([])}
            className="text-xs px-2.5 py-1 rounded border border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {schemaWarning && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
          <div className="font-semibold">Esquema de paquetes/perfiles pendiente</div>
          <div>{schemaWarning.message}</div>
          {schemaWarning.missingTables.length > 0 && (
            <div>Tablas faltantes: {schemaWarning.missingTables.join(", ")}</div>
          )}
          {schemaWarning.hint && <div>Sugerencia: {schemaWarning.hint}</div>}
        </div>
      )}

      <div className="flex flex-col gap-8 md:flex-row">
        <div className="w-full flex-1">
          <div className="bg-white rounded-lg shadow border border-gray-200">
            {loading ? (
              <div className="p-6 text-center text-gray-500">Cargando...</div>
            ) : filteredRows.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No hay paquetes/perfiles activos.</div>
            ) : (
              <>
              <div className="px-4 py-2 text-xs text-gray-500 border-b bg-gray-50">
                Mostrando {Math.min(visibleRows.length, filteredRows.length)} de {filteredRows.length} resultado(s)
              </div>
              <ul className="divide-y divide-gray-100">
                {visibleRows.map((row) => {
                  const isChecked = selected.includes(Number(row.id));
                  const qty = Math.max(1, Number(quantities[row.id] || 1));
                  const componentCount = Array.isArray(row.items) ? row.items.length : Number(row.items_total || 0);
                  const badges = getPackageServiceBadges(row);
                  const visibleBadges = badges.slice(0, 3);
                  const hiddenBadges = Math.max(0, badges.length - visibleBadges.length);
                  return (
                    <li key={row.id} className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelected(row.id)}
                        className="w-5 h-5 accent-blue-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-800 truncate">{row.nombre}</div>
                        <div className="text-xs text-gray-500 flex gap-2 flex-wrap">
                          <span>{row.codigo}</span>
                          <span>| {row.tipo}</span>
                          <span>| {componentCount} item(s)</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {visibleBadges.map((badge) => (
                            <span key={`${row.id}-${badge}`} className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                              {badge}
                            </span>
                          ))}
                          {hiddenBadges > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                              +{hiddenBadges} mas
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="font-bold text-green-700">S/ {Number(row.precio_global_venta || 0).toFixed(2)}</div>
                      {isChecked && (
                        <input
                          type="number"
                          min={1}
                          value={qty}
                          onChange={(e) => setQuantities((prev) => ({
                            ...prev,
                            [row.id]: Math.max(1, Number(e.target.value || 1)),
                          }))}
                          className="border rounded-lg px-2 w-16 bg-white"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
              {visibleCount < filteredRows.length && (
                <div className="p-3 border-t bg-white flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + LIST_LOAD_STEP)}
                    className="px-4 py-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    Cargar mas
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        </div>

        {selectedRows.length > 0 && (
          <div className="w-full md:sticky md:top-8 h-fit md:max-w-xl">
            <h4 className="font-semibold text-gray-700 mb-2">Lista seleccionada</h4>
            <ul className="divide-y divide-gray-200 bg-gray-50 rounded-lg shadow p-4 max-h-80 overflow-y-auto">
              {selectedRows.map((row) => {
                const qty = Math.max(1, Number(quantities[row.id] || 1));
                const subtotal = Number(row.precio_global_venta || 0) * qty;
                return (
                  <li key={`sel-${row.id}`} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-gray-900">{row.nombre}</div>
                      <div className="text-xs text-gray-500">{row.codigo} | {row.tipo} | x{qty}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {getPackageServiceBadges(row).map((badge) => (
                          <span key={`sel-${row.id}-${badge}`} className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                            {badge}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="font-bold text-green-700 text-right">S/ {subtotal.toFixed(2)}</div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 text-lg font-bold text-right">
              Total: <span className="text-green-600">S/ {total.toFixed(2)}</span>
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <button
                onClick={() => {
                  setSelected([]);
                  setQuantities({});
                }}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200"
              >
                Limpiar seleccion
              </button>
              <button
                onClick={addToCart}
                className="bg-violet-600 text-white px-4 py-2 rounded hover:bg-violet-700"
              >
                Agregar al carrito
              </button>
              <button
                onClick={() => registrarCotizacion()}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                {isEditingCotizacion ? "Actualizar cotizacion" : "Registrar cotizacion"}
              </button>
              <button
                onClick={() => registrarCotizacion({ irACobro: true })}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                {isEditingCotizacion ? "Actualizar y cobrar" : "Registrar y cobrar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
