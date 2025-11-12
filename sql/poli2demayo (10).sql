-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Nov 12, 2025 at 06:26 AM
-- Server version: 8.0.42
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
  `servicio` enum('consulta','laboratorio','farmacia','rayosx','ecografia','procedimiento','operacion','hospitalizacion','ocupacional','procedimientos','cirugias','tratamientos','emergencias') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `estado` enum('pendiente','en_proceso','finalizado') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'pendiente',
  `observaciones` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cajas`
--

CREATE TABLE `cajas` (
  `id` int NOT NULL,
  `fecha` date NOT NULL,
  `usuario_id` int NOT NULL,
  `turno` enum('mañana','tarde','noche') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `estado` enum('abierta','en_cierre','cerrada') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'abierta',
  `monto_apertura` decimal(10,2) NOT NULL DEFAULT '0.00',
  `hora_apertura` time NOT NULL,
  `observaciones_apertura` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `monto_cierre` decimal(10,2) DEFAULT NULL,
  `hora_cierre` time DEFAULT NULL,
  `observaciones_cierre` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `total_efectivo` decimal(10,2) DEFAULT '0.00',
  `total_tarjetas` decimal(10,2) DEFAULT '0.00',
  `total_transferencias` decimal(10,2) DEFAULT '0.00',
  `total_otros` decimal(10,2) DEFAULT '0.00',
  `diferencia` decimal(10,2) DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `total_yape` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total_plin` decimal(10,2) NOT NULL DEFAULT '0.00',
  `egreso_honorarios` decimal(10,2) NOT NULL DEFAULT '0.00',
  `egreso_lab_ref` decimal(10,2) NOT NULL DEFAULT '0.00',
  `egreso_operativo` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total_egresos` decimal(10,2) NOT NULL DEFAULT '0.00',
  `ganancia_dia` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cie10`
--

