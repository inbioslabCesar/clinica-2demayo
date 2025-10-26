-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Oct 26, 2025 at 08:49 AM
-- Server version: 8.4.3
-- PHP Version: 8.3.16

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `poli2demayo`
--

-- --------------------------------------------------------

--
-- Table structure for table `atenciones`
--

CREATE TABLE `atenciones` (
  `id` int NOT NULL,
  `paciente_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `servicio` enum('consulta','laboratorio','farmacia','rayosx','ecografia','ocupacional','procedimiento','procedimientos') COLLATE utf8mb4_general_ci NOT NULL,
  `estado` enum('pendiente','en_proceso','finalizado') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'pendiente',
  `observaciones` text COLLATE utf8mb4_general_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cajas`
--

CREATE TABLE `cajas` (
  `id` int NOT NULL,
  `fecha` date NOT NULL,
  `usuario_id` int NOT NULL,
  `estado` enum('abierta','en_cierre','cerrada') COLLATE utf8mb4_general_ci DEFAULT 'abierta',
  `monto_apertura` decimal(10,2) NOT NULL DEFAULT '0.00',
  `hora_apertura` time NOT NULL,
  `observaciones_apertura` text COLLATE utf8mb4_general_ci,
  `monto_cierre` decimal(10,2) DEFAULT NULL,
  `hora_cierre` time DEFAULT NULL,
  `observaciones_cierre` text COLLATE utf8mb4_general_ci,
  `total_efectivo` decimal(10,2) DEFAULT '0.00',
  `total_tarjetas` decimal(10,2) DEFAULT '0.00',
  `total_transferencias` decimal(10,2) DEFAULT '0.00',
  `total_otros` decimal(10,2) DEFAULT '0.00',
  `diferencia` decimal(10,2) DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `categorias_ingresos`
--

CREATE TABLE `categorias_ingresos` (
  `id` int NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `tipo_ingreso` enum('consulta','laboratorio','farmacia','ecografia','rayosx','procedimiento','otros') COLLATE utf8mb4_general_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_general_ci,
  `activo` tinyint(1) DEFAULT '1',
  `orden_visualizacion` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cie10`
--

CREATE TABLE `cie10` (
  `id` int NOT NULL,
  `codigo` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `categoria` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subcategoria` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `activo` tinyint(1) DEFAULT '1',
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cierre_caja_detalle`
--

CREATE TABLE `cierre_caja_detalle` (
  `id` int NOT NULL,
  `caja_id` int NOT NULL,
  `usuario_cierre_id` int NOT NULL,
  `efectivo_sistema` decimal(10,2) DEFAULT '0.00',
  `efectivo_contado` decimal(10,2) DEFAULT '0.00',
  `diferencia_efectivo` decimal(10,2) DEFAULT '0.00',
  `tarjetas_sistema` decimal(10,2) DEFAULT '0.00',
  `tarjetas_contado` decimal(10,2) DEFAULT '0.00',
  `diferencia_tarjetas` decimal(10,2) DEFAULT '0.00',
  `transferencias_sistema` decimal(10,2) DEFAULT '0.00',
  `transferencias_contado` decimal(10,2) DEFAULT '0.00',
  `diferencia_transferencias` decimal(10,2) DEFAULT '0.00',
  `otros_sistema` decimal(10,2) DEFAULT '0.00',
  `otros_contado` decimal(10,2) DEFAULT '0.00',
  `diferencia_otros` decimal(10,2) DEFAULT '0.00',
  `diferencia_total` decimal(10,2) DEFAULT '0.00',
  `observaciones` text COLLATE utf8mb4_general_ci,
  `fecha_cierre` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cobros`
--

CREATE TABLE `cobros` (
  `id` int NOT NULL,
  `paciente_id` int DEFAULT NULL,
  `usuario_id` int NOT NULL,
  `fecha_cobro` datetime DEFAULT CURRENT_TIMESTAMP,
  `total` decimal(10,2) NOT NULL,
  `tipo_pago` enum('efectivo','tarjeta','transferencia','yape','plin','seguro','otros') COLLATE utf8mb4_general_ci NOT NULL,
  `estado` enum('pendiente','pagado','anulado','devolucion') COLLATE utf8mb4_general_ci DEFAULT 'pendiente',
  `observaciones` text COLLATE utf8mb4_general_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Tabla de cobros - paciente_id puede ser NULL para pacientes no registrados';

-- --------------------------------------------------------

--
-- Table structure for table `cobros_detalle`
--

CREATE TABLE `cobros_detalle` (
  `id` int NOT NULL,
  `cobro_id` int NOT NULL,
  `servicio_tipo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `servicio_id` int DEFAULT NULL,
  `descripcion` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `cantidad` int DEFAULT '1',
  `precio_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL
) ;

-- --------------------------------------------------------

--
-- Table structure for table `configuracion_clinica`
--

CREATE TABLE `configuracion_clinica` (
  `id` int NOT NULL,
  `nombre_clinica` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `direccion` text COLLATE utf8mb4_general_ci NOT NULL,
  `telefono` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `horario_atencion` text COLLATE utf8mb4_general_ci,
  `logo_url` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `website` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ruc` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `especialidades` text COLLATE utf8mb4_general_ci,
  `mision` text COLLATE utf8mb4_general_ci,
  `vision` text COLLATE utf8mb4_general_ci,
  `valores` text COLLATE utf8mb4_general_ci,
  `director_general` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `jefe_enfermeria` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `contacto_emergencias` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `configuracion_honorarios_medicos`
--

CREATE TABLE `configuracion_honorarios_medicos` (
  `id` int NOT NULL,
  `medico_id` int NOT NULL,
  `tarifa_id` int DEFAULT NULL,
  `especialidad` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo_servicio` enum('consulta','procedimiento','cirugia','interconsulta','otros') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'consulta',
  `porcentaje_clinica` decimal(5,2) NOT NULL,
  `porcentaje_medico` decimal(5,2) NOT NULL,
  `monto_fijo_clinica` decimal(10,2) DEFAULT NULL,
  `monto_fijo_medico` decimal(10,2) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `vigencia_desde` date NOT NULL,
  `vigencia_hasta` date DEFAULT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `consultas`
--

CREATE TABLE `consultas` (
  `id` int NOT NULL,
  `paciente_id` int NOT NULL,
  `medico_id` int NOT NULL,
  `fecha` date NOT NULL,
  `hora` time NOT NULL,
  `estado` enum('pendiente','completada','cancelada') COLLATE utf8mb4_general_ci DEFAULT 'pendiente',
  `tipo_consulta` enum('programada','espontanea') COLLATE utf8mb4_general_ci DEFAULT 'programada',
  `clasificacion` varchar(32) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `triaje_realizado` tinyint(1) NOT NULL DEFAULT '0',
  `cobro_id` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cotizaciones`
--

CREATE TABLE `cotizaciones` (
  `id` int NOT NULL,
  `paciente_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP,
  `estado` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'pendiente',
  `observaciones` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cotizaciones_detalle`
--

CREATE TABLE `cotizaciones_detalle` (
  `id` int NOT NULL,
  `cotizacion_id` int NOT NULL,
  `servicio_tipo` varchar(30) COLLATE utf8mb4_general_ci NOT NULL,
  `servicio_id` int DEFAULT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cantidad` int DEFAULT '1',
  `precio_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cotizaciones_farmacia`
--

CREATE TABLE `cotizaciones_farmacia` (
  `id` int NOT NULL,
  `paciente_id` int DEFAULT NULL,
  `usuario_id` int NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP,
  `estado` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'pendiente',
  `observaciones` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `paciente_dni` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `paciente_nombre` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cotizaciones_farmacia_detalle`
--

CREATE TABLE `cotizaciones_farmacia_detalle` (
  `id` int NOT NULL,
  `cotizacion_id` int NOT NULL,
  `medicamento_id` int NOT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cantidad` int DEFAULT '1',
  `precio_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `disponibilidad_medicos`
--

CREATE TABLE `disponibilidad_medicos` (
  `id` int NOT NULL,
  `medico_id` int NOT NULL,
  `fecha` date DEFAULT NULL,
  `dia_semana` enum('lunes','martes','miércoles','jueves','viernes','sábado','domingo') COLLATE utf8mb4_general_ci NOT NULL,
  `hora_inicio` time NOT NULL,
  `hora_fin` time NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `egresos`
--

CREATE TABLE `egresos` (
  `id` int NOT NULL,
  `tipo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `categoria` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `concepto` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `responsable` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `examenes_laboratorio`
--

CREATE TABLE `examenes_laboratorio` (
  `id` int NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `categoria` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `metodologia` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `valores_referenciales` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `precio_publico` decimal(10,2) DEFAULT NULL,
  `precio_convenio` decimal(10,2) DEFAULT NULL,
  `tipo_tubo` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tipo_frasco` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tiempo_resultado` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `condicion_paciente` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `preanalitica` text COLLATE utf8mb4_general_ci,
  `activo` tinyint(1) DEFAULT '1',
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ;

-- --------------------------------------------------------

--
-- Table structure for table `historia_clinica`
--

CREATE TABLE `historia_clinica` (
  `id` int NOT NULL,
  `consulta_id` int NOT NULL,
  `datos` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `fecha_registro` datetime DEFAULT CURRENT_TIMESTAMP
) ;

-- --------------------------------------------------------

--
-- Table structure for table `honorarios_medicos_movimientos`
--

CREATE TABLE `honorarios_medicos_movimientos` (
  `id` int NOT NULL,
  `consulta_id` int DEFAULT NULL,
  `cobro_id` int DEFAULT NULL,
  `medico_id` int NOT NULL,
  `paciente_id` int DEFAULT NULL,
  `tarifa_id` int DEFAULT NULL,
  `tipo_precio` enum('particular','seguro','convenio') COLLATE utf8mb4_unicode_ci DEFAULT 'particular',
  `fecha` date NOT NULL,
  `hora` time NOT NULL,
  `tipo_servicio` enum('consulta','procedimiento','cirugia','interconsulta','otros') COLLATE utf8mb4_unicode_ci NOT NULL,
  `especialidad` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tarifa_total` decimal(10,2) NOT NULL,
  `monto_clinica` decimal(10,2) NOT NULL,
  `monto_medico` decimal(10,2) NOT NULL,
  `porcentaje_aplicado_clinica` decimal(5,2) NOT NULL,
  `porcentaje_aplicado_medico` decimal(5,2) NOT NULL,
  `estado_pago_medico` enum('pendiente','pagado','cancelado') COLLATE utf8mb4_unicode_ci DEFAULT 'pendiente',
  `fecha_pago_medico` date DEFAULT NULL,
  `metodo_pago_medico` enum('efectivo','transferencia','cheque','deposito') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `liquidacion_id` int DEFAULT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ingresos_diarios`
--

CREATE TABLE `ingresos_diarios` (
  `id` int NOT NULL,
  `caja_id` int NOT NULL,
  `tipo_ingreso` enum('consulta','laboratorio','farmacia','ecografia','rayosx','procedimiento','otros') COLLATE utf8mb4_general_ci NOT NULL,
  `area` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_general_ci NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `metodo_pago` enum('efectivo','tarjeta','transferencia','yape','plin','seguro','otros') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `referencia_id` int DEFAULT NULL,
  `referencia_tabla` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `paciente_id` int DEFAULT NULL,
  `paciente_nombre` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `fecha_hora` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `usuario_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `liquidaciones_medicos`
--

CREATE TABLE `liquidaciones_medicos` (
  `id` int NOT NULL,
  `medico_id` int NOT NULL,
  `periodo_desde` date NOT NULL,
  `periodo_hasta` date NOT NULL,
  `total_bruto` decimal(10,2) NOT NULL,
  `descuentos` decimal(10,2) DEFAULT '0.00',
  `total_neto` decimal(10,2) NOT NULL,
  `estado` enum('borrador','aprobada','pagada','cancelada') COLLATE utf8mb4_unicode_ci DEFAULT 'borrador',
  `fecha_aprobacion` date DEFAULT NULL,
  `fecha_pago` date DEFAULT NULL,
  `metodo_pago` enum('efectivo','transferencia','cheque','deposito') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `usuario_aprobacion` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `usuario_pago` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `log_reaperturas`
--

CREATE TABLE `log_reaperturas` (
  `id` int NOT NULL,
  `caja_id` int NOT NULL,
  `fecha_reapertura` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `usuario_id` int NOT NULL,
  `usuario_nombre` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `motivo` text COLLATE utf8mb4_general_ci,
  `datos_cierre_anterior` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
) ;

-- --------------------------------------------------------

--
-- Table structure for table `medicamentos`
--

CREATE TABLE `medicamentos` (
  `id` int NOT NULL,
  `codigo` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `presentacion` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `concentracion` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `laboratorio` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `stock` int DEFAULT '0',
  `unidades_por_caja` int NOT NULL DEFAULT '1',
  `fecha_vencimiento` date DEFAULT NULL,
  `estado` enum('activo','inactivo','cuarentena') COLLATE utf8mb4_general_ci DEFAULT 'activo',
  `fecha_cuarentena` date DEFAULT NULL,
  `motivo_cuarentena` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `fecha_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_actualizacion` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `precio_compra` decimal(10,2) NOT NULL DEFAULT '0.00',
  `margen_ganancia` decimal(5,2) NOT NULL DEFAULT '30.00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `medicos`
--

CREATE TABLE `medicos` (
  `id` int NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `especialidad` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `email` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `rol` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'medico',
  `firma` longtext COLLATE utf8mb4_general_ci COMMENT 'Firma digital del médico en base64',
  `apellido` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cmp` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `rne` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `metodos_pago`
--

CREATE TABLE `metodos_pago` (
  `id` int NOT NULL,
  `nombre` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `codigo` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_general_ci,
  `requiere_referencia` tinyint(1) DEFAULT '0',
  `activo` tinyint(1) DEFAULT '1',
  `orden_visualizacion` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `movimientos_medicamento`
--

CREATE TABLE `movimientos_medicamento` (
  `id` int NOT NULL,
  `medicamento_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `medico_id` int DEFAULT NULL,
  `cantidad` int NOT NULL,
  `tipo_movimiento` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `fecha_hora` datetime DEFAULT CURRENT_TIMESTAMP,
  `observaciones` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ordenes_laboratorio`
--

CREATE TABLE `ordenes_laboratorio` (
  `id` int NOT NULL,
  `cobro_id` int DEFAULT NULL,
  `consulta_id` int DEFAULT NULL,
  `paciente_id` int DEFAULT NULL,
  `examenes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP,
  `estado` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'pendiente'
) ;

-- --------------------------------------------------------

--
-- Table structure for table `pacientes`
--

CREATE TABLE `pacientes` (
  `id` int NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `apellido` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `historia_clinica` varchar(30) COLLATE utf8mb4_general_ci NOT NULL,
  `fecha_nacimiento` date DEFAULT NULL,
  `edad` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `edad_unidad` enum('días','meses','años') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `procedencia` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tipo_seguro` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `sexo` enum('M','F') COLLATE utf8mb4_general_ci NOT NULL,
  `direccion` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `telefono` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `email` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `dni` varchar(15) COLLATE utf8mb4_general_ci NOT NULL,
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `resultados_laboratorio`
--

CREATE TABLE `resultados_laboratorio` (
  `id` int NOT NULL,
  `consulta_id` int DEFAULT NULL,
  `orden_id` int DEFAULT NULL,
  `tipo_examen` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `resultados` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP
) ;

-- --------------------------------------------------------

--
-- Table structure for table `seguros`
--

CREATE TABLE `seguros` (
  `id` int NOT NULL,
  `paciente_id` int NOT NULL,
  `tipo` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `numero` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tarifas`
--

CREATE TABLE `tarifas` (
  `id` int NOT NULL,
  `servicio_tipo` enum('consulta','rayosx','ecografia','ocupacional','procedimientos','cirugias','tratamientos','emergencias') COLLATE utf8mb4_general_ci NOT NULL,
  `servicio_id` int DEFAULT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `precio_particular` decimal(10,2) NOT NULL,
  `precio_seguro` decimal(10,2) DEFAULT NULL,
  `precio_convenio` decimal(10,2) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `medico_id` int DEFAULT NULL,
  `porcentaje_medico` decimal(5,2) DEFAULT NULL,
  `porcentaje_clinica` decimal(5,2) DEFAULT NULL,
  `monto_medico` decimal(10,2) DEFAULT NULL,
  `monto_clinica` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `triaje`
--

CREATE TABLE `triaje` (
  `id` int NOT NULL,
  `consulta_id` int NOT NULL,
  `datos` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `fecha_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ;

-- --------------------------------------------------------

--
-- Table structure for table `usuarios`
--

CREATE TABLE `usuarios` (
  `id` int NOT NULL,
  `usuario` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `dni` varchar(15) COLLATE utf8mb4_general_ci NOT NULL,
  `profesion` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `rol` enum('administrador','recepcionista','laboratorista','enfermero','quimico') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'recepcionista',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `atenciones`
--
ALTER TABLE `atenciones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indexes for table `cajas`
--
ALTER TABLE `cajas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_fecha_usuario` (`fecha`,`usuario_id`),
  ADD KEY `idx_fecha` (`fecha`),
  ADD KEY `idx_estado` (`estado`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indexes for table `categorias_ingresos`
--
ALTER TABLE `categorias_ingresos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `nombre` (`nombre`),
  ADD KEY `idx_tipo_ingreso` (`tipo_ingreso`),
  ADD KEY `idx_activo` (`activo`);

--
-- Indexes for table `cie10`
--
ALTER TABLE `cie10`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `codigo` (`codigo`),
  ADD KEY `idx_codigo` (`codigo`),
  ADD KEY `idx_nombre` (`nombre`),
  ADD KEY `idx_categoria` (`categoria`);
ALTER TABLE `cie10` ADD FULLTEXT KEY `nombre` (`nombre`,`descripcion`);

--
-- Indexes for table `cierre_caja_detalle`
--
ALTER TABLE `cierre_caja_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `caja_id` (`caja_id`),
  ADD KEY `usuario_cierre_id` (`usuario_cierre_id`);

--
-- Indexes for table `cobros`
--
ALTER TABLE `cobros`
  ADD PRIMARY KEY (`id`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `idx_cobros_paciente` (`paciente_id`),
  ADD KEY `idx_cobros_fecha` (`fecha_cobro`),
  ADD KEY `idx_cobros_estado` (`estado`);

--
-- Indexes for table `cobros_detalle`
--
ALTER TABLE `cobros_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cobro_id` (`cobro_id`);

--
-- Indexes for table `configuracion_clinica`
--
ALTER TABLE `configuracion_clinica`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_configuracion_email` (`email`),
  ADD KEY `idx_configuracion_created` (`created_at`);

--
-- Indexes for table `configuracion_honorarios_medicos`
--
ALTER TABLE `configuracion_honorarios_medicos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_medico_servicio` (`medico_id`,`tipo_servicio`),
  ADD KEY `idx_vigencia` (`vigencia_desde`,`vigencia_hasta`),
  ADD KEY `idx_activo` (`activo`);

--
-- Indexes for table `consultas`
--
ALTER TABLE `consultas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `medico_id` (`medico_id`),
  ADD KEY `cobro_id` (`cobro_id`);

--
-- Indexes for table `cotizaciones`
--
ALTER TABLE `cotizaciones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indexes for table `cotizaciones_detalle`
--
ALTER TABLE `cotizaciones_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cotizacion_id` (`cotizacion_id`);

--
-- Indexes for table `cotizaciones_farmacia`
--
ALTER TABLE `cotizaciones_farmacia`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indexes for table `cotizaciones_farmacia_detalle`
--
ALTER TABLE `cotizaciones_farmacia_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cotizacion_id` (`cotizacion_id`),
  ADD KEY `medicamento_id` (`medicamento_id`);

--
-- Indexes for table `disponibilidad_medicos`
--
ALTER TABLE `disponibilidad_medicos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `medico_id` (`medico_id`);

--
-- Indexes for table `egresos`
--
ALTER TABLE `egresos`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `examenes_laboratorio`
--
ALTER TABLE `examenes_laboratorio`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `historia_clinica`
--
ALTER TABLE `historia_clinica`
  ADD PRIMARY KEY (`id`),
  ADD KEY `consulta_id` (`consulta_id`);

--
-- Indexes for table `honorarios_medicos_movimientos`
--
ALTER TABLE `honorarios_medicos_movimientos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_movimientos_medico_fecha` (`medico_id`,`fecha`),
  ADD KEY `idx_movimientos_estado_pago` (`estado_pago_medico`),
  ADD KEY `idx_movimientos_liquidacion` (`liquidacion_id`),
  ADD KEY `idx_movimientos_consulta` (`consulta_id`);

--
-- Indexes for table `ingresos_diarios`
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
-- Indexes for table `liquidaciones_medicos`
--
ALTER TABLE `liquidaciones_medicos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_liquidaciones_medico_periodo` (`medico_id`,`periodo_desde`,`periodo_hasta`),
  ADD KEY `idx_liquidaciones_estado` (`estado`),
  ADD KEY `idx_liquidaciones_fechas` (`fecha_aprobacion`,`fecha_pago`);

--
-- Indexes for table `log_reaperturas`
--
ALTER TABLE `log_reaperturas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `caja_id` (`caja_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indexes for table `medicamentos`
--
ALTER TABLE `medicamentos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `codigo` (`codigo`);

--
-- Indexes for table `medicos`
--
ALTER TABLE `medicos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_firma` (`firma`(100)),
  ADD KEY `idx_cmp` (`cmp`),
  ADD KEY `idx_rne` (`rne`);

--
-- Indexes for table `metodos_pago`
--
ALTER TABLE `metodos_pago`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `nombre` (`nombre`),
  ADD UNIQUE KEY `codigo` (`codigo`),
  ADD KEY `idx_codigo` (`codigo`),
  ADD KEY `idx_activo` (`activo`);

--
-- Indexes for table `movimientos_medicamento`
--
ALTER TABLE `movimientos_medicamento`
  ADD PRIMARY KEY (`id`),
  ADD KEY `medicamento_id` (`medicamento_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Indexes for table `ordenes_laboratorio`
--
ALTER TABLE `ordenes_laboratorio`
  ADD PRIMARY KEY (`id`),
  ADD KEY `consulta_id` (`consulta_id`);

--
-- Indexes for table `pacientes`
--
ALTER TABLE `pacientes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `dni` (`dni`),
  ADD UNIQUE KEY `historia_clinica` (`historia_clinica`),
  ADD KEY `idx_pacientes_dni` (`dni`),
  ADD KEY `idx_pacientes_apellido_nombre` (`apellido`,`nombre`),
  ADD KEY `idx_pacientes_historia` (`historia_clinica`),
  ADD KEY `idx_historia_clinica` (`historia_clinica`);

--
-- Indexes for table `resultados_laboratorio`
--
ALTER TABLE `resultados_laboratorio`
  ADD PRIMARY KEY (`id`),
  ADD KEY `consulta_id` (`consulta_id`);

--
-- Indexes for table `seguros`
--
ALTER TABLE `seguros`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`);

--
-- Indexes for table `tarifas`
--
ALTER TABLE `tarifas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tarifas_servicio` (`servicio_tipo`,`activo`),
  ADD KEY `fk_tarifas_medico` (`medico_id`);

--
-- Indexes for table `triaje`
--
ALTER TABLE `triaje`
  ADD PRIMARY KEY (`id`),
  ADD KEY `consulta_id` (`consulta_id`);

--
-- Indexes for table `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `usuario` (`usuario`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `atenciones`
--
ALTER TABLE `atenciones`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cajas`
--
ALTER TABLE `cajas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `categorias_ingresos`
--
ALTER TABLE `categorias_ingresos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cie10`
--
ALTER TABLE `cie10`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cierre_caja_detalle`
--
ALTER TABLE `cierre_caja_detalle`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cobros`
--
ALTER TABLE `cobros`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cobros_detalle`
--
ALTER TABLE `cobros_detalle`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `configuracion_clinica`
--
ALTER TABLE `configuracion_clinica`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `configuracion_honorarios_medicos`
--
ALTER TABLE `configuracion_honorarios_medicos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `consultas`
--
ALTER TABLE `consultas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cotizaciones`
--
ALTER TABLE `cotizaciones`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cotizaciones_detalle`
--
ALTER TABLE `cotizaciones_detalle`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cotizaciones_farmacia`
--
ALTER TABLE `cotizaciones_farmacia`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cotizaciones_farmacia_detalle`
--
ALTER TABLE `cotizaciones_farmacia_detalle`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `disponibilidad_medicos`
--
ALTER TABLE `disponibilidad_medicos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `egresos`
--
ALTER TABLE `egresos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `examenes_laboratorio`
--
ALTER TABLE `examenes_laboratorio`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `historia_clinica`
--
ALTER TABLE `historia_clinica`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `honorarios_medicos_movimientos`
--
ALTER TABLE `honorarios_medicos_movimientos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ingresos_diarios`
--
ALTER TABLE `ingresos_diarios`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `liquidaciones_medicos`
--
ALTER TABLE `liquidaciones_medicos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `log_reaperturas`
--
ALTER TABLE `log_reaperturas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `medicamentos`
--
ALTER TABLE `medicamentos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `medicos`
--
ALTER TABLE `medicos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `metodos_pago`
--
ALTER TABLE `metodos_pago`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `movimientos_medicamento`
--
ALTER TABLE `movimientos_medicamento`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ordenes_laboratorio`
--
ALTER TABLE `ordenes_laboratorio`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `pacientes`
--
ALTER TABLE `pacientes`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `resultados_laboratorio`
--
ALTER TABLE `resultados_laboratorio`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `seguros`
--
ALTER TABLE `seguros`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tarifas`
--
ALTER TABLE `tarifas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `triaje`
--
ALTER TABLE `triaje`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
