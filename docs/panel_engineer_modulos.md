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
- Las credenciales viven **fuera de `public_html`**. Se busca, en este orden: la variable `ENGINEER_CONFIG_FILE`; `../../clinica-config/engineer.php`
  (en Hostinger: `domains/<dominio>/clinica-config/engineer.php`, fuera de `public_html`); y `../clinica-config/engineer.php` (desarrollo local).
  **En producción use la segunda ruta** (la tercera caería dentro de `public_html`).
  Contiene solo el hash de la contraseña y el secreto del código; nunca la contraseña.
- Login = contraseña **y** código de una app de autenticación (TOTP). No se indica cuál de los dos falló.
- 5 fallos por IP o 30 en total bloquean 15 minutos. Un código usado no se puede reutilizar. La sesión caduca a los 30 min sin uso.
- Las acciones que cambian datos exigen el token CSRF de la sesión. Todo cambio queda en `modulos_instalacion_historial`.
- La sesión del panel es independiente de `usuarios` y de la sesión de la clínica.
- Detrás de un proxy, `REMOTE_ADDR` puede ser la IP del proxy: el límite global (30 fallos) cubre ese caso.

## Alta del acceso (lo ejecuta usted, el asistente nunca ve la contraseña)
```
php scripts/engineer_setup.php --salida=../clinica-config/engineer.php        # desarrollo
php scripts/engineer_setup.php --salida=../../clinica-config/engineer.php     # Hostinger (desde public_html/sistema): queda fuera de public_html
```
Pide la contraseña dos veces (mínimo 12 caracteres) y muestra el secreto para su app de autenticación. Anótelo: si se pierde, se repite
el comando con `--forzar`. `scripts/` no se despliega: en producción suba `scripts/engineer_setup.php` a mano (o genere el archivo en su PC y súbalo
a `domains/<dominio>/clinica-config/engineer.php` con permisos 600).

## Activar un módulo en una clínica
1. Aplicar `005_modulos_instalacion_schema.sql` en la BD de esa clínica (con respaldo). **No viaja en el build.**
2. Crear el acceso del panel en ese servidor (paso anterior).
3. Abrir `https://<dominio>/panel-engineer`, entrar y activar el módulo (o `UPDATE modulos_instalacion SET habilitado = 1 WHERE modulo = 'ocupacional';`).
4. Verificación: `SELECT modulo, habilitado, estado FROM modulos_instalacion;`

## Personalización visual (colores y diseño de la página pública)
Vive **solo** en el panel Engineer, pestaña "Personalización" (`/panel-engineer`; en Hostinger `/sistema/panel-engineer`). Ya no existe la ruta `/tema` ni el menú dentro del sistema de la clínica.
`api_tema.php`: GET sigue público (la clínica lo lee para pintar sus colores); POST exige sesión Engineer vigente + cabecera `X-Engineer-Csrf`, aunque el usuario sea administrador.
No hay cambios de BD: las columnas `tema_*` se siguen creando solas. El permiso `ver_tema` ya no se ofrece en el formulario de usuarios, pero su clave se conserva en los usuarios que ya la tenían.

