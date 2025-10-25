import { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";

export default function useCajaActual() {
  const [caja, setCaja] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(BASE_URL + "api_caja_actual.php", { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setCaja(data.caja);
        } else {
          setCaja(null);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err);
        setLoading(false);
      });
  }, []);

  return { caja, loading, error };
}
