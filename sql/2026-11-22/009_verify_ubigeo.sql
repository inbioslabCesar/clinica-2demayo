-- Verificación del catálogo de ubigeo (007 + 008). Esperado: departamentos 25, provincias 196, distritos > 1800, huérfanos 0.
SELECT
  (SELECT COUNT(*) FROM departamento) AS departamentos,
  (SELECT COUNT(*) FROM provincia)    AS provincias,
  (SELECT COUNT(*) FROM distrito)     AS distritos,
  (SELECT COUNT(*) FROM provincia p LEFT JOIN departamento d ON d.id = p.departamento WHERE d.id IS NULL) AS provincias_huerfanas,
  (SELECT COUNT(*) FROM distrito x LEFT JOIN provincia p ON p.id = x.provincia WHERE p.id IS NULL)       AS distritos_huerfanos;
