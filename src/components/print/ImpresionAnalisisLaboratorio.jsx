const ImpresionAnalisisLaboratorio = ({ 
  paciente, 
  ordenesLaboratorio,
  medicoInfo,
  configuracionClinica 
}) => {
  // Función para obtener la ruta del logo según el entorno
  const getLogoPath = () => {
    // Intentar detectar si estamos en producción por el hostname o protocol
    const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    
    if (isProduction) {
      // En producción (Hostinger), usar ruta absoluta desde la raíz del dominio
      return `${window.location.protocol}//${window.location.host}/2demayo.svg`;
    } else {
      // En desarrollo local, usar la ruta relativa a public
      return '/2demayo.svg';
    }
  };
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
            <img 
              src={getLogoPath()} 
              alt="Logo Clínica 2 de Mayo" 
              className="h-10 w-auto"
            />
            <div>
              <h1 className="text-sm font-bold text-black uppercase leading-tight">
                {configuracionClinica?.nombre_clinica || 'CLÍNICA 2 DE MAYO'}
              </h1>
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
            <h2 className="text-sm font-bold text-black leading-tight">Dr(a). {medicoInfo?.nombre}</h2>
            <p className="text-xs text-black">{medicoInfo?.especialidad}</p>
            <p className="text-xs text-black">CMP: {medicoInfo?.cmp || 'N/A'}</p>
          </div>
        </div>

        {/* Título del documento - compacto */}
        <div className="text-center mb-2">
          <h2 className="text-lg font-bold text-black border-b border-black pb-1">
            📋 ORDEN DE LABORATORIO
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

      {/* Lista de exámenes solicitados - compacto */}
      <div className="border border-black p-2 mb-4">
        <h3 className="text-sm font-bold text-black mb-2 border-b border-black pb-1">
          🔬 EXÁMENES SOLICITADOS
        </h3>
        
        {ordenesLaboratorio && ordenesLaboratorio.length > 0 ? (
          <div className="space-y-2">
            {ordenesLaboratorio.map((orden, index) => (
              <div key={index} className="border border-gray-300 p-2 bg-gray-50 rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-black text-xs bg-blue-200 px-1 rounded">#{index + 1}</span>
                  <span className="text-xs text-black">Solicitud: {formatearFecha(orden.fecha_solicitud)}</span>
                </div>
                
                {orden.examenes && orden.examenes.length > 0 ? (
                  <ul className="list-disc pl-5 text-xs text-black">
                    {orden.examenes.map((examen, examIndex) => (
                      <li key={examIndex}>
                        <span className="font-semibold">{examen.nombre}</span>
                        {examen.condicion_paciente && (
                          <span className="ml-2 bg-yellow-100 px-1 rounded border">⚠️ {examen.condicion_paciente}</span>
                        )}
                        {examen.tiempo_resultado && (
                          <span className="ml-2 bg-blue-100 px-1 rounded border">⏱️ {examen.tiempo_resultado}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-black">Sin detalles disponibles</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">
            <p className="text-xs">No hay órdenes de laboratorio</p>
          </div>
        )}
      </div>

      {/* Instrucciones y observaciones - compacto */}
      <div className="space-y-2 mb-4">
        <div className="border border-black p-2">
          <h3 className="text-xs font-bold text-black mb-1">📝 INSTRUCCIONES</h3>
          <div className="text-xs text-black space-y-1">
            <p>• Presentar DNI original</p>
            <p>• Seguir preparación específica</p>
            <p>• Resultados según tiempo indicado</p>
          </div>
        </div>
      </div>

      {/* Pie de página con firmas - compacto */}
      <div className="border-t border-black pt-3 mt-4">
        <div className="flex justify-between items-end text-xs">
          {/* Espacio para sello laboratorio */}
          <div className="text-center">
            <div className="w-20 h-16 border border-dashed border-gray-400 flex items-center justify-center mb-1">
              <span className="text-xs text-gray-500 text-center leading-tight">SELLO<br/>LAB</span>
            </div>
            <p className="text-xs text-black font-bold">PROCESADO</p>
          </div>

          {/* Información de emisión */}
          <div className="text-center">
            <p className="text-xs text-gray-600">Emitido: {formatearFecha(new Date())}</p>
            <p className="text-xs text-gray-600">Válido 15 días</p>
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

export default ImpresionAnalisisLaboratorio;