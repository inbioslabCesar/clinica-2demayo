import { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";

export default function useUsuarioLogueado() {
  const [usuario, setUsuario] = useState(null);
  useEffect(() => {
    fetch(BASE_URL + "api_auth_status.php", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.authenticated) {
          setUsuario({
            id: data.usuario_id,
            nombre: data.nombre,
            rol: data.rol,
            usuario: data.usuario,
          });
        } else {
          setUsuario(null);
        }
      })
      .catch(() => setUsuario(null));
  }, []);
  return usuario;
}
