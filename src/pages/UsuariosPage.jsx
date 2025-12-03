import UsuarioList from "../components/usuario/UsuarioList";

function UsuariosPage() {
  return (
    <div className="container py-4">
      <h2 className="mb-4 text-2xl font-bold text-purple-800">Gestión de Usuarios</h2>
      <UsuarioList />
    </div>
  );
}

export default UsuariosPage;