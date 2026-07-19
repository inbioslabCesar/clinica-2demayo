import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { authFetch } from "../utils/apiClient";

const TIPO_CONFIG = {
  rx: { label: "Rayos X", emoji: "📸", servTipo: "rayosx", color: "sky" },
  ecografia: {
    label: "Ecografía",
    emoji: "🫀",
    servTipo: "ecografia",
    color: "violet",
  },
  tomografia: {
    label: "Tomografía",
    emoji: "🔬",
    servTipo: "tomografia",
    color: "amber",
  },
};

export default function SolicitudImagenPage() {
  const { consultaId, tipo } = useParams();
  const navigate = useNavigate();
  const cfg = TIPO_CONFIG[tipo] ?? TIPO_CONFIG.rx;

  const [tarifas, setTarifas] = useState([]);
  const [loadingTarifas, setLoadingTarifas] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionados, setSeleccionados] = useState([]); // [{tarifa_id, descripcion, precio, medico_id}]
  const [indicaciones, setIndicaciones] = useState("");
  const [cargaAnticipada, setCargaAnticipada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null); // {orden_id, cotizacion_id, numero_comprobante, total}
  const [error, setError] = useState("");

  // Paciente desde la consulta (para poder crear la orden)
  const [pacienteId, setPacienteId] = useState(null);

  useEffect(() => {
    // Cargar tarifas del tipo correspondiente
    authFetch(`api_tarifas.php`)
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success) {
          setError(
            d?.error || `No se pudo cargar el catalogo de ${cfg.label}.`,
          );
          setTarifas([]);
          return;
        }
        const origen = Array.isArray(d?.tarifas) ? d.tarifas : [];
        const lista = origen.filter(
          (t) => t.servicio_tipo === cfg.servTipo && t.activo != 0,
        );
        setTarifas(lista);
      })
      .catch(() => {
        setError(`Error de red al cargar el catalogo de ${cfg.label}.`);
        setTarifas([]);
      })
      .finally(() => setLoadingTarifas(false));

    // Obtener paciente_id de la consulta
    authFetch(`api_consultas.php?consulta_id=${consultaId}`)
      .then((r) => r.json())
      .then((d) => {
        const consulta = d.consultas?.[0] ?? d.consulta ?? null;
        if (consulta?.paciente_id) setPacienteId(consulta.paciente_id);
      })
      .catch(() => {});
  }, [consultaId, cfg.label, cfg.servTipo]);

  const tarifasFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return tarifas;
    return tarifas.filter((t) => t.descripcion?.toLowerCase().includes(q));
  }, [tarifas, busqueda]);

  const toggleServicio = (tarifa) => {
    setSeleccionados((prev) => {
      const existe = prev.some((s) => s.tarifa_id === tarifa.id);
      if (existe) return prev.filter((s) => s.tarifa_id !== tarifa.id);
      return [
        ...prev,
        {
          tarifa_id: tarifa.id,
          descripcion: tarifa.descripcion,
          precio: parseFloat(tarifa.precio_particular) || 0,
          medico_id: Number(tarifa.medico_id || 0) || 0,
        },
      ];
    });
  };

  const isSelected = (id) => seleccionados.some((s) => s.tarifa_id === id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (seleccionados.length === 0) {
      setError("Seleccione al menos un servicio.");
      return;
    }
    if (!pacienteId) {
      setError("No se pudo obtener el paciente de esta consulta.");
      return;
    }
    setError("");
    setGuardando(true);
    try {
      const res = await authFetch(`api_ordenes_imagen.php`, {
        method: "POST",
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
    sky: {
      btn: "bg-sky-600 hover:bg-sky-700",
      ring: "ring-sky-400",
      badge: "bg-sky-100 text-sky-800",
      header: "from-sky-500 to-cyan-600",
    },
    violet: {
      btn: "bg-violet-600 hover:bg-violet-700",
      ring: "ring-violet-400",
      badge: "bg-violet-100 text-violet-800",
      header: "from-violet-500 to-purple-600",
    },
    amber: {
      btn: "bg-amber-600 hover:bg-amber-700",
      ring: "ring-amber-400",
      badge: "bg-amber-100 text-amber-800",
      header: "from-amber-500 to-orange-600",
    },
  };
  const c = colorMap[cfg.color] ?? colorMap.sky;
  const themedPageBg = {
    background: 'linear-gradient(to bottom right, var(--color-primary-light, #eff6ff), #ffffff, color-mix(in srgb, var(--color-accent, #eef2ff) 28%, white))',
  };
  const primaryActionStyle = {
    background: 'linear-gradient(to right, var(--color-primary, #2563eb), var(--color-secondary, #4f46e5))',
  };
  const selectedCardStyle = {
    borderColor: 'color-mix(in srgb, var(--color-primary, #2563eb) 48%, white)',
    backgroundColor: 'color-mix(in srgb, var(--color-primary-light, #dbeafe) 68%, white)',
    boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-primary, #2563eb) 22%, white)',
  };
  const selectedPanelStyle = {
    backgroundColor: 'color-mix(in srgb, var(--color-primary-light, #dbeafe) 72%, white)',
    borderColor: 'color-mix(in srgb, var(--color-primary, #2563eb) 30%, white)',
  };
  const selectedPanelTitleStyle = {
    color: 'var(--color-primary-dark, #1d4ed8)',
  };

  // ── Pantalla de éxito ─────────────────────────────────────────────────────
  if (resultado) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 solicitud-imagen-theme" style={themedPageBg}>
        <style>{`
          .solicitud-imagen-theme input:focus,
          .solicitud-imagen-theme textarea:focus {
            border-color: var(--color-primary, #2563eb) !important;
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary-light, #dbeafe) 75%, white) !important;
          }
        `}</style>
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-green-200">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-green-700 mb-2">
            Solicitud generada
          </h2>
          <p className="text-gray-600 mb-1">
            {cfg.emoji} <strong>{cfg.label}</strong> — {seleccionados.length}{" "}
            servicio(s)
          </p>
          {resultado.numero_comprobante && (
            <div className="mt-3 p-3 bg-green-50 rounded-xl border border-green-200">
              <p className="text-sm text-gray-500">Cotización generada</p>
              <p className="text-2xl font-bold text-green-700">
                {resultado.numero_comprobante}
              </p>
              <p className="text-sm font-semibold text-gray-700 mt-1">
                Servicios registrados correctamente.
              </p>
              {cargaAnticipada && (
                <p className="text-xs mt-1 text-amber-600 font-semibold">
                  ⚡ Carga anticipada activada — se puede subir sin pago previo
                </p>
              )}
            </div>
          )}
          {!resultado.numero_comprobante && (
            <p className="text-sm text-gray-500 mt-2">
              No se generó cotización (sin precios configurados).
            </p>
          )}
          <button
            onClick={() => navigate(-1)}
            className="mt-6 text-white px-6 py-2 rounded-lg font-semibold transition"
            style={primaryActionStyle}
          >
            ← Volver a Historia Clínica
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-4 sm:py-8 px-2 sm:px-4 solicitud-imagen-theme" style={themedPageBg}>
      <style>{`
        .solicitud-imagen-theme input:focus,
        .solicitud-imagen-theme textarea:focus {
          border-color: var(--color-primary, #2563eb) !important;
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary-light, #dbeafe) 75%, white) !important;
        }
      `}</style>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div
          className={`bg-gradient-to-r ${c.header} text-white rounded-2xl p-5 mb-5 shadow-lg flex items-center gap-4`}
        >
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
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              🔍 Buscar servicio
            </label>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={`Buscar en catálogo de ${cfg.label}...`}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none"
            />
          </div>

          {/* Catálogo */}
          <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">
              Servicios disponibles{" "}
              <span className="text-gray-400 font-normal">
                ({tarifasFiltradas.length})
              </span>
            </p>

            {loadingTarifas && (
              <p className="text-sm text-gray-400 text-center py-6">
                Cargando catálogo...
              </p>
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
                      sel
                        ? ""
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                    style={sel ? selectedCardStyle : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggleServicio(t)}
                      className="w-4 h-4 shrink-0"
                      style={{ accentColor: 'var(--color-primary, #2563eb)' }}
                    />
                    <span className="flex-1 text-sm text-gray-800">
                      {t.descripcion}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Seleccionados + total */}
          {seleccionados.length > 0 && (
            <div className="border rounded-xl p-4" style={selectedPanelStyle}>
              <p className="font-semibold mb-2" style={selectedPanelTitleStyle}>
                ✔ Seleccionados ({seleccionados.length})
              </p>
              <ul className="space-y-1 mb-3">
                {seleccionados.map((s) => (
                  <li key={s.tarifa_id} className="text-sm text-gray-700">
                    <span>{s.descripcion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Indicaciones */}
          <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Indicaciones / zona a estudiar
            </label>
            <textarea
              value={indicaciones}
              onChange={(e) => setIndicaciones(e.target.value)}
              rows={3}
              placeholder={`Ej: Tórax AP y lateral, ${cfg.label.toLowerCase()} de abdomen...`}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none resize-none"
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
              <p className="font-semibold text-amber-800 text-sm">
                ⚡ Urgente — Carga anticipada
              </p>
              <p className="text-xs text-amber-600">
                Permite subir resultados sin esperar el pago de la cotización.
              </p>
            </div>
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={guardando || seleccionados.length === 0}
            className="w-full text-white font-bold py-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            style={primaryActionStyle}
          >
            {guardando
              ? "Generando solicitud..."
              : `${cfg.emoji} Generar solicitud de ${cfg.label}`}
          </button>
        </form>
      </div>
    </div>
  );
}
