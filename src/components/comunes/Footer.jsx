
function Footer({ clinicName = "Sistema Clínico" }) {
  const safeName = String(clinicName || "").trim() || "Sistema Clínico";
  return (
    <footer
      className="w-full py-4 border-t shadow-inner"
      style={{
        background: "linear-gradient(90deg, var(--color-primary-dark) 0%, var(--color-secondary) 55%, var(--color-primary) 100%)",
        borderTopColor: "var(--color-primary-light)",
      }}
    >
      <div className="container mx-auto text-center">
        <span className="text-white text-sm font-medium drop-shadow">© {new Date().getFullYear()} {safeName}. Todos los derechos reservados.</span>
      </div>
    </footer>
  );
}

export default Footer;
