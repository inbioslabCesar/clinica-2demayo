# Módulos y licencias por instalación (panel Engineer)

Permite activar o apagar módulos (por ahora `ocupacional` y `portal_empresas`) en **cada instalación**, con plan, precio, fechas y un
historial de cambios. El módulo `clinico` siempre está activo. Todo lo existente queda como hoy hasta que se active algo.

## Piezas
| Pieza | Archivo |
|---|---|
| Tablas `modulos_instalacion` y `modulos_instalacion_historial` | `sql/2026-11-22/005_modulos_instalacion_schema.sql` |
| Lógica de módulos, licencias y guardia 403 | `modules/ModulosInstalacion.php` |
| Qué módulos están activos (solo sí/no, para el menú) | `api_modulos.php`, `src/hooks/useModulos.js` |
| Login y sesión del panel (contraseña + código TOTP, límite de intentos, CSRF) | `modules/EngineerAuth.php` |
| API del panel | `api_engineer.php` |
| Pantalla del panel | `src/pages/EngineerPanelPage.jsx`, ruta `/panel-engineer` (en `src/main.jsx`) |
| Alta del acceso | `scripts/engineer_setup.php` (solo CLI) |

## Seguridad
- **Desactivado por defecto:** sin el archivo de credenciales, `api_engineer.php` responde 404 y la página muestra «No encontrado».
- Las credenciales viven **fuera de `public_html`**: `../clinica-config/engineer.php` (o la ruta de la variable `ENGINEER_CONFIG_FILE`).
  Contiene solo el hash de la contraseña y el secreto del código; nunca la contraseña.
- Login = contraseña **y** código de una app de autenticación (TOTP). No se indica cuál de los dos falló.
- 5 fallos por IP o 30 en total bloquean 15 minutos. Un código usado no se puede reutilizar. La sesión caduca a los 30 min sin uso.
- Las acciones que cambian datos exigen el token CSRF de la sesión. Todo cambio queda en `modulos_instalacion_historial`.
- La sesión del panel es independiente de `usuarios` y de la sesión de la clínica.
- Detrás de un proxy, `REMOTE_ADDR` puede ser la IP del proxy: el límite global (30 fallos) cubre ese caso.

## Alta del acceso (lo ejecuta usted, el asistente nunca ve la contraseña)
```
php scripts/engineer_setup.php --salida=../clinica-config/engineer.php
```
Pide la contraseña dos veces (mínimo 12 caracteres) y muestra el secreto para su app de autenticación. Anótelo: si se pierde, se repite
el comando con `--forzar`. En producción ejecútelo por SSH en la carpeta del sistema.

## Activar un módulo en una clínica
1. Aplicar `005_modulos_instalacion_schema.sql` en la BD de esa clínica (con respaldo). **No viaja en el build.**
2. Crear el acceso del panel en ese servidor (paso anterior).
3. Abrir `https://<dominio>/panel-engineer`, entrar y activar el módulo (o `UPDATE modulos_instalacion SET habilitado = 1 WHERE modulo = 'ocupacional';`).
4. Verificación: `SELECT modulo, habilitado, estado FROM modulos_instalacion;`

## Licencia vencida
Al pasar `fecha_fin`: 7 días en **gracia** (sigue funcionando) y luego **suspendido** (los endpoints del módulo responden 403).
Los datos nunca se borran. Si la tabla no existe, solo `clinico` queda activo.

## Cómo proteger un endpoint de un módulo
```php
require_once __DIR__ . '/modules/ModulosInstalacion.php';
ModulosInstalacion::exigir($pdo, 'ocupacional'); // 403 si el módulo no está habilitado
```
En el frontend, `authFetch` trata cualquier 401/403 como sesión expirada: para las llamadas de un módulo apagado use `__skipAuthEvent: true`
y oculte el menú con `useModulos().tiene('ocupacional')`. Ocultar el menú **no** protege: la guardia real es la del backend.

## Pruebas
`php tests/php/run.php` (unitarias: TOTP con los vectores de RFC 6238, límites, sesión, validación, licencias).
