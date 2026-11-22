# 2026-11-22 · Herramienta de actualización de esquema de BD

**Sin cambios de BD.** Esta carpeta solo contiene un script de verificación de solo lectura.

- `001_verify_huella_estructura.sql`: devuelve `elementos` y `huella` (MD5) de columnas, índices y FKs normalizados.
  Ejecutarlo igual en dev y en cada cliente (phpMyAdmin > SQL, con la BD seleccionada). Si coinciden, la estructura es idéntica.
  En clientes solo coincide con dev tras aplicar el actualizador con `--nombres-exactos --incluir-fks` y si no hay objetos sobrantes.

Referencia de dev usada al crearlo: 140 tablas · 1816 columnas · 635 índices · 88 FKs → huella `39791c8de0c19da0da38e391b0642593` (2539 elementos).
Herramienta: [scripts/esquema_bd/README.md](../../scripts/esquema_bd/README.md).
