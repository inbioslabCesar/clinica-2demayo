# Actualizador de esquema de BD (solo CLI)

Lleva cualquier BD de cliente al esquema de **desarrollo** (`poli2demayo`) creando **solo lo que falte**:
tablas, columnas, índices, claves foráneas y semillas. Decide mirando `information_schema`, por lo que sirve
igual para una BD muy atrasada o casi al día, y es idempotente.

Diseño completo: [docs/guia_actualizador_esquema_bd_portable.md](../../docs/guia_actualizador_esquema_bd_portable.md).

## Reglas

- **Simulacro por defecto.** Aplicar exige `--aplicar --confirmo-respaldo`.
- **Nunca** hace `DROP`/`DELETE` ni modifica lo existente (excepción: ampliar un `ENUM` agregando valores al final).
  Lo que difiere se informa como `INFO` con el `ALTER` sugerido.
- Índices `UNIQUE` y claves foráneas solo se crean si no hay duplicados / huérfanos (si los hay: `OMITIDA` + consulta).
- Las **FKs no se aplican por defecto** (activarlas puede hacer fallar borrados que la UI no controla):
  usar `--incluir-fks` o `--solo=fks`.
- Solo CLI (`PHP_SAPI !== 'cli'` aborta). No se incluye en el paquete de release; se sube a mano fuera de `public_html`.

## Archivos

| Archivo | Uso |
|---|---|
| `EsquemaBd.php` | Toda la lógica |
| `generar_esquema_referencia.php` | Lee dev (solo lectura) y escribe `db/esquema_referencia/esquema_referencia.json` |
| `actualizar_esquema_bd.php` | Compara una/todas las BD de clientes y crea lo que falte |
| `sql/2026-11-22/001_verify_huella_estructura.sql` | Huella MD5 de estructura para comparar dos BD |

## Uso

```
# 1) Cada vez que cambie la estructura de dev: regenerar y versionar la referencia
php scripts/esquema_bd/generar_esquema_referencia.php

# 2) Ver las BD de clientes detectadas (config/instances/*.php, agrupadas por DB_NAME)
php scripts/esquema_bd/actualizar_esquema_bd.php --listar

# 3) Simulacro
php scripts/esquema_bd/actualizar_esquema_bd.php --empresa=sistema_clinica2demayo_com
php scripts/esquema_bd/actualizar_esquema_bd.php --todas

# 4) Aplicar (tras respaldo con mysqldump)
php scripts/esquema_bd/actualizar_esquema_bd.php --empresa=sistema_clinica2demayo_com --aplicar --confirmo-respaldo
```

| Opción | Efecto |
|---|---|
| `--empresa=slug` / `--todas` | Qué BD(s); no se pueden combinar. `--todas` omite `u330560936_prueba_bd`, `u330560936_nutrimed_bd` (inactiva) y `u330560936_sanAntonioBD` (dominio provisional de Padua) salvo `--incluir-pruebas` |
| `--solo=tablas,columnas,indices,fks,semillas` | Limita fases. Por defecto: `tablas,columnas,indices,semillas` |
| `--incluir-fks` | Agrega la fase `fks` a las fases por defecto |
| `--nombres-exactos` | Crea índices/FKs por nombre aunque exista uno equivalente (para igualar a dev) |
| `--sql=archivo.sql` | Guarda el SQL pendiente (para phpMyAdmin si no hay CLI) |
| `--ref=archivo.json` | Referencia alternativa |
| `--host --puerto --bd --usuario --clave` | Sobrescriben la conexión (solo con `--empresa`) |

Códigos de salida: `0` al día · `1` error o quedaron acciones pendientes · `2` hay cambios pendientes (simulacro) u omitidas por revisar.
Al aplicar se escribe un registro en `tmp/esquema_bd/` (ignorado por git). Nunca se imprimen contraseñas.

## Despliegue en Hostinger (por SSH, dentro del servidor)

Todas las BD están en la misma cuenta y aceptan solo `localhost`, así que se ejecuta desde el servidor.

1. Subir a una carpeta **fuera de `public_html`** (p. ej. `~/herramienta_bd`): `scripts/esquema_bd/`, `db/esquema_referencia/` y `config/instances/` (de ahí se leen las credenciales de cada BD).
   ```
   ssh -p 65002 USUARIO@HOST "mkdir -p ~/herramienta_bd/scripts ~/herramienta_bd/db ~/herramienta_bd/config"
   scp -P 65002 -r scripts/esquema_bd USUARIO@HOST:~/herramienta_bd/scripts/
   scp -P 65002 -r db/esquema_referencia USUARIO@HOST:~/herramienta_bd/db/
   scp -P 65002 -r config/instances USUARIO@HOST:~/herramienta_bd/config/
   ```
   Si las configuraciones de producción viven en `../clinica-config/`, también se leen desde ahí.
2. `php --version` (producción: PHP 8.2) y `php -m | grep -i pdo_mysql`.
3. Simulacro de todas: `php scripts/esquema_bd/actualizar_esquema_bd.php --todas | grep -E '^===|Resumen'`.
4. Piloto con el cliente más simple, de a uno:
   ```
   mysqldump --no-tablespaces -u USUARIO -p BD > ~/respaldo_CLIENTE_$(date +%F).sql
   ls -lh ~/respaldo_CLIENTE_*.sql      # no debe pesar 0 bytes
   php scripts/esquema_bd/actualizar_esquema_bd.php --empresa=SLUG --aplicar --confirmo-respaldo
   php scripts/esquema_bd/actualizar_esquema_bd.php --empresa=SLUG    # debe decir "sin diferencias"
   ```
   Probar el sistema del cliente en el navegador sin crear datos de prueba.
5. FKs (segunda pasada, opcional): `--solo=fks` en simulacro lista huérfanos; depurarlos a mano y reejecutar con `--aplicar`.
6. **Limpieza:** `rm -rf ~/herramienta_bd` (contiene credenciales) y bajar/borrar los `~/respaldo_*.sql`.

## Límites (a propósito)

No elimina sobrantes, no cambia tipo/nulabilidad/default de columnas existentes (solo `INFO`), no renombra ni migra datos.
Columnas generadas, `AUTO_INCREMENT` en tabla existente, índices funcionales y `CHECK` se avisan para crear a mano.
Vistas, triggers y procedimientos no se comparan (solo tablas base).
**Probado contra MySQL 8.4; la compatibilidad con MariaDB (producción) está implementada pero se valida con el simulacro de producción.**
