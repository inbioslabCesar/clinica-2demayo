
import { useState, useEffect } from "react";
import { evaluate } from "mathjs";
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
        // Fallback: usar parámetros adjuntos a la orden si el catálogo no los trae
        let exOrdenDetalle = null;
        if (Array.isArray(orden.examenes)) {
          exOrdenDetalle = orden.examenes.find(ex => (typeof ex === 'object' && ex.id == id)) || null;
        }
        const paramsList = (exObj && Array.isArray(exObj.valores_referenciales) && exObj.valores_referenciales.length > 0)
          ? exObj.valores_referenciales
          : (exOrdenDetalle && Array.isArray(exOrdenDetalle.valores_referenciales) ? exOrdenDetalle.valores_referenciales : []);

        if (paramsList.length > 0) {
          paramsList.filter(p => p && typeof p === 'object').forEach(param => {
            if ((param.tipo === undefined || param.tipo === "Parámetro") && param.nombre && param.nombre.trim() !== "") {
              res[`${id}__${param.nombre}`] = "";
            }
          });
        } else {
          // Sin parámetros definidos: usar campo libre
          res[`${id}`] = "";
        }
      });
      
      setResultados(res);
    }
  }, [orden, examenesDisponibles]);

  // Normaliza valores numéricos desde entradas de texto (soporta coma decimal y unidades)
  function normalizeNumber(value) {
    // Cuando no haya número válido, retornar NaN en lugar de 0.
    // Esto evita que rangos vacíos se muestren como "0 - 0".
    if (value === null || value === undefined) return NaN;
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    let s = String(value).trim();
    // convertir coma decimal a punto
    s = s.replace(/,/g, ".");
    // extraer el primer número válido (soporta signo y decimales)
    const match = s.match(/-?\d+(?:\.\d+)?/);
    if (!match) return NaN;
    const n = parseFloat(match[0]);
    return Number.isFinite(n) ? n : NaN;
  }

  function evalFormula(formula, valoresPorNombre) {
    if (!formula) return "";
    let expr = formula;
    const nombres = Object.keys(valoresPorNombre).sort((a, b) => b.length - a.length);
    nombres.forEach(nombre => {
      const rawVal = valoresPorNombre[nombre];
      const numVal = normalizeNumber(rawVal);
      // Escapar el nombre para usar en RegExp
      const safeName = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safeName, 'g');
      expr = expr.replace(regex, Number.isFinite(numVal) ? numVal : 0);
    });
    try {
      const result = evaluate(expr);
      if (typeof result === "number" && !isNaN(result)) {
        return result.toFixed(1);
      }
      return result;
    } catch {
      return "";
    }
  }

  // Extrae min/max desde un texto de referencia (p.ej. "2.5-5.8", "2,5 – 5,8", "entre 2.5 y 5.8").
  function parseMinMaxFromText(texto) {
    if (!texto) return { min: null, max: null };
    let s = String(texto).trim();
    // normalizar separadores y coma decimal
    s = s.replace(/,/g, '.');
    // quitar etiquetas comunes
    s = s.replace(/^(?:N\s*:\s*|Normal\s*:\s*)/i, '');
    s = s.replace(/Rango(?:\s*de)?\s*referencia\s*:?/i, '');
    // patrón de rango "x - y" con distintos separadores
    const mRango = s.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|a|hasta|entre|y)\s*(-?\d+(?:\.\d+)?)/i);
    if (mRango) {
      const min = parseFloat(mRango[1]);
      const max = parseFloat(mRango[2]);
      return {
        min: Number.isFinite(min) ? min : null,
        max: Number.isFinite(max) ? max : null,
      };
    }
    // límites unilaterales
    const mMin = s.match(/(?:>=|≥|desde|mayor\s*a?)\s*(-?\d+(?:\.\d+)?)/i);
    const mMax = s.match(/(?:<=|≤|hasta|menor\s*a?)\s*(-?\d+(?:\.\d+)?)/i);
    const min = mMin ? parseFloat(mMin[1]) : null;
    const max = mMax ? parseFloat(mMax[1]) : null;
    return {
      min: Number.isFinite(min) ? min : null,
      max: Number.isFinite(max) ? max : null,
    };
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
      // Antes de enviar, evaluar todas las fórmulas y asegurarnos de inyectar sus valores en el objeto `resultados`
      const resultadosToSend = { ...resultados };
      // Procesar examenes - puede venir en diferentes formatos (misma lógica que en useEffect)
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

      // Para cada examen, buscar sus parámetros y calcular fórmulas si las tiene
      examenesArray.forEach(exId => {
        const id = typeof exId === 'object' ? exId.id : exId;
        const exObj = examenesDisponibles.find(e => e.id == id);
        const exOrdenDetalle = Array.isArray(orden.examenes)
          ? orden.examenes.find(ex => (typeof ex === 'object' && ex.id == id))
          : null;
        const paramsList = (exObj && Array.isArray(exObj.valores_referenciales) && exObj.valores_referenciales.length > 0)
          ? exObj.valores_referenciales
          : (exOrdenDetalle && Array.isArray(exOrdenDetalle.valores_referenciales) ? exOrdenDetalle.valores_referenciales : []);
        if (!Array.isArray(paramsList) || paramsList.length === 0) return;
        // construir mapa de valores por nombre para esta iteración (usar los valores ya calculados o ingresados)
        const valoresPorNombre = {};
        paramsList.filter(p => p && typeof p === 'object').forEach(param => {
          if ((param.tipo === undefined || param.tipo === "Parámetro") && param.nombre && param.nombre.trim() !== "") {
            valoresPorNombre[param.nombre] = resultadosToSend[`${id}__${param.nombre}`] || "";
          }
        });
        // evaluar y almacenar fórmulas
        paramsList.filter(p => p && typeof p === 'object').forEach(param => {
          if ((param.tipo === undefined || param.tipo === "Parámetro") && param.nombre && param.nombre.trim() !== "") {
            if (param.formula && param.formula.trim() !== "") {
              const computed = evalFormula(param.formula, valoresPorNombre);
              // actualizar tanto el mapa local como el objeto a enviar
              valoresPorNombre[param.nombre] = computed === null || computed === undefined ? "" : computed;
              resultadosToSend[`${id}__${param.nombre}`] = computed === null || computed === undefined ? "" : computed;
            }
          }
        });
      });

      // Usar orden.consulta_id si existe, sino orden.id
      const consultaId = orden.consulta_id ? orden.consulta_id : orden.id;
      const res = await fetch(BASE_URL + "api_resultados_laboratorio.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consulta_id: consultaId, tipo_examen: "varios", resultados: resultadosToSend }),
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
    
    if (param && param.min !== null && param.min !== "") {
      const m = normalizeNumber(param.min);
      if (Number.isFinite(m)) min = m;
    } else if (param && param.referencias && param.referencias[0]) {
      const mRef = normalizeNumber(param.referencias[0].valor_min);
      if (Number.isFinite(mRef)) min = mRef;
    }
    
    if (param && param.max !== null && param.max !== "") {
      const M = normalizeNumber(param.max);
      if (Number.isFinite(M)) max = M;
    } else if (param && param.referencias && param.referencias[0]) {
      const MRef = normalizeNumber(param.referencias[0].valor_max);
      if (Number.isFinite(MRef)) max = MRef;
    }

    // Si no hay min/max numéricos, intentar parsear desde el texto de referencia
    if ((min === null && max === null) && param && Array.isArray(param.referencias) && param.referencias[0]) {
      const fromText = parseMinMaxFromText(param.referencias[0].valor);
      if (fromText.min !== null) min = fromText.min;
      if (fromText.max !== null) max = fromText.max;
    }
    
    let valorNum = normalizeNumber(valor);
    if (Number.isFinite(valorNum)) {
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
                const exOrdenDetalle = Array.isArray(orden.examenes)
                  ? orden.examenes.find(ex => (typeof ex === 'object' && ex.id == id))
                  : null;
                const paramsList = (exObj && Array.isArray(exObj.valores_referenciales) && exObj.valores_referenciales.length > 0)
                  ? exObj.valores_referenciales
                  : (exOrdenDetalle && Array.isArray(exOrdenDetalle.valores_referenciales) ? exOrdenDetalle.valores_referenciales : []);

                if (Array.isArray(paramsList) && paramsList.length > 0) {
                  // Construir un mapa nombre->valor para este examen usando la lista efectiva de parámetros
                  const valoresPorNombre = {};
                  paramsList.filter(p => p && typeof p === 'object').forEach(param => {
                    if ((param.tipo === undefined || param.tipo === "Parámetro") && param.nombre && param.nombre.trim() !== "") {
                      valoresPorNombre[param.nombre] = resultados[`${id}__${param.nombre}`] || "";
                    }
                  });
                  const examName = (exObj && exObj.nombre) || (exOrdenDetalle && exOrdenDetalle.nombre) || `Examen ${id}`;

                  return (
                    <div key={id} className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                      {/* Header del examen */}
                      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                          🧪
                        </div>
                        <div>
                          <h4 className="text-lg font-bold text-gray-900">{examName}</h4>
                          <p className="text-sm text-gray-600">Complete todos los parámetros requeridos</p>
                        </div>
                      </div>

                      {/* Parámetros del examen */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {(() => {
                          return (paramsList || []).filter(p => p && typeof p === 'object').map((param) => {
                          if ((param.tipo === undefined || param.tipo === "Parámetro") && param.nombre && param.nombre.trim() !== "") {
                            const tieneFormula = param.formula && param.formula.trim() !== "";
                            let valor = resultados[`${id}__${param.nombre}`] || "";

                            // Nombre a mostrar: si viene como "Item 1" y este examen solo tiene un parámetro,
                            // mostrar el nombre del examen para una mejor UX, manteniendo la clave original.
                            const parametrosValidos = (paramsList || []).filter(p => p && typeof p === 'object' && (p.tipo === undefined || p.tipo === "Parámetro") && p.nombre && p.nombre.trim() !== "");
                            const defaults = parametrosValidos.filter(p => /^item\s*\d+$/i.test((p.nombre || '').trim()));
                            const isDefaultItem = /^item\s*\d+$/i.test((param.nombre || '').trim());
                            const defaultIndex = isDefaultItem ? defaults.findIndex(p => p === param) : -1;
                            const displayName = isDefaultItem
                              ? (defaults.length <= 1 ? examName : `${examName} — Parámetro ${defaultIndex + 1}`)
                              : param.nombre;
                            
                            if (tieneFormula) {
                              valor = evalFormula(param.formula, valoresPorNombre);
                            }
                            
                            if (typeof valor === 'number' && isNaN(valor)) valor = "";
                            if (valor === undefined || valor === null) valor = "";

                            const { fueraDeRango, min, max } = getParameterStatus(param, valor);
                            // Texto de referencia a mostrar: soporta rango (min/max) o valor textual
                            let referenciaTexto = null;
                            if (min !== null || max !== null) {
                              referenciaTexto = `Rango de referencia: ${min !== null ? min : '∞'} - ${max !== null ? max : '∞'}`;
                            } else if (Array.isArray(param.referencias) && param.referencias.length > 0) {
                              const r0 = param.referencias[0] || {};
                              if (r0.valor && String(r0.valor).trim() !== '') {
                                referenciaTexto = `Referencia: ${r0.valor}`;
                              }
                            }

                            return (
                              <div key={param.nombre} className="space-y-2">
                                <label className="block text-sm font-semibold text-gray-700">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span>{displayName}</span>
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
                                  {referenciaTexto && (
                                    <div className="text-xs text-gray-500 mt-1">{referenciaTexto}</div>
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
                        });
                        })()}
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
