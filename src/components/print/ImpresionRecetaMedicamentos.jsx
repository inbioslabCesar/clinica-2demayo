import { formatColegiatura, formatProfesionalName } from "../../utils/profesionalDisplay";
import { BASE_URL } from "../../config/config.js";

const ImpresionRecetaMedicamentos = ({ 
  paciente, 
  medicamentos,
  medicoInfo,
  configuracionClinica,
  diagnosticos,
}) => {
  const nombrePaciente = paciente?.nombre || paciente?.nombres || '';
  const apellidoPaciente = paciente?.apellido || paciente?.apellidos || '';

  // Resolver logo con base URL del servidor PHP
  const resolveLogoUrl = (rawValue) => {
    const raw = String(rawValue || '').trim();
    if (!raw) return '/2demayo.svg';
    if (/^(https?:\/\/|data:|blob:)/i.test(raw)) return raw;
    return `${BASE_URL}${raw.replace(/^\/+/, '')}`;
  };

  const logoSrc = resolveLogoUrl(configuracionClinica?.logo_url);
  const formatearFecha = (fecha) => {
    if (!fecha) return '';
    return new Date(fecha).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatearHora = (fecha) => {
    if (!fecha) return '';
    return new Date(fecha).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const diagnosticosArray = Array.isArray(diagnosticos) ? diagnosticos : [];
  const medicamentosArray = Array.isArray(medicamentos) ? medicamentos : [];

  return (
    <div
      className="receta-a4-landscape bg-white text-slate-900 print:text-black"
      style={{
        width: "277mm",
        height: "190mm",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 0,
        overflow: "hidden",
        boxSizing: "border-box",
        fontFamily: "Arial, sans-serif",
        fontSize: "11px",
        lineHeight: 1.18,
      }}
    >
      <section
        className="relative h-full overflow-hidden border-r border-dashed border-slate-400"
        style={{ padding: "3mm 3mm 2.5mm 3mm" }}
      >
        <img
          src={logoSrc}
          alt=""
          className="pointer-events-none absolute inset-0 m-auto w-3/4 opacity-[0.03]"
          style={{ filter: "grayscale(100%)" }}
        />

        <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden">
          <header className="flex items-start justify-between gap-2 border-b border-slate-900 pb-1">
            <div className="flex min-w-0 items-start gap-2">
              <img
                src={logoSrc}
                alt={configuracionClinica?.nombre_clinica || "Logo"}
                className="h-12 w-auto shrink-0 object-contain"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold uppercase leading-tight">
                  {configuracionClinica?.nombre_clinica || "MI CLINICA"}
                </p>
                {configuracionClinica?.slogan && (
                  <p className="text-[11px] leading-tight" style={{ color: configuracionClinica.slogan_color || "#374151" }}>
                    {configuracionClinica.slogan}
                  </p>
                )}
                <p className="text-[11px] leading-tight">RUC: {configuracionClinica?.ruc || "-"}</p>
                <p className="text-[11px] leading-tight">Dirección: {configuracionClinica?.direccion || "-"}</p>
                <p className="text-[11px] leading-tight">Tel: {configuracionClinica?.telefono || "-"}</p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-bold leading-tight">{formatProfesionalName(medicoInfo || {})}</p>
              <p className="text-[11px] leading-tight">{medicoInfo?.especialidad}</p>
              <p className="text-[11px] leading-tight">{formatColegiatura(medicoInfo || {})}</p>
              {medicoInfo?.rne && <p className="text-[11px] leading-tight">RNE: {medicoInfo.rne}</p>}
            </div>
          </header>

          <div className="mt-1 flex items-center justify-between border-b border-slate-900 pb-1">
            <p className="text-sm font-bold tracking-wide">RECETA MEDICA</p>
            <div className="text-[11px] text-slate-700">
              <span className="mr-3">Fecha: {formatearFecha(new Date())}</span>
              <span>Hora: {formatearHora(new Date())}</span>
            </div>
          </div>

          <section className="mt-1 border border-slate-900 p-1.5">
            <p className="mb-0.5 border-b border-slate-300 text-[11px] font-semibold uppercase">Datos del paciente</p>
            <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[11px] leading-tight">
              <p className="col-span-3"><span className="font-semibold">Paciente:</span> {nombrePaciente} {apellidoPaciente}</p>
              <p><span className="font-semibold">DNI:</span> {paciente?.dni || "-"}</p>
              <p><span className="font-semibold">Edad:</span> {paciente?.edad ? `${paciente.edad} años` : "-"}</p>
              <p><span className="font-semibold">Sexo:</span> {paciente?.sexo || "-"}</p>
            </div>
          </section>

          {diagnosticosArray.length > 0 && (
            <section className="mt-1 border border-slate-900 p-1.5">
              <p className="mb-0.5 border-b border-slate-300 text-[11px] font-semibold uppercase">Diagnóstico</p>
              <div className="space-y-0.5 text-[11px] leading-tight">
                {diagnosticosArray.map((diagnostico, index) => (
                  <p key={index}>
                    <span className="font-semibold">{diagnostico.codigo || diagnostico.cie10_codigo || ""}</span>
                    {(diagnostico.codigo || diagnostico.cie10_codigo) ? " - " : ""}
                    {diagnostico.descripcion || diagnostico.cie10_descripcion || diagnostico.nombre || ""}
                  </p>
                ))}
              </div>
            </section>
          )}

          <section className="mt-1 flex min-h-0 flex-1 flex-col overflow-hidden border border-slate-900 p-1.5">
            <div className="mb-1 flex items-center justify-between border-b border-slate-300 pb-0.5">
              <p className="text-sm font-bold">Rp/ Medicamentos</p>
              <p className="text-[11px] text-slate-600">Lista prescrita</p>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {medicamentosArray.length > 0 ? (
                <div className="divide-y divide-slate-200">
                  {medicamentosArray.map((medicamento, index) => (
                    <article key={index} className="py-0.5">
                      <div className="flex gap-1.5">
                        <div className="w-6 shrink-0 text-[10px] font-semibold">{index + 1}.</div>
                        <div className="min-w-0 flex-1 space-y-0.5 leading-[1]">
                          <p className="text-[10px] font-semibold uppercase leading-[1]">
                            {medicamento.nombre || "Medicamento no especificado"}
                            {medicamento.codigo && <span className="ml-1 font-normal text-slate-600">({medicamento.codigo})</span>}
                          </p>
                          <p className="text-[10px] leading-[1] text-slate-800">
                            {[
                              medicamento.presentacion,
                              medicamento.concentracion,
                              medicamento.laboratorio,
                            ]
                              .filter(Boolean)
                              .join(" - ") || "Sin presentación / concentración / laboratorio"}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] italic text-slate-500">Sin medicamentos registrados.</p>
              )}
            </div>
          </section>

          <footer className="mt-1 flex shrink-0 items-end justify-between gap-3 border-t border-slate-900 pt-1">
            <div className="text-[11px] text-slate-700">
              <p className="font-semibold uppercase">Despachado</p>
              <p>Emitido: {formatearFecha(new Date())}</p>
              <p>Válido 30 días</p>
            </div>
            <div className="flex flex-col items-center justify-end text-center">
              <div className="flex h-20 w-28 items-center justify-center border border-dashed border-slate-400">
                <span className="text-[11px] leading-tight text-slate-500">SELLO FARMACIA</span>
              </div>
            </div>
          </footer>
        </div>
      </section>

      <section
        className="relative h-full overflow-hidden"
        style={{ padding: "3mm 3mm 2.5mm 3mm" }}
      >
        <img
          src={logoSrc}
          alt=""
          className="pointer-events-none absolute inset-0 m-auto w-3/4 opacity-[0.03]"
          style={{ filter: "grayscale(100%)" }}
        />

        <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden">
          <header className="border-b border-slate-900 pb-1 text-right">
            <p className="text-xs font-bold leading-tight">{formatProfesionalName(medicoInfo || {})}</p>
            <p className="text-[11px] leading-tight">{medicoInfo?.especialidad}</p>
            <p className="text-[11px] leading-tight">{formatColegiatura(medicoInfo || {})}</p>
            {medicoInfo?.rne && <p className="text-[11px] leading-tight">RNE: {medicoInfo.rne}</p>}
          </header>

          <div className="mt-1 border-b border-slate-900 pb-1 text-center">
            <p className="text-sm font-bold tracking-wide">INDICACIONES</p>
          </div>

          <section className="mt-1 flex min-h-0 flex-1 flex-col overflow-hidden border border-slate-900 p-1.5">
            <div className="min-h-0 flex-1 overflow-hidden">
              {medicamentosArray.length > 0 ? (
                <div className="divide-y divide-slate-200">
                  {medicamentosArray.map((medicamento, index) => (
                    <article key={index} className="py-0.5">
                      <div className="flex gap-1.5">
                        <div className="w-6 shrink-0 text-[10px] font-semibold">{index + 1}.</div>
                        <div className="min-w-0 flex-1 space-y-0.5 leading-[1]">
                          <p className="text-[10px] font-semibold uppercase leading-[1]">{medicamento.nombre || "Medicamento"}</p>
                          <p className="text-[10px] leading-[1] text-slate-800">
                            <span className="font-semibold">Dosis:</span> {medicamento.dosis || "-"}
                            <span className="mx-1 text-slate-400">|</span>
                            <span className="font-semibold">Frecuencia:</span> {medicamento.frecuencia || "-"}
                            <span className="mx-1 text-slate-400">|</span>
                            <span className="font-semibold">Duración:</span> {medicamento.duracion || "-"}
                          </p>
                          {medicamento.observaciones && (
                            <p className="text-[10px] leading-[1] text-slate-800">
                              Obs: {medicamento.observaciones}
                            </p>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] italic text-slate-500">Sin indicaciones.</p>
              )}
            </div>
          </section>

          <section className="mt-1 shrink-0 border border-rose-300 bg-rose-50 p-1.5 text-[11px] text-rose-800">
            <p className="font-semibold uppercase">Advertencias</p>
            <p>Receta personal e intransferible. Fuera del alcance de niños.</p>
          </section>

          <footer className="mt-1 flex shrink-0 justify-end border-t border-slate-900 pt-1">
            <div className="flex flex-col items-center justify-end text-center">
              {medicoInfo?.firma && (
                <div className="mb-[-10px]">
                  <img
                    src={medicoInfo.firma}
                    alt="Firma digital del médico"
                    className="firma-img-receta mx-auto block max-h-20 w-auto bg-transparent p-0"
                  />
                </div>
              )}
              {!medicoInfo?.firma && (
                <div className="mb-[-10px] flex h-20 w-40 items-center justify-center border border-dashed border-slate-400">
                  <span className="text-[11px] text-slate-500">[Firma Manual]</span>
                </div>
              )}
              <div className="min-w-40 border-t border-slate-900 pt-1 text-[11px] leading-tight">
                <p className="font-bold">{formatProfesionalName(medicoInfo || {})}</p>
                <p>{medicoInfo?.especialidad}</p>
                <p>{formatColegiatura(medicoInfo || {})}</p>
                {medicoInfo?.rne && <p>RNE: {medicoInfo.rne}</p>}
                <p className="mt-1 font-bold uppercase">Firma médico</p>
              </div>
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
};

export default ImpresionRecetaMedicamentos;