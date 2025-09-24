-- Ejemplo de inserción de datos para probar el flujo de consultas médicas

-- Insertar médicos
INSERT INTO medicos (nombre, especialidad) VALUES
('Dra. Ana Torres', 'Medicina General'),
('Dr. Luis Pérez', 'Pediatría'),
('Dra. Carla Gómez', 'Ginecología');

-- Insertar pacientes (ajusta los IDs si ya tienes pacientes)
INSERT INTO pacientes (dni, nombre, apellido, historia_clinica) VALUES
('12345678', 'Juan', 'Ramírez', 'HC001'),
('87654321', 'María', 'López', 'HC002');

-- Insertar disponibilidad para médicos (ajusta los IDs según tu tabla)
INSERT INTO disponibilidad_medicos (medico_id, dia_semana, hora_inicio, hora_fin) VALUES
(1, 'lunes', '08:00', '12:00'),
(1, 'miércoles', '14:00', '18:00'),
(2, 'martes', '09:00', '13:00'),
(3, 'viernes', '10:00', '13:00');

-- Insertar una consulta de ejemplo
INSERT INTO consultas (paciente_id, medico_id, fecha, hora, estado) VALUES
(1, 1, '2025-09-15', '08:00', 'pendiente');