## Suscripción del sistema (aviso de cobro, gracia y bloqueo)
Pestaña **"Suscripción"** del panel Engineer. Se configura por clínica (cada una tiene su BD): monto, moneda, periodicidad, día de pago, próximo vencimiento, **días de aviso** antes del vencimiento, **días de gracia** después, mensaje, WhatsApp para el comprobante y los métodos de pago (Yape, Plin, transferencia, depósito: solo texto y números).
- **Estados** (fecha de Lima): al día → *aviso* (faltan N días; banner ámbar, administrador) → *vencida* (en gracia; banner rojo, administrador y recepción) → *bloqueada* (pasó la gracia).
- **Bloqueo real en el servidor** (`config.php` → `LicenciaSistema::aplicarGuardia`): toda API de la clínica responde **402** `licencia_bloqueada`. Siguen funcionando `api_engineer`, `api_licencia`, login/logout/`api_auth_status`, `api_tema` (GET) y `api_public_*`. Ocultar pantallas no bastaría.
- **Qué ve cada rol:** administrador (aviso, vencida, bloqueada, con datos de pago); recepción (vencida y bloqueada); resto de roles, médicos y empresas del portal: solo "servicio suspendido, avise al administrador" (sin montos ni cuentas).
- **"Registrar pago recibido"** guarda el pago y avanza el vencimiento un periodo (día 31 → último día de los meses cortos y luego vuelve al 31). Nunca se renueva solo. **Prórroga puntual**: sigue funcionando hasta esa fecha sin tocar el calendario; se quita al registrar el pago.
- **Falla seguro:** sin la tabla, sin fila, desactivada o ante cualquier error de lectura, no se avisa ni se bloquea. Subir el código a una clínica no cambia nada hasta activarla en su panel.
- **BD (no viaja en el build):** aplicar `sql/2026-11-23/001_licencia_sistema_schema.sql` en la BD de cada clínica (requiere antes `005_modulos_instalacion_schema.sql`); verificar con `002_verify_licencia_sistema.sql`. Si el bloqueo llega a ocurrir por error, desde el panel: desactivar o aplicar prórroga.

## Licencia vencida (módulos)
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
`php tests/php/run.php` (unitarias: TOTP con los vectores de RFC 6238, límites, sesión, validación, licencias, contraseñas ocupacionales).

## Módulo ocupacional (backend trasladado)
Los 18 PHP del repo `2demayo-ocupacional` (`api_ocupacional_*`, `api_login_empresa`, `api_empresa_portal_ordenes`, `api_upload_logo_ocupacional`,
`db_ocupacional`) están en la raíz, **apagados por defecto**. Cambios respecto al original:
- **Guardia de módulo:** `db_ocupacional.php` exige `ocupacional`; el portal exige además `portal_empresas`. Sin licencia activa, 403.
- **BD:** por defecto los datos ocupacionales usan la misma BD. Para separarlos (confidencialidad) basta definir `DB_OCUP_HOST/NAME/USER/PASS`
  en la configuración de la instancia; así funciona hoy 2 de Mayo (`so2demayo`).
- **Esquema:** `db/esquema_referencia/esquema_referencia_ocupacional.json`. Aplicarlo con
  `php scripts/esquema_bd/actualizar_esquema_bd.php --empresa=... --ref=db/esquema_referencia/esquema_referencia_ocupacional.json`
  (en una BD separada hay que apuntar la herramienta a esa BD). Ya no se crean tablas durante una petición.
- **Contraseñas de empresa (RRHH y médico)** — dos modos por instalación, interruptor `OCUP_PASSWORDS_VISIBLES` (variable de entorno o
  `config/instances/*.php`; **no viaja en el build**, hay que definirlo en cada instancia):
  - `0` o ausente (**seguro**, por defecto): se guardan con hash, la API **no las devuelve** (solo `rrhh_password_definida` /
    `doctor_password_definida`), vacío al editar **conserva** la actual y las antiguas en texto plano pasan a hash al primer acceso al portal.
  - `1` (**visibles**, transición — decisión para 2 de Mayo): se guardan en texto plano, **solo administradores** reciben `rrhh_password` /
    `doctor_password` en el listado (otros roles, vacío) y no se convierte nada a hash. Para pasar a seguro basta poner `0`: las existentes
    siguen sirviendo y se convierten al primer uso (las que no se usen quedan en texto plano hasta entonces).
  - En ambos modos el formulario del frontend debe precargar `rrhh_password` solo si viene en la respuesta, y dejar vacío = no cambiar.
