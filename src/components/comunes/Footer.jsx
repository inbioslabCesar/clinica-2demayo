
function Footer() {
  return (
    <footer className="w-full bg-purple-800 py-4 border-t border-blue-500 shadow-inner">
      <div className="container mx-auto text-center">
        <span className="text-white text-sm font-medium drop-shadow">© {new Date().getFullYear()} Clínica 2 de Mayo. Todos los derechos reservados.</span>
      </div>
    </footer>
  );
}

export default Footer;
