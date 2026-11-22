# Guía portable: actualizador de esquema de BD para clientes desactualizados

Documento para implementar en **otro sistema** (frontend React + backend PHP + MySQL/MariaDB) la misma herramienta que se construyó y se usó en producción en el sistema `base-php` (laboratorio InbiosLab). Está escrito para que una persona o un asistente (Copilot) lo pueda aplicar sin acceso al repositorio original.

---

## 0. Instrucción lista para pegar a Copilot (en el otro sistema)

> Lee completa la guía `guia_actualizador_esquema_bd_portable.md`. Implementa en este proyecto la herramienta descrita: un generador del esquema de referencia (desde la BD de **desarrollo**) y un actualizador por línea de comandos que lleva cualquier BD de cliente a ese esquema **creando solo lo que falte** (tablas, columnas, índices, claves foráneas, semillas). Reglas no negociables: simulacro por defecto, `--aplicar` exige `--confirmo-respaldo`, nunca `DROP`/`DELETE`/modificar lo existente (salvo ampliar un ENUM agregando valores al final), solo CLI (nunca por web), contraseñas nunca impresas. Adapta únicamente los puntos de la sección 6 ("Puntos que cambian en cada sistema"). Antes de tocar nada, muéstrame el plan y los archivos que vas a crear. Después prueba con una BD temporal siguiendo la sección 9 y no des nada por bueno sin esa prueba.

---

## 1. Problema que resuelve

- Existe una BD de **desarrollo** (dev) que es la estable y la fuente de verdad.
- Hay **varias BD de clientes en producción**, cada una con un grado distinto de atraso: a unas les faltan 2 columnas, a otras 20 tablas.
- No se quiere llevar un "número de versión" por cliente ni escribir un script distinto para cada uno.

**Solución:** un único actualizador que, para cada BD, **mira la estructura real** (`information_schema`), la compara contra un esquema de referencia generado desde dev, y crea lo que falte. Como decide con lo que *hay*, sirve igual para una BD muy atrasada o casi al día, y es idempotente (ejecutarlo dos veces no hace nada la segunda).

## 2. Principios de diseño (por qué está hecho así)

1. **Solo crea, nunca destruye.** No hace `DROP`, no borra, no cambia tipo/nulabilidad/default de columnas existentes. Lo que difiere lo reporta como `INFO` con el `ALTER` sugerido para decidir a mano. Única excepción automática: ampliar un `ENUM` cuando la referencia solo **agrega valores al final** (no toca datos).
2. **Simulacro por defecto.** Sin `--aplicar` solo imprime lo que haría. Para aplicar exige además `--confirmo-respaldo` (obliga a recordar el respaldo).
3. **Decide mirando la BD real**, no un historial de migraciones. Cada acción se vuelve a calcular en cada ejecución.
4. **Cada acción es independiente.** Si una falla, se informa `[ERROR]` y el resto continúa. Al final se **re-planifica** para verificar que no quedó nada pendiente.
5. **Las claves foráneas se crean solo si no hay registros huérfanos.** Si los hay, se omite con aviso y la consulta para verlos. Nunca se borran huérfanos automáticamente.
6. **Los UNIQUE/PRIMARY solo si no hay duplicados.**
7. **Funciona en MySQL y MariaDB** (producción solía ser MariaDB 11.x y dev MySQL 8.4): normaliza diferencias de `COLUMN_DEFAULT`, ancho de enteros (`int(11)` vs `int`), `RESTRICT` vs `NO ACTION`, y collations que el destino no conoce.
8. **Solo línea de comandos.** El script aborta si `PHP_SAPI !== 'cli'`. Nunca debe ser accesible por HTTP (por eso se ejecuta desde una carpeta fuera de `public_html`).

## 3. Arquitectura

