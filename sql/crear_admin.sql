-- Script para crear un usuario administrador
-- Ejecutar en la base de datos de producción

INSERT INTO usuarios (
    nombre, 
    email, 
    password, 
    rol,
    created_at
) VALUES (
    'Administrador Sistema',
    'admin@clinica2demayo.com',
    '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password: password
    'administrador',
    NOW()
);

-- Verificar que se creó
SELECT id, nombre, email, rol FROM usuarios WHERE rol = 'administrador';