CREATE TABLE `cie10` (
  `id` int NOT NULL,
  `codigo` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `categoria` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subcategoria` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descripcion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
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
  `observaciones` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
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
  `tipo_pago` enum('efectivo','tarjeta','transferencia','yape','plin','seguro','otros') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `estado` enum('pendiente','pagado','anulado','devolucion') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'pendiente',
  `observaciones` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `turno` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Tabla de cobros - paciente_id puede ser NULL para pacientes no registrados';

-- --------------------------------------------------------

--
-- Table structure for table `cobros_detalle`
--

CREATE TABLE `cobros_detalle` (
  `id` int NOT NULL,
  `cobro_id` int NOT NULL,
  `servicio_tipo` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `servicio_id` int DEFAULT NULL,
  `descripcion` json DEFAULT NULL,
  `cantidad` int DEFAULT '1',
  `precio_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `configuracion_clinica`
--

CREATE TABLE `configuracion_clinica` (
  `id` int NOT NULL,
  `nombre_clinica` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `direccion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `telefono` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `horario_atencion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `logo_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `website` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ruc` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `especialidades` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `mision` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `vision` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `valores` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `director_general` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `jefe_enfermeria` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `contacto_emergencias` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
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
  `especialidad` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Especialidad espec├¡fica o NULL para general',
  `tipo_servicio` enum('consulta','procedimiento','cirugia','interconsulta','otros') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'consulta',
  `tarifa_id` int DEFAULT NULL,
  `porcentaje_clinica` decimal(5,2) NOT NULL COMMENT 'Porcentaje que retiene la cl├¡nica',
  `porcentaje_medico` decimal(5,2) NOT NULL COMMENT 'Porcentaje que recibe el m├®dico',
  `monto_fijo_clinica` decimal(10,2) DEFAULT NULL COMMENT 'Alternativa: monto fijo para cl├¡nica',
  `monto_fijo_medico` decimal(10,2) DEFAULT NULL COMMENT 'Alternativa: monto fijo para m├®dico',
  `activo` tinyint(1) DEFAULT '1',
  `vigencia_desde` date NOT NULL DEFAULT (curdate()),
  `vigencia_hasta` date DEFAULT NULL COMMENT 'NULL = vigencia indefinida',
  `observaciones` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
  `estado` enum('pendiente','completada','cancelada') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'pendiente',
  `clasificacion` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `triaje_realizado` tinyint(1) NOT NULL DEFAULT '0',
  `cobro_id` int DEFAULT NULL,
  `tipo_consulta` enum('programada','espontanea') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'programada'
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
  `estado` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'pendiente',
  `observaciones` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cotizaciones_detalle`
--

CREATE TABLE `cotizaciones_detalle` (
  `id` int NOT NULL,
  `cotizacion_id` int NOT NULL,
  `servicio_tipo` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `servicio_id` int DEFAULT NULL,
  `descripcion` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
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
  `estado` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'pendiente',
  `observaciones` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `paciente_dni` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `paciente_nombre` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cotizaciones_farmacia_detalle`
--

CREATE TABLE `cotizaciones_farmacia_detalle` (
  `id` int NOT NULL,
  `cotizacion_id` int NOT NULL,
  `medicamento_id` int NOT NULL,
  `descripcion` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
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
  `dia_semana` enum('lunes','martes','miércoles','jueves','viernes','sábado','domingo') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `hora_inicio` time NOT NULL,
  `hora_fin` time NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `egresos`
--

CREATE TABLE `egresos` (
  `id` int NOT NULL,
  `fecha` date NOT NULL,
  `hora` time DEFAULT NULL,
  `tipo_egreso` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `categoria` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `descripcion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `monto` decimal(10,2) NOT NULL,
  `metodo_pago` enum('efectivo','transferencia','tarjeta','yape','plin','cheque','deposito') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'efectivo',
  `usuario_id` int NOT NULL,
  `turno` enum('mañana','tarde','noche') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'mañana',
  `estado` enum('pendiente','cancelado','pagado') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'pendiente',
  `medico_id` int DEFAULT NULL,
  `liquidacion_id` int DEFAULT NULL,
  `observaciones` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `caja_id` int DEFAULT NULL,
  `honorario_movimiento_id` int DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `examenes_laboratorio`
--

CREATE TABLE `examenes_laboratorio` (
  `id` int NOT NULL,
  `nombre` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `categoria` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `metodologia` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `valores_referenciales` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `precio_publico` decimal(10,2) DEFAULT NULL,
  `precio_convenio` decimal(10,2) DEFAULT NULL,
  `tipo_tubo` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tipo_frasco` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tiempo_resultado` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `condicion_paciente` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `preanalitica` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `activo` tinyint(1) DEFAULT '1',
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `historia_clinica`
--

CREATE TABLE `historia_clinica` (
  `id` int NOT NULL,
  `consulta_id` int NOT NULL,
  `datos` json NOT NULL,
  `fecha_registro` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `honorarios_medicos_movimientos`
--

CREATE TABLE `honorarios_medicos_movimientos` (
  `id` int NOT NULL,
  `consulta_id` int DEFAULT NULL COMMENT 'Referencia a la consulta si aplica',
  `cobro_id` int DEFAULT NULL COMMENT 'Referencia al cobro/venta',
  `medico_id` int NOT NULL,
  `turno` enum('mañana','tarde','noche') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'mañana',
  `tarifa_id` int DEFAULT NULL,
  `tipo_precio` enum('particular','seguro','convenio') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'particular',
  `paciente_id` int DEFAULT NULL,
  `caja_id` int DEFAULT NULL,
  `fecha` date NOT NULL,
  `hora` time NOT NULL,
  `tipo_servicio` enum('consulta','rayosx','ecografia','ocupacional','procedimientos','cirugias','tratamientos','emergencias','operacion','hospitalizacion') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `especialidad` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tarifa_total` decimal(10,2) NOT NULL,
  `monto_clinica` decimal(10,2) NOT NULL COMMENT 'Monto que queda para la cl├¡nica',
  `monto_medico` decimal(10,2) NOT NULL COMMENT 'Monto que se debe al m├®dico',
  `porcentaje_aplicado_clinica` decimal(5,2) NOT NULL,
  `porcentaje_aplicado_medico` decimal(5,2) NOT NULL,
  `estado_pago_medico` enum('pendiente','pagado','cancelado') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'pendiente',
  `fecha_pago_medico` date DEFAULT NULL,
  `metodo_pago_medico` enum('efectivo','transferencia','cheque','deposito','tarjeta','yape','plin') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `liquidacion_id` int DEFAULT NULL COMMENT 'ID de la liquidaci├│n cuando se procese',
  `observaciones` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ingresos`
--

CREATE TABLE `ingresos` (
  `id` int NOT NULL,
  `caja_id` int NOT NULL,
  `area` enum('consulta','laboratorio','farmacia','ecografia','rayosx','procedimiento','otros') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `tipo_pago` enum('efectivo','tarjeta','transferencia','yape','plin','otros') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `descripcion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `fecha_hora` datetime NOT NULL,
  `usuario_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ingresos_diarios`
--

CREATE TABLE `ingresos_diarios` (
  `id` int NOT NULL,
  `caja_id` int NOT NULL,
  `tipo_ingreso` enum('consulta','laboratorio','farmacia','ecografia','rayosx','procedimiento','otros') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `area` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `descripcion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `metodo_pago` enum('efectivo','tarjeta','transferencia','yape','plin','seguro','otros') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `referencia_id` int DEFAULT NULL,
  `referencia_tabla` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `paciente_id` int DEFAULT NULL,
  `paciente_nombre` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `fecha_hora` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `usuario_id` int NOT NULL,
  `turno` enum('mañana','tarde','noche') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'mañana',
  `honorario_movimiento_id` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `laboratorio_referencia_movimientos`
--

CREATE TABLE `laboratorio_referencia_movimientos` (
  `id` int NOT NULL,
  `cobro_id` int NOT NULL,
  `examen_id` int NOT NULL,
  `laboratorio` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `tipo` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `estado` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'pendiente',
  `paciente_id` int DEFAULT NULL,
  `cobrado_por` int DEFAULT NULL,
  `liquidado_por` int DEFAULT NULL,
  `caja_id` int DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `hora` time DEFAULT NULL,
  `observaciones` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `turno_cobro` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `hora_cobro` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `turno_liquidacion` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `hora_liquidacion` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `liquidaciones_medicos`
--

CREATE TABLE `liquidaciones_medicos` (
  `id` int NOT NULL,
  `medico_id` int NOT NULL,
  `periodo_tipo` enum('semanal','quincenal','mensual') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'mensual',
  `fecha_inicio` date NOT NULL,
  `fecha_fin` date NOT NULL,
  `total_consultas` int NOT NULL DEFAULT '0',
  `total_ingresos_brutos` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'Total facturado',
  `total_honorarios_medico` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'Total a pagar al m├®dico',
  `total_retencion_clinica` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT 'Total que retiene cl├¡nica',
  `estado` enum('borrador','generada','pagada','cancelada') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'borrador',
  `fecha_generacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_pago` date DEFAULT NULL,
  `metodo_pago` enum('efectivo','transferencia','cheque','deposito') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `referencia_pago` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'N├║mero de transferencia, cheque, etc.',
  `observaciones` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `created_by` int NOT NULL COMMENT 'Usuario que cre├│ la liquidaci├│n',
  `paid_by` int DEFAULT NULL COMMENT 'Usuario que proces├│ el pago',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `log_reaperturas`
--

CREATE TABLE `log_reaperturas` (
  `id` int NOT NULL,
  `caja_id` int NOT NULL,
  `fecha_reapertura` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `usuario_id` int NOT NULL,
  `usuario_nombre` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `motivo` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `datos_cierre_anterior` json DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `medicamentos`
--

CREATE TABLE `medicamentos` (
  `id` int NOT NULL,
  `codigo` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `nombre` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `presentacion` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `concentracion` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `laboratorio` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `stock` int DEFAULT '0',
  `unidades_por_caja` int NOT NULL DEFAULT '1',
  `fecha_vencimiento` date DEFAULT NULL,
  `estado` enum('activo','inactivo','cuarentena') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'activo',
  `fecha_cuarentena` date DEFAULT NULL,
  `motivo_cuarentena` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
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
  `nombre` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `especialidad` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `rol` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'medico',
  `firma` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci COMMENT 'Firma digital del médico en base64',
  `apellido` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cmp` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `rne` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `metodos_pago`
--

CREATE TABLE `metodos_pago` (
  `id` int NOT NULL,
  `nombre` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `codigo` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `descripcion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
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
  `tipo_movimiento` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `fecha_hora` datetime DEFAULT CURRENT_TIMESTAMP,
  `observaciones` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL
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
  `examenes` json NOT NULL,
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP,
  `estado` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'pendiente'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `pacientes`
--

CREATE TABLE `pacientes` (
  `id` int NOT NULL,
  `nombre` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `apellido` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `historia_clinica` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `fecha_nacimiento` date DEFAULT NULL,
  `edad` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `edad_unidad` enum('días','meses','años') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `procedencia` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tipo_seguro` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `sexo` enum('M','F') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `direccion` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `telefono` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `dni` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
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
  `tipo_examen` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `resultados` json DEFAULT NULL,
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `seguros`
--

CREATE TABLE `seguros` (
  `id` int NOT NULL,
  `paciente_id` int NOT NULL,
  `tipo` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `numero` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tarifas`
--

CREATE TABLE `tarifas` (
  `id` int NOT NULL,
  `servicio_tipo` enum('consulta','rayosx','ecografia','ocupacional','procedimientos','cirugias','tratamientos','emergencias','operacion','hospitalizacion') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `servicio_id` int DEFAULT NULL,
  `descripcion` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
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
  `datos` json NOT NULL,
  `fecha_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `usuarios`
--

CREATE TABLE `usuarios` (
  `id` int NOT NULL,
  `usuario` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `nombre` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `dni` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `profesion` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `rol` enum('administrador','recepcionista','laboratorista','enfermero','quimico') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'recepcionista',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Stand-in structure for view `vista_honorarios_pendientes`
-- (See below for the actual view)
--
CREATE TABLE `vista_honorarios_pendientes` (
`consultas_pendientes` bigint
,`especialidad` varchar(100)
,`fecha_mas_antigua` date
,`fecha_mas_reciente` date
,`medico_id` int
,`medico_nombre` varchar(201)
,`total_pendiente` decimal(32,2)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vista_ingresos_por_area_hoy`
-- (See below for the actual view)
--
CREATE TABLE `vista_ingresos_por_area_hoy` (
`area` varchar(100)
,`cantidad_transacciones` bigint
,`tipo_ingreso` enum('consulta','laboratorio','farmacia','ecografia','rayosx','procedimiento','otros')
,`total_efectivo` decimal(32,2)
,`total_monto` decimal(32,2)
,`total_tarjetas` decimal(32,2)
,`total_transferencias` decimal(32,2)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `vista_resumen_liquidaciones`
-- (See below for the actual view)
--
CREATE TABLE `vista_resumen_liquidaciones` (
`dias_vencimiento` int
,`estado` enum('borrador','generada','pagada','cancelada')
,`fecha_fin` date
,`fecha_inicio` date
,`fecha_pago` date
,`id` int
,`medico_id` int
,`medico_nombre` varchar(201)
,`periodo_tipo` enum('semanal','quincenal','mensual')
,`total_consultas` int
,`total_honorarios_medico` decimal(10,2)
);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `atenciones`
--
ALTER TABLE `atenciones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `idx_atenciones_fecha_paciente` (`fecha`,`paciente_id`);

--
-- Indexes for table `cajas`
--
ALTER TABLE `cajas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_fecha_usuario` (`fecha`,`usuario_id`),
  ADD KEY `idx_fecha` (`fecha`),
  ADD KEY `idx_estado` (`estado`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `idx_cajas_estado_fecha` (`estado`,`fecha`),
  ADD KEY `idx_cajas_usuario_id` (`usuario_id`),
  ADD KEY `idx_cajas_fecha_estado` (`fecha`,`estado`);

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
  ADD KEY `idx_cobros_estado` (`estado`),
  ADD KEY `idx_cobros_estado_fecha` (`estado`,`fecha_cobro`);

--
-- Indexes for table `cobros_detalle`
--
ALTER TABLE `cobros_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cobro_id` (`cobro_id`),
  ADD KEY `idx_cobros_detalle_cobro_id` (`cobro_id`);

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
  ADD KEY `idx_medico_activo` (`medico_id`,`activo`),
  ADD KEY `idx_vigencia` (`vigencia_desde`,`vigencia_hasta`),
  ADD KEY `fk_configuracion_honorarios_tarifa` (`tarifa_id`);

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
  ADD PRIMARY KEY (`id`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `medico_id` (`medico_id`);

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
  ADD KEY `paciente_id` (`paciente_id`),
  ADD KEY `idx_medico_fecha` (`medico_id`,`fecha`),
  ADD KEY `idx_estado_pago` (`estado_pago_medico`),
  ADD KEY `idx_liquidacion` (`liquidacion_id`),
  ADD KEY `fk_honorarios_movimientos_tarifa` (`tarifa_id`);

--
-- Indexes for table `ingresos`
--
ALTER TABLE `ingresos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `caja_id` (`caja_id`),
  ADD KEY `usuario_id` (`usuario_id`);

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
-- Indexes for table `laboratorio_referencia_movimientos`
--
ALTER TABLE `laboratorio_referencia_movimientos`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `liquidaciones_medicos`
--
ALTER TABLE `liquidaciones_medicos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `created_by` (`created_by`),
  ADD KEY `paid_by` (`paid_by`),
  ADD KEY `idx_medico_periodo` (`medico_id`,`fecha_inicio`,`fecha_fin`),
  ADD KEY `idx_estado` (`estado`),
  ADD KEY `idx_fecha_pago` (`fecha_pago`);

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
  ADD KEY `idx_pacientes_historia` (`historia_clinica`);

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
-- AUTO_INCREMENT for table `ingresos`
--
ALTER TABLE `ingresos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ingresos_diarios`
--
ALTER TABLE `ingresos_diarios`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `laboratorio_referencia_movimientos`
--
ALTER TABLE `laboratorio_referencia_movimientos`
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

-- --------------------------------------------------------

--
-- Structure for view `vista_honorarios_pendientes`
--
DROP TABLE IF EXISTS `vista_honorarios_pendientes`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vista_honorarios_pendientes`  AS SELECT `h`.`medico_id` AS `medico_id`, concat(`m`.`nombre`,' ',`m`.`apellido`) AS `medico_nombre`, `m`.`especialidad` AS `especialidad`, count(0) AS `consultas_pendientes`, sum(`h`.`monto_medico`) AS `total_pendiente`, min(`h`.`fecha`) AS `fecha_mas_antigua`, max(`h`.`fecha`) AS `fecha_mas_reciente` FROM (`honorarios_medicos_movimientos` `h` join `medicos` `m` on((`h`.`medico_id` = `m`.`id`))) WHERE (`h`.`estado_pago_medico` = 'pendiente') GROUP BY `h`.`medico_id`, `m`.`nombre`, `m`.`apellido`, `m`.`especialidad` ;

-- --------------------------------------------------------

--
-- Structure for view `vista_ingresos_por_area_hoy`
--
DROP TABLE IF EXISTS `vista_ingresos_por_area_hoy`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vista_ingresos_por_area_hoy`  AS SELECT `i`.`tipo_ingreso` AS `tipo_ingreso`, `i`.`area` AS `area`, count(0) AS `cantidad_transacciones`, sum(`i`.`monto`) AS `total_monto`, sum((case when (`i`.`metodo_pago` = 'efectivo') then `i`.`monto` else 0 end)) AS `total_efectivo`, sum((case when (`i`.`metodo_pago` in ('tarjeta_debito','tarjeta_credito')) then `i`.`monto` else 0 end)) AS `total_tarjetas`, sum((case when (`i`.`metodo_pago` in ('transferencia','yape','plin')) then `i`.`monto` else 0 end)) AS `total_transferencias` FROM (`ingresos_diarios` `i` join `cajas` `c` on((`i`.`caja_id` = `c`.`id`))) WHERE (`c`.`fecha` = curdate()) GROUP BY `i`.`tipo_ingreso`, `i`.`area` ORDER BY `i`.`tipo_ingreso` ASC, `total_monto` DESC ;

-- --------------------------------------------------------

--
-- Structure for view `vista_resumen_liquidaciones`
--
DROP TABLE IF EXISTS `vista_resumen_liquidaciones`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vista_resumen_liquidaciones`  AS SELECT `l`.`id` AS `id`, `l`.`medico_id` AS `medico_id`, concat(`m`.`nombre`,' ',`m`.`apellido`) AS `medico_nombre`, `l`.`periodo_tipo` AS `periodo_tipo`, `l`.`fecha_inicio` AS `fecha_inicio`, `l`.`fecha_fin` AS `fecha_fin`, `l`.`total_consultas` AS `total_consultas`, `l`.`total_honorarios_medico` AS `total_honorarios_medico`, `l`.`estado` AS `estado`, `l`.`fecha_pago` AS `fecha_pago`, (to_days(curdate()) - to_days(`l`.`fecha_fin`)) AS `dias_vencimiento` FROM (`liquidaciones_medicos` `l` join `medicos` `m` on((`l`.`medico_id` = `m`.`id`))) ORDER BY `l`.`fecha_fin` DESC ;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `atenciones`
--
ALTER TABLE `atenciones`
  ADD CONSTRAINT `atenciones_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes` (`id`),
  ADD CONSTRAINT `atenciones_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Constraints for table `cajas`
--
ALTER TABLE `cajas`
  ADD CONSTRAINT `cajas_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Constraints for table `cierre_caja_detalle`
--
ALTER TABLE `cierre_caja_detalle`
  ADD CONSTRAINT `cierre_caja_detalle_ibfk_1` FOREIGN KEY (`caja_id`) REFERENCES `cajas` (`id`),
  ADD CONSTRAINT `cierre_caja_detalle_ibfk_2` FOREIGN KEY (`usuario_cierre_id`) REFERENCES `usuarios` (`id`);

--
-- Constraints for table `cobros`
--
ALTER TABLE `cobros`
  ADD CONSTRAINT `cobros_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `cobros_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Constraints for table `cobros_detalle`
--
ALTER TABLE `cobros_detalle`
  ADD CONSTRAINT `cobros_detalle_ibfk_1` FOREIGN KEY (`cobro_id`) REFERENCES `cobros` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `configuracion_honorarios_medicos`
--
ALTER TABLE `configuracion_honorarios_medicos`
  ADD CONSTRAINT `configuracion_honorarios_medicos_ibfk_1` FOREIGN KEY (`medico_id`) REFERENCES `medicos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_configuracion_honorarios_tarifa` FOREIGN KEY (`tarifa_id`) REFERENCES `tarifas` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `consultas`
--
ALTER TABLE `consultas`
  ADD CONSTRAINT `consultas_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `consultas_ibfk_2` FOREIGN KEY (`medico_id`) REFERENCES `medicos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `consultas_ibfk_3` FOREIGN KEY (`cobro_id`) REFERENCES `cobros` (`id`);

--
-- Constraints for table `cotizaciones`
--
ALTER TABLE `cotizaciones`
  ADD CONSTRAINT `cotizaciones_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes` (`id`),
  ADD CONSTRAINT `cotizaciones_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Constraints for table `cotizaciones_detalle`
--
ALTER TABLE `cotizaciones_detalle`
  ADD CONSTRAINT `cotizaciones_detalle_ibfk_1` FOREIGN KEY (`cotizacion_id`) REFERENCES `cotizaciones` (`id`);

--
-- Constraints for table `cotizaciones_farmacia`
--
ALTER TABLE `cotizaciones_farmacia`
  ADD CONSTRAINT `cotizaciones_farmacia_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes` (`id`),
  ADD CONSTRAINT `cotizaciones_farmacia_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Constraints for table `cotizaciones_farmacia_detalle`
--
ALTER TABLE `cotizaciones_farmacia_detalle`
  ADD CONSTRAINT `cotizaciones_farmacia_detalle_ibfk_1` FOREIGN KEY (`cotizacion_id`) REFERENCES `cotizaciones_farmacia` (`id`),
  ADD CONSTRAINT `cotizaciones_farmacia_detalle_ibfk_2` FOREIGN KEY (`medicamento_id`) REFERENCES `medicamentos` (`id`);

--
-- Constraints for table `disponibilidad_medicos`
--
ALTER TABLE `disponibilidad_medicos`
  ADD CONSTRAINT `disponibilidad_medicos_ibfk_1` FOREIGN KEY (`medico_id`) REFERENCES `medicos` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `egresos`
--
ALTER TABLE `egresos`
  ADD CONSTRAINT `egresos_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  ADD CONSTRAINT `egresos_ibfk_2` FOREIGN KEY (`medico_id`) REFERENCES `medicos` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `historia_clinica`
--
ALTER TABLE `historia_clinica`
  ADD CONSTRAINT `historia_clinica_ibfk_1` FOREIGN KEY (`consulta_id`) REFERENCES `consultas` (`id`);

--
-- Constraints for table `honorarios_medicos_movimientos`
--
ALTER TABLE `honorarios_medicos_movimientos`
  ADD CONSTRAINT `fk_honorarios_movimientos_tarifa` FOREIGN KEY (`tarifa_id`) REFERENCES `tarifas` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `honorarios_medicos_movimientos_ibfk_1` FOREIGN KEY (`medico_id`) REFERENCES `medicos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `honorarios_medicos_movimientos_ibfk_2` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `ingresos`
--
ALTER TABLE `ingresos`
  ADD CONSTRAINT `ingresos_ibfk_1` FOREIGN KEY (`caja_id`) REFERENCES `cajas` (`id`),
  ADD CONSTRAINT `ingresos_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Constraints for table `ingresos_diarios`
--
ALTER TABLE `ingresos_diarios`
  ADD CONSTRAINT `ingresos_diarios_ibfk_1` FOREIGN KEY (`caja_id`) REFERENCES `cajas` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `ingresos_diarios_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  ADD CONSTRAINT `ingresos_diarios_ibfk_3` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes` (`id`);

--
-- Constraints for table `liquidaciones_medicos`
--
ALTER TABLE `liquidaciones_medicos`
  ADD CONSTRAINT `liquidaciones_medicos_ibfk_1` FOREIGN KEY (`medico_id`) REFERENCES `medicos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `liquidaciones_medicos_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `usuarios` (`id`),
  ADD CONSTRAINT `liquidaciones_medicos_ibfk_3` FOREIGN KEY (`paid_by`) REFERENCES `usuarios` (`id`);

--
-- Constraints for table `log_reaperturas`
--
ALTER TABLE `log_reaperturas`
  ADD CONSTRAINT `log_reaperturas_ibfk_1` FOREIGN KEY (`caja_id`) REFERENCES `cajas` (`id`),
  ADD CONSTRAINT `log_reaperturas_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Constraints for table `movimientos_medicamento`
--
ALTER TABLE `movimientos_medicamento`
  ADD CONSTRAINT `movimientos_medicamento_ibfk_1` FOREIGN KEY (`medicamento_id`) REFERENCES `medicamentos` (`id`),
  ADD CONSTRAINT `movimientos_medicamento_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Constraints for table `ordenes_laboratorio`
--
ALTER TABLE `ordenes_laboratorio`
  ADD CONSTRAINT `ordenes_laboratorio_ibfk_1` FOREIGN KEY (`consulta_id`) REFERENCES `consultas` (`id`);

--
-- Constraints for table `resultados_laboratorio`
--
ALTER TABLE `resultados_laboratorio`
  ADD CONSTRAINT `resultados_laboratorio_ibfk_1` FOREIGN KEY (`consulta_id`) REFERENCES `consultas` (`id`);

--
-- Constraints for table `seguros`
--
ALTER TABLE `seguros`
  ADD CONSTRAINT `seguros_ibfk_1` FOREIGN KEY (`paciente_id`) REFERENCES `pacientes` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `tarifas`
--
ALTER TABLE `tarifas`
  ADD CONSTRAINT `fk_tarifas_medico` FOREIGN KEY (`medico_id`) REFERENCES `medicos` (`id`);

--
-- Constraints for table `triaje`
--
ALTER TABLE `triaje`
  ADD CONSTRAINT `triaje_ibfk_1` FOREIGN KEY (`consulta_id`) REFERENCES `consultas` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