```
scripts/esquema_bd/
  EsquemaBd.php                     <- librería (toda la lógica)
  generar_esquema_referencia.php    <- CLI: lee dev (solo lectura) y escribe el JSON de referencia
  actualizar_esquema_bd.php         <- CLI: compara una/todas las BD de clientes y crea lo que falte
  README.md                         <- uso rápido
sql/esquema_referencia/
  esquema_referencia.json           <- la referencia (se versiona en el repo)
sql/<fecha>_.../verificar_estructura.sql  <- huella MD5 de estructura (ver sección 8)
```

Flujo:

```
BD dev --(generar_esquema_referencia.php)--> esquema_referencia.json
esquema_referencia.json + BD cliente --(actualizar_esquema_bd.php)--> simulacro / aplicar
```

## 4. El esquema de referencia (JSON)

Generado leyendo `information_schema` de dev. Estructura:

```json
{
  "formato": 1,
  "generado_en": "2026-11-22 03:06",
  "origen_motor": "MySQL 8.4.3",
  "tablas": {
    "mi_tabla": {
      "engine": "InnoDB",
      "collation": "utf8mb4_unicode_ci",
      "columnas": {
        "col": { "orden": 1, "tipo": "int", "nulo": false,
                 "defecto": {"t": "ninguno|nulo|literal|expr", "v": "..."},
                 "extra": "auto_increment", "collation": null,
                 "comentario": "", "generada": false }
      },
      "indices": {
        "PRIMARY": { "unico": true, "tipo": "BTREE", "expresion": false,
                     "columnas": [{"c": "id", "sub": null}] }
      },
      "fks": {
        "fk_x": { "columnas": ["a_id"], "ref_tabla": "otra", "ref_columnas": ["id"],
                  "on_delete": "CASCADE", "on_update": "NO ACTION" }
      }
    }
  },
  "semillas": { "catalogo": [ { "codigo": "301", "nombre": "..." } ] }
}
```

Consultas usadas (todas con `TABLE_SCHEMA = DATABASE()`):
- `information_schema.TABLES` (solo `BASE TABLE`): engine, collation.
- `information_schema.COLUMNS`: `COLUMN_TYPE`, `IS_NULLABLE`, `COLUMN_DEFAULT`, `EXTRA`, `COLLATION_NAME`, `COLUMN_COMMENT`, `GENERATION_EXPRESSION`, `ORDINAL_POSITION`.
- `information_schema.STATISTICS`: índices (agrupar por `INDEX_NAME`, ordenar por `SEQ_IN_INDEX`; `NON_UNIQUE=0` => único; `SUB_PART` para prefijos; `COLUMN_NAME IS NULL` => índice funcional).
- `KEY_COLUMN_USAGE` + `REFERENTIAL_CONSTRAINTS` (join por schema + nombre + tabla): FKs con `DELETE_RULE`/`UPDATE_RULE`.

### Normalización de `COLUMN_DEFAULT` (crítico entre MySQL y MariaDB)
Se unifica en `{t, v}`:
- `NULL` en BD: `nulo` si la columna admite NULL, si no `ninguno` (sin default).
- **MariaDB** devuelve el default como texto SQL: `'NULL'` => `nulo`; `'abc'` entre comillas => `literal` quitando comillas (y `''`→`'`); número => `literal`; otra cosa (p. ej. `current_timestamp()`) => `expr`.
- **MySQL**: si `EXTRA` contiene `default_generated` => `expr`; si no => `literal`.
- Al comparar, las expresiones se normalizan (minúsculas, sin `()`, comillas ni espacios).

### Normalización de tipos al comparar
`int(11)` = `int`, `tinyint(1)` = `tinyint`, etc. (se quita el ancho de enteros); `json` = `longtext` (MariaDB guarda JSON como longtext).

### Qué se excluye de la referencia
- **Tablas de respaldo/puntuales**: regex `/(^|_)backup(_|$)/i` (`backup_*`, `*_backup`, `*_backup_*`). Además se eliminan las FKs que apunten a tablas excluidas. Se aplica tanto al generar como al cargar el JSON.

## 5. Algoritmo de planificación (`planificar`)

