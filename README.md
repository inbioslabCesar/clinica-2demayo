# Clínica 2 de Mayo - Sistema de Gestión

## Descripción
Sistema web para la gestión clínica: pacientes, usuarios, médicos, farmacia, caja, reportes y más. Desarrollado en React (frontend) y PHP/MySQL (backend).

## Características principales
- Registro y edición de pacientes con paginación eficiente
- Gestión de usuarios y médicos
- Módulo de farmacia y cotización
- Control de caja y reportes
- Exportación a Excel/PDF
- Interfaz moderna y responsiva

## Paginación eficiente (React + PHP)
### Backend (PHP)
- Los endpoints que devuelven listas grandes aceptan parámetros `page` y `limit`.
- Ejemplo:
  ```php
  $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
  $limit = isset($_GET['limit']) ? max(1, intval($_GET['limit'])) : 20;
  $offset = ($page - 1) * $limit;
  $stmt = $conn->prepare("SELECT ... FROM tabla ORDER BY id DESC LIMIT ? OFFSET ?");
  $stmt->bind_param('ii', $limit, $offset);
  // ...fetch rows...
  echo json_encode([
    'success' => true,
    'items' => $rows,
    'total' => $total,
    'page' => $page,
    'limit' => $limit,
    'totalPages' => ceil($total / $limit)
  ]);
  ```

### Frontend (React)
- Usa estados para `page`, `rowsPerPage`, `totalRows`, `totalPages`, y la lista de items.
- En el `useEffect`, pide los datos paginados al backend:
  ```js
  useEffect(() => {
    setLoading(true);
    fetch(`${BASE_URL}api_endpoint.php?page=${page}&limit=${rowsPerPage}`)
      .then(res => res.json())
      .then(data => {
        setItems(data.items);
        setTotalRows(data.total);
        setTotalPages(data.totalPages);
        setLoading(false);
      });
  }, [page, rowsPerPage]);
  ```
- Al agregar/editar/eliminar, recarga la página actual usando los mismos parámetros.
- Muestra controles de paginación y el número de registros.

## Instalación
1. Clona el repositorio
2. Instala dependencias con `npm install` y configura el backend PHP/MySQL
3. Ejecuta el frontend con `npm run dev`

## Estructura de carpetas
- `src/components/` - Componentes React
- `src/pages/` - Páginas principales
- `api_*.php` - Endpoints PHP
- `public/` - Archivos estáticos

## Créditos
Desarrollado por inbioslabCesar y colaboradores.

## Licencia
MIT
# 🏥 Clínica 2 de Mayo - Sistema de Gestión Hospitalaria

