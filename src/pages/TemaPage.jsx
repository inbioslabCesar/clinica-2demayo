import { useState, useEffect, useCallback } from "react";
import { useTheme } from "../context/useTheme";
import { BASE_URL } from "../config/config";
import { Icon } from "@fluentui/react";

function ColorSwatch({ color, label, onChange, name }) {
  return (
    <div className="flex items-center gap-3">
      <label className="relative cursor-pointer">
        <input
          type="color"
          value={color}
          onChange={(e) => onChange(name, e.target.value)}
          className="absolute inset-0 opacity-0 w-0 h-0 cursor-pointer"
        />
        <div
          className="w-10 h-10 rounded-lg border-2 border-gray-300 shadow-sm hover:border-gray-400 transition-colors cursor-pointer"
          style={{ backgroundColor: color }}
        />
      </label>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-700 truncate">{label}</div>
        <div className="text-xs text-gray-400 font-mono">{color}</div>
      </div>
    </div>
  );
}

function PresetCard({ id, preset, isActive, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`relative p-4 rounded-xl border-2 transition-all duration-200 text-left hover:shadow-md ${
        isActive
          ? "border-blue-500 ring-2 ring-blue-200 shadow-md"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {isActive && (
        <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
      <div className="text-sm font-semibold text-gray-800 mb-2">{preset.label}</div>
      <div className="flex gap-1">
        {[preset.primary, preset.primary_dark, preset.secondary, preset.accent, preset.navbar_bg].map((c, i) => (
          <div key={i} className="w-6 h-6 rounded-md border border-gray-200" style={{ backgroundColor: c }} />
        ))}
      </div>
      {/* Mini preview */}
      <div className="mt-3 rounded-lg overflow-hidden border border-gray-200 h-16">
        <div className="h-3" style={{ backgroundColor: preset.navbar_bg }} />
        <div className="flex h-13">
          <div
            className="w-8 h-full"
            style={{
              background: `linear-gradient(to bottom right, ${preset.sidebar_from}, ${preset.sidebar_via}, ${preset.sidebar_to})`,
            }}
          />
          <div className="flex-1 bg-blue-50" />
        </div>
      </div>
    </button>
  );
}

function LivePreview({ colors }) {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      {/* Navbar */}
      <div className="h-10 flex items-center px-4 gap-3" style={{ backgroundColor: colors.tema_navbar_bg }}>
        <div className="w-6 h-6 rounded-full bg-white/30" />
        <div className="h-3 w-24 bg-white/50 rounded" />
        <div className="ml-auto h-3 w-16 bg-white/30 rounded" />
      </div>
      <div className="flex" style={{ minHeight: 140 }}>
        {/* Sidebar */}
        <div
          className="w-20 p-2 space-y-2"
          style={{
            background: `linear-gradient(to bottom right, ${colors.tema_sidebar_from}, ${colors.tema_sidebar_via}, ${colors.tema_sidebar_to})`,
          }}
        >
          <div className="h-10 w-full rounded-lg bg-white/20 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-white/40" />
          </div>
          <div className="h-3 bg-white/30 rounded mx-1" />
          <div className="h-3 bg-white/20 rounded mx-1" />
          <div className="h-3 bg-white/20 rounded mx-1" />
        </div>
        {/* Main */}
        <div className="flex-1 bg-blue-50 p-3">
          <div className="h-4 w-32 rounded mb-3" style={{ backgroundColor: colors.tema_primary }} />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-8 rounded-lg" style={{ backgroundColor: colors.tema_primary_light }} />
            <div className="h-8 rounded-lg" style={{ backgroundColor: colors.tema_primary_light }} />
          </div>
          <div className="mt-2 flex gap-2">
            <div className="h-6 w-20 rounded-lg text-white text-xs flex items-center justify-center font-medium" style={{ backgroundColor: colors.tema_primary }}>
              Botón
            </div>
            <div className="h-6 w-20 rounded-lg text-white text-xs flex items-center justify-center font-medium" style={{ backgroundColor: colors.tema_accent }}>
              Acción
            </div>
          </div>
        </div>
      </div>
      {/* Login preview */}
      <div
        className="h-20 flex items-center justify-center"
        style={{
          background: `linear-gradient(to bottom right, ${colors.tema_login_from}, ${colors.tema_login_via}, ${colors.tema_login_to})`,
        }}
      >
        <div className="bg-white/10 backdrop-blur rounded-lg px-6 py-2 border border-white/20">
          <div className="text-white/80 text-xs font-medium text-center">Vista Login</div>
        </div>
      </div>
    </div>
  );
}

export default function TemaPage() {
  const { theme, presets, refreshTheme } = useTheme();
  const [activePreset, setActivePreset] = useState(theme.tema_preset || "purple");
  const [colors, setColors] = useState({ ...theme });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [isCustom, setIsCustom] = useState(theme.tema_preset === "custom");
  const [publicLayout, setPublicLayout] = useState(theme.tema_public_layout || "classic");

  useEffect(() => {
    setColors({ ...theme });
    setActivePreset(theme.tema_preset || "purple");
    setIsCustom(theme.tema_preset === "custom");
    setPublicLayout(theme.tema_public_layout || "classic");
  }, [theme]);

  const selectPreset = useCallback(
    (id) => {
      const p = presets[id];
      if (!p) return;
      setActivePreset(id);
      setIsCustom(false);
      setColors({
        tema_preset: id,
        tema_primary: p.primary,
        tema_primary_dark: p.primary_dark,
        tema_primary_light: p.primary_light,
        tema_secondary: p.secondary,
        tema_accent: p.accent,
        tema_navbar_bg: p.navbar_bg,
        tema_sidebar_from: p.sidebar_from,
        tema_sidebar_via: p.sidebar_via,
        tema_sidebar_to: p.sidebar_to,
        tema_login_from: p.login_from,
        tema_login_via: p.login_via,
        tema_login_to: p.login_to,
      });
    },
    [presets]
  );

  const handleColorChange = useCallback((name, value) => {
    setColors((prev) => ({ ...prev, [name]: value }));
    setIsCustom(true);
    setActivePreset("custom");
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = isCustom
        ? {
            preset: "custom",
            public_layout: publicLayout,
            primary: colors.tema_primary,
            primary_dark: colors.tema_primary_dark,
            primary_light: colors.tema_primary_light,
            secondary: colors.tema_secondary,
            accent: colors.tema_accent,
            navbar_bg: colors.tema_navbar_bg,
            sidebar_from: colors.tema_sidebar_from,
            sidebar_via: colors.tema_sidebar_via,
            sidebar_to: colors.tema_sidebar_to,
            login_from: colors.tema_login_from,
            login_via: colors.tema_login_via,
            login_to: colors.tema_login_to,
          }
        : { preset: activePreset, public_layout: publicLayout };

      const res = await fetch(`${BASE_URL}api_tema.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.success) {
        setMessage({ type: "success", text: "Tema actualizado correctamente" });
        window.dispatchEvent(new CustomEvent("clinica-theme-updated", { detail: data.tema }));
        refreshTheme();
      } else {
        setMessage({ type: "error", text: data?.error || "Error al guardar" });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100">
          <Icon iconName="Color" className="text-2xl text-purple-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Personalización Visual</h1>
          <p className="text-sm text-gray-500">Configura los colores del sistema, login y página pública</p>
        </div>
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm font-medium ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          <Icon iconName={message.type === "success" ? "CheckMark" : "ErrorBadge"} />
          {message.text}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Presets + Custom Colors */}
        <div className="lg:col-span-2 space-y-6">
          {/* Presets */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Paletas predefinidas</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Object.entries(presets).map(([id, preset]) => (
                <PresetCard
                  key={id}
                  id={id}
                  preset={preset}
                  isActive={!isCustom && activePreset === id}
                  onSelect={selectPreset}
                />
              ))}
            </div>
          </div>

          {/* Custom Colors */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Colores personalizados</h2>
              {isCustom && (
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                  Modo personalizado
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Modifica cualquier color manualmente. Al cambiar uno, se activará el modo personalizado.
            </p>

            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">General</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <ColorSwatch color={colors.tema_primary} label="Primario" onChange={handleColorChange} name="tema_primary" />
                  <ColorSwatch color={colors.tema_primary_dark} label="Primario oscuro" onChange={handleColorChange} name="tema_primary_dark" />
                  <ColorSwatch color={colors.tema_primary_light} label="Primario claro" onChange={handleColorChange} name="tema_primary_light" />
                  <ColorSwatch color={colors.tema_secondary} label="Secundario" onChange={handleColorChange} name="tema_secondary" />
                  <ColorSwatch color={colors.tema_accent} label="Acento" onChange={handleColorChange} name="tema_accent" />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Barra superior (Navbar)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <ColorSwatch color={colors.tema_navbar_bg} label="Fondo navbar" onChange={handleColorChange} name="tema_navbar_bg" />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Barra lateral (Sidebar)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <ColorSwatch color={colors.tema_sidebar_from} label="Degradado inicio" onChange={handleColorChange} name="tema_sidebar_from" />
                  <ColorSwatch color={colors.tema_sidebar_via} label="Degradado medio" onChange={handleColorChange} name="tema_sidebar_via" />
                  <ColorSwatch color={colors.tema_sidebar_to} label="Degradado final" onChange={handleColorChange} name="tema_sidebar_to" />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Pantalla de login</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <ColorSwatch color={colors.tema_login_from} label="Fondo inicio" onChange={handleColorChange} name="tema_login_from" />
                  <ColorSwatch color={colors.tema_login_via} label="Fondo medio" onChange={handleColorChange} name="tema_login_via" />
                  <ColorSwatch color={colors.tema_login_to} label="Fondo final" onChange={handleColorChange} name="tema_login_to" />
                </div>
              </div>
            </div>
          </div>

          {/* Public Layout Selector */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Diseño de Página Pública</h2>
            <p className="text-sm text-gray-500 mb-4">
              Elige el diseño visual de tu sitio web público.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Classic */}
              <button
                type="button"
                onClick={() => setPublicLayout("classic")}
                className={`relative rounded-xl border-2 p-4 text-left transition-all hover:shadow-md ${
                  publicLayout === "classic"
                    ? "border-blue-500 ring-2 ring-blue-200 shadow-md"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {publicLayout === "classic" && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                <div className="text-sm font-semibold text-gray-800 mb-2">Clásico</div>
                <div className="rounded-lg overflow-hidden border border-gray-200 h-24 bg-gray-50">
                  <div className="h-3 bg-white border-b border-gray-200 flex items-center px-2">
                    <div className="flex gap-1">
                      <div className="w-4 h-1.5 bg-gray-300 rounded" />
                      <div className="w-4 h-1.5 bg-gray-300 rounded" />
                      <div className="w-4 h-1.5 bg-gray-300 rounded" />
                    </div>
                  </div>
                  <div className="p-2 space-y-1">
                    <div className="h-8 rounded bg-gradient-to-r from-blue-200 to-purple-200" />
                    <div className="grid grid-cols-2 gap-1">
                      <div className="h-4 rounded bg-white border border-gray-200" />
                      <div className="h-4 rounded bg-white border border-gray-200" />
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-2">Banner carousel, servicios en cards, ofertas dinámicas</div>
              </button>

              {/* Landing */}
              <button
                type="button"
                onClick={() => setPublicLayout("landing")}
                className={`relative rounded-xl border-2 p-4 text-left transition-all hover:shadow-md ${
                  publicLayout === "landing"
                    ? "border-blue-500 ring-2 ring-blue-200 shadow-md"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {publicLayout === "landing" && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                <div className="text-sm font-semibold text-gray-800 mb-2">Landing Premium</div>
                <div className="rounded-lg overflow-hidden border border-gray-200 h-24">
                  <div className="h-3 bg-white border-b border-gray-200 flex items-center justify-between px-2">
                    <div className="w-6 h-1.5 bg-gray-300 rounded" />
                    <div className="flex gap-1">
                      <div className="w-3 h-1.5 bg-gray-300 rounded" />
                      <div className="w-3 h-1.5 bg-gray-300 rounded" />
                      <div className="w-8 h-1.5 rounded" style={{ backgroundColor: colors.tema_primary }} />
                    </div>
                  </div>
                  <div className="h-10 flex" style={{ background: `linear-gradient(135deg, ${colors.tema_primary_light}, #c2e9fb, ${colors.tema_accent}40)` }}>
                    <div className="w-1/2 p-1.5 flex flex-col justify-center">
                      <div className="h-1.5 w-12 rounded mb-1" style={{ backgroundColor: colors.tema_primary }} />
                      <div className="h-1 w-8 bg-gray-400 rounded" />
                    </div>
                    <div className="w-1/2 bg-gray-200/50 rounded-l-lg" />
                  </div>
                  <div className="p-1 flex gap-1 justify-center">
                    <div className="w-6 h-4 rounded bg-white border border-gray-200" />
                    <div className="w-6 h-4 rounded bg-white border border-gray-200" />
                    <div className="w-6 h-4 rounded bg-white border border-gray-200" />
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-2">Hero full, servicios, testimonios, FAQ, mapa, página Conócenos</div>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Preview + Save */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Vista previa</h2>
            <LivePreview colors={colors} />
            <button
              onClick={handleSave}
              disabled={saving}
              className="mt-4 w-full py-3 px-4 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.01] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ backgroundColor: colors.tema_primary }}
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Icon iconName="Save" className="text-lg" />
                  Guardar tema
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
