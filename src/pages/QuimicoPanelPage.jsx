import SidebarFarmacia from "../farmacia/SidebarFarmacia";

function QuimicoPanelPage() {
  return (
    <div className="flex">
      <aside className="w-64 min-h-screen bg-blue-50 border-r">
        <SidebarFarmacia />
      </aside>
      <main className="flex-1 p-4">
        <h1 className="text-2xl font-bold text-center mb-4">Panel de Farmacia</h1>
        <div className="bg-white rounded shadow p-4 text-center">
          <p>Bienvenido al panel del químico/farmacia. Aquí podrás gestionar recetas, medicamentos y entregas.</p>
          {/* Aquí puedes agregar componentes y lógica de farmacia */}
        </div>
      </main>
    </div>
  );
}

export default QuimicoPanelPage;
