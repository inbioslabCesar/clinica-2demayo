
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";

function Login({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const esEmail = usuario.includes("@") && usuario.includes(".");
    try {
      if (esEmail) {
        // 1. Intentar login como médico
        let resMedico, dataMedico;
        try {
          resMedico = await fetch(BASE_URL + "api_login_medico.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: usuario, password }),
            credentials: "include"
          });
          dataMedico = await resMedico.json();
        } catch {
          resMedico = { ok: false };
          dataMedico = {};
        }
        if (resMedico.ok && dataMedico.success) {
          const medicoConRol = { ...dataMedico.medico, rol: 'medico' };
          sessionStorage.setItem('medico', JSON.stringify(medicoConRol));
          onLogin && onLogin(medicoConRol);
          navigate("/");
          return;
        }
        // Si falla, intentar como usuario normal
        let res, data;
        try {
          res = await fetch(BASE_URL + "api_login.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usuario, password }),
            credentials: "include"
          });
          data = await res.json();
        } catch {
          res = { ok: false };
          data = {};
        }
        if (res.ok && data.success) {
          sessionStorage.setItem('usuario', JSON.stringify(data.usuario));
          onLogin && onLogin(data.usuario);
          navigate("/");
          return;
        }
      } else {
        // 1. Intentar login como usuario normal
        let res, data;
        try {
          res = await fetch(BASE_URL + "api_login.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usuario, password }),
            credentials: "include"
          });
          data = await res.json();
        } catch {
          res = { ok: false };
          data = {};
        }
        if (res.ok && data.success) {
          sessionStorage.setItem('usuario', JSON.stringify(data.usuario));
          onLogin && onLogin(data.usuario);
          navigate("/");
          return;
        }
        // Si falla, intentar como médico
        let resMedico, dataMedico;
        try {
          resMedico = await fetch(BASE_URL + "api_login_medico.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: usuario, password }),
            credentials: "include"
          });
          dataMedico = await resMedico.json();
        } catch {
          resMedico = { ok: false };
          dataMedico = {};
        }
        if (resMedico.ok && dataMedico.success) {
          const medicoConRol = { ...dataMedico.medico, rol: 'medico' };
          sessionStorage.setItem('medico', JSON.stringify(medicoConRol));
          onLogin && onLogin(medicoConRol);
          navigate("/");
          return;
        }
      }
      setError("Usuario o contraseña incorrectos");
    } catch {
      setError("Error de conexión con el servidor");
    }
  };

  return (
  <div className="flex justify-center items-center min-h-0 md:min-h-screen py-8">
      <div className="w-full max-w-sm bg-white/95 rounded-xl border border-blue-400 shadow-lg p-6">
        <div className="flex flex-col items-center mb-4">
          <img src="/2demayo.svg" alt="Logo clínica" className="h-14 w-14 object-contain bg-white rounded-full p-1 mb-2 shadow" />
          <h1 className="text-lg font-bold text-purple-800 mb-0 drop-shadow">Clínica 2 de Mayo</h1>
          <h2 className="text-sm font-semibold text-blue-500 mb-2">Ingreso al Sistema</h2>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Usuario o email del médico"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
            required
          />
          <button type="submit" className="bg-gradient-to-r from-purple-800 via-blue-500 to-green-400 text-white font-bold rounded-lg py-2 mt-2 shadow hover:scale-105 transition-transform">Ingresar</button>
          {error && <div className="mt-2 text-red-600 text-center font-medium bg-red-100 rounded p-1 text-sm">{error}</div>}
        </form>
      </div>
    </div>
  );
}

export default Login;
