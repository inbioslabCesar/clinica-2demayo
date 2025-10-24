## 🏥 SISTEMA DE HONORARIOS MÉDICOS - PRIVILEGIOS POR ROL

### 👨‍💼 **ADMINISTRADOR** - Acceso Total
| Funcionalidad | Configuración | Movimientos | Pagos | Liquidaciones |
|---------------|:-------------:|:-----------:|:-----:|:-------------:|
| **Crear/Editar Configuraciones** | ✅ | ➖ | ➖ | ➖ |
| **Eliminar Configuraciones** | ✅ | ➖ | ➖ | ➖ |
| **Ver Todas las Configuraciones** | ✅ | ➖ | ➖ | ➖ |
| **Ver Todos los Movimientos** | ➖ | ✅ | ➖ | ➖ |
| **Registrar Movimientos Manuales** | ➖ | ✅ | ➖ | ➖ |
| **Actualizar Estados de Pago** | ➖ | ➖ | ✅ | ➖ |
| **Marcar como Pagado/Pendiente** | ➖ | ➖ | ✅ | ➖ |
| **Generar Liquidaciones** | ➖ | ➖ | ➖ | ✅ |
| **Aprobar Liquidaciones** | ➖ | ➖ | ➖ | ✅ |

### 👩‍💼 **RECEPCIONISTA** - Gestión de Pagos
| Funcionalidad | Configuración | Movimientos | Pagos | Liquidaciones |
|---------------|:-------------:|:-----------:|:-----:|:-------------:|
| **Crear/Editar Configuraciones** | ❌ | ➖ | ➖ | ➖ |
| **Eliminar Configuraciones** | ❌ | ➖ | ➖ | ➖ |
| **Ver Configuraciones (Solo Lectura)** | ✅ | ➖ | ➖ | ➖ |
| **Ver Movimientos por Médico/Fecha** | ➖ | ✅ | ➖ | ➖ |
| **Registrar Movimientos Manuales** | ➖ | ✅ | ➖ | ➖ |
| **Actualizar Estados de Pago** | ➖ | ➖ | ✅ | ➖ |
| **Marcar como Pagado/Pendiente** | ➖ | ➖ | ✅ | ➖ |
| **Ver Liquidaciones** | ➖ | ➖ | ➖ | ✅ |

### 👨‍⚕️ **MÉDICO** - Consulta Personal
| Funcionalidad | Configuración | Movimientos | Pagos | Liquidaciones |
|---------------|:-------------:|:-----------:|:-----:|:-------------:|
| **Ver Sus Configuraciones** | ✅ | ➖ | ➖ | ➖ |
| **Ver Sus Movimientos** | ➖ | ✅ | ➖ | ➖ |
| **Ver Sus Pagos Recibidos** | ➖ | ➖ | ✅ | ➖ |
| **Ver Sus Liquidaciones** | ➖ | ➖ | ➖ | ✅ |

---

## 🔐 **Implementación de Seguridad**

### Validaciones en `auth_check.php`:
```php
// ADMINISTRADOR: Sin restricciones
if ($usuarioRol === 'administrador') {
    // Acceso total permitido
}

// RECEPCIONISTA: Solo pagos, no configuración
elseif ($usuarioRol === 'recepcionista') {
    // Bloquear modificación de configuraciones
    if ($isConfiguracionHonorarios && $method !== 'GET') {
        // Error 403: Solo administradores pueden configurar
    }
}
```

### APIs Protegidas:
- `api_honorarios_medicos_v2.php` - Configuraciones (Admin: completo, Recepcionista: solo lectura)
- `api_movimientos_honorarios.php` - Movimientos (Admin + Recepcionista: completo)

### Flujo de Trabajo:
1. **Admin** configura porcentajes por médico/servicio
2. **Sistema** calcula honorarios automáticamente en consultas
3. **Recepcionista** gestiona pagos diarios a médicos
4. **Admin** genera liquidaciones periódicas

## ✅ **Estado Actual**
- [x] Base de datos implementada
- [x] APIs funcionales
- [x] Permisos configurados
- [x] Integración con tarifas existentes
- [ ] Interfaces de usuario pendientes