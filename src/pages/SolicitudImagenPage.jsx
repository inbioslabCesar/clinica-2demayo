import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";

const TIPO_CONFIG = {
  rx:         { label: "Rayos X",    emoji: "📸", servTipo: "rayosx",    color: "sky" },
  ecografia:  { label: "Ecografía",  emoji: "🫀", servTipo: "ecografia", color: "violet" },
  tomografia: { label: "Tomografía", emoji: "🔬", servTipo: "tomografia",color: "amber" },
};

export default function SolicitudImagenPage() {
  const { consultaId, tipo } = useParams();
  const navigate = useNavigate();
  const cfg = TIPO_CONFIG[tipo] ?? TIPO_CONFIG.rx;

  const [tarifas, setTarifas]             = useState([]);
  const [loadingTarifas, setLoadingTarifas] = useState(true);
  const [busqueda, setBusqueda]           = useState("");
  const [seleccionados, setSeleccionados] = useState([]); // [{tarifa_id, descripcion, precio}]
  const [indicaciones, setIndicaciones]  = useState("");
  const [cargaAnticipada, setCargaAnticipada] = useState(false);
  const [guardando, setGuardando]         = useState(false);
  const [resultado, setResultado]         = useState(null); // {orden_id, cotizacion_id, numero_comprobante, total}
  const [error, setError]                 = useState("");

  // Paciente desde la consulta (para poder crear la orden)
  const [pacienteId, setPacienteId]       = useState(null);

  useEffect(() => {
    // Cargar tarifas del tipo correspondiente
    fetch(`${BASE_URL}api_tarifas.php`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success) {
          setError(d?.error || `No se pudo cargar el catalogo de ${cfg.label}.`);
          setTarifas([]);
          return;
        }
        const origen = Array.isArray(d?.tarifas) ? d.tarifas : [];
        const lista = origen.filter((t) => t.servicio_tipo === cfg.servTipo && t.activo != 0);
        setTarifas(lista);
      })
      .catch(() => {
        setError(`Error de red al cargar el catalogo de ${cfg.label}.`);
        setTarifas([]);
      })
      .finally(() => setLoadingTarifas(false));

    // Obtener paciente_id de la consulta
    fetch(`${BASE_URL}api_consultas.php?consulta_id=${consultaId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const consulta = d.consultas?.[0] ?? d.consulta ?? null;
        if (consulta?.paciente_id) setPacienteId(consulta.paciente_id);
      })
      .catch(() => {});
  }, [consultaId, cfg.servTipo]);

  const tarifasFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return tarifas;
    return tarifas.filter((t) => t.descripcion?.toLowerCase().includes(q));
  }, [tarifas, busqueda]);

  const toggleServicio = (tarifa) => {
    setSeleccionados((prev) => {
      const existe = prev.some((s) => s.tarifa_id === tarifa.id);
      if (existe) return prev.filter((s) => s.tarifa_id !== tarifa.id);
      return [...prev, { tarifa_id: tarifa.id, descripcion: tarifa.descripcion, precio: parseFloat(tarifa.precio_particular) || 0 }];
    });
  };

  const isSelected = (id) => seleccionados.some((s) => s.tarifa_id === id);

  const total = seleccionados.reduce((acc, s) => acc + s.precio, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (seleccionados.length === 0) { setError("Seleccione al menos un servicio."); return; }
    if (!pacienteId) { setError("No se pudo obtener el paciente de esta consulta."); return; }
    setError("");
    setGuardando(true);
    try {
      const res = await fetch(`${BASE_URL}api_ordenes_imagen.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "crear",
          consulta_id: Number(consultaId),
          paciente_id: Number(pacienteId),
          tipo,
          indicaciones,
          carga_anticipada: cargaAnticipada,
          servicios: seleccionados,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setResultado(d);
      } else {
        setError(d.error ?? "Error al crear la solicitud.");
      }
    } catch {
      setError("Error de red. Intente nuevamente.");
    } finally {
      setGuardando(false);
    }
  };

  const colorMap = {
    sky:    { btn: "bg-sky-600 hover:bg-sky-700",    ring: "ring-sky-400",    badge: "bg-sky-100 text-sky-800",    header: "from-sky-500 to-cyan-600" },
    violet: { btn: "bg-violet-600 hover:bg-violet-700", ring: "ring-violet-400", badge: "bg-violet-100 text-violet-800", header: "from-violet-500 to-purple-600" },
    amber:  { btn: "bg-amber-600 hover:bg-amber-700",  ring: "ring-amber-400",  badge: "bg-amber-100 text-amber-800",  header: "from-amber-500 to-orange-600" },
  };
  const c = colorMap[cfg.color] ?? colorMap.sky;

  // ── Pantalla de éxito ─────────────────────────────────────────────────────
  if (resultado) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-green-200">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-green-700 mb-2">Solicitud generada</h2>
          <p className="text-gray-600 mb-1">{cfg.emoji} <strong>{cfg.label}</strong> — {seleccionados.length} servicio(s)</p>
          {resultado.numero_comprobante && (
            <div className="mt-3 p-3 bg-green-50 rounded-xl border border-green-200">
              <p className="text-sm text-gray-500">Cotización generada</p>
              <p className="text-2xl font-bold text-green-700">{resultado.numero_comprobante}</p>
              <p className="text-lg font-semibold text-gray-700 mt-1">Total: S/ {parseFloat(resultado.total || 0).toFixed(2)}</p>
              {cargaAnticipada && (
                <p className="text-xs mt-1 text-amber-600 font-semibold">⚡ Carga anticipada activada — se puede subir sin pago previo</p>
              )}
            </div>
          )}
          {!resultado.numero_comprobante && (
            <p className="text-sm text-gray-500 mt-2">No se generó cotización (sin precios configurados).</p>
          )}
          <button
            onClick={() => navigate(-1)}
            className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            ← Volver a Historia Clínica
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 py-4 sm:py-8 px-2 sm:px-4">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className={`bg-gradient-to-r ${c.header} text-white rounded-2xl p-5 mb-5 shadow-lg flex items-center gap-4`}>
          <div className="text-4xl">{cfg.emoji}</div>
          <div>
            <h1 className="text-2xl font-bold">Solicitud de {cfg.label}</h1>
            <p className="text-sm opacity-80">Consulta #{consultaId}</p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="ml-auto bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition"
          >
            ← Volver
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Buscador */}
          <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">🔍 Buscar servicio</label>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={`Buscar en catálogo de ${cfg.label}...`}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none"
            />
          </div>

          {/* Catálogo */}
          <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">
              Servicios disponibles{" "}
              <span className="text-gray-400 font-normal">({tarifasFiltradas.length})</span>
            </p>

            {loadingTarifas && (
              <p className="text-sm text-gray-400 text-center py-6">Cargando catálogo...</p>
            )}
            {!loadingTarifas && tarifasFiltradas.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                {tarifas.length === 0
                  ? `No hay servicios de ${cfg.label} configurados en tarifas.`
                  : "Sin resultados para esa búsqueda."}
              </p>
            )}

            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
              {tarifasFiltradas.map((t) => {
                const sel = isSelected(t.id);
                return (
                  <label
                    key={t.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer border transition ${
                      sel ? "border-blue-400 bg-blue-50 ring-1 ring-blue-300" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggleServicio(t)}
                      className="w-4 h-4 accent-blue-600 shrink-0"
                    />
                    <span className="flex-1 text-sm text-gray-800">{t.descripcion}</span>
                    {t.precio_particular > 0 && (
                      <span className="text-sm font-semibold text-green-700 shrink-0">
                        S/ {parseFloat(t.precio_particular).toFixed(2)}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Seleccionados + total */}
          {seleccionados.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="font-semibold text-blue-800 mb-2">✔ Seleccionados ({seleccionados.length})</p>
              <ul className="space-y-1 mb-3">
                {seleccionados.map((s) => (
                  <li key={s.tarifa_id} className="flex justify-between text-sm text-gray-700">
                    <span>{s.descripcion}</span>
                    <span className="font-semibold text-green-700">S/ {s.precio.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-blue-200 pt-2 flex justify-end">
                <span className="font-bold text-blue-900 text-base">Total: S/ {total.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Indicaciones */}
          <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Indicaciones / zona a estudiar</label>
            <textarea
              value={indicaciones}
              onChange={(e) => setIndicaciones(e.target.value)}
              rows={3}
              placeholder={`Ej: Tórax AP y lateral, ${cfg.label.toLowerCase()} de abdomen...`}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none resize-none"
            />
          </div>

          {/* Carga anticipada */}
          <label className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100 transition">
            <input
              type="checkbox"
              checked={cargaAnticipada}
              onChange={(e) => setCargaAnticipada(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
            />
            <div>
              <p className="font-semibold text-amber-800 text-sm">⚡ Urgente — Carga anticipada</p>
              <p className="text-xs text-amber-600">Permite subir resultados sin esperar el pago de la cotización.</p>
            </div>
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={guardando || seleccionados.length === 0}
            className={`w-full ${c.btn} text-white font-bold py-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg`}
          >
            {guardando ? "Generando solicitud..." : `${cfg.emoji} Generar solicitud de ${cfg.label}`}
          </button>
        </form>
      </div>
    </div>
  );
}
