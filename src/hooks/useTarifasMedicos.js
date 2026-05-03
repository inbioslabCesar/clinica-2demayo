import { useState, useEffect } from "react";
import { authFetch } from "../utils/apiClient";

export function useTarifasMedicos() {
  const [tarifas, setTarifas] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarTarifas();
    cargarMedicos();
  }, []);

  const cargarTarifas = async () => {
    try {
      setLoading(true);
      const response = await authFetch("api_tarifas.php");
      const data = await response.json();
      if (data.success) {
        setTarifas(data.tarifas || []);
      }
    } catch (error) {
      setTarifas([]);
    } finally {
      setLoading(false);
    }
  };

  const cargarMedicos = async () => {
    try {
      const response = await authFetch("api_medicos.php");
      const data = await response.json();
      if (data.success) {
        const medicosNormalizados = (data.medicos || []).map((medico) => ({ ...medico, id: parseInt(medico.id) }));
        setMedicos(medicosNormalizados);
      }
    } catch (error) {
      setMedicos([]);
    }
  };

  return { tarifas, medicos, loading, cargarTarifas };
}
