import MovimientosModal from "./MovimientosModal";
import { FaInfoCircle, FaEdit, FaHistory, FaLock } from "react-icons/fa";
import MedicamentoForm from "./MedicamentoForm";
// ...hooks de filtro de fecha solo dentro de la función...
// ...hooks de cuarentena solo dentro de la función...
// ...existing code...
import { useEffect, useState } from "react";

import { BASE_URL } from "../config/config";

export default function MedicamentosList() {
  const [detalleMed, setDetalleMed] = useState(null);
  const [filtroVencDesde, setFiltroVencDesde] = useState("");
  const [filtroVencHasta, setFiltroVencHasta] = useState("");
  const [movimientosMed, setMovimientosMed] = useState(null);
  const [medicamentos, setMedicamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editData, setEditData] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [tamanoPagina, setTamanoPagina] = useState(5);
  const [showCuarentena, setShowCuarentena] = useState(false);
  const [cuarentenaData, setCuarentenaData] = useState(null);
  const [motivoCuarentena, setMotivoCuarentena] = useState("");
  const [filtroCuarentena, setFiltroCuarentena] = useState(false);

  const fetchMedicamentos = () => {
    setLoading(true);
    setError(null);
    const apiUrl = `${BASE_URL}api_medicamentos.php`;
    fetch(apiUrl)
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar medicamentos");
        return res.json();
      })
      .then(setMedicamentos)
      .catch(setError)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMedicamentos();
  }, []);

  const handleAdd = () => {
    setEditData(null);
    setShowForm(true);
  };

  const handleEdit = (med) => {
    setEditData(med);
    setShowForm(true);
  };

  const handleSave = (data) => {
    const apiUrl = `${BASE_URL}api_medicamentos.php`;
    return fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          setShowForm(false);
          fetchMedicamentos();
          return { success: true };
        } else {
          // Devuelve el error al formulario para que lo muestre
          return { error: result.error || "Error al guardar" };
        }
      })
      .catch(() => ({ error: "Error de red o servidor" }));
  };

  let medicamentosFiltrados = medicamentos.filter(
    (m) =>
      m.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      m.codigo.toLowerCase().includes(busqueda.toLowerCase())
  );
  // Ordenar por id descendente (el más reciente primero)
  medicamentosFiltrados.sort((a, b) => {
    if (a.id && b.id) {
      return b.id - a.id;
    }
    // Si no hay id, mantener el orden original
    return 0;
  });
  if (filtroCuarentena) {
    medicamentosFiltrados = medicamentosFiltrados.filter(
      (m) => m.estado === "cuarentena"
    );
  }
  if (filtroVencDesde) {
    medicamentosFiltrados = medicamentosFiltrados.filter(
      (m) => m.fecha_vencimiento && m.fecha_vencimiento >= filtroVencDesde
    );
  }
  if (filtroVencHasta) {
    medicamentosFiltrados = medicamentosFiltrados.filter(
      (m) => m.fecha_vencimiento && m.fecha_vencimiento <= filtroVencHasta
    );
  }
  <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-2 sm:p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 shadow-sm">
    <div className="flex items-center gap-1 sm:gap-2 text-base font-semibold text-yellow-900 flex-wrap">
      <span className="inline-block text-yellow-600 mr-1">🗓️</span>
      <label>Filtrar por vencimiento:</label>
      <span className="ml-2 text-sm font-normal text-gray-700">Desde</span>
      <input
        type="date"
        value={filtroVencDesde}
        onChange={(e) => setFiltroVencDesde(e.target.value)}
        className="border border-yellow-400 rounded px-1 py-1 focus:ring-2 focus:ring-yellow-300 w-20 sm:w-28 md:w-32"
      />
      <span className="ml-2 text-sm font-normal text-gray-700">Hasta</span>
      <input
        type="date"
        value={filtroVencHasta}
        onChange={(e) => setFiltroVencHasta(e.target.value)}
        className="border border-yellow-400 rounded px-1 py-1 focus:ring-2 focus:ring-yellow-300 w-20 sm:w-28 md:w-32"
      />
      <button
        type="button"
        onClick={() => {
          setFiltroVencDesde("");
          setFiltroVencHasta("");
        }}
        className="ml-2 px-2 py-1 rounded bg-yellow-300 text-yellow-900 font-semibold border border-yellow-400 hover:bg-yellow-400 transition text-xs sm:text-sm"
        title="Limpiar filtros de vencimiento"
      >
        Limpiar
      </button>
    </div>
    <div className="flex items-center gap-4 mt-2 sm:mt-0">
      <label className="flex items-center gap-1 text-sm">
        <input
          type="checkbox"
          checked={filtroCuarentena}
          onChange={(e) => setFiltroCuarentena(e.target.checked)}
        />
        Solo cuarentena
      </label>
      <span className="text-xs text-gray-500">
        Medicamentos en cuarentena deben ser llevados a puntos de acopio
        autorizados (DIGEMID).
      </span>
    </div>
  </div>;

  // Paginación
  const totalPaginas = Math.ceil(medicamentosFiltrados.length / tamanoPagina);
  const medicamentosPaginados = medicamentosFiltrados.slice(
    (pagina - 1) * tamanoPagina,
    pagina * tamanoPagina
  );

  const handleChangeTamano = (e) => {
    setTamanoPagina(Number(e.target.value));
    setPagina(1);
  };

  const handlePagina = (nueva) => {
    if (nueva >= 1 && nueva <= totalPaginas) setPagina(nueva);
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6 text-center">
        Gestión de Medicamentos
      </h1>
      <div className="flex flex-col sm:flex-row sm:justify-between mb-4 gap-2">
        <input
          type="text"
          placeholder="Buscar por código o nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="border rounded px-3 py-2 w-full sm:w-72"
        />
        <select
          value={tamanoPagina}
          onChange={handleChangeTamano}
          className="border rounded px-2 py-2 ml-2"
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={25}>25</option>
        </select>
        <span className="ml-2 text-sm">por página</span>
        <button
          onClick={handleAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
        >
          + Nuevo Medicamento
        </button>
      </div>

      {/* Filtro de fecha y cuarentena */}
      <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-2 sm:p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 shadow-sm">
        <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-base font-semibold text-yellow-900 flex-wrap">
          <span className="inline-block text-yellow-600 mr-1">🗓️</span>
          <label className="text-xs sm:text-base">
            Filtrar por vencimiento:
          </label>
          <span className="ml-1 text-xs font-normal text-gray-700">Desde</span>
          <input
            type="date"
            value={filtroVencDesde}
            onChange={(e) => setFiltroVencDesde(e.target.value)}
            className="border border-yellow-400 rounded px-1 py-1 focus:ring-2 focus:ring-yellow-300 w-16 sm:w-24 md:w-28"
          />
          <span className="ml-1 text-xs font-normal text-gray-700">Hasta</span>
          <input
            type="date"
            value={filtroVencHasta}
            onChange={(e) => setFiltroVencHasta(e.target.value)}
            className="border border-yellow-400 rounded px-1 py-1 focus:ring-2 focus:ring-yellow-300 w-16 sm:w-24 md:w-28"
          />
          <button
            type="button"
            onClick={() => {
              setFiltroVencDesde("");
              setFiltroVencHasta("");
            }}
            className="ml-1 px-2 py-1 rounded bg-yellow-300 text-yellow-900 font-semibold border border-yellow-400 hover:bg-yellow-400 transition text-xs sm:text-sm"
            title="Limpiar filtros de vencimiento"
          >
            Limpiar
          </button>
        </div>
        <div className="flex items-center gap-4 mt-2 sm:mt-0">
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={filtroCuarentena}
              onChange={(e) => setFiltroCuarentena(e.target.checked)}
            />
            Solo cuarentena
          </label>
          <span className="text-xs text-gray-500">
            Medicamentos en cuarentena deben ser llevados a puntos de acopio
            autorizados (DIGEMID).
          </span>
        </div>
      </div>
      {loading && <div className="text-center text-gray-500">Cargando...</div>}
      {error && (
        <div className="text-center text-red-500">
          {error.message || "Error"}
        </div>
      )}
      {!loading && !error && (
        <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 rounded-lg">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg text-xs sm:text-sm md:text-base">
            <thead>
              <tr className="bg-purple-100">
                <th className="py-2 px-3 border-b">Código</th>
                <th className="py-2 px-3 border-b">Nombre</th>
                <th className="py-2 px-3 border-b text-center sm:hidden">
                  Detalle
                </th>
                <th className="py-2 px-3 border-b hidden md:table-cell">
                  Presentación
                </th>
                <th className="py-2 px-3 border-b hidden lg:table-cell">
                  Concentración
                </th>
                <th className="py-2 px-3 border-b hidden xl:table-cell">
                  Laboratorio
                </th>
                <th className="py-2 px-3 border-b hidden md:table-cell text-right">
                  Stock
                </th>
                <th className="py-2 px-3 border-b hidden sm:table-cell">
                  Vencimiento
                </th>
                <th className="py-2 px-3 border-b text-right hidden sm:table-cell">
                  Precio compra (S/)
                </th>
                <th className="py-2 px-3 border-b text-right hidden sm:table-cell">
                  Margen (%)
                </th>
                <th className="py-2 px-3 border-b text-right hidden sm:table-cell">
                  Precio venta (S/)
                </th>
                <th className="py-2 px-3 border-b hidden sm:table-cell">
                  Estado
                </th>
                <th className="py-2 px-3 border-b hidden sm:table-cell">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {medicamentosPaginados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-4 text-gray-400">
                    No hay medicamentos registrados
                  </td>
                </tr>
              ) : (
                medicamentosPaginados.map((m) => {
                  // Resaltado de vencimiento
                  let vencClass = "";
                  if (m.fecha_vencimiento) {
                    const hoy = new Date();
                    const venc = new Date(m.fecha_vencimiento);
                    const diff = (venc - hoy) / (1000 * 60 * 60 * 24);
                    if (diff < 0)
                      vencClass = "bg-red-200 text-red-800 font-bold";
                    else if (diff < 90)
                      vencClass = "bg-orange-100 text-orange-800 font-semibold";
                  }
                  return (
                    <tr
                      key={m.id}
                      className={"hover:bg-purple-50 " + vencClass}
                    >
                      <td className="py-2 px-3 border-b">{m.codigo}</td>
                      <td className="py-2 px-3 border-b">{m.nombre}</td>
                      <td className="py-2 px-3 border-b text-center sm:hidden flex flex-row gap-2 justify-center">
                        <button
                          onClick={() => setDetalleMed(m)}
                          className="text-blue-700 hover:text-blue-900"
                          title="Ver detalles"
                        >
                          <FaInfoCircle size={18} />
                        </button>
                        <button
                          onClick={() => handleEdit(m)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Editar"
                        >
                          <FaEdit size={18} />
                        </button>
                        <button
                          onClick={() => setMovimientosMed(m)}
                          className="text-purple-700 hover:text-purple-900"
                          title="Historial"
                        >
                          <FaHistory size={18} />
                        </button>
                        {m.estado !== "cuarentena" && (
                          <button
                            onClick={() => {
                              setCuarentenaData(m);
                              setShowCuarentena(true);
                              setMotivoCuarentena("");
                            }}
                            className="text-yellow-700 hover:text-yellow-900"
                            title="Cuarentena"
                          >
                            <FaLock size={18} />
                          </button>
                        )}
                      </td>
                      <td className="py-2 px-3 border-b hidden md:table-cell">
                        {m.presentacion}
                      </td>
                      <td className="py-2 px-3 border-b hidden lg:table-cell">
                        {m.concentracion}
                      </td>
                      <td className="py-2 px-3 border-b hidden xl:table-cell">
                        {m.laboratorio}
                      </td>
                      <td className="py-2 px-3 border-b text-right hidden md:table-cell">
                        {m.stock}
                      </td>
                      <td className="py-2 px-3 border-b text-center hidden sm:table-cell">
                        {m.fecha_vencimiento
                          ? new Date(m.fecha_vencimiento).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="py-2 px-3 border-b text-right hidden sm:table-cell">
                        {m.precio_compra !== undefined
                          ? Number(m.precio_compra).toFixed(2)
                          : "-"}
                      </td>
                      <td className="py-2 px-3 border-b text-right hidden sm:table-cell">
                        {m.margen_ganancia !== undefined
                          ? Number(m.margen_ganancia).toFixed(1)
                          : "-"}
                      </td>
                      <td className="py-2 px-3 border-b text-right font-semibold text-green-700 hidden sm:table-cell">
                        {m.precio_compra !== undefined &&
                        m.margen_ganancia !== undefined
                          ? (
                              Number(m.precio_compra) +
                              (Number(m.precio_compra) *
                                Number(m.margen_ganancia)) /
                                100
                            ).toFixed(2)
                          : "-"}
                      </td>
                      <td
                        className={
                          "py-2 px-3 border-b hidden sm:table-cell " +
                          (m.estado === "cuarentena"
                            ? "bg-yellow-200 text-yellow-900 font-bold"
                            : "")
                        }
                      >
                        {m.estado === "cuarentena" ? "CUARENTENA" : m.estado}
                      </td>
                      <td className="py-2 px-3 border-b text-center gap-2 justify-center hidden sm:table-cell">
                        <button
                          onClick={() => handleEdit(m)}
                          className="text-blue-600 hover:text-blue-900 mx-1"
                          title="Editar"
                        >
                          <FaEdit size={18} />
                        </button>
                        <button
                          onClick={() => setMovimientosMed(m)}
                          className="text-purple-700 hover:text-purple-900 mx-1"
                          title="Historial"
                        >
                          <FaHistory size={18} />
                        </button>
                        {m.estado !== "cuarentena" && (
                          <button
                            onClick={() => {
                              setCuarentenaData(m);
                              setShowCuarentena(true);
                              setMotivoCuarentena("");
                            }}
                            className="text-yellow-700 hover:text-yellow-900 mx-1"
                            title="Cuarentena"
                          >
                            <FaLock size={18} />
                          </button>
                        )}
                      </td>
                      {/* Modal de detalles para móvil */}
                      {detalleMed && (
                        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                          <div className="bg-white rounded-lg shadow-lg p-6 max-w-xs w-full relative">
                            <button
                              onClick={() => setDetalleMed(null)}
                              className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 text-xl"
                            >
                              ×
                            </button>
                            <h2 className="text-lg font-bold mb-2 text-blue-800">
                              Detalles del Medicamento
                            </h2>
                            <div className="space-y-1 text-sm">
                              <div>
                                <b>Código:</b> {detalleMed.codigo}
                              </div>
                              <div>
                                <b>Nombre:</b> {detalleMed.nombre}
                              </div>
                              <div>
                                <b>Presentación:</b> {detalleMed.presentacion}
                              </div>
                              <div>
                                <b>Concentración:</b> {detalleMed.concentracion}
                              </div>
                              <div>
                                <b>Laboratorio:</b> {detalleMed.laboratorio}
                              </div>
                              <div>
                                <b>Stock:</b> {detalleMed.stock}
                              </div>
                              <div>
                                <b>Vencimiento:</b>{" "}
                                {detalleMed.fecha_vencimiento
                                  ? new Date(
                                      detalleMed.fecha_vencimiento
                                    ).toLocaleDateString()
                                  : "-"}
                              </div>
                              <div>
                                <b>Precio compra:</b> S/{" "}
                                {detalleMed.precio_compra !== undefined
                                  ? Number(detalleMed.precio_compra).toFixed(2)
                                  : "-"}
                              </div>
                              <div>
                                <b>Margen ganancia:</b>{" "}
                                {detalleMed.margen_ganancia !== undefined
                                  ? Number(detalleMed.margen_ganancia).toFixed(
                                      1
                                    )
                                  : "-"}
                                %
                              </div>
                              <div>
                                <b>Precio venta:</b> S/{" "}
                                {detalleMed.precio_compra !== undefined &&
                                detalleMed.margen_ganancia !== undefined
                                  ? (
                                      Number(detalleMed.precio_compra) +
                                      (Number(detalleMed.precio_compra) *
                                        Number(detalleMed.margen_ganancia)) /
                                        100
                                    ).toFixed(2)
                                  : "-"}
                              </div>
                              <div>
                                <b>Estado:</b> {detalleMed.estado}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {/* Modal de cuarentena */}
                      {showCuarentena && (
                        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full relative">
                            <h2 className="text-lg font-bold mb-2 text-yellow-800">
                              Enviar a cuarentena
                            </h2>
                            <p className="mb-2 text-sm">
                              Medicamento: <b>{cuarentenaData?.nombre}</b> (
                              {cuarentenaData?.codigo})
                            </p>
                            <label className="block mb-2 text-sm">
                              Motivo de cuarentena{" "}
                              <span className="text-red-600">*</span>
                            </label>
                            <textarea
                              className="w-full border rounded px-2 py-1 mb-4"
                              rows={3}
                              value={motivoCuarentena}
                              onChange={(e) =>
                                setMotivoCuarentena(e.target.value)
                              }
                              required
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => setShowCuarentena(false)}
                                className="bg-gray-400 text-white px-4 py-2 rounded"
                              >
                                Cancelar
                              </button>
                              <button
                                className="bg-yellow-600 text-white px-4 py-2 rounded"
                                disabled={!motivoCuarentena.trim()}
                                onClick={async () => {
                                  if (!cuarentenaData) return;
                                  const apiUrl = `${BASE_URL}api_medicamentos.php`;
                                  const hoy = new Date()
                                    .toISOString()
                                    .slice(0, 10);
                                  const data = {
                                    ...cuarentenaData,
                                    estado: "cuarentena",
                                    fecha_cuarentena: hoy,
                                    motivo_cuarentena: motivoCuarentena,
                                  };
                                  await fetch(apiUrl, {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify(data),
                                  });
                                  setShowCuarentena(false);
                                  setCuarentenaData(null);
                                  setMotivoCuarentena("");
                                  fetchMedicamentos();
                                }}
                              >
                                Confirmar
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {/* Controles de paginación */}
          <div className="flex justify-between items-center mt-4">
            <div className="text-sm text-gray-600">
              Página {pagina} de {totalPaginas} ({medicamentosFiltrados.length}{" "}
              resultados)
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePagina(1)}
                disabled={pagina === 1}
                className="px-2 py-1 border rounded disabled:opacity-50"
              >
                «
              </button>
              <button
                onClick={() => handlePagina(pagina - 1)}
                disabled={pagina === 1}
                className="px-2 py-1 border rounded disabled:opacity-50"
              >
                ‹
              </button>
              <span className="px-2 py-1">{pagina}</span>
              <button
                onClick={() => handlePagina(pagina + 1)}
                disabled={pagina === totalPaginas || totalPaginas === 0}
                className="px-2 py-1 border rounded disabled:opacity-50"
              >
                ›
              </button>
              <button
                onClick={() => handlePagina(totalPaginas)}
                disabled={pagina === totalPaginas || totalPaginas === 0}
                className="px-2 py-1 border rounded disabled:opacity-50"
              >
                »
              </button>
            </div>
          </div>
        </div>
      )}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-0 max-w-lg w-full relative">
            <MedicamentoForm
              initialData={editData}
              onSave={handleSave}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}
      {movimientosMed && (
        <MovimientosModal
          medicamento={movimientosMed}
          usuario={null}
          onClose={() => {
            setMovimientosMed(null);
            fetchMedicamentos();
          }}
        />
      )}
    </div>
  );
}
