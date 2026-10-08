import { formatColegiatura, formatProfesionalName } from "../../utils/profesionalDisplay";
import { BASE_URL } from "../../config/config.js";
import { resolverEdadDisplayClinica } from "../../utils/edadClinica";

const ImpresionRecetaMedicamentos = ({ 
  paciente, 
  medicamentos,
  recomendaciones,
  medicoInfo,
  configuracionClinica,
  diagnosticos,
}) => {
  const nombrePaciente = paciente?.nombre || paciente?.nombres || '';
  const apellidoPaciente = paciente?.apellido || paciente?.apellidos || '';
  const edadPaciente = resolverEdadDisplayClinica(paciente);
  const edadPacienteTexto = edadPaciente === "No registrada" ? "-" : edadPaciente;

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

  const esDescripcionCatalogoCie10 = (valor) => {
    const texto = String(valor || '').trim();
    return /^OMS ICD-10/i.test(texto);
  };

  const obtenerCodigoDiagnostico = (diagnostico) => {
    return String(
      diagnostico?.codigo
      || diagnostico?.cie10
      || diagnostico?.cie10_codigo
      || ''
    ).trim();
  };

  const obtenerNombreDiagnostico = (diagnostico) => {
    const nombre = String(
      diagnostico?.nombre
      || diagnostico?.diagnostico
      || diagnostico?.cie10_nombre
      || ''
    ).trim();
    if (nombre) return nombre;

    const descripcion = String(
      diagnostico?.descripcion
      || diagnostico?.cie10_descripcion
      || ''
    ).trim();

    if (!descripcion || esDescripcionCatalogoCie10(descripcion)) {
      return 'Sin diagnóstico';
    }

    return descripcion;
  };

  const diagnosticosArray = Array.isArray(diagnosticos) ? diagnosticos : [];
  const medicamentosArray = Array.isArray(medicamentos) ? medicamentos : [];
  const recomendacionesGenerales = String(recomendaciones || '').trim();

  const getCantidadImpresion = (medicamento) => {
    const cantidad = Number.parseInt(
      medicamento?.cantidad_dispensacion ?? medicamento?.cantidad_dispensar ?? medicamento?.cantidad_total ?? 0,
      10
    );
    return Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1;
  };

  const getUnidadImpresion = (medicamento) => {
    const unidad = String(medicamento?.unidad_dispensacion || "").trim();
    return unidad || "unidad";
  };

  const getIndicacionImpresion = (medicamento) => {
    const indicaciones = String(medicamento?.observaciones || "").trim();
    if (indicaciones) return indicaciones;

    // Compatibilidad con recetas historicas que aun no usan observaciones como indicacion principal
    const fallback = [medicamento?.dosis, medicamento?.frecuencia, medicamento?.duracion]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join(" | ");

    return fallback || "Sin indicaciones";
  };

  return (
    <div
      className="receta-a4-landscape bg-white text-slate-900 print:text-black"
      style={{
        width: "277mm",
        minHeight: "190mm",
        height: "auto",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 0,
        overflow: "visible",
        boxSizing: "border-box",
        fontFamily: "Arial, sans-serif",
        fontSize: "10px",
        lineHeight: 1.12,
      }}
    >
      <section
        className="relative h-full border-r border-dashed border-slate-400"
        style={{ padding: "2.5mm" }}
      >
        <img
          src={logoSrc}
          alt=""
          className="pointer-events-none absolute inset-0 m-auto w-3/4 opacity-[0.03]"
          style={{ filter: "grayscale(100%)" }}
        />

        <div className="relative z-10 flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-start justify-between gap-2.5 border-b border-slate-900 pb-1.5">
            <div className="flex min-w-0 items-start gap-2.5">
              <img
                src={logoSrc}
                alt={configuracionClinica?.nombre_clinica || "Logo"}
                className="h-10 w-auto shrink-0 object-contain"
              />
              <div className="min-w-0">
                <p className="font-bold uppercase" style={{ fontSize: "9.5pt", lineHeight: 1.25 }}>
                  {configuracionClinica?.nombre_clinica || "MI CLINICA"}
                </p>
                {configuracionClinica?.slogan && (
                  <p style={{ fontSize: "7.5pt", lineHeight: 1.25, color: configuracionClinica.slogan_color || "#374151" }}>
                    {configuracionClinica.slogan}
                  </p>
                )}
                <p style={{ fontSize: "8pt", lineHeight: 1.25 }}>RUC: {configuracionClinica?.ruc || "-"}</p>
                <p style={{ fontSize: "8pt", lineHeight: 1.25 }}>Dirección: {configuracionClinica?.direccion || "-"}</p>
                <p style={{ fontSize: "8pt", lineHeight: 1.25 }}>Tel: {configuracionClinica?.telefono || "-"}</p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-bold" style={{ fontSize: "9.5pt", lineHeight: 1.25 }}>{formatProfesionalName(medicoInfo || {})}</p>
              <p style={{ fontSize: "8pt", lineHeight: 1.25 }}>{medicoInfo?.especialidad}</p>
              <p style={{ fontSize: "8pt", lineHeight: 1.25 }}>{formatColegiatura(medicoInfo || {})}</p>
              {medicoInfo?.rne && <p style={{ fontSize: "8pt", lineHeight: 1.25 }}>RNE: {medicoInfo.rne}</p>}
            </div>
          </header>

          <div className="mt-1 flex shrink-0 items-center justify-between border-b border-blue-300 pb-1">
            <p className="text-[22px] font-bold leading-none tracking-tight text-blue-700">Rx</p>
            <div className="text-[11px] text-slate-700">
              <span className="mr-3">Fecha: {formatearFecha(new Date())}</span>
              <span>Hora: {formatearHora(new Date())}</span>
            </div>
          </div>

          <section className="mt-1 shrink-0 rounded-md border border-slate-300 bg-slate-50/50 p-1.5">
            <p className="mb-0.5 border-b border-slate-300 text-[11px] font-semibold uppercase text-slate-700">Datos del paciente</p>
            <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[11px] leading-tight">
              <p className="col-span-3"><span className="font-semibold">Paciente:</span> {nombrePaciente} {apellidoPaciente}</p>
              <p><span className="font-semibold">DNI:</span> {paciente?.dni || "-"}</p>
              <p><span className="font-semibold">Edad:</span> {edadPacienteTexto}</p>
              <p><span className="font-semibold">Sexo:</span> {paciente?.sexo || "-"}</p>
            </div>
          </section>

          {diagnosticosArray.length > 0 && (
            <section className="mt-1 shrink-0 border border-slate-900 p-1.5">
              <p className="mb-0.5 border-b border-slate-300 text-[11px] font-semibold uppercase">Diagnóstico</p>
              <div className="space-y-0.5 text-[11px] leading-tight">
                {diagnosticosArray.map((diagnostico, index) => {
                  const codigoDx = obtenerCodigoDiagnostico(diagnostico);
                  const nombreDx = obtenerNombreDiagnostico(diagnostico);
                  return (
                    <p key={index}>
                      <span className="font-semibold">{codigoDx}</span>
                      {codigoDx ? " - " : ""}
                      {nombreDx}
                    </p>
                  );
                })}
              </div>
            </section>
          )}

          <section className="mt-1 flex min-h-0 flex-1 flex-col rounded-md border border-slate-300 bg-white p-1">
            <div className="mb-1 flex items-center justify-between border-b border-slate-300 pb-0.5">
              <p className="font-bold" style={{ fontSize: "11.5pt", lineHeight: 1.15 }}>Rp/ Medicamentos</p>
              <p className="text-slate-600" style={{ fontSize: "8.5pt", lineHeight: 1.2 }}>Lista prescrita</p>
            </div>

            <div className="min-h-0 flex-1">
              {medicamentosArray.length > 0 ? (
                <div className="space-y-0.5">
                  {medicamentosArray.map((medicamento, index) => (
                    <article key={index} className="break-inside-avoid rounded-md border border-slate-200 bg-slate-50/60 px-1.5 py-1">
                      <div className="flex gap-1">
                        <div
                          className="w-5 shrink-0 font-semibold text-slate-700"
                          style={{ fontSize: "8.5pt", lineHeight: 1.25 }}
                        >
                          {index + 1}.
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className="pr-2 font-bold uppercase"
                              style={{ fontSize: "9.5pt", lineHeight: 1.25 }}
                            >
                              {medicamento.nombre || "Medicamento no especificado"}
                              {medicamento.codigo && (
                                <span
                                  className="ml-1 font-normal text-slate-600"
                                  style={{ fontSize: "8.5pt" }}
                                >
                                  ({medicamento.codigo})
                                </span>
                              )}
                            </p>
                            <span
                              className="shrink-0 rounded-md bg-blue-100 px-2 py-0.5 font-semibold text-blue-700"
                              style={{ fontSize: "8.5pt", lineHeight: 1.2 }}
                            >
                              {getCantidadImpresion(medicamento)} {getUnidadImpresion(medicamento)}
                            </span>
                          </div>
                          <p
                            className="mt-0.5 text-slate-700"
                            style={{ fontSize: "8.5pt", lineHeight: 1.25 }}
                          >
                            Presentación: {[
                              medicamento.presentacion,
                              medicamento.concentracion,
                              medicamento.laboratorio,
                            ]
                              .filter(Boolean)
                              .join(" - ") || "No especificada"}
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
        className="relative h-full"
        style={{ padding: "2.5mm" }}
      >
        <img
          src={logoSrc}
          alt=""
          className="pointer-events-none absolute inset-0 m-auto w-3/4 opacity-[0.03]"
          style={{ filter: "grayscale(100%)" }}
        />

        <div className="relative z-10 flex h-full min-h-0 flex-col">
          <header className="shrink-0 border-b border-slate-900 pb-1.5 text-right">
            <p className="font-bold" style={{ fontSize: "9.5pt", lineHeight: 1.25 }}>{formatProfesionalName(medicoInfo || {})}</p>
            <p style={{ fontSize: "8pt", lineHeight: 1.25 }}>{medicoInfo?.especialidad}</p>
            <p style={{ fontSize: "8pt", lineHeight: 1.25 }}>{formatColegiatura(medicoInfo || {})}</p>
            {medicoInfo?.rne && <p style={{ fontSize: "8pt", lineHeight: 1.25 }}>RNE: {medicoInfo.rne}</p>}
          </header>

          <div className="mt-1 shrink-0 border-b border-emerald-300 pb-1 text-left">
            <p className="text-[18px] font-bold tracking-tight text-blue-700">Indicaciones para el paciente</p>
            <p className="text-[10px] text-slate-600">Siga cuidadosamente cada indicación. Ante cualquier duda, contacte a su médico.</p>
          </div>

          <section className="mt-1 flex min-h-0 flex-1 flex-col rounded-md border border-blue-200 bg-slate-50/40 p-1">
            <div className="min-h-0 flex-1">
              {medicamentosArray.length > 0 ? (
                <div className="space-y-0.5">
                  {medicamentosArray.map((medicamento, index) => (
                    <article key={index} className="break-inside-avoid rounded-md border border-blue-100 bg-blue-50/60 px-1.5 py-1">
                      <div className="flex gap-1.5">
                        <div className="relative h-[18px] w-[18px] shrink-0 rounded-full bg-blue-600 text-white">
                          <span
                            className="absolute inset-0 grid place-items-center font-bold leading-none [transform:translateY(-0.4px)]"
                            style={{ fontSize: "8pt" }}
                          >
                            {index + 1}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className="font-bold uppercase"
                            style={{ fontSize: "9.5pt", lineHeight: 1.25 }}
                          >
                            {medicamento.nombre || "Medicamento"}
                          </p>
                          <p
                            className="mt-0.5 break-words text-slate-800"
                            style={{ fontSize: "9pt", lineHeight: 1.3 }}
                          >
                            {getIndicacionImpresion(medicamento)}
                            <span className="font-semibold"> | {getCantidadImpresion(medicamento)} {getUnidadImpresion(medicamento)}</span>
                          </p>
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

          {recomendacionesGenerales && (
            <section className="mt-1 shrink-0 border border-amber-300 bg-amber-50 p-1.5 text-[11px] text-amber-900">
              <table className="w-full border-collapse" cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.02em",
                        lineHeight: 1.15,
                        paddingBottom: "4px",
                      }}
                    >
                      Recomendaciones
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div
                        style={{
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          lineHeight: 1.25,
                          background: "#ffffff",
                          border: "1px solid #fde68a",
                          borderRadius: "4px",
                          padding: "5px 7px",
                          marginTop: "0",
                        }}
                      >
                        {recomendacionesGenerales}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}

          <section className="mt-1 shrink-0 border border-rose-300 bg-rose-50 p-1.5 text-[11px] text-rose-800">
            <p className="font-semibold uppercase">Advertencias</p>
            <p>Receta personal e intransferible. Fuera del alcance de niños.</p>
          </section>

          <footer className="mt-1 flex shrink-0 justify-end border-t border-slate-900 pt-1">
            <div className="flex flex-col items-center justify-end text-center">
              {medicoInfo?.firma && (
                <div className="relative z-10 mb-[-8px]">
                  <img
                    src={medicoInfo.firma}
                    alt="Firma digital del médico"
                    className="firma-img-receta mx-auto block max-h-12 w-auto bg-transparent p-0"
                  />
                </div>
              )}
              {!medicoInfo?.firma && (
                <div className="mb-[-2px] flex h-12 w-32 items-center justify-center border border-dashed border-slate-400">
                  <span className="text-[11px] text-slate-500">[Firma Manual]</span>
                </div>
              )}
              <div className="min-w-40 border-t border-slate-900 pt-0.5 text-[8px] leading-[1] text-slate-700">
                <p className="font-bold text-[8.5px] leading-[1]">{formatProfesionalName(medicoInfo || {})}</p>
                <p className="text-[7.5px] leading-[1]">{medicoInfo?.especialidad}</p>
                <p>
                  {formatColegiatura(medicoInfo || {})}
                  {medicoInfo?.rne ? ` | RNE: ${medicoInfo.rne}` : ""}
                </p>
              </div>
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
};

export default ImpresionRecetaMedicamentos;