Entrada: referencia, estructura actual del destino, `PDO`, opciones. Salida: lista de acciones `{fase, tabla, objeto, sql|null, estado, nota}` con `estado` ∈ `pendiente | omitida | info` (y luego `ok | error` al aplicar).

Se trabaja sobre una copia `$d` del estado del destino que se va **actualizando conforme se planifica** (para que las fases siguientes vean lo que las anteriores crearán). Orden de fases:

1. **tablas**: si la tabla no existe en destino => `CREATE TABLE` con columnas (en orden de referencia), índices (PRIMARY primero) y engine/charset/collation. **Las FKs NO van dentro del CREATE**; se agregan en la fase 4 para no depender del orden de creación. Las columnas generadas se omiten con nota ("crear a mano"). La tabla se marca `nueva` para que las fases siguientes no repitan lo que ya trae el CREATE.
2. **columnas** (tablas ya existentes): recorre columnas de la referencia por `orden`.
   - Falta => `ALTER TABLE ... ADD COLUMN <def> AFTER <columna previa>` (o `FIRST`). `$previa` solo se actualiza con columnas que **existen** o se van a crear (las omitidas no la actualizan), así nunca se usa `AFTER` de una columna inexistente. Las `auto_increment`/generadas faltantes se omiten ("crear a mano").
   - Existe y la referencia es el ENUM actual **+ valores nuevos al final** (`esAmpliacionEnum`) => `MODIFY COLUMN` conservando nulabilidad y default actuales (acción `pendiente`, nota "Ampliación segura de ENUM").
   - Existe y difiere en tipo/nulabilidad/default => `info` con el `ALTER` sugerido (no se ejecuta).
3. **índices** (tablas no nuevas):
   - Índice funcional (`expresion`) => `omitida` ("crear a mano").
   - Existe con el mismo nombre pero otra definición => `info`.
   - No existe por nombre:
     - Sin `--nombres-exactos`: si ya hay **otro índice equivalente** (misma firma: único/no, tipo, columnas con prefijo) => `info` "cubierto por X" (evita duplicar índices solo por nombre).
     - Si faltan columnas => `omitida`.
     - Si es `UNIQUE` y hay duplicados (`GROUP BY cols HAVING COUNT(*)>1`, solo tuplas sin NULL) => `omitida`.
     - Si no => `ALTER TABLE ... ADD [UNIQUE] KEY ...`.
4. **claves foráneas** (al final, ya existen tablas/columnas/índices):
   - Existe por nombre => nada.
   - Sin `--nombres-exactos`: FK equivalente (mismas columnas/tabla/columnas ref) con otro nombre => `info`.
   - Nombre de restricción ya usado en **otra tabla** (en MySQL los nombres son únicos por BD) => `omitida`.
   - Faltan columnas o la tabla referenciada => `omitida`.
   - **Huérfanos**: `SELECT COUNT(*) FROM hijo c LEFT JOIN padre p ON p.col = c.col [AND ...] WHERE c.col IS NOT NULL AND p.col IS NULL`. Si > 0 => `omitida` con la consulta `SELECT c.*` para verlos. (En FKs compuestas el `LEFT JOIN` ya exige *todas* las columnas; basta comprobar una columna del padre `IS NULL`.)
   - Si no => `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... [ON DELETE x] [ON UPDATE y]`.
