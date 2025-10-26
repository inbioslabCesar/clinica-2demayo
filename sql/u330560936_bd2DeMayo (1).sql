-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1:3306
-- Tiempo de generación: 26-10-2025 a las 08:47:49
-- Versión del servidor: 11.8.3-MariaDB-log
-- Versión de PHP: 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `u330560936_bd2DeMayo`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `atenciones`
--

CREATE TABLE `atenciones` (
  `id` int(11) NOT NULL,
  `paciente_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `fecha` datetime NOT NULL DEFAULT current_timestamp(),
  `servicio` enum('consulta','laboratorio','farmacia','rayosx','ecografia','ocupacional','procedimiento','procedimientos') NOT NULL,
  `estado` enum('pendiente','en_proceso','finalizado') NOT NULL DEFAULT 'pendiente',
  `observaciones` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cajas`
--

CREATE TABLE `cajas` (
  `id` int(11) NOT NULL,
  `fecha` date NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `estado` enum('abierta','en_cierre','cerrada') DEFAULT 'abierta',
  `monto_apertura` decimal(10,2) NOT NULL DEFAULT 0.00,
  `hora_apertura` time NOT NULL,
  `observaciones_apertura` text DEFAULT NULL,
  `monto_cierre` decimal(10,2) DEFAULT NULL,
  `hora_cierre` time DEFAULT NULL,
  `observaciones_cierre` text DEFAULT NULL,
  `total_efectivo` decimal(10,2) DEFAULT 0.00,
  `total_tarjetas` decimal(10,2) DEFAULT 0.00,
  `total_transferencias` decimal(10,2) DEFAULT 0.00,
  `total_otros` decimal(10,2) DEFAULT 0.00,
  `diferencia` decimal(10,2) DEFAULT 0.00,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `categorias_ingresos`
--

CREATE TABLE `categorias_ingresos` (
  `id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `tipo_ingreso` enum('consulta','laboratorio','farmacia','ecografia','rayosx','procedimiento','otros') NOT NULL,
  `descripcion` text DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `orden_visualizacion` int(11) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cie10`
--

CREATE TABLE `cie10` (
  `id` int(11) NOT NULL,
  `codigo` varchar(10) NOT NULL,
  `nombre` varchar(500) NOT NULL,
  `categoria` varchar(100) DEFAULT NULL,
  `subcategoria` varchar(100) DEFAULT NULL,
  `descripcion` text DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `creado_en` timestamp NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cierre_caja_detalle`
--

CREATE TABLE `cierre_caja_detalle` (
  `id` int(11) NOT NULL,
  `caja_id` int(11) NOT NULL,
  `usuario_cierre_id` int(11) NOT NULL,
  `efectivo_sistema` decimal(10,2) DEFAULT 0.00,
  `efectivo_contado` decimal(10,2) DEFAULT 0.00,
  `diferencia_efectivo` decimal(10,2) DEFAULT 0.00,
  `tarjetas_sistema` decimal(10,2) DEFAULT 0.00,
  `tarjetas_contado` decimal(10,2) DEFAULT 0.00,
  `diferencia_tarjetas` decimal(10,2) DEFAULT 0.00,
  `transferencias_sistema` decimal(10,2) DEFAULT 0.00,
  `transferencias_contado` decimal(10,2) DEFAULT 0.00,
  `diferencia_transferencias` decimal(10,2) DEFAULT 0.00,
  `otros_sistema` decimal(10,2) DEFAULT 0.00,
  `otros_contado` decimal(10,2) DEFAULT 0.00,
  `diferencia_otros` decimal(10,2) DEFAULT 0.00,
  `diferencia_total` decimal(10,2) DEFAULT 0.00,
  `observaciones` text DEFAULT NULL,
  `fecha_cierre` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cobros`
--

CREATE TABLE `cobros` (
  `id` int(11) NOT NULL,
  `paciente_id` int(11) DEFAULT NULL,
  `usuario_id` int(11) NOT NULL,
  `fecha_cobro` datetime DEFAULT current_timestamp(),
  `total` decimal(10,2) NOT NULL,
  `tipo_pago` enum('efectivo','tarjeta','transferencia','yape','plin','seguro','otros') NOT NULL,
  `estado` enum('pendiente','pagado','anulado','devolucion') DEFAULT 'pendiente',
  `observaciones` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Tabla de cobros - paciente_id puede ser NULL para pacientes no registrados';

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cobros_detalle`
--

CREATE TABLE `cobros_detalle` (
  `id` int(11) NOT NULL,
  `cobro_id` int(11) NOT NULL,
  `servicio_tipo` varchar(50) NOT NULL,
  `servicio_id` int(11) DEFAULT NULL,
  `descripcion` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`descripcion`)),
  `cantidad` int(11) DEFAULT 1,
  `precio_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `configuracion_clinica`
--

CREATE TABLE `configuracion_clinica` (
  `id` int(11) NOT NULL,
  `nombre_clinica` varchar(255) NOT NULL,
  `direccion` text NOT NULL,
  `telefono` varchar(20) NOT NULL,
  `email` varchar(100) NOT NULL,
  `horario_atencion` text DEFAULT NULL,
  `logo_url` varchar(500) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `ruc` varchar(20) DEFAULT NULL,
  `especialidades` text DEFAULT NULL,
  `mision` text DEFAULT NULL,
  `vision` text DEFAULT NULL,
  `valores` text DEFAULT NULL,
  `director_general` varchar(255) DEFAULT NULL,
  `jefe_enfermeria` varchar(255) DEFAULT NULL,
  `contacto_emergencias` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `configuracion_honorarios_medicos`
--

CREATE TABLE `configuracion_honorarios_medicos` (
  `id` int(11) NOT NULL,
  `medico_id` int(11) NOT NULL,
  `tarifa_id` int(11) DEFAULT NULL,
  `especialidad` varchar(100) DEFAULT NULL,
  `tipo_servicio` enum('consulta','procedimiento','cirugia','interconsulta','otros') NOT NULL DEFAULT 'consulta',
  `porcentaje_clinica` decimal(5,2) NOT NULL,
  `porcentaje_medico` decimal(5,2) NOT NULL,
  `monto_fijo_clinica` decimal(10,2) DEFAULT NULL,
  `monto_fijo_medico` decimal(10,2) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `vigencia_desde` date NOT NULL DEFAULT curdate(),
  `vigencia_hasta` date DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `consultas`
--

CREATE TABLE `consultas` (
  `id` int(11) NOT NULL,
  `paciente_id` int(11) NOT NULL,
  `medico_id` int(11) NOT NULL,
  `fecha` date NOT NULL,
  `hora` time NOT NULL,
  `estado` enum('pendiente','completada','cancelada') DEFAULT 'pendiente',
  `clasificacion` varchar(32) DEFAULT NULL,
  `triaje_realizado` tinyint(1) NOT NULL DEFAULT 0,
  `cobro_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cotizaciones`
--

CREATE TABLE `cotizaciones` (
  `id` int(11) NOT NULL,
  `paciente_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `fecha` datetime DEFAULT current_timestamp(),
  `estado` varchar(20) DEFAULT 'pendiente',
  `observaciones` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cotizaciones_detalle`
--

CREATE TABLE `cotizaciones_detalle` (
  `id` int(11) NOT NULL,
  `cotizacion_id` int(11) NOT NULL,
  `servicio_tipo` varchar(30) NOT NULL,
  `servicio_id` int(11) DEFAULT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `cantidad` int(11) DEFAULT 1,
  `precio_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cotizaciones_farmacia`
--

CREATE TABLE `cotizaciones_farmacia` (
  `id` int(11) NOT NULL,
  `paciente_id` int(11) DEFAULT NULL,
  `usuario_id` int(11) NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `fecha` datetime DEFAULT current_timestamp(),
  `estado` varchar(20) DEFAULT 'pendiente',
  `observaciones` varchar(255) DEFAULT NULL,
  `paciente_dni` varchar(20) DEFAULT NULL,
  `paciente_nombre` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cotizaciones_farmacia_detalle`
--

CREATE TABLE `cotizaciones_farmacia_detalle` (
  `id` int(11) NOT NULL,
  `cotizacion_id` int(11) NOT NULL,
  `medicamento_id` int(11) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `cantidad` int(11) DEFAULT 1,
  `precio_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `disponibilidad_medicos`
--

CREATE TABLE `disponibilidad_medicos` (
  `id` int(11) NOT NULL,
  `medico_id` int(11) NOT NULL,
  `fecha` date DEFAULT NULL,
  `dia_semana` enum('lunes','martes','miércoles','jueves','viernes','sábado','domingo') NOT NULL,
  `hora_inicio` time NOT NULL,
  `hora_fin` time NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `egresos`
--

CREATE TABLE `egresos` (
  `id` int(11) NOT NULL,
  `fecha` date NOT NULL,
  `tipo` enum('operativo','administrativo','inversion','otros') NOT NULL DEFAULT 'operativo',
  `categoria` varchar(100) NOT NULL,
  `concepto` text NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `responsable` varchar(100) DEFAULT NULL,
  `estado` enum('pendiente','confirmado','cancelado') DEFAULT 'pendiente',
  `observaciones` text DEFAULT NULL,
  `honorario_movimiento_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `examenes_laboratorio`
--

CREATE TABLE `examenes_laboratorio` (
  `id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `categoria` varchar(100) DEFAULT NULL,
  `metodologia` varchar(100) DEFAULT NULL,
  `valores_referenciales` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`valores_referenciales`)),
  `precio_publico` decimal(10,2) DEFAULT NULL,
  `precio_convenio` decimal(10,2) DEFAULT NULL,
  `tipo_tubo` varchar(50) DEFAULT NULL,
  `tipo_frasco` varchar(50) DEFAULT NULL,
  `tiempo_resultado` varchar(50) DEFAULT NULL,
  `condicion_paciente` varchar(100) DEFAULT NULL,
  `preanalitica` text DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `creado_en` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `historia_clinica`
--

CREATE TABLE `historia_clinica` (
  `id` int(11) NOT NULL,
  `consulta_id` int(11) NOT NULL,
  `datos` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`datos`)),
  `fecha_registro` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `honorarios_medicos_movimientos`
--

CREATE TABLE `honorarios_medicos_movimientos` (
  `id` int(11) NOT NULL,
  `consulta_id` int(11) DEFAULT NULL,
  `cobro_id` int(11) DEFAULT NULL,
  `medico_id` int(11) NOT NULL,
  `paciente_id` int(11) DEFAULT NULL,
  `tarifa_id` int(11) DEFAULT NULL,
  `tipo_precio` enum('particular','seguro','convenio') DEFAULT 'particular',
  `fecha` date NOT NULL,
  `hora` time NOT NULL,
  `tipo_servicio` enum('consulta','procedimiento','cirugia','interconsulta','otros') NOT NULL,
  `especialidad` varchar(100) DEFAULT NULL,
  `tarifa_total` decimal(10,2) NOT NULL,
  `monto_clinica` decimal(10,2) NOT NULL,
  `monto_medico` decimal(10,2) NOT NULL,
  `porcentaje_aplicado_clinica` decimal(5,2) NOT NULL,
  `porcentaje_aplicado_medico` decimal(5,2) NOT NULL,
  `estado_pago_medico` enum('pendiente','pagado','cancelado') DEFAULT 'pendiente',
  `fecha_pago_medico` date DEFAULT NULL,
  `metodo_pago_medico` enum('efectivo','transferencia','cheque','deposito') DEFAULT NULL,
  `liquidacion_id` int(11) DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ingresos_diarios`
--

CREATE TABLE `ingresos_diarios` (
  `id` int(11) NOT NULL,
  `caja_id` int(11) NOT NULL,
  `tipo_ingreso` enum('consulta','laboratorio','farmacia','ecografia','rayosx','procedimiento','otros') NOT NULL,
  `area` varchar(100) NOT NULL,
  `descripcion` text NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `metodo_pago` enum('efectivo','tarjeta','transferencia','yape','plin','seguro','otros') DEFAULT NULL,
  `referencia_id` int(11) DEFAULT NULL,
  `referencia_tabla` varchar(50) DEFAULT NULL,
  `paciente_id` int(11) DEFAULT NULL,
  `paciente_nombre` varchar(255) DEFAULT NULL,
  `fecha_hora` timestamp NULL DEFAULT current_timestamp(),
  `usuario_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `liquidaciones_medicos`
--

CREATE TABLE `liquidaciones_medicos` (
  `id` int(11) NOT NULL,
  `medico_id` int(11) NOT NULL,
  `periodo_desde` date NOT NULL,
  `periodo_hasta` date NOT NULL,
  `total_bruto` decimal(10,2) NOT NULL,
  `descuentos` decimal(10,2) DEFAULT 0.00,
  `total_neto` decimal(10,2) NOT NULL,
  `estado` enum('borrador','aprobada','pagada','cancelada') DEFAULT 'borrador',
  `fecha_aprobacion` date DEFAULT NULL,
  `fecha_pago` date DEFAULT NULL,
  `metodo_pago` enum('efectivo','transferencia','cheque','deposito') DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `usuario_aprobacion` varchar(100) DEFAULT NULL,
  `usuario_pago` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `log_reaperturas`
--

CREATE TABLE `log_reaperturas` (
  `id` int(11) NOT NULL,
  `caja_id` int(11) NOT NULL,
  `fecha_reapertura` timestamp NULL DEFAULT current_timestamp(),
  `usuario_id` int(11) NOT NULL,
  `usuario_nombre` varchar(100) DEFAULT NULL,
  `motivo` text DEFAULT NULL,
  `datos_cierre_anterior` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`datos_cierre_anterior`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `medicamentos`
--

CREATE TABLE `medicamentos` (
  `id` int(11) NOT NULL,
  `codigo` varchar(30) DEFAULT NULL,
  `nombre` varchar(100) NOT NULL,
  `presentacion` varchar(50) DEFAULT NULL,
  `concentracion` varchar(50) DEFAULT NULL,
  `laboratorio` varchar(100) DEFAULT NULL,
  `stock` int(11) DEFAULT 0,
  `unidades_por_caja` int(11) NOT NULL DEFAULT 1,
  `fecha_vencimiento` date DEFAULT NULL,
  `estado` enum('activo','inactivo','cuarentena') DEFAULT 'activo',
  `fecha_cuarentena` date DEFAULT NULL,
  `motivo_cuarentena` varchar(255) DEFAULT NULL,
  `fecha_registro` timestamp NULL DEFAULT current_timestamp(),
  `fecha_actualizacion` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  `precio_compra` decimal(10,2) NOT NULL DEFAULT 0.00,
  `margen_ganancia` decimal(5,2) NOT NULL DEFAULT 30.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `medicos`
--

CREATE TABLE `medicos` (
  `id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `especialidad` varchar(100) DEFAULT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `rol` varchar(50) DEFAULT 'medico',
  `firma` longtext DEFAULT NULL COMMENT 'Firma digital del médico en base64',
  `apellido` varchar(100) DEFAULT NULL,
  `cmp` varchar(20) DEFAULT NULL,
  `rne` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `metodos_pago`
--

CREATE TABLE `metodos_pago` (
  `id` int(11) NOT NULL,
  `nombre` varchar(50) NOT NULL,
  `codigo` varchar(20) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `requiere_referencia` tinyint(1) DEFAULT 0,
  `activo` tinyint(1) DEFAULT 1,
  `orden_visualizacion` int(11) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `movimientos_medicamento`
--

CREATE TABLE `movimientos_medicamento` (
  `id` int(11) NOT NULL,
  `medicamento_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `medico_id` int(11) DEFAULT NULL,
  `cantidad` int(11) NOT NULL,
  `tipo_movimiento` varchar(20) NOT NULL,
  `fecha_hora` datetime DEFAULT current_timestamp(),
  `observaciones` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ordenes_laboratorio`
--

CREATE TABLE `ordenes_laboratorio` (
  `id` int(11) NOT NULL,
  `cobro_id` int(11) DEFAULT NULL,
  `consulta_id` int(11) DEFAULT NULL,
  `paciente_id` int(11) DEFAULT NULL,
  `examenes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`examenes`)),
  `fecha` datetime DEFAULT current_timestamp(),
  `estado` varchar(20) DEFAULT 'pendiente'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `pacientes`
--

CREATE TABLE `pacientes` (
  `id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `apellido` varchar(100) NOT NULL,
  `historia_clinica` varchar(30) NOT NULL,
  `fecha_nacimiento` date DEFAULT NULL,
  `edad` varchar(20) DEFAULT NULL,
  `edad_unidad` enum('días','meses','años') DEFAULT NULL,
  `procedencia` varchar(100) DEFAULT NULL,
  `tipo_seguro` varchar(100) DEFAULT NULL,
  `sexo` enum('M','F') NOT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `dni` varchar(15) NOT NULL,
  `creado_en` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `resultados_laboratorio`
--

CREATE TABLE `resultados_laboratorio` (
  `id` int(11) NOT NULL,
  `consulta_id` int(11) DEFAULT NULL,
  `orden_id` int(11) DEFAULT NULL,
  `tipo_examen` varchar(100) DEFAULT NULL,
  `resultados` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`resultados`)),
  `fecha` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `seguros`
--

CREATE TABLE `seguros` (
  `id` int(11) NOT NULL,
  `paciente_id` int(11) NOT NULL,
  `tipo` varchar(50) NOT NULL,
  `numero` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `tarifas`
--

CREATE TABLE `tarifas` (
  `id` int(11) NOT NULL,
  `servicio_tipo` enum('consulta','rayosx','ecografia','ocupacional','procedimientos','cirugias','tratamientos','emergencias') NOT NULL,
  `servicio_id` int(11) DEFAULT NULL,
  `descripcion` varchar(255) NOT NULL,
  `precio_particular` decimal(10,2) NOT NULL,
  `precio_seguro` decimal(10,2) DEFAULT NULL,
  `precio_convenio` decimal(10,2) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  `medico_id` int(11) DEFAULT NULL,
  `porcentaje_medico` decimal(5,2) DEFAULT NULL,
  `porcentaje_clinica` decimal(5,2) DEFAULT NULL,
  `monto_medico` decimal(10,2) DEFAULT NULL,
  `monto_clinica` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `triaje`
--

CREATE TABLE `triaje` (
  `id` int(11) NOT NULL,
  `consulta_id` int(11) NOT NULL,
  `datos` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`datos`)),
  `fecha_registro` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuarios`
--

CREATE TABLE `usuarios` (
  `id` int(11) NOT NULL,
  `usuario` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `dni` varchar(15) NOT NULL,
  `profesion` varchar(100) NOT NULL,
  `rol` enum('administrador','recepcionista','laboratorista','enfermero','quimico') NOT NULL DEFAULT 'recepcionista',
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `atenciones`
--
ALTER TABLE `atenciones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `cajas`
--
ALTER TABLE `cajas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_fecha_usuario` (`fecha`,`usuario_id`),
  ADD KEY `idx_fecha` (`fecha`),
  ADD KEY `idx_estado` (`estado`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `categorias_ingresos`
--
ALTER TABLE `categorias_ingresos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `nombre` (`nombre`),
  ADD KEY `idx_tipo_ingreso` (`tipo_ingreso`),
  ADD KEY `idx_activo` (`activo`);

--
-- Indices de la tabla `cie10`
--
ALTER TABLE `cie10`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `codigo` (`codigo`),
  ADD KEY `idx_codigo` (`codigo`),
  ADD KEY `idx_nombre` (`nombre`),
  ADD KEY `idx_categoria` (`categoria`);
ALTER TABLE `cie10` ADD FULLTEXT KEY `nombre` (`nombre`,`descripcion`);

--
-- Indices de la tabla `cierre_caja_detalle`
--
ALTER TABLE `cierre_caja_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `caja_id` (`caja_id`),
  ADD KEY `usuario_cierre_id` (`usuario_cierre_id`);

--
-- Indices de la tabla `cobros`
--
ALTER TABLE `cobros`
  ADD PRIMARY KEY (`id`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `idx_cobros_paciente` (`paciente_id`),
  ADD KEY `idx_cobros_fecha` (`fecha_cobro`),
  ADD KEY `idx_cobros_estado` (`estado`);

--
-- Indices de la tabla `cobros_detalle`
--
ALTER TABLE `cobros_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cobro_id` (`cobro_id`);

--
-- Indices de la tabla `configuracion_clinica`
--
ALTER TABLE `configuracion_clinica`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_configuracion_email` (`email`),
  ADD KEY `idx_configuracion_created` (`created_at`);

--
-- Indices de la tabla `configuracion_honorarios_medicos`
--
ALTER TABLE `configuracion_honorarios_medicos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_medico_servicio` (`medico_id`,`tipo_servicio`),
  ADD KEY `idx_vigencia` (`vigencia_desde`,`vigencia_hasta`),
  ADD KEY `idx_activo` (`activo`);

--
-- Indices de la tabla `consultas`
--
ALTER TABLE `consultas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `medico_id` (`medico_id`),
  ADD KEY `cobro_id` (`cobro_id`);

--
-- Indices de la tabla `cotizaciones`
--
ALTER TABLE `cotizaciones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `cotizaciones_detalle`
--
ALTER TABLE `cotizaciones_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cotizacion_id` (`cotizacion_id`);

--
-- Indices de la tabla `cotizaciones_farmacia`
--
ALTER TABLE `cotizaciones_farmacia`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `cotizaciones_farmacia_detalle`
--
ALTER TABLE `cotizaciones_farmacia_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cotizacion_id` (`cotizacion_id`),
  ADD KEY `medicamento_id` (`medicamento_id`);

--
-- Indices de la tabla `disponibilidad_medicos`
--
ALTER TABLE `disponibilidad_medicos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `medico_id` (`medico_id`);

--
-- Indices de la tabla `egresos`
--
ALTER TABLE `egresos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_egresos_fecha` (`fecha`),
  ADD KEY `idx_egresos_tipo` (`tipo`),
  ADD KEY `idx_egresos_categoria` (`categoria`),
  ADD KEY `idx_egresos_estado` (`estado`),
  ADD KEY `idx_egresos_honorario` (`honorario_movimiento_id`);

--
-- Indices de la tabla `examenes_laboratorio`
--
ALTER TABLE `examenes_laboratorio`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `historia_clinica`
--
ALTER TABLE `historia_clinica`
  ADD PRIMARY KEY (`id`),
  ADD KEY `consulta_id` (`consulta_id`);

--
-- Indices de la tabla `honorarios_medicos_movimientos`
--
ALTER TABLE `honorarios_medicos_movimientos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_movimientos_medico_fecha` (`medico_id`,`fecha`),
  ADD KEY `idx_movimientos_estado_pago` (`estado_pago_medico`),
  ADD KEY `idx_movimientos_liquidacion` (`liquidacion_id`),
  ADD KEY `idx_movimientos_consulta` (`consulta_id`);

--
-- Indices de la tabla `ingresos_diarios`
--
ALTER TABLE `ingresos_diarios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_caja_id` (`caja_id`),
  ADD KEY `idx_tipo_ingreso` (`tipo_ingreso`),
  ADD KEY `idx_fecha_hora` (`fecha_hora`),
  ADD KEY `idx_metodo_pago` (`metodo_pago`),
  ADD KEY `idx_paciente_id` (`paciente_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `liquidaciones_medicos`
--
ALTER TABLE `liquidaciones_medicos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_liquidaciones_medico_periodo` (`medico_id`,`periodo_desde`,`periodo_hasta`),
  ADD KEY `idx_liquidaciones_estado` (`estado`),
  ADD KEY `idx_liquidaciones_fechas` (`fecha_aprobacion`,`fecha_pago`);

--
-- Indices de la tabla `log_reaperturas`
--
ALTER TABLE `log_reaperturas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `caja_id` (`caja_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `medicamentos`
--
ALTER TABLE `medicamentos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `codigo` (`codigo`);

--
-- Indices de la tabla `medicos`
--
ALTER TABLE `medicos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_firma` (`firma`(100)),
  ADD KEY `idx_cmp` (`cmp`),
  ADD KEY `idx_rne` (`rne`);

--
-- Indices de la tabla `metodos_pago`
--
ALTER TABLE `metodos_pago`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `nombre` (`nombre`),
  ADD UNIQUE KEY `codigo` (`codigo`),
  ADD KEY `idx_codigo` (`codigo`),
  ADD KEY `idx_activo` (`activo`);

--
-- Indices de la tabla `movimientos_medicamento`
--
ALTER TABLE `movimientos_medicamento`
  ADD PRIMARY KEY (`id`),
  ADD KEY `medicamento_id` (`medicamento_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indices de la tabla `ordenes_laboratorio`
--
ALTER TABLE `ordenes_laboratorio`
  ADD PRIMARY KEY (`id`),
  ADD KEY `consulta_id` (`consulta_id`);

--
-- Indices de la tabla `pacientes`
--
ALTER TABLE `pacientes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `dni` (`dni`),
  ADD UNIQUE KEY `historia_clinica` (`historia_clinica`),
  ADD KEY `idx_pacientes_dni` (`dni`),
  ADD KEY `idx_pacientes_apellido_nombre` (`apellido`,`nombre`),
  ADD KEY `idx_pacientes_historia` (`historia_clinica`);

--
-- Indices de la tabla `resultados_laboratorio`
--
ALTER TABLE `resultados_laboratorio`
  ADD PRIMARY KEY (`id`),
  ADD KEY `consulta_id` (`consulta_id`);

--
-- Indices de la tabla `seguros`
--
ALTER TABLE `seguros`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`);

--
-- Indices de la tabla `tarifas`
--
ALTER TABLE `tarifas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tarifas_servicio` (`servicio_tipo`,`activo`),
  ADD KEY `fk_tarifas_medico` (`medico_id`);

--
-- Indices de la tabla `triaje`
--
ALTER TABLE `triaje`
  ADD PRIMARY KEY (`id`),
  ADD KEY `consulta_id` (`consulta_id`);

--
-- Indices de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `usuario` (`usuario`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `atenciones`
--
ALTER TABLE `atenciones`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cajas`
--
ALTER TABLE `cajas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `categorias_ingresos`
--
ALTER TABLE `categorias_ingresos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cie10`
--
ALTER TABLE `cie10`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cierre_caja_detalle`
--
ALTER TABLE `cierre_caja_detalle`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cobros`
--
ALTER TABLE `cobros`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cobros_detalle`
--
ALTER TABLE `cobros_detalle`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `configuracion_clinica`
--
ALTER TABLE `configuracion_clinica`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `configuracion_honorarios_medicos`
--
ALTER TABLE `configuracion_honorarios_medicos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `consultas`
--
ALTER TABLE `consultas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cotizaciones`
--
ALTER TABLE `cotizaciones`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cotizaciones_detalle`
--
ALTER TABLE `cotizaciones_detalle`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cotizaciones_farmacia`
--
ALTER TABLE `cotizaciones_farmacia`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cotizaciones_farmacia_detalle`
--
ALTER TABLE `cotizaciones_farmacia_detalle`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `disponibilidad_medicos`
--
ALTER TABLE `disponibilidad_medicos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `egresos`
--
ALTER TABLE `egresos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `examenes_laboratorio`
--
ALTER TABLE `examenes_laboratorio`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `historia_clinica`
--
ALTER TABLE `historia_clinica`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `honorarios_medicos_movimientos`
--
ALTER TABLE `honorarios_medicos_movimientos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `ingresos_diarios`
--
ALTER TABLE `ingresos_diarios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `liquidaciones_medicos`
--
ALTER TABLE `liquidaciones_medicos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `log_reaperturas`
--
ALTER TABLE `log_reaperturas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `medicamentos`
--
ALTER TABLE `medicamentos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `medicos`
--
ALTER TABLE `medicos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `metodos_pago`
--
ALTER TABLE `metodos_pago`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `movimientos_medicamento`
--
ALTER TABLE `movimientos_medicamento`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `ordenes_laboratorio`
--
ALTER TABLE `ordenes_laboratorio`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `pacientes`
--
ALTER TABLE `pacientes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `resultados_laboratorio`
--
ALTER TABLE `resultados_laboratorio`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `seguros`
--
ALTER TABLE `seguros`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `tarifas`
--
ALTER TABLE `tarifas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `triaje`
--
ALTER TABLE `triaje`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
