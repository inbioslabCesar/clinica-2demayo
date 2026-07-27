-- Plantilla HC integral de Pediatria
-- Fecha: 2026-07-26
-- Alcance: plantilla global. Tiene prioridad sobre overrides de otra clinica
--          y no reemplaza plantillas especificas de una clinica distinta.

INSERT INTO hc_templates (
  template_id,
  version,
  nombre,
  schema_version,
  source,
  clinic_key,
  schema_json,
  activo
) VALUES (
  'pediatria',
  '2026.07.26',
  'Pediatria - HC integral',
  '2.0',
  'clinica_override',
  '',
  '{
    "sections": {
      "inmunizaciones": {
        "bcg": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"BCG"},
        "hbv": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"HBV"},
        "pentavalente_1": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"Pentavalente 1ra"},
        "pentavalente_2": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"Pentavalente 2da"},
        "pentavalente_3": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"Pentavalente 3ra"},
        "antipolio_1": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"Antipolio 1ra"},
        "antipolio_2": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"Antipolio 2da"},
        "antipolio_3": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"Antipolio 3ra"},
        "rotavirus_1": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"Rotavirus 1ra"},
        "rotavirus_2": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"Rotavirus 2da"},
        "neumococo_1": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"Neumococo 1ra"},
        "neumococo_2": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"Neumococo 2da"},
        "influenza_1": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"Influenza 1ra"},
        "influenza_2": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"Influenza 2da"},
        "spr_1": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"SPR 1ra"},
        "spr_2": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"SPR 2da"},
        "neumococo_12_meses": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"Neumococo (12 meses)"},
        "antiamarilica": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"Antiamarilica"},
        "dpt_refuerzo_1": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"1er refuerzo DPT"},
        "spr_refuerzo_1": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"1er refuerzo SPR"},
        "apo_refuerzo_1": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"1er refuerzo APO"},
        "dpt_refuerzo_2": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"2do refuerzo DPT"},
        "apo_refuerzo_2": {"type":"select","width":"quarter","rows":1,"options":["Aplicada","Pendiente","No recibida","No recuerda"],"label":"2do refuerzo APO"}
      },
      "antecedentes": {
        "patologicos": {"type":"textarea","width":"half","rows":3,"options":[],"label":"Patologicos"},
        "quirurgicos": {"type":"textarea","width":"half","rows":3,"options":[],"label":"Quirurgicos"},
        "ram": {"type":"textarea","width":"half","rows":3,"options":[],"label":"RAM"},
        "uso_frecuente_medicamentos": {"type":"textarea","width":"half","rows":3,"options":[],"label":"Uso frecuente de medicamentos"},
        "antecedentes_prenatales_perinatales": {"type":"textarea","width":"full","rows":3,"options":[],"label":"Antecedentes prenatales y perinatales"}
      },
      "crecimiento_y_desarrollo": {
        "peso_kg": {"type":"number","width":"quarter","rows":1,"options":[],"label":"Peso (kg)"},
        "talla_cm": {"type":"number","width":"quarter","rows":1,"options":[],"label":"Talla (cm)"},
        "perimetro_cefalico_cm": {"type":"number","width":"quarter","rows":1,"options":[],"label":"Perimetro cefalico (cm)"},
        "imc": {"type":"number","width":"quarter","rows":1,"options":[],"label":"IMC"},
        "alimentacion": {"type":"textarea","width":"half","rows":2,"options":[],"label":"Alimentacion"},
        "desarrollo_psicomotor": {"type":"textarea","width":"half","rows":2,"options":[],"label":"Desarrollo psicomotor"}
      },
      "enfermedad_actual": {
        "inicio": {"type":"select","width":"quarter","rows":1,"options":["Brusco","Insidioso"],"label":"Inicio"},
        "curso": {"type":"select","width":"quarter","rows":1,"options":["Progresivo","Estacional"],"label":"Curso"},
        "tiempo_enfermedad": {"type":"text","width":"half","rows":1,"options":[],"label":"Tiempo de enfermedad"},
        "signos_sintomas": {"type":"textarea","width":"full","rows":3,"options":[],"label":"Signos y sintomas"},
        "anamnesis": {"type":"textarea","width":"full","rows":4,"options":[],"label":"Anamnesis"}
      },
      "examen_fisico_pediatrico": {
        "estado_general": {"type":"textarea","width":"half","rows":2,"options":[],"label":"Estado general"},
        "piel_mucosas": {"type":"textarea","width":"half","rows":2,"options":[],"label":"Piel y mucosas"},
        "cabeza_cuello": {"type":"textarea","width":"half","rows":2,"options":[],"label":"Cabeza y cuello"},
        "cardiopulmonar": {"type":"textarea","width":"half","rows":2,"options":[],"label":"Cardiopulmonar"},
        "abdomen": {"type":"textarea","width":"half","rows":2,"options":[],"label":"Abdomen"},
        "neurologico": {"type":"textarea","width":"half","rows":2,"options":[],"label":"Neurologico"}
      }
    }
  }',
  1
)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  schema_version = VALUES(schema_version),
  source = VALUES(source),
  schema_json = VALUES(schema_json),
  activo = VALUES(activo),
  updated_at = CURRENT_TIMESTAMP;