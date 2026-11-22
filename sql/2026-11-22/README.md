# 2026-11-22 · Herramienta de actualización de esquema de BD

**Sin cambios de BD.** Esta carpeta solo contiene un script de verificación de solo lectura.

- `001_verify_huella_estructura.sql`: devuelve `elementos` y `huella` (MD5) de columnas, índices y FKs normalizados.
  Ejecutarlo igual en dev y en cada cliente (phpMyAdmin > SQL, con la BD seleccionada). Si coinciden, la estructura es idéntica.
  En clientes solo coincide con dev tras aplicar el actualizador con `--nombres-exactos --incluir-fks` y si no hay objetos sobrantes.

Referencia de dev usada al crearlo: 131 tablas · 1673 columnas · 618 índices · 88 FKs → huella `dd69183953cc5f169b0ce91a47be43ea` (2379 elementos).
Se excluyen tablas de un solo uso: `backup`, `bkp`, `bak` (como palabra dentro del nombre) y prefijo `zfix_`.
Herramienta: [scripts/esquema_bd/README.md](../../scripts/esquema_bd/README.md).
