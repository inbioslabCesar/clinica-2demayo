
import React, { useState, useEffect } from "react";
import { BASE_URL } from "../config/config";

function LlenarResultadosForm({ orden, onVolver, onGuardado }) {
  // Inicializa los resultados con los exámenes solicitados o los ya guardados
  // examenesDisponibles debe estar antes de inicializar resultados
  const [examenesDisponibles, setExamenesDisponibles] = useState([]);
  const [resultados, setResultados] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(BASE_URL + "api_examenes_laboratorio.php", {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setExamenesDisponibles(data.examenes || []));
  }, []);

  // Si la orden cambia (por ejemplo, al editar otra orden), actualizar resultados
  // Inicializar resultados solo cuando examenesDisponibles esté listo
  useEffect(() => {
    if (!examenesDisponibles || examenesDisponibles.length === 0) return;
    if (orden.resultados && typeof orden.resultados === 'object') {
      setResultados({ ...orden.resultados });
    } else {
      const res = {};
      (orden.examenes || []).forEach(exId => {
        const exObj = examenesDisponibles.find(e => e.id == exId);
        if (exObj && Array.isArray(exObj.valores_referenciales) && exObj.valores_referenciales.length > 0) {
          exObj.valores_referenciales.forEach(param => {
            // Solo considerar parámetros, no subtítulos/títulos
            if ((param.tipo === undefined || param.tipo === "Parámetro") && param.nombre && param.nombre.trim() !== "") {
              res[`${exId}__${param.nombre}`] = "";
            }
          });
        } else {
          res[`${exId}`] = "";
        }
      });
      setResultados(res);
    }
  }, [orden, examenesDisponibles]);

  // Evalúa una fórmula simple usando los valores actuales
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

  // Cuando cambia un campo, recalcula los que tengan fórmula
  const handleChange = (e) => {
    const nuevos = { ...resultados, [e.target.name]: e.target.value };
    setResultados(nuevos);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setMsg("");
    // Guardar resultados en la tabla resultados_laboratorio
    const res = await fetch(BASE_URL + "api_resultados_laboratorio.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consulta_id: orden.consulta_id, tipo_examen: "varios", resultados }),
    });
    const data = await res.json();
    setGuardando(false);
    if (data.success) {
      setMsg("Resultados guardados correctamente");
      onGuardado && onGuardado();
    } else {
      setMsg(data.error || "Error al guardar");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h4 className="font-semibold mb-2">Llenar resultados de laboratorio</h4>
      <div className="max-h-[400px] md:max-h-[500px] overflow-y-auto pr-2 border rounded bg-white">
        {(orden.examenes || []).map(exId => {
          const exObj = examenesDisponibles.find(e => e.id == exId);
          if (exObj && Array.isArray(exObj.valores_referenciales) && exObj.valores_referenciales.length > 0) {
            // Construir un mapa nombre->valor para este examen
            const valoresPorNombre = {};
            exObj.valores_referenciales.forEach(param => {
              if ((param.tipo === undefined || param.tipo === "Parámetro") && param.nombre && param.nombre.trim() !== "") {
                valoresPorNombre[param.nombre] = resultados[`${exId}__${param.nombre}`] || "";
              }
            });
            return (
              <div key={exId} className="mb-4 border-b pb-2">
                <div className="font-semibold mb-1">{exObj.nombre}</div>
                {exObj.valores_referenciales.map((param, idx) => {
                  if ((param.tipo === undefined || param.tipo === "Parámetro") && param.nombre && param.nombre.trim() !== "") {
                    // Si tiene fórmula, calcular el valor
                    const tieneFormula = param.formula && param.formula.trim() !== "";
                    let valor = resultados[`${exId}__${param.nombre}`] || "";
                    if (tieneFormula) {
                      valor = evalFormula(param.formula, valoresPorNombre);
                    }
                    // Si valor es NaN, pasar string vacío
                    if (typeof valor === 'number' && isNaN(valor)) valor = "";
                    if (valor === undefined || valor === null) valor = "";
                    // Comparar con min y max (robusto, compatible con referencias)
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
                    return (
                      <div key={param.nombre} className="mb-2 ml-4">
                        <label className="block text-sm font-medium mb-1">
                          {param.nombre}
                          {tieneFormula ? <span className="text-xs text-blue-600 ml-2">(fórmula: {param.formula})</span> : null}
                          {(min !== null || max !== null) && (
                            <span className="text-xs text-gray-500 ml-2">[
                              {min !== null ? `min: ${min}` : ''}
                              {min !== null && max !== null ? ', ' : ''}
                              {max !== null ? `max: ${max}` : ''}
                            ]</span>
                          )}
                        </label>
                        <input
                          type="text"
                          name={`${exId}__${param.nombre}`}
                          value={valor}
                          onChange={tieneFormula ? undefined : handleChange}
                          className={`w-full border-2 rounded p-1 bg-gray-100 transition-colors duration-200 ${fueraDeRango ? 'border-red-600 text-red-700 font-bold bg-red-50' : 'border-gray-300'}`}
                          readOnly={tieneFormula}
                          required
                        />
                        {fueraDeRango && (min !== null || max !== null) && (
                          <span className="text-xs text-red-600 ml-1 font-semibold">{`Fuera de rango`}</span>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            );
          } else if (exObj) {
            // Examen sin parámetros definidos
            return (
              <div key={exId} className="mb-2">
                <label className="block font-semibold mb-1">{exObj.nombre}:</label>
                <input
                  type="text"
                  name={`${exId}`}
                  value={resultados[`${exId}`] || ""}
                  onChange={handleChange}
                  className="w-full border rounded p-1"
                  required
                />
              </div>
            );
          } else {
            // Si no se encuentra el objeto del examen
            return null;
          }
        })}
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onVolver} className="bg-gray-300 px-3 py-1 rounded">Volver</button>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded" disabled={guardando}>{guardando ? "Guardando..." : "Guardar resultados"}</button>
      </div>
      {msg && <div className="mt-2 text-green-700 font-semibold">{msg}</div>}
    </form>
  );
}

export default LlenarResultadosForm;
