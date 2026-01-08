#!/bin/bash
# Simple tests for api_cobro_actualizar.php and api_cobro_eliminar_item.php
# Ajusta BASE_URL y COBRO_ID según tu entorno
BASE_URL="http://localhost/clinica-2demayo/"
COBRO_ID=123
PACIENTE_ID=1

# 1) Añadir examen (merge mode)
curl -s -X POST "${BASE_URL}api_cobro_actualizar.php" \
  -H 'Content-Type: application/json' \
  -d '{
    "cobro_id": '${COBRO_ID}',
    "servicio_tipo": "laboratorio",
    "items": [ { "servicio_id": 9999, "descripcion": "Examen Test", "cantidad": 1, "precio_unitario": 10.0, "subtotal": 10.0 } ]
  }' | jq '.'

# 2) Forzar replace (sobrescribir)
curl -s -X POST "${BASE_URL}api_cobro_actualizar.php" \
  -H 'Content-Type: application/json' \
  -d '{
    "cobro_id": '${COBRO_ID}',
    "servicio_tipo": "laboratorio",
    "replace": true,
    "items": [ { "servicio_id": 8888, "descripcion": "Examen Replace", "cantidad": 1, "precio_unitario": 20.0, "subtotal": 20.0 } ]
  }' | jq '.'

# 3) Eliminar ítem (ejemplo) -- ajusta item payload
curl -s -X POST "${BASE_URL}api_cobro_eliminar_item.php" \
  -H 'Content-Type: application/json' \
  -d '{
    "cobro_id": '${COBRO_ID}',
    "servicio_tipo": "laboratorio",
    "motivo": "Prueba",
    "item": { "servicio_id": 8888, "descripcion": "Examen Replace", "cantidad": 1, "subtotal": 20.0 }
  }' | jq '.'