5. **semillas**: para cada catálogo declarado en `SEMILLAS` (tabla, columnas clave, columnas excluidas):
   - Solo se siembra si la tabla destino está **vacía o es nueva**. Si tiene registros propios => `info` ("no se siembra, faltan N de M") — nunca mezclar con lo del cliente.
   - Si el destino tiene columnas obligatorias (`NOT NULL` sin default, no auto_increment, no generadas) que la semilla no trae => `omitida`.
   - Se excluyen de la semilla: `id`, timestamps, rutas de archivos subidos por el cliente (en el ejemplo `icono_ruta`).
   - Los INSERT usan literales escapados (`\` y `'`).

### Generación de DDL (detalles que evitaron errores reales)
- **Collations**: si la collation de la referencia no existe en el destino (típico: `utf8mb4_0900_ai_ci` de MySQL 8 en MariaDB, o `utf8mb4_uca1400_*` al revés), se reemplaza por `utf8mb4_unicode_ci` o `utf8mb4_general_ci` (lo que el destino soporte), consultando `information_schema.COLLATIONS`.
- **Defaults**: `literal` => `DEFAULT 'x'`; `nulo` => `DEFAULT NULL`; `expr`: `CURRENT_TIMESTAMP`/`NOW()`/`LOCALTIME` y variantes con precisión => `DEFAULT CURRENT_TIMESTAMP[(n)]`; otra expresión => `DEFAULT (expr)` **salvo que ya venga entre paréntesis** (`estaEntreParentesis` recorre la cadena ignorando paréntesis dentro de comillas).
- `ON UPDATE CURRENT_TIMESTAMP` se conserva desde `EXTRA`. `COMMENT` se conserva. `AUTO_INCREMENT` solo en `CREATE TABLE`.
- Todo identificador se escapa con backticks; los literales con `'` duplicado.
- **Valores de ENUM**: se parsean con regex `'((?:[^']|'')*)'` y `''` => `'`.

## 6. Puntos que cambian en cada sistema (lo único que hay que adaptar)

| Punto | En `base-php` | Qué hacer en el otro sistema |
|---|---|---|
| `EsquemaBd::raiz()` | `dirname(__DIR__, 2)` | Ajustar para apuntar a la raíz del proyecto según dónde queden los scripts. |
| `listarEmpresas()` | lee `src/config/empresas/*.php` | Devolver la lista de clientes/BD (de un directorio, `.env` por cliente, un arreglo central, etc.). |
| `cargarConfigEmpresa($slug)` | parsea `define('DB_HOST'…)` con regex **sin ejecutar** el archivo | Devolver `['host','name','user','pass']` (y `port` opcional) de donde se guarden las credenciales. Si usan `.env`, leerlo con parser propio. No ejecutar archivos de config de varios clientes en el mismo proceso (las constantes chocarían). |
| `conectar($cfg)` | PDO `mysql:` utf8mb4, `ERRMODE_EXCEPTION`, `FETCH_ASSOC` | Normalmente igual. |
| `SEMILLAS` | `sis_codigos_prestacionales` (clave `codigo`) | Declarar los **catálogos** de ese sistema que deban existir en todos los clientes (roles, estados, tipos…). Si no hay, dejar vacío. |
| `TABLAS_EXCLUIDAS_REGEX` | `backup` | Añadir prefijos/sufijos de tablas temporales o propias de dev. |
| Dev como origen | `--origen=desarrollo` | Indicar la "empresa/slug" que representa la BD de dev. |

El resto de la lógica es genérica. **El frontend React no participa**: la herramienta vive solo en el backend PHP y se ejecuta por CLI. React solo notará las columnas/tablas nuevas si el backend las usa.

## 7. CLI

### Generador
```
php scripts/esquema_bd/generar_esquema_referencia.php
php scripts/esquema_bd/generar_esquema_referencia.php --origen=desarrollo --salida=ruta.json
```
Escribe el JSON (pretty, UTF-8, sin escapar `/`). Imprime conteos (tablas, columnas, índices, FKs, semillas). Se ejecuta **cada vez que cambie la estructura de dev**, y se versiona el JSON.

### Actualizador
```
php scripts/esquema_bd/actualizar_esquema_bd.php --empresa=cliente            # simulacro
php scripts/esquema_bd/actualizar_esquema_bd.php --todas                      # simulacro de todos
php scripts/esquema_bd/actualizar_esquema_bd.php --empresa=cliente --aplicar --confirmo-respaldo
```

| Opción | Efecto |
|---|---|
| `--empresa=slug` / `--todas` | Qué BD(s). **No se pueden usar juntas** (error explícito). |
| `--aplicar --confirmo-respaldo` | Ejecuta. Sin `--confirmo-respaldo` falla. |
| `--solo=tablas,columnas,indices,fks,semillas` | Limita fases (validadas). |
| `--nombres-exactos` | Crea índices/FKs por nombre aunque exista uno equivalente con otro nombre (para dejar la BD idéntica a dev). |
| `--sql=archivo.sql` | Guarda el SQL pendiente por cliente (para pegarlo en phpMyAdmin si no hay CLI). |
| `--ref=archivo.json` | Referencia alternativa. |
| `--host --puerto --bd --usuario --clave` | Sobrescriben la conexión (túnel / acceso remoto / pruebas). |

Salida por acción: `[PENDIENTE] [OK] [ERROR] [OMITIDA] [INFO]` + resumen por fase por cliente. Al aplicar: registro en `tmp/esquema_bd_AAAAMMDD_HHMMSS.log` (carpeta ignorada por git) y **verificación final** (se vuelve a leer la estructura y re-planificar).

**Códigos de salida**: `0` al día; `1` error o quedan acciones sin aplicar; `2` hay cambios pendientes (simulacro) u omitidas que requieren revisión manual.

> Los mensajes de la salida incluyen nombres y SQL, **nunca contraseñas**.

## 8. Verificar que dos BD quedaron idénticas (huella)

Script SQL de solo lectura que se ejecuta **igual en cada BD** (phpMyAdmin → pestaña SQL, con la BD seleccionada). Construye una línea por columna / índice / FK normalizadas y devuelve `MD5(GROUP_CONCAT(... ORDER BY BINARY linea))` + número de elementos. Si coincide, la estructura es idéntica.

Líneas generadas (resumen):
- `COL|tabla|columna|tipo(sin ancho de int)|NULLABLE|default normalizado|AI`
- `IDX|tabla|indice|NON_UNIQUE|col1,col2`
- `FK|tabla|nombre|cols->ref(cols)|DELETE_RULE|UPDATE_RULE` (con `RESTRICT`→`NO ACTION`)

**Lección importante:** el `ORDER BY` debe ser **`ORDER BY BINARY linea`**. Con el orden por collation, MySQL y MariaDB ordenan distinto y la huella salía diferente aunque el contenido fuera idéntico. Se necesita `SET SESSION group_concat_max_len = 4000000;` antes. El detalle (una fila por línea) se puede exportar a CSV en ambas BD y comparar en un diff.

Notas: la huella solo coincide con dev si se usó `--nombres-exactos` y el cliente no tiene objetos sobrantes (el actualizador no borra). Las tablas de respaldo de dev no se replican, así que se excluyen también de la comparación.

Archivo de referencia en el proyecto original: `sql/2026_11_21_igualar_produccion_con_desarrollo/verificar_estructura.sql`.

## 9. Cómo se probó (repetir en el otro sistema antes de usarlo)

Se usó una instancia **temporal de MySQL** en otro puerto (sin tocar ninguna BD real): `mysqld --initialize-insecure --datadir=<tmp>` y `mysqld --datadir=<tmp> --port=3394 --mysqlx=OFF`. Luego se cargaron volcados de estructura de dev y de un cliente, y se ejecutó el actualizador con `--host=127.0.0.1 --puerto=3394 --bd=<bd_temporal>`.

Escenarios a cubrir (todos pasaron):
1. **BD vacía** con `--nombres-exactos`: crea todo; la huella queda **idéntica a dev**; segunda pasada sin cambios.
2. **Cliente casi al día**: propone solo lo que falta; aplicar => código 0; segunda pasada solo `INFO`.
3. **Cliente muy atrasado** (se le quitaron tablas, columnas e índices): se crea todo, columnas en su posición.
4. **Huérfano**: la FK se omite con la consulta, resto continúa, código de salida 2 (no 0).
5. **FK que MySQL rechaza** (tipos incompatibles): sale `[ERROR]` con el mensaje de MySQL, queda pendiente, código 1.
6. **ENUM ampliado al final**: se amplía conservando `NOT NULL` y default. **ENUM reordenado**: solo `INFO`.
7. **Semillas**: tabla vacía => siembra; con registros propios => no siembra + `INFO`; columna obligatoria extra => `omitida`.
8. **`--empresa` junto con `--todas`**: error claro, código 1.
9. **Tablas de respaldo**: no aparecen en la referencia ni se crean.
10. Prueba unitaria del helper de paréntesis: `(uuid())`→true, `uuid()`→false, `(a)+(b)`→false, `((x))`→true, `(')')`→true.

Consejo: en Windows, ejecutar los `mysql.exe` con `--protocol=TCP -h127.0.0.1` y usar `source archivo` en vez de redirección `<` de PowerShell. En Python, `PYTHONIOENCODING=utf-8` para imprimir `→`.

## 10. Procedimiento de despliegue en producción (hosting compartido, p. ej. Hostinger)

Las BD de hosting aceptan solo conexiones locales (`DB_HOST = localhost`), así que **se ejecuta dentro del servidor por SSH**, no desde la PC. Si todas las BD están en la misma cuenta, una sola sesión SSH alcanza a todos los clientes.

1. Verificar PHP del servidor: `php -v` (≥ 7.1) y `php -m | grep -i pdo_mysql`.
2. Subir la herramienta a una carpeta **fuera de `public_html`** (`~/herramienta_bd`) con `scp` (puerto SSH propio de Hostinger, p. ej. `-P 65002`):
   ```
   ssh -p PUERTO usuario@host "mkdir -p ~/herramienta_bd/scripts ~/herramienta_bd/sql ~/herramienta_bd/<ruta de configs>"
   scp -P PUERTO -r scripts/esquema_bd usuario@host:~/herramienta_bd/scripts/
   scp -P PUERTO -r sql/esquema_referencia usuario@host:~/herramienta_bd/sql/
   scp -P PUERTO <configs de clientes> usuario@host:~/herramienta_bd/<ruta de configs>/
   ssh -p PUERTO usuario@host "rm -f ~/herramienta_bd/<ruta>/desarrollo.php"   # dev no existe en el servidor
   ```
   (En PowerShell la ruta `cd /c/...` no existe: usar rutas Windows; esa ruta solo vale en Git Bash.)
3. **Simulacro de todos** y revisar con calma:
   ```
   cd ~/herramienta_bd
   php scripts/esquema_bd/actualizar_esquema_bd.php --todas | grep -E '^===|Resumen'
   ```
4. **Piloto con el cliente más simple**, de uno en uno y por fases (sin FKs):
   ```
   mysqldump --no-tablespaces -u USUARIO -p BD > ~/respaldo_CLIENTE_$(date +%F).sql
   ls -lh ~/respaldo_CLIENTE_*.sql                       # no debe ser 0 bytes
   php scripts/esquema_bd/actualizar_esquema_bd.php --empresa=CLIENTE --solo=tablas,columnas,indices,semillas
   php scripts/esquema_bd/actualizar_esquema_bd.php --empresa=CLIENTE --solo=tablas,columnas,indices,semillas --aplicar --confirmo-respaldo
   php scripts/esquema_bd/actualizar_esquema_bd.php --empresa=CLIENTE --solo=tablas,columnas,indices,semillas   # debe decir "al día"
   ```
   Luego probar el sistema del cliente en el navegador **sin crear datos de prueba**.
5. Repetir con los demás, de menos a más cambios.
6. Comprobación final de todos: `--todas --solo=tablas,columnas,indices,semillas | grep -E '^===|Resumen'`. Cada uno debe decir "sin diferencias" o solo `indices: N info`.
7. **Limpieza**: `rm -rf ~/herramienta_bd` (contiene copias de contraseñas). Descargar y luego borrar los `~/respaldo_*.sql`.

### Decisión sobre claves foráneas (segunda pasada, opcional)
Se dejaron fuera de la primera pasada **a propósito**: con FKs activas, borrar un registro con datos asociados falla con error 1451 y la UI puede no controlarlo. Cuando se decida crearlas: `--empresa=X --solo=fks` (simulacro) lista huérfanos antes de aplicar. Los huérfanos se depuran a mano y se reejecuta (ej.: un registro viejo en una tabla pivote apuntando a una promoción borrada).

## 11. Riesgos y reglas de seguridad aprendidas

- **Respaldo antes de aplicar, siempre.** `mysqldump --no-tablespaces` (evita el error de privilegio PROCESS en hosting compartido).
- **Datos que cambian el comportamiento del sistema** (p. ej. un "modo operativo" por cliente que oculta precios): antes de aplicar a un cliente con modo especial, verificar que la columna del modo **ya existe** y su valor. La herramienta nunca modifica datos ni crea columnas que ya existen, así que no cambia el modo; pero hay que confirmarlo y revisar en el sistema que se mantiene la regla de negocio.
- **Columnas nuevas con DEFAULT** se aplican a las filas existentes: confirmar que el código ya trataba la columna ausente como ese mismo valor (ej.: `estado_validacion` ausente = `'pendiente'`).
- **Collations de MySQL 8** pueden fallar en MariaDB (ya se traducen). Si una tabla falla en `CREATE`, ese único paso sale `[ERROR]` y se corrige aparte.
- **Backfills de datos** (rellenar históricos) NO los hace la herramienta; van como migraciones numeradas por fecha (`sql/AAAA_MM_DD_nombre/` con `migracion.sql`, `rollback.sql`, `README.md`).
- **Credenciales**: si están en archivos versionados, conviene moverlas a variables de entorno / `.env` (fuera de git) y asegurarse de que `tmp/` esté en `.gitignore`.
- El actualizador **no elimina sobrantes** (tablas/columnas que el cliente tiene y dev no) ni renombra columnas.

## 12. Procedimiento permanente (cada vez que cambie la BD de dev)

1. Escribir el SQL de la mejora en `sql/AAAA_MM_DD_nombre/` (idempotente + rollback + README) y avisar qué tablas/columnas cambian ("Sin cambios en BD" si no).
2. Aplicarlo en dev.
3. Regenerar y versionar la referencia: `php scripts/esquema_bd/generar_esquema_referencia.php`.
4. Subir referencia (y scripts si cambiaron) al servidor y ejecutar el actualizador por clientes (sección 10).
5. Cerrar con la lista "Scripts a ejecutar en producción" (o "Ninguno").

## 13. Archivos a copiar desde `base-php` al otro sistema

Copiar tal cual y luego adaptar solo la sección 6:

- `scripts/esquema_bd/EsquemaBd.php` (~800 líneas, toda la lógica)
- `scripts/esquema_bd/generar_esquema_referencia.php`
- `scripts/esquema_bd/actualizar_esquema_bd.php`
- `scripts/esquema_bd/README.md`
- `sql/2026_11_21_igualar_produccion_con_desarrollo/verificar_estructura.sql` (huella)
- Luego **generar** (no copiar) su propio `sql/esquema_referencia/esquema_referencia.json` desde la dev de ese sistema.
- Añadir `/tmp/` al `.gitignore` si no está.

Si el otro sistema no puede ver estos archivos, pedir que los **reimplemente a partir de las secciones 4 a 8** de esta guía; contienen el algoritmo completo.

## 14. Límites conocidos (no hace, a propósito)

- No elimina tablas/columnas/índices sobrantes.
- No cambia tipo/nulabilidad/default de columnas existentes (solo `INFO` con el `ALTER` sugerido; excepción: ampliar ENUM).
- No renombra ni migra datos.
- Columnas generadas, `AUTO_INCREMENT` añadido a tabla existente, índices funcionales y `CHECK`: se avisan para crear a mano.
- Vistas, triggers, procedimientos y eventos no se comparan (solo tablas base).
- Sin `--nombres-exactos`, índices/FKs equivalentes con otro nombre cuentan como cubiertos, por lo que la huella global puede no coincidir exactamente con dev.
