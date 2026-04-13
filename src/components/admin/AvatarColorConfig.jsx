import { useMemo } from 'react';

function AvatarColorConfig() {
  const previewStyle = useMemo(
    () => ({
      background: 'linear-gradient(135deg, #3b82f6 0%, #22d3ee 100%)',
    }),
    []
  );

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4">
        <h3 className="text-lg font-semibold text-slate-800">Colores de Avatar</h3>
        <p className="text-sm text-slate-600">
          Este modulo se incluye para mantener la compatibilidad del panel de configuracion.
        </p>
      </header>

      <div className="flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white" style={previewStyle}>
          A
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700">Vista previa de avatar</p>
          <p className="text-xs text-slate-500">Puedes ampliar esta seccion luego con presets o selector avanzado.</p>
        </div>
      </div>
    </section>
  );
}

export default AvatarColorConfig;