- **Portal de empresas:** límite de 8 intentos fallidos por IP o por cuenta (15 min), con el mismo mensaje para cualquier fallo.
  El dominio del login (`nombre_empresa@dominio`) es `clinica2demayo.com` por defecto; otra clínica con portal define `PORTAL_EMPRESAS_DOMINIO`
  (variable de entorno o config de la instancia). Los alias heredados de 2 de Mayo se siguen aceptando.

## Frontend de salud ocupacional (completo)
Todo queda **detrás del módulo**: una clínica con `ocupacional` apagado no ve menús, rutas, permisos ni pestañas nuevas y sus APIs ocupacionales dan 403
(se activa por clínica desde el panel Engineer). Lo único que corre siempre es una consulta a `api_modulos.php` (falla seguro: solo `clinico`).
- Páginas en `src/pages/ocupacional/`, API en `src/api/ocupacionalApi.js` (usa `authFetch`; un 403 no cierra la sesión clínica, un 401 sí).
- Rutas `/salud-ocupacional/*` y menú (`SidebarSaludOcupacional.jsx`): recepción y administrador. Cada ruta exige `access_salud_ocupacional` **y** el permiso
  específico (el backend lo revalida). Los permisos solo se ofrecen en el formulario de usuarios con el módulo activo y **nunca se conceden por compatibilidad**.
- **Médico:** `/mis-evaluaciones-ocupacionales` (+ examen). **Enfermería:** `/mis-triajes-ocupacionales` (+ examen). El médico inicia sesión por
  `api_login_medico.php` (sesión separada, sin `$_SESSION['usuario']`): `modules/OcupacionalSesion.php` lo presenta a las APIs ocupacionales como usuario de rol
  `medico` **sin escribir en la sesión**, así el login clínico no cambia. Las reglas por rol (propias órdenes, triaje, etc.) siguen en `api_ocupacional_ordenes.php`
  y `api_ocupacional_resultados.php`.
- **Portal de empresas** (`portal_empresas`, además de `ocupacional`): el login normal intenta primero `api_login_empresa.php` solo si el correo es del dominio de la clínica;
  si el módulo está apagado o no son credenciales de empresa, continúa el login habitual sin cambios. Sesión `empresa_portal` independiente de usuarios y médicos
  (cada login clínico la descarta; `api_auth_status.php` la reconoce solo si no hay otra sesión). La empresa solo ve `/empresa/panel`.
- **Laboratorio:** pestaña "Ocupacional Lab" en `LaboratorioPanelPage` (solo con el módulo activo; enlace contextual `?tab=ocupacional_lab&orden_id=`).
- **Portal del paciente** (`portal_pacientes`, independiente de `ocupacional`): el paciente entra en `/resultados` con DNI + PIN de 6 dígitos
  (`api_paciente_portal.php`, sesión `paciente_portal` aislada, límite de intentos) y descarga laboratorio e imagenología. El personal (administrador, o recepción con
  el permiso `gestionar_portal_pacientes`) genera el PIN, lo envía por WhatsApp y libera/retiene resultados en `/portal-paciente` (`api_paciente_portal_gestion.php`).
  Liberación `automatico` (al completarse) o `manual`; con saldo pendiente en la cadena de cotizaciones la descarga se bloquea (configurable). Tablas y activación:
  `sql/2026-11-24/`. Otros tipos de informe se agregan registrándolos en `PortalPaciente::PROVEEDORES`.
  **Archivos subidos:** los PDF de "Documentos del paciente" (`archivo_externo`, solo laboratorio/ecografía/rayos X/tomografía) y los PDF/imágenes de órdenes de imagen
  (`archivo_imagen`, nunca DICOM) pueden publicarse al portal con la casilla "Publicar en el portal del paciente" al subir (PDF marcado por defecto, imágenes solo si se marcan);
  el personal puede publicar o retirar después en `/portal-paciente`. Columnas `publicar_paciente`, `titulo` y `laboratorio_origen`: `sql/2026-11-25/004` (aditivo; sin ellas el portal los ignora).
  **Interruptores del Engineer** (`paciente_portal_config`: `publicar_laboratorio`, `publicar_imagenologia`, por defecto activos) apagan una categoría completa; solo se cambian desde el panel Engineer
  (con historial). Una categoría apagada devuelve 404 al paciente. El paciente ve los resultados agrupados por atención (cotización raíz con sus adendas); el saldo pendiente se avisa una vez por atención, sin montos.
  Las carpetas `uploads/documentos_externos/` y `uploads/imagenes_diagnostico/` quedan cerradas al acceso directo por `.htaccess` (`RewriteRule ^uploads/(documentos_externos|imagenes_diagnostico)/ - [F,L]`);
  el `.htaccess` raíz viaja en el deploy (el rsync no lo excluye); tras desplegar, comprobar que una URL directa de esas carpetas responde 403.
  La web pública (`public-site/`) muestra el botón "Iniciar sesión" como menú **"Iniciar sesión como: Paciente · Médico o personal · Empresa"** según los módulos activos
  (`api_public_portales.php`: `pacientes` = `portal_pacientes`; `empresas` = `ocupacional` + `portal_empresas`). Sin ninguno activo es el enlace directo de siempre.
  "Médico o personal" mantiene la URL del sistema de siempre; "Empresa" abre el mismo login con `?acceso=empresa` (solo cambian los textos); "Paciente" abre `/resultados`.
