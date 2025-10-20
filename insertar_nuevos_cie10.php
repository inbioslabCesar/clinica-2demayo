<?php
require_once 'config.php';

// Códigos nuevos a insertar (solo los que agregamos)
$nuevos_codigos = [
    // HEMATOLOGÍA
    ['D50.0', 'Anemia por deficiencia de hierro secundaria a pérdida de sangre (crónica)', 'Hematología', 'Anemias por deficiencia de hierro', 'Anemia ferropénica por sangrado'],
    ['D50.1', 'Anemia sideropénica distrópica', 'Hematología', 'Anemias por deficiencia de hierro', 'Anemia por deficiencia de hierro'],
    ['D50.8', 'Otras anemias por deficiencia de hierro', 'Hematología', 'Anemias por deficiencia de hierro', 'Anemia ferropénica'],
    ['D50.9', 'Anemia por deficiencia de hierro, no especificada', 'Hematología', 'Anemias por deficiencia de hierro', 'Anemia ferropénica'],
    ['D51.0', 'Anemia por deficiencia de vitamina B12 debida a deficiencia de factor intrínseco', 'Hematología', 'Anemias megaloblásticas', 'Anemia perniciosa'],
    ['D51.1', 'Anemia por deficiencia de vitamina B12 debida a absorción selectiva defectuosa de vitamina B12', 'Hematología', 'Anemias megaloblásticas', 'Anemia por déficit B12'],
    ['D51.9', 'Anemia por deficiencia de vitamina B12, no especificada', 'Hematología', 'Anemias megaloblásticas', 'Anemia megaloblástica'],
    ['D52.0', 'Anemia por deficiencia de folato dietético', 'Hematología', 'Anemias megaloblásticas', 'Anemia por déficit de ácido fólico'],
    ['D52.9', 'Anemia por deficiencia de folato, no especificada', 'Hematología', 'Anemias megaloblásticas', 'Anemia por déficit de folatos'],
    ['D53.9', 'Anemia nutricional, no especificada', 'Hematología', 'Anemias nutricionales', 'Anemia carencial'],
    ['D62', 'Anemia aguda posthemorrágica', 'Hematología', 'Anemias agudas', 'Anemia por hemorragia aguda'],
    ['D64.9', 'Anemia, no especificada', 'Hematología', 'Otras anemias', 'Anemia no especificada'],
    
    // ONCOLOGÍA
    ['C16.9', 'Tumor maligno del estómago, parte no especificada', 'Oncología', 'Neoplasias digestivas', 'Cáncer gástrico'],
    ['C18.9', 'Tumor maligno del colon, parte no especificada', 'Oncología', 'Neoplasias digestivas', 'Cáncer de colon'],
    ['C20', 'Tumor maligno del recto', 'Oncología', 'Neoplasias digestivas', 'Cáncer rectal'],
    ['C34.9', 'Tumor maligno de parte no especificada de bronquio o pulmón no especificado', 'Oncología', 'Neoplasias respiratorias', 'Cáncer pulmonar'],
    ['C50.9', 'Tumor maligno de la mama, parte no especificada', 'Oncología', 'Neoplasias mamarias', 'Cáncer de mama'],
    ['C61', 'Tumor maligno de la próstata', 'Oncología', 'Neoplasias urológicas', 'Cáncer de próstata'],
    
    // PSIQUIATRÍA
    ['F32.0', 'Episodio depresivo leve', 'Psiquiatría', 'Trastornos depresivos', 'Depresión leve'],
    ['F32.1', 'Episodio depresivo moderado', 'Psiquiatría', 'Trastornos depresivos', 'Depresión moderada'],
    ['F32.2', 'Episodio depresivo severo sin síntomas psicóticos', 'Psiquiatría', 'Trastornos depresivos', 'Depresión severa'],
    ['F32.9', 'Episodio depresivo, no especificado', 'Psiquiatría', 'Trastornos depresivos', 'Depresión'],
    ['F41.0', 'Trastorno de pánico [ansiedad paroxística episódica]', 'Psiquiatría', 'Trastornos de ansiedad', 'Trastorno de pánico'],
    ['F41.1', 'Trastorno de ansiedad generalizada', 'Psiquiatría', 'Trastornos de ansiedad', 'Ansiedad generalizada'],
    ['F41.9', 'Trastorno de ansiedad, no especificado', 'Psiquiatría', 'Trastornos de ansiedad', 'Ansiedad'],
    
    // NEUROLOGÍA
    ['G20', 'Enfermedad de Parkinson', 'Neurología', 'Trastornos del movimiento', 'Parkinson'],
    ['G30.9', 'Enfermedad de Alzheimer, no especificada', 'Neurología', 'Demencias', 'Alzheimer'],
    ['G40.9', 'Epilepsia, no especificada', 'Neurología', 'Epilepsia', 'Epilepsia'],
    ['G43.0', 'Migraña sin aura [migraña común]', 'Neurología', 'Cefaleas', 'Migraña sin aura'],
    ['G43.1', 'Migraña con aura [migraña clásica]', 'Neurología', 'Cefaleas', 'Migraña con aura'],
    ['G43.9', 'Migraña, no especificada', 'Neurología', 'Cefaleas', 'Migraña'],
    ['G44.2', 'Cefalea de tipo tensional', 'Neurología', 'Cefaleas', 'Cefalea tensional'],
    ['G56.0', 'Síndrome del túnel carpiano', 'Neurología', 'Neuropatías periféricas', 'Túnel carpiano'],
    
    // DERMATOLOGÍA
    ['L01.0', 'Impétigo [cualquier sitio] [cualquier organismo]', 'Dermatología', 'Infecciones cutáneas', 'Impétigo'],
    ['L03.9', 'Celulitis, no especificada', 'Dermatología', 'Infecciones cutáneas', 'Celulitis'],
    ['L20.9', 'Dermatitis atópica, no especificada', 'Dermatología', 'Dermatitis', 'Dermatitis atópica'],
    ['L21.9', 'Dermatitis seborreica, no especificada', 'Dermatología', 'Dermatitis', 'Dermatitis seborreica'],
    ['L40.9', 'Psoriasis, no especificada', 'Dermatología', 'Psoriasis', 'Psoriasis'],
    ['L50.9', 'Urticaria, no especificada', 'Dermatología', 'Urticaria', 'Urticaria'],
    ['L70.0', 'Acné vulgar', 'Dermatología', 'Acné', 'Acné vulgar']
];

$insertados = 0;
$errores = [];

$stmt = $mysqli->prepare("INSERT IGNORE INTO cie10 (codigo, nombre, categoria, subcategoria, descripcion) VALUES (?, ?, ?, ?, ?)");

foreach ($nuevos_codigos as $codigo) {
    $stmt->bind_param("sssss", $codigo[0], $codigo[1], $codigo[2], $codigo[3], $codigo[4]);
    
    if ($stmt->execute()) {
        if ($stmt->affected_rows > 0) {
            $insertados++;
        }
    } else {
        $errores[] = "Error al insertar {$codigo[0]}: " . $stmt->error;
    }
}

echo "Proceso completado:\n";
echo "- Nuevos códigos insertados: $insertados\n";
echo "- Errores: " . count($errores) . "\n";

if (!empty($errores)) {
    echo "\nErrores:\n";
    foreach ($errores as $error) {
        echo "- $error\n";
    }
}

$stmt->close();
$mysqli->close();
?>