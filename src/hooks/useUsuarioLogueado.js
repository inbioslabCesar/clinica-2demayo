import { useEffect, useState } from "react";
import { authFetch } from "../utils/apiClient";

export default function useUsuarioLogueado() {
  const [usuario, setUsuario] = useState(null);
  useEffect(() => {
    authFetch("api_auth_status.php")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.authenticated) {
          setUsuario({
            id: data.usuario_id,
            nombre: data.nombre,
            rol: data.rol,
            usuario: data.usuario,
            permisos: Array.isArray(data.permisos) ? data.permisos : [],
          });
        } else {
          setUsuario(null);
        }
      })
      .catch(() => setUsuario(null));
  }, []);
  return usuario;
}
