import { BASE_URL } from '../../config/config';

const ImpresionRecetaMedicamentos = ({ 
  paciente, 
  medicamentos,
  medicoInfo,
  configuracionClinica 
}) => {
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
    <div className="bg-white max-w-2xl mx-auto print:shadow-none print:max-w-none" style={{ 
      minHeight: '210mm', // A5 format
      maxWidth: '148mm',   // A5 width
      padding: '10mm',     // Smaller padding
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px'
    }}>
      {/* Encabezado estilo receta médica compacto */}
      <div className="border-2 border-black p-2 mb-4">
        <div className="flex items-center justify-between border-b border-black pb-2 mb-3">
          {/* Logo e información de la clínica - compacto */}
          <div className="flex items-center gap-2">
            {configuracionClinica?.logo_url && (
              <img 
                src={configuracionClinica.logo_url.startsWith('/') || configuracionClinica.logo_url.startsWith('http') 
                  ? configuracionClinica.logo_url 
                  : `${BASE_URL}${configuracionClinica.logo_url}`} 
                alt="Logo" 
                className="h-10 w-auto"
              />
            )}
            <div>
              <h1 className="text-sm font-bold text-black uppercase leading-tight">
                {configuracionClinica?.nombre_clinica || 'CLÍNICA 2 DE MAYO'}
              </h1>
              <p className="text-xs text-black">{configuracionClinica?.direccion}</p>
              <p className="text-xs text-black">
                Tel: {configuracionClinica?.telefono}
              </p>
              {configuracionClinica?.ruc && (
                <p className="text-xs text-black">RUC: {configuracionClinica.ruc}</p>
              )}
            </div>
          </div>

          {/* Información del médico - compacto */}
          <div className="text-right">
            <h2 className="text-sm font-bold text-black leading-tight">Dr(a). {medicoInfo?.nombre}</h2>
            <p className="text-xs text-black">{medicoInfo?.especialidad}</p>
            <p className="text-xs text-black">CMP: {medicoInfo?.cmp || 'N/A'}</p>
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
          <p className="text-black"><strong>Paciente:</strong> {paciente?.nombres} {paciente?.apellidos}</p>
          <div className="grid grid-cols-3 gap-2">
            <p className="text-black"><strong>DNI:</strong> {paciente?.dni}</p>
            <p className="text-black"><strong>Edad:</strong> {paciente?.edad} años</p>
            <p className="text-black"><strong>Sexo:</strong> {paciente?.sexo}</p>
          </div>
        </div>
      </div>

      {/* Símbolo Rx clásico - más pequeño */}
      <div className="text-center mb-3">
        <div className="text-4xl font-bold text-black" style={{ fontFamily: 'serif' }}>
          ℞
        </div>
      </div>

      {/* Lista de medicamentos prescritos - compacto */}
      <div className="border border-black p-2 mb-3" style={{ minHeight: '120px' }}>
        <h3 className="text-sm font-bold text-black mb-2 border-b border-black pb-1">
          💊 MEDICAMENTOS PRESCRITOS
        </h3>
        
        {medicamentos && medicamentos.length > 0 ? (
          <div className="space-y-2">
            {medicamentos.map((medicamento, index) => (
              <div key={index} className="border border-gray-300 p-2 bg-gray-50 rounded">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-black text-xs bg-blue-200 px-1 rounded">#{index + 1}</span>
                  <div className="flex-1 text-xs leading-tight">
                    <h4 className="font-bold text-black uppercase mb-1">
                      {medicamento.nombre || 'Medicamento no especificado'}
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div>
                        {medicamento.dosis && (
                          <p className="text-black"><strong>Dosis:</strong> {medicamento.dosis}</p>
                        )}
                        {medicamento.frecuencia && (
                          <p className="text-black"><strong>Frecuencia:</strong> {medicamento.frecuencia}</p>
                        )}
                      </div>
                      <div>
                        {medicamento.duracion && (
                          <p className="text-black"><strong>Duración:</strong> {medicamento.duracion}</p>
                        )}
                      </div>
                    </div>
                    
                    {medicamento.observaciones && (
                      <p className="text-xs text-black mt-1 italic">
                        <strong>Obs:</strong> {medicamento.observaciones}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
            <div className="border-t border-black pt-1 mt-8 min-w-24">
              <p className="font-bold text-black text-xs">Dr(a). {medicoInfo?.nombre}</p>
              <p className="text-xs text-black">CMP: {medicoInfo?.cmp || 'N/A'}</p>
              <p className="text-xs text-black font-bold">FIRMA MÉDICO</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImpresionRecetaMedicamentos;