import SidebarFarmacia from "../farmacia/SidebarFarmacia";

function QuimicoPanelPage() {
  return (
    <div className="flex min-h-screen" style={{ background: "linear-gradient(135deg, var(--color-primary-light) 0%, #f8fafc 100%)" }}>
      <aside className="w-64 min-h-screen border-r" style={{ borderColor: "var(--color-primary-light)" }}>
        <SidebarFarmacia />
      </aside>
      <main className="flex-1 p-4">
        <div
          className="rounded-2xl p-4 text-white shadow-lg mb-4"
          style={{ background: "linear-gradient(90deg, var(--color-primary) 0%, var(--color-secondary) 100%)" }}
        >
          <h1 className="text-2xl font-bold text-center">Panel de Farmacia</h1>
        </div>
        <div className="bg-white rounded-xl shadow p-4 text-center border" style={{ borderColor: "var(--color-primary-light)" }}>
          <p>Bienvenido al panel del químico/farmacia. Aquí podrás gestionar recetas, medicamentos y entregas.</p>
          {/* Aquí puedes agregar componentes y lógica de farmacia */}
        </div>
      </main>
    </div>
  );
}

export default QuimicoPanelPage;
