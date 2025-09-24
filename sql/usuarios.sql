-- Tabla de usuarios para el sistema Policlínico 2 de Mayo
CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  dni VARCHAR(15) NOT NULL,
  profesion VARCHAR(100) NOT NULL,
  rol ENUM('administrador', 'medico', 'enfermero', 'recepcionista', 'laboratorista') NOT NULL DEFAULT 'recepcionista',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO usuarios (usuario, password, nombre, dni, profesion, rol, activo)
VALUES (
  'admin',
  SHA2('admin123', 256),
  'Administrador General',
  '00000000',
  'Administrador',
  'administrador',
  1
);
modificar la contraseña del admin
UPDATE usuarios
SET password = SHA2('41950361', 256)
WHERE usuario = 'admin';