Sistema integral de gestión hospitalaria desarrollado con React + PHP + MySQL para la administración completa de una clínica médica.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![React](https://img.shields.io/badge/react-18.3.1-blue.svg)
![PHP](https://img.shields.io/badge/php-8.0+-purple.svg)
![MySQL](https://img.shields.io/badge/mysql-8.0+-orange.svg)

## 📋 Descripción

La Clínica 2 de Mayo es un sistema completo de gestión hospitalaria que permite administrar todos los aspectos de una clínica médica moderna, desde la recepción de pacientes hasta la gestión de laboratorio y farmacia.

### ✨ Características Principales

- **👥 Gestión de Usuarios**: Sistema completo de roles y permisos
- **🏥 Recepción**: Registro y búsqueda de pacientes
- **📅 Citas Médicas**: Sistema de agendamiento con disponibilidad de médicos
- **📋 Historia Clínica Digital**: Completa y estructurada
- **🔬 Laboratorio**: Gestión de exámenes y resultados
- **💊 Farmacia**: Control de medicamentos e inventario
- **👩‍⚕️ Triaje**: Evaluación inicial de enfermería
- **📊 Reportes**: Exportación a PDF y Excel

## 🚀 Tecnologías Utilizadas

### Frontend
- **React 18.3.1** - Biblioteca de JavaScript para interfaces de usuario
- **Vite 7.0.0** - Build tool y dev server ultra rápido
- **Tailwind CSS 3.4.17** - Framework CSS utilitario
- **React Router DOM** - Enrutamiento para SPA
- **Chart.js** - Gráficos y visualizaciones
- **SweetAlert2** - Alertas y notificaciones elegantes
- **Axios** - Cliente HTTP para API calls

### Backend
- **PHP 8.0+** - Lenguaje de servidor
- **MySQL 8.0+** - Base de datos relacional
- **MySQLi/PDO** - Conectores de base de datos

### Herramientas de Desarrollo
- **ESLint** - Linter para JavaScript
- **PostCSS** - Procesador de CSS
- **jsPDF** - Generación de PDFs
- **XLSX** - Exportación a Excel

## 📦 Instalación

### Prerrequisitos

- Node.js 18+ y npm
- PHP 8.0+
- MySQL 8.0+
- Servidor web (Apache/Nginx) o XAMPP/Laragon

### Paso 1: Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/clinica-2demayo.git
cd clinica-2demayo
```

### Paso 2: Configurar el Frontend

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp src/config/config.example.js src/config/config.js
# Editar config.js con tu URL base
```

### Paso 3: Configurar el Backend

```bash
# Configurar archivo de conexión a BD
cp config.example.php config.php
# Editar config.php con tus credenciales de MySQL
```

### Paso 4: Base de Datos

```bash
# Crear la base de datos
mysql -u root -p
CREATE DATABASE poli2demayo CHARACTER SET utf8 COLLATE utf8_general_ci;
exit

# Importar las tablas
mysql -u root -p poli2demayo < sql/usuarios.sql
mysql -u root -p poli2demayo < sql/recepcion_modulo.sql
mysql -u root -p poli2demayo < sql/consultas_medicas.sql
mysql -u root -p poli2demayo < sql/triaje.sql
mysql -u root -p poli2demayo < sql/farmacia.sql
# Importar otros archivos SQL según necesites
```

### Paso 5: Ejecutar el proyecto

```bash
# Desarrollo del frontend
npm run dev

# El backend debe estar servido por tu servidor web
# Ejemplo: http://localhost/clinica-2demayo/
```

## 🏗️ Estructura del Proyecto

```
clinica-2demayo/
├── public/                 # Archivos públicos
├── src/                   # Código fuente React
│   ├── components/        # Componentes React
│   ├── pages/            # Páginas principales
│   ├── config/           # Configuraciones
│   ├── assets/           # Recursos estáticos
│   └── farmacia/         # Módulo de farmacia
├── sql/                  # Scripts de base de datos
├── *.php                 # APIs del backend
├── config.php            # Configuración de BD
└── package.json          # Dependencias de Node
```

## 👥 Roles de Usuario

| Rol | Permisos |
|-----|----------|
| **👨‍💼 Administrador** | Acceso completo al sistema |
| **👨‍⚕️ Médico** | Consultas, historias clínicas, diagnósticos |
| **👩‍⚕️ Enfermero** | Triaje, apoyo médico |
| **👩‍💻 Recepcionista** | Registro de pacientes, citas |
| **🔬 Laboratorista** | Gestión de exámenes y resultados |
| **💊 Químico** | Gestión de farmacia |

## 🔄 Flujo de Trabajo

1. **Recepción** → Búsqueda/registro de paciente
2. **Triaje** → Evaluación inicial por enfermería
3. **Consulta Médica** → Atención médica y diagnóstico
4. **Laboratorio** → Solicitud y procesamiento de exámenes
5. **Farmacia** → Dispensación de medicamentos
6. **Seguimiento** → Control y evolución del paciente

## 🔧 Configuración

### Variables de Entorno

#### Frontend (`src/config/config.js`)
```javascript
export const BASE_URL = "http://localhost/clinica-2demayo/";
```

#### Backend (`config.php`)
```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'poli2demayo');
define('DB_USER', 'root');
define('DB_PASS', '');
```

## 📊 API Endpoints

### Autenticación
- `POST /api_login.php` - Login de usuario
- `POST /api_login_medico.php` - Login de médico
- `POST /api_logout.php` - Cerrar sesión

### Pacientes
- `GET /api_pacientes.php` - Listar pacientes
- `POST /api_pacientes.php` - Crear paciente
- `POST /api_pacientes_buscar.php` - Buscar pacientes

### Consultas
- `GET /api_consultas.php` - Listar consultas
- `POST /api_consultas.php` - Crear consulta
- `GET /api_disponibilidad_medicos.php` - Disponibilidad

### Laboratorio
- `GET /api_examenes_laboratorio.php` - Listar exámenes
- `POST /api_ordenes_laboratorio.php` - Crear orden
- `GET /api_resultados_laboratorio.php` - Obtener resultados

## 🧪 Testing

```bash
# Ejecutar linter
npm run lint

# Build para producción
npm run build
```

## 🚀 Deployment

### Desarrollo Local
1. XAMPP/Laragon corriendo
2. Base de datos configurada
3. `npm run dev` para frontend

### Producción
1. Build del frontend: `npm run build`
2. Subir archivos PHP al servidor
3. Configurar base de datos en hosting
4. Actualizar `config.php` con credenciales de producción

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 📞 Soporte

Para soporte técnico o consultas:

- 📧 Email: desarrollo@clinica2demayo.com
- 🐛 Issues: [GitHub Issues](https://github.com/tu-usuario/clinica-2demayo/issues)

## 📈 Roadmap

- [ ] Notificaciones por email
- [ ] Módulo de imagenología  
- [ ] Sistema de facturación
- [ ] App móvil
- [ ] Telemedicina
- [ ] Integración con equipos médicos

---

⚡ **Desarrollado con ❤️ para mejorar la atención médica**
- Puedes personalizar el contenido y formato del email (HTML, adjuntos, etc.).
- Si usas Gmail u otro proveedor, puede que debas generar una contraseña de aplicación o activar acceso a apps menos seguras.

## Alternativas
- Para WhatsApp o SMS, se requiere integración con APIs externas (Twilio, WhatsApp Business API, etc.) y suelen tener costo por mensaje.

---
# Instalación y configuración de Tailwind CSS en este proyecto

Esta guía documenta los pasos y problemas resueltos para instalar Tailwind CSS correctamente en un proyecto Vite + React con "type": "module" en package.json.

## 1. Instalar dependencias necesarias

```bash
npm install -D tailwindcss postcss autoprefixer @tailwindcss/postcss
```

## 2. Inicializar archivos de configuración

```bash
npx tailwindcss init -p
```

Esto crea `tailwind.config.js` y `postcss.config.js` (que luego cambiaremos a `.cjs`).

## 3. Cambiar postcss.config.js a CommonJS

Si tu `package.json` tiene "type": "module", renombra `postcss.config.js` a `postcss.config.cjs`.

El contenido debe ser:

```js
module.exports = {
	plugins: {
		'@tailwindcss/postcss': {},
		autoprefixer: {},
	},
};
```

## 4. Configurar Tailwind en tu CSS principal

En `src/index.css`:

```css
@import "tailwindcss/preflight";
@import "tailwindcss/utilities";
```

## 5. Configuración de Vite

En `vite.config.js` solo necesitas:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
});
```

No uses el plugin `@tailwindcss/vite`.

## 6. Reiniciar el servidor

```bash
npm run dev
```

## 7. Problemas comunes y soluciones

- Si ves errores de "module is not defined in ES module scope", asegúrate de usar `postcss.config.cjs`.
- Si Tailwind no aplica estilos, revisa que no haya un archivo `postcss.config.js` residual.
- Si ves el error sobre el plugin de Tailwind y PostCSS, instala `@tailwindcss/postcss` y usa la configuración mostrada arriba.


---

# Módulo Recepción: Búsqueda, Registro y Atención de Pacientes

Este módulo permite la gestión de pacientes en la recepción del policlínico, incluyendo:

- Búsqueda de pacientes por DNI, nombre/apellido o historia clínica.
- Registro de nuevos pacientes si no existen en la base de datos.
- Selección de servicios para atención (consulta, laboratorio, farmacia, etc.).

## Flujo principal

1. **Búsqueda de paciente:**
	- El usuario ingresa un DNI, nombre/apellido o historia clínica.
	- El sistema busca en la base de datos y muestra los datos si el paciente existe.
	- Si no existe, ofrece registrar un nuevo paciente.

2. **Registro de paciente:**
	- Se muestra un formulario para ingresar los datos del paciente.
	- Solo los campos DNI, nombre, apellido e historia clínica son obligatorios.
	- El campo fecha de nacimiento es opcional y acepta valores nulos.
	- Al registrar, el paciente se guarda en la base de datos y se muestra en pantalla.

3. **Selección de servicio:**
	- Una vez seleccionado el paciente, se puede elegir el servicio para la atención.
	- El sistema registra la atención y puede redirigir al módulo correspondiente.

## Endpoints PHP

- `api_pacientes_buscar.php`: Busca pacientes por DNI, nombre/apellido o historia clínica (POST, JSON).
- `api_pacientes.php`: Registra un nuevo paciente (POST, JSON). Valida campos obligatorios y permite nulos en los opcionales.
- `api_atenciones.php`: Registra la atención del paciente para un servicio seleccionado.

## Componentes principales (React)

- `RecepcionModulo.jsx`: Orquesta el flujo de búsqueda, registro y atención.
- `PacienteSearch.jsx`: Formulario de búsqueda de pacientes.
- `PacienteResumen.jsx`: Muestra los datos del paciente encontrado.
- `PacienteForm.jsx`: Formulario para registrar un nuevo paciente.
- `ServiciosSelector.jsx`: Permite seleccionar el servicio para la atención.

## Consideraciones técnicas

- El frontend usa rutas absolutas para los endpoints en desarrollo (`http://localhost/policlinico-2demayo/...`).
- El backend valida y devuelve mensajes claros si falta algún campo obligatorio.
- El campo `fecha_nacimiento` acepta valores nulos.
- El sistema maneja correctamente CORS y persistencia de sesión de usuario.
- constraseña bd mysql hostinger = 'poli2deMayo12-09-25'

<?php
// Conexión centralizada para MySQL
$mysqli = new mysqli('localhost', 'u330560936_poli2demayo', 'poli2deMayo12-09-25', 'u330560936_2demayo');
if ($mysqli->connect_errno) {
    http_response_code(500);
    echo json_encode(['error' => 'Error de conexión a la base de datos']);
    exit;
}
// Alias para compatibilidad
$conn = $mysqli;



ruta local 
export const BASE_URL = "http://localhost/policlinico-2demayo/";
ruta hsotinguer
export const BASE_URL = "https://darkcyan-gnu-615778.hostingersite.com/";

contraseña = "Clinica2demayo18-09-25";
Nombre de la base de datos MySQL = "u330560936_2demayobd";
Nombre de usuario MySQL = "u330560936_2demayo";
Contraseña = Clinica2demayo18-09-25

---
Flujo de Consulta Médica
El médico/especialista define su disponibilidad:

Desde su panel, el médico selecciona los días y horarios en los que puede atender consultas.
Puede agregar, modificar o eliminar bloques de disponibilidad.
Esta información se guarda en la base de datos (tabla disponibilidad_medicos).
La recepcionista/admin visualiza la disponibilidad:

Desde su panel, la recepcionista puede ver la lista de médicos y sus horarios disponibles.
Solo la recepcionista/admin tiene acceso a esta vista.
Recepción de cita:

La recepcionista busca al paciente (ya registrado).
Selecciona el servicio de consulta médica.
El sistema muestra los médicos disponibles y sus horarios.
La recepcionista agenda la cita en un horario disponible.
El sistema verifica que el médico no tenga otra consulta pendiente en ese horario.
El médico ve sus consultas pendientes:

Desde su panel, el médico puede ver la lista de consultas agendadas y su estado (pendiente, completada, cancelada).
Puede marcar una consulta como completada.
Estructura de Base de Datos (sugerida)
medicos

id
nombre
especialidad
...otros datos
disponibilidad_medicos

id
medico_id (FK a medicos)
dia_semana (ej: lunes, martes, etc.)
hora_inicio
hora_fin
consultas

id
paciente_id (FK a pacientes)
medico_id (FK a medicos)
fecha
hora
estado (pendiente, completada, cancelada)
...otros datos
Componentes/Endpoints React y PHP
Panel Médico:

Formulario para definir disponibilidad.
Vista de consultas pendientes.
Panel Recepcionista/Admin:

Vista de disponibilidad de médicos.
Formulario para agendar consulta (elige paciente, médico, fecha y hora).
Validación de disponibilidad en tiempo real.
Endpoints PHP:

api_disponibilidad_medicos.php (GET/POST/PUT/DELETE)
api_consultas.php (GET/POST/PUT para agendar y actualizar estado)
api_medicos.php (GET para listar médicos)


13-09-25 sql que se agregagn la bd

- ALTER TABLE disponibilidad_medicos ADD COLUMN fecha DATE NULL AFTER medico_id;
-- Supón que esta semana es del 15 al 19 de septiembre de 2025
INSERT INTO disponibilidad_medicos (medico_id, fecha, hora_inicio, hora_fin)
VALUES
(1, '2025-09-15', '16:00:00', '18:00:00'), -- lunes
(1, '2025-09-17', '16:00:00', '18:00:00'), -- miércoles
(1, '2025-09-19', '16:00:00', '18:00:00'); -- viernes

## Disponibilidad de Médicos: por fecha exacta y por día de semana

El sistema permite registrar la disponibilidad de los médicos de dos formas:

- **Por día de semana**: El médico atiende todos los lunes, martes, etc. (recurrente)
- **Por fecha exacta**: El médico solo atiende en fechas específicas (por ejemplo, solo ciertos días de este mes)

### 1. Estructura recomendada de la tabla

Asegúrate de que tu tabla `disponibilidad_medicos` tenga ambos campos:

```sql
CREATE TABLE disponibilidad_medicos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  medico_id INT NOT NULL,
  fecha DATE NULL,
  dia_semana ENUM('lunes','martes','miércoles','jueves','viernes','sábado','domingo') NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL
);
```

- Si `fecha` tiene valor, la disponibilidad es solo para ese día.
- Si solo tiene `dia_semana`, es recurrente todas las semanas.

### 2. Ejemplo: Disponibilidad recurrente (todos los lunes)

```sql
INSERT INTO disponibilidad_medicos (medico_id, dia_semana, hora_inicio, hora_fin)
VALUES (1, 'lunes', '08:00:00', '12:00:00');
```

### 3. Ejemplo: Disponibilidad solo para fechas concretas

```sql
INSERT INTO disponibilidad_medicos (medico_id, fecha, hora_inicio, hora_fin)
VALUES
(1, '2025-09-15', '16:00:00', '18:00:00'), -- lunes
(1, '2025-09-17', '16:00:00', '18:00:00'), -- miércoles
(1, '2025-09-19', '16:00:00', '18:00:00'); -- viernes
```

### 4. Lógica en el sistema

- Si el campo `fecha` está lleno, solo se muestra esa disponibilidad para ese día exacto.
- Si solo tiene `dia_semana`, se asume que es recurrente todas las semanas.
- El frontend y backend ya soportan ambos casos.

### 5. Ejemplo: Varios médicos el mismo día

```sql
INSERT INTO disponibilidad_medicos (medico_id, fecha, hora_inicio, hora_fin)
VALUES
(1, '2025-09-15', '16:00:00', '18:00:00'),
(2, '2025-09-15', '09:00:00', '13:00:00');
```

Así puedes controlar la agenda de cada médico de forma flexible.


Aquí tienes la estructura de pasos para implementar el módulo de disponibilidad avanzada (soporta varios horarios por día):

Diseñar estructura de datos y endpoints

Permitir varios bloques de horario por fecha para un médico.
Definir endpoints PHP/REST para crear, listar y eliminar bloques.
Crear formulario React para seleccionar fechas y horarios

Permitir seleccionar una o varias fechas.
Permitir agregar varios bloques de horario por fecha (ej: 08:00-10:00 y 16:00-18:00 el mismo día).
Permitir agregar/eliminar bloques dinámicamente.
Implementar lógica de guardado en frontend

Al guardar, enviar todos los bloques seleccionados al backend.
Implementar endpoint PHP para guardar disponibilidad

Recibir y guardar múltiples bloques (fecha, hora_inicio, hora_fin) para el médico.
Mostrar disponibilidad guardada en el panel del médico

Listar todos los bloques registrados, permitiendo eliminar o editar cada uno.

Comenzamos con el primer paso: estructura de datos y endpoints.

La tabla disponibilidad_medicos ya soporta múltiples bloques por fecha y médico (campos: medico_id, fecha, hora_inicio, hora_fin).
Para soportar varios bloques el mismo día, simplemente insertas varios registros con la misma fecha y medico_id, pero diferentes horarios.
Endpoints recomendados:

GET api_disponibilidad_medicos.php?medico_id=ID → Lista todos los bloques de un médico.
POST api_disponibilidad_medicos.php → Recibe un array de bloques: [{fecha, hora_inicio, hora_fin}, ...] y los inserta.
DELETE api_disponibilidad_medicos.php?id=ID → Elimina un bloque específico.

---
# Integración de escaneo de códigos QR y de barras en el módulo de farmacia

## Objetivo
Permitir que el sistema de farmacia lea códigos QR o de barras de medicamentos/recetas usando:
- Lector físico (hardware USB o inalámbrico)
- Cámara del celular o PC (webcam)

## 1. Lector físico (hardware)
- Los lectores de código de barras/QR funcionan como un teclado.
- Solo necesitas un `<input type="text">` en la pantalla donde se debe ingresar el código.
- El usuario enfoca el input y escanea: el código se escribe automáticamente.
- Procesa el valor con JavaScript/React para buscar el medicamento, validar receta, etc.
- No requiere librerías adicionales ni configuración especial.

## 2. Escaneo con cámara (celular o PC)
Para usar la cámara y escanear códigos directamente desde la web:

### a) Instalar una librería de escaneo
Ejemplo con [react-qr-reader](https://github.com/JodusNodus/react-qr-reader):

```bash
npm install react-qr-reader
```

### b) Ejemplo de uso en React
```jsx
import { useState } from "react";
import QrReader from "react-qr-reader";

function EscanerQR({ onCodigoDetectado }) {
  const [error, setError] = useState("");
  return (
    <div>
      <QrReader
        delay={300}
        onError={err => setError(err?.message || "Error de cámara")}
        onScan={data => {
          if (data) onCodigoDetectado(data);
        }}
        style={{ width: "100%" }}
      />
      {error && <div className="text-red-600">{error}</div>}
    </div>
  );
}
```

### c) Para códigos de barras
Puedes usar [quaggaJS](https://serratus.github.io/quaggaJS/) o [react-barcode-reader](https://www.npmjs.com/package/react-barcode-reader):

```bash
npm install react-barcode-reader
```

```jsx
import BarcodeReader from 'react-barcode-reader';

function EscanerBarra({ onCodigoDetectado }) {
  return <BarcodeReader onError={console.error} onScan={onCodigoDetectado} />;
}
```

## Consideraciones
- El usuario debe aceptar el permiso de cámara en el navegador.
- El escaneo por cámara es más lento y menos preciso que el hardware dedicado, pero es suficiente para la mayoría de casos.
- Puedes combinar ambos métodos: input de texto + botón para abrir escáner de cámara.
- El código detectado se puede usar para buscar automáticamente el medicamento o receta en la base de datos.

## Recomendación
- Para farmacias con alto volumen, usar hardware dedicado.
- Para movilidad o bajo volumen, la cámara del celular es suficiente.

---

# Flujo de Solicitud y Resultados de Laboratorio

## 1. Solicitud de análisis de laboratorio desde la Historia Clínica (HC)
- El médico, desde la HC, puede seleccionar y solicitar pruebas de laboratorio para el paciente (ejemplo: hemograma, glucosa, orina, etc.).
- Al guardar la solicitud, se crea un registro en la tabla `ordenes_laboratorio`, asociada al `consulta_id` y con el detalle de los exámenes solicitados (en JSON).

**Ejemplo de tabla:**
```sql
CREATE TABLE ordenes_laboratorio (
    id INT AUTO_INCREMENT PRIMARY KEY,
    consulta_id INT NOT NULL,
    examenes JSON NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) DEFAULT 'pendiente',
    FOREIGN KEY (consulta_id) REFERENCES consultas(id)
);
```

## 2. Visualización y gestión en el módulo de laboratorio
- El personal de laboratorio ve la lista de órdenes pendientes (`estado = 'pendiente'`).
- Al hacer clic en una orden, puede ingresar los resultados y marcarlos como “completados”.
- Los resultados se guardan en la tabla `resultados_laboratorio`, vinculados al mismo `consulta_id`.

## 3. Visualización de resultados en la HC
- El médico y el paciente pueden ver los resultados de laboratorio asociados a la consulta desde la HC.

## 4. Verificación de deuda y servicios asociados (admin/recepción)
- En la vista de admin/recepción, agregar un botón en la tabla de pacientes para “Verificar deuda/servicios”.
- Al hacer clic, mostrar un resumen de los servicios asociados al paciente (laboratorio, consulta, tratamiento, rayos X, ecografía, farmacia, etc.) y si tiene deuda pendiente.
- Esto requiere una consulta a la base de datos para traer los servicios y el estado de pago.

## 5. Siguiente pasos recomendados
- Crear la tabla `ordenes_laboratorio` y el endpoint PHP para registrar y listar órdenes.
- Modificar la HC para permitir al médico solicitar exámenes y guardar la orden.
- Crear la vista de laboratorio para ver y completar órdenes.
- Agregar el botón de verificación de deuda/servicios en la vista de admin/recepción.

---

**Sigue estos pasos para implementar el flujo completo de laboratorio y servicios asociados.**

por ejemplo a hora estoy con rol admin voy precionando la flecha hacia atras de la barra de navegacion y por ejemplo entro a esta vista que no le correcponde a admin http://localhost:5173/historia-clinica/16/23, que es la del medico pero no se visualiza nada, pero la idea es que el rol que se esta logeado en ese instante no pueda acceder a otras rutas auque no visualice nada, no es sierto ? como solucionaria este tema ?

Diluent
Volumen por ciclo: 200
Muestras por día: 40, Objetivo: 4000
HX5D
Volumen por ciclo: 150
Muestras por día: 40, Objetivo: 3000
HX5H
Volumen por ciclo: 100
Muestras por día: 40, Objetivo: 2000