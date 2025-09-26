
import { useState, useEffect } from "react";
import { BASE_URL } from "../config/config";

function LlenarResultadosForm({ orden, onVolver, onGuardado }) {
  const [examenesDisponibles, setExamenesDisponibles] = useState([]);
  const [resultados, setResultados] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("success");

  useEffect(() => {
    fetch(BASE_URL + "api_examenes_laboratorio.php", {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setExamenesDisponibles(data.examenes || []));
  }, []);

  useEffect(() => {
    if (!examenesDisponibles || examenesDisponibles.length === 0) return;
    if (orden.resultados && typeof orden.resultados === 'object') {
      setResultados({ ...orden.resultados });
    } else {
      const res = {};
      
      // Procesar examenes - puede venir en diferentes formatos
      let examenesArray = [];
      if (typeof orden.examenes === 'string') {
        try {
          examenesArray = JSON.parse(orden.examenes);
        } catch {
          examenesArray = orden.examenes.split(',').map(s => s.trim()).filter(s => s);
        }
      } else if (Array.isArray(orden.examenes)) {
        examenesArray = orden.examenes;
      } else if (orden.examenes) {
        examenesArray = [orden.examenes];
      }
      
      examenesArray.forEach(exId => {
        // Si exId es un objeto con id, extraer el id
        const id = typeof exId === 'object' ? exId.id : exId;
        const exObj = examenesDisponibles.find(e => e.id == id);
        
        if (exObj && Array.isArray(exObj.valores_referenciales) && exObj.valores_referenciales.length > 0) {
          exObj.valores_referenciales.forEach(param => {
            if ((param.tipo === undefined || param.tipo === "Parámetro") && param.nombre && param.nombre.trim() !== "") {
              res[`${id}__${param.nombre}`] = "";
            }
          });
        } else {
          res[`${id}`] = "";
        }
      });
      
      setResultados(res);
    }
  }, [orden, examenesDisponibles]);

  function evalFormula(formula, valoresPorNombre) {
    if (!formula) return "";
    let expr = formula;
    const nombres = Object.keys(valoresPorNombre).sort((a, b) => b.length - a.length);
    nombres.forEach(nombre => {
      const val = valoresPorNombre[nombre] || 0;
      const regex = new RegExp(nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      expr = expr.replace(regex, val === "" ? 0 : val);
    });
    try {
      const result = eval(expr);
      if (typeof result === "number" && !isNaN(result)) {
        return result.toFixed(1);
      }
      return result;
    } catch {
      return "";
    }
  }

  const handleChange = (e) => {
    const nuevos = { ...resultados, [e.target.name]: e.target.value };
    setResultados(nuevos);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setMsg("");

    try {
      const res = await fetch(BASE_URL + "api_resultados_laboratorio.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consulta_id: orden.consulta_id, tipo_examen: "varios", resultados }),
      });
      const data = await res.json();
      
      if (data.success) {
        setMsg("✅ Resultados guardados correctamente");
        setMsgType("success");
        setTimeout(() => {
          onGuardado && onGuardado();
        }, 1000);
      } else {
        setMsg("❌ " + (data.error || "Error al guardar"));
        setMsgType("error");
      }
    } catch {
      setMsg("❌ Error de conexión");
      setMsgType("error");
    } finally {
      setGuardando(false);
    }
  };

  const getParameterStatus = (param, valor) => {
    let fueraDeRango = false;
    let min = null, max = null;
    
    if (!isNaN(parseFloat(param.min)) && param.min !== null && param.min !== "") {
      min = parseFloat(param.min);
    } else if (param.referencias && param.referencias[0] && !isNaN(parseFloat(param.referencias[0].valor_min))) {
      min = parseFloat(param.referencias[0].valor_min);
    }
    
    if (!isNaN(parseFloat(param.max)) && param.max !== null && param.max !== "") {
      max = parseFloat(param.max);
    } else if (param.referencias && param.referencias[0] && !isNaN(parseFloat(param.referencias[0].valor_max))) {
      max = parseFloat(param.referencias[0].valor_max);
    }
    
    let valorNum = parseFloat(valor);
    if (!isNaN(valorNum)) {
      if (min !== null && valorNum < min) fueraDeRango = true;
      if (max !== null && valorNum > max) fueraDeRango = true;
    }

    return { fueraDeRango, min, max };
  };

  return (
    <div className="space-y-6">
      {/* Header del formulario */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-6 text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-2xl">
            📊
          </div>
          <div>
            <h3 className="text-xl font-bold">Procesar Resultados de Laboratorio</h3>
            <p className="text-purple-100">Complete los valores para cada examen solicitado</p>
          </div>
        </div>
      </div>

      {/* Formulario principal */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-6">
          <div className="max-h-[600px] overflow-y-auto space-y-6">
            {(() => {
              // Procesar examenes - mismo lógica que en useEffect
              let examenesArray = [];
              if (typeof orden.examenes === 'string') {
                try {
                  examenesArray = JSON.parse(orden.examenes);
                } catch {
                  examenesArray = orden.examenes.split(',').map(s => s.trim()).filter(s => s);
                }
              } else if (Array.isArray(orden.examenes)) {
                examenesArray = orden.examenes;
              } else if (orden.examenes) {
                examenesArray = [orden.examenes];
              }
              
              return examenesArray.map(exId => {
                // Si exId es un objeto con id, extraer el id
                const id = typeof exId === 'object' ? exId.id : exId;
                const exObj = examenesDisponibles.find(e => e.id == id);
              
                if (exObj && Array.isArray(exObj.valores_referenciales) && exObj.valores_referenciales.length > 0) {
                  // Construir un mapa nombre->valor para este examen
                  const valoresPorNombre = {};
                  exObj.valores_referenciales.forEach(param => {
                    if ((param.tipo === undefined || param.tipo === "Parámetro") && param.nombre && param.nombre.trim() !== "") {
                      valoresPorNombre[param.nombre] = resultados[`${id}__${param.nombre}`] || "";
                    }
                  });

                  return (
                    <div key={id} className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                      {/* Header del examen */}
                      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                          🧪
                        </div>
                        <div>
                          <h4 className="text-lg font-bold text-gray-900">{exObj.nombre}</h4>
                          <p className="text-sm text-gray-600">Complete todos los parámetros requeridos</p>
                        </div>
                      </div>

                      {/* Parámetros del examen */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {exObj.valores_referenciales.map((param) => {
                          if ((param.tipo === undefined || param.tipo === "Parámetro") && param.nombre && param.nombre.trim() !== "") {
                            const tieneFormula = param.formula && param.formula.trim() !== "";
                            let valor = resultados[`${id}__${param.nombre}`] || "";
                            
                            if (tieneFormula) {
                              valor = evalFormula(param.formula, valoresPorNombre);
                            }
                            
                            if (typeof valor === 'number' && isNaN(valor)) valor = "";
                            if (valor === undefined || valor === null) valor = "";

                            const { fueraDeRango, min, max } = getParameterStatus(param, valor);

                            return (
                              <div key={param.nombre} className="space-y-2">
                                <label className="block text-sm font-semibold text-gray-700">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span>{param.nombre}</span>
                                    {tieneFormula && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        🧮 Calculado
                                      </span>
                                    )}
                                  </div>
                                  {tieneFormula && (
                                    <span className="text-xs text-blue-600 font-normal">
                                      Fórmula: {param.formula}
                                    </span>
                                  )}
                                  {(min !== null || max !== null) && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      Rango de referencia: {min !== null ? `${min}` : '∞'} - {max !== null ? `${max}` : '∞'}
                                    </div>
                                  )}
                                </label>
                                
                                <div className="relative">
                                  <input
                                    type="text"
                                    name={`${id}__${param.nombre}`}
                                    value={valor}
                                    onChange={tieneFormula ? undefined : handleChange}
                                    readOnly={tieneFormula}
                                    required
                                    className={`w-full px-4 py-3 border-2 rounded-lg transition-all duration-200 ${
                                      fueraDeRango
                                        ? 'border-red-400 bg-red-50 text-red-700 font-semibold focus:ring-2 focus:ring-red-500'
                                        : tieneFormula
                                        ? 'border-blue-200 bg-blue-50 text-blue-800 cursor-not-allowed'
                                        : 'border-gray-300 bg-white hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-200'
                                    }`}
                                    placeholder={tieneFormula ? "Valor calculado automáticamente" : "Ingrese el valor"}
                                  />
                                  
                                  {/* Indicador de estado */}
                                  {valor && !tieneFormula && (
                                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                                      {fueraDeRango ? (
                                        <span className="text-red-500 font-bold">⚠️</span>
                                      ) : (
                                        <span className="text-green-500 font-bold">✓</span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Mensaje de fuera de rango */}
                                {fueraDeRango && (min !== null || max !== null) && (
                                  <div className="flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2 py-1 rounded-md">
                                    <span>⚠️</span>
                                    <span>Valor fuera del rango de referencia</span>
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  );
                } else if (exObj) {
                  // Examen sin parámetros definidos
                  return (
                    <div key={id} className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                          🧪
                        </div>
                        <h4 className="text-lg font-bold text-gray-900">{exObj.nombre}</h4>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                          Resultado del examen
                        </label>
                        <textarea
                          name={`${id}`}
                          value={resultados[`${id}`] || ""}
                          onChange={handleChange}
                          rows={4}
                          required
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all duration-200"
                          placeholder="Ingrese el resultado completo del examen..."
                        />
                      </div>
                    </div>
                  );
                }
                return null;
              });
            })()}
          </div>
        </div>        {/* Botones de acción */}
        <div className="flex flex-col sm:flex-row gap-4 justify-end">
          <button 
            type="button" 
            onClick={onVolver} 
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium border border-gray-300"
          >
            ← Cancelar
          </button>
          <button 
            type="submit" 
            disabled={guardando}
            className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {guardando ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Guardando...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span>💾</span>
                Guardar Resultados
              </span>
            )}
          </button>
        </div>

        {/* Mensaje de estado */}
        {msg && (
          <div className={`p-4 rounded-lg border ${
            msgType === "success"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}>
            <div className="flex items-center gap-2 font-medium">
              {msg}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

export default LlenarResultadosForm;