- **Configuración:** "Logo horizontal para certificados ocupacionales" (solo con el módulo; columna opcional `configuracion_clinica.logo_ocupacional_url`,
  `sql/2026-11-22/010`). Sin la columna, `api_configuracion.php` ignora el campo y los documentos usan `logo_url`.
- Necesita el catálogo de ubigeo: `sql/2026-11-22/007`–`009`.
- `api_ocupacional_empresas.php?accion=catalogo` (id, RUC, razón social) también lo puede leer quien tiene `registrar_trabajadores_ocupacional`.
- **No portado (decisión):** biometría del trabajador (`api_pacientes_biometria.php`): captura firma/huella/foto del paciente, pero ninguna pantalla ni PDF portado la
  consume y requeriría 3 columnas nuevas en `pacientes`; se porta si se pide un uso concreto.

## Despliegue de salud ocupacional en 2 de Mayo (único cliente por ahora)
Orden recomendado, con **respaldo previo** de `u330560936_bd2DeMayo` y `u330560936_so2demayo`:
1. Subir el release (`scripts/prepare_hostinger_release.ps1`; no incluye `sql/`, `scripts/esquema_bd`, `scripts/engineer_setup.php` ni el script de hash).
2. BD clínica (`bd2DeMayo`): `sql/2026-11-22/005` (módulos), `007` + `008` (ubigeo, importar en UTF-8), `009` (verificación) y `010` (logo).
3. BD ocupacional (`so2demayo`): alinear con `esquema_referencia_ocupacional.json` usando la herramienta (simulacro primero, luego `--aplicar`).
4. Configuración de la instancia (no viaja en el build): `DB_OCUP_HOST/NAME/USER/PASS` y `OCUP_PASSWORDS_VISIBLES=1`.
5. Crear el acceso Engineer (`php scripts/engineer_setup.php --salida=../clinica-config/engineer.php`) y activar `ocupacional` (y `portal_empresas` cuando corresponda) solo allí.
6. Asignar los permisos ocupacionales a las recepcionistas y probar con un usuario de cada rol.
Más adelante, para pasar a contraseñas con hash: `OCUP_PASSWORDS_VISIBLES=0` y `php scripts/ocupacional_hashear_contrasenas.php` (simulacro) / `--aplicar`.
Las demás clínicas no requieren ningún paso: el módulo viene apagado y se activa desde Engineer cuando lo pidan (ahí sí aplican 007–010 y la BD ocupacional).

