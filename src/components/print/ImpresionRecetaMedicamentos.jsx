import { formatColegiatura, formatProfesionalName } from "../../utils/profesionalDisplay";

const ImpresionRecetaMedicamentos = ({ 
  paciente, 
  medicamentos,
  medicoInfo,
  configuracionClinica 
}) => {
  const nombrePaciente = paciente?.nombre || paciente?.nombres || '';
  const apellidoPaciente = paciente?.apellido || paciente?.apellidos || '';

  // Resolver logo con base URL del servidor PHP
  const resolveLogoUrl = (rawValue) => {
    const raw = String(rawValue || '').trim();
    if (!raw) return '/2demayo.svg';
    if (/^(https?:\/\/|data:|blob:)/i.test(raw)) return raw;
    const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    const base = isProduction ? (window.location.origin.replace(/\/+$/, '') + '/') : 'http://localhost/clinica-2demayo/';
    return `${base}${raw.replace(/^\/+/, '')}`;
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

  return (
    <div className="bg-white max-w-2xl mx-auto print:shadow-none print:max-w-none a5-receta-print" style={{ 
      minHeight: '210mm', // A5 format
      maxWidth: '148mm',   // A5 width
      padding: '8mm',
      fontFamily: 'Arial, sans-serif',
      fontSize: '10px',
      lineHeight: 1.2
    }}>
      {/* Encabezado estilo receta médica compacto */}
      <div className="border-2 border-black p-2 mb-4">
        <div className="flex items-center justify-between border-b border-black pb-2 mb-3">
          {/* Logo e información de la clínica - compacto */}
          <div className="flex items-center gap-2">
            <img 
              src={logoSrc} 
              alt={configuracionClinica?.nombre_clinica || 'Logo'} 
              className="h-10 w-auto"
            />
            <div>
              <h1 className="text-sm font-bold text-black uppercase leading-tight">
                {configuracionClinica?.nombre_clinica || 'MI CLÍNICA'}
              </h1>
              {configuracionClinica?.slogan && (
                <p className="text-xs font-medium" style={{ color: configuracionClinica.slogan_color || '#374151' }}>
                  {configuracionClinica.slogan}
                </p>
              )}
              <p className="text-xs text-black">{configuracionClinica?.direccion || 'Dirección de la clínica'}</p>
              <p className="text-xs text-black">
                Tel: {configuracionClinica?.telefono || '123-456-789'}
              </p>
              {configuracionClinica?.ruc && (
                <p className="text-xs text-black">RUC: {configuracionClinica.ruc}</p>
              )}
            </div>
          </div>

          {/* Información del médico - compacto */}
          <div className="text-right">
            <h2 className="text-sm font-bold text-black leading-tight">
              {formatProfesionalName(medicoInfo || {})}
            </h2>
            <p className="text-xs text-black">{medicoInfo?.especialidad}</p>
            <p className="text-xs text-black">{formatColegiatura(medicoInfo || {})}</p>
            {medicoInfo?.rne && (
              <p className="text-xs text-black">RNE: {medicoInfo.rne}</p>
            )}
          </div>
        </div>

        {/* Título del documento - compacto */}
        <div className="text-center mb-2">
          <h2 className="text-lg font-bold text-black border-b border-black pb-1">
            💊 RECETA MÉDICA
          </h2>
          <div className="flex justify-between text-xs text-black mt-1">
            <span>Fecha: {formatearFecha(new Date())}</span>
            <span>Hora: {formatearHora(new Date())}</span>
          </div>
        </div>
      </div>

      {/* Datos del paciente en formato receta - compacto */}
      <div className="border border-black p-2 mb-3">
        <h3 className="text-sm font-bold text-black mb-2 border-b border-black pb-1">
          👤 DATOS DEL PACIENTE
        </h3>
        <div className="grid grid-cols-1 gap-1 text-xs">
          <p className="text-black"><strong>Paciente:</strong> {nombrePaciente} {apellidoPaciente}</p>
          <div className="grid grid-cols-3 gap-2">
            <p className="text-black"><strong>DNI:</strong> {paciente?.dni}</p>
            <p className="text-black"><strong>Edad:</strong> {paciente?.edad} años</p>
            <p className="text-black"><strong>Sexo:</strong> {paciente?.sexo}</p>
          </div>
        </div>
      </div>



      {/* Lista de medicamentos prescritos - tipo lista compacta */}
      <div className="border border-black p-2 mb-3" style={{ minHeight: '80px' }}>
        <h3 className="text-sm font-bold text-black mb-2 border-b border-black pb-1">
          💊 MEDICAMENTOS PRESCRITOS
        </h3>
        {medicamentos && medicamentos.length > 0 ? (
          <ul className="list-disc pl-5 text-xs text-black space-y-1">
            {medicamentos.map((medicamento, index) => (
              <li key={index}>
                <span className="font-semibold uppercase">{medicamento.nombre || 'Medicamento no especificado'}</span>
                {medicamento.dosis && (
                  <span className="ml-2"><strong>Dosis:</strong> {medicamento.dosis}</span>
                )}
                {medicamento.frecuencia && (
                  <span className="ml-2"><strong>Frecuencia:</strong> {medicamento.frecuencia}</span>
                )}
                {medicamento.duracion && (
                  <span className="ml-2"><strong>Duración:</strong> {medicamento.duracion}</span>
                )}
                {medicamento.observaciones && (
                  <span className="ml-2 italic"><strong>Obs:</strong> {medicamento.observaciones}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-black italic text-center py-4">
            No se han prescrito medicamentos.
          </p>
        )}
      </div>

      {/* Instrucciones y advertencias - compacto */}
      <div className="space-y-2 mb-4">
        <div className="border border-black p-2">
          <h3 className="text-xs font-bold text-black mb-1">📋 INSTRUCCIONES</h3>
          <div className="text-xs text-black space-y-1">
            <p>• Tomar según indicación médica</p>
            <p>• Completar tratamiento</p>
            <p>• Contactar médico si efectos adversos</p>
          </div>
        </div>
        
        <div className="border border-red-500 bg-red-50 p-2">
          <h3 className="text-xs font-bold text-red-800 mb-1">⚠️ ADVERTENCIAS</h3>
          <p className="text-xs text-red-800">• Receta personal e intransferible • Fuera del alcance de niños</p>
        </div>
      </div>

      {/* Pie de página con firmas - compacto */}
      <div className="border-t border-black pt-3 mt-4">
        <div className="flex justify-between items-end text-xs">
          {/* Espacio para sello farmacia */}
          <div className="text-center">
            <div className="w-20 h-16 border border-dashed border-gray-400 flex items-center justify-center mb-1">
              <span className="text-xs text-gray-500 text-center leading-tight">SELLO<br/>FARMACIA</span>
            </div>
            <p className="text-xs text-black font-bold">DESPACHADO</p>
          </div>

          {/* Información de emisión */}
          <div className="text-center">
            <p className="text-xs text-gray-600">Emitido: {formatearFecha(new Date())}</p>
            <p className="text-xs text-gray-600">Válido 30 días</p>
          </div>
          
          {/* Firma del médico */}
          <div className="text-center">
            {/* Firma digital del médico */}
            {medicoInfo?.firma && (
              <div className="mb-2">
                <img 
                  src={medicoInfo.firma} 
                  alt="Firma digital del médico" 
                  className="mx-auto bg-transparent p-0 firma-img-receta"
                
                />
              </div>
            )}
            
            <div className="border-t border-black pt-1 min-w-24">
              <p className="font-bold text-black text-xs">
                {formatProfesionalName(medicoInfo || {})}
              </p>
              <p className="text-xs text-black">{medicoInfo?.especialidad}</p>
              <p className="text-xs text-black">{formatColegiatura(medicoInfo || {})}</p>
              {medicoInfo?.rne && (
                <p className="text-xs text-black">RNE: {medicoInfo.rne}</p>
              )}
              
              {/* Mensaje si no hay firma */}
              {!medicoInfo?.firma && (
                <div className="mt-1 mb-2 h-8 flex items-center justify-center border border-dashed border-gray-400 text-xs text-gray-500">
                  [Firma Manual]
                </div>
              )}
              
              <p className="text-xs text-black font-bold">FIRMA MÉDICO</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImpresionRecetaMedicamentos;