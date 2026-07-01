<?php
$pdfPath = 'uploads/informes_imagenologia/informe_imagenologia_1_20260623074600.pdf';
if (file_exists($pdfPath)) {
    $content = file_get_contents($pdfPath);
    $size = filesize($pdfPath);
    echo "PDF size: $size bytes\n";
    echo "---\n";
    
    if (strpos($content, 'DR. PAGÁN') !== false) {
        echo "[✓] FOUND: DR. PAGÁN\n";
    } else {
        echo "[✗] NOT FOUND: DR. PAGÁN\n";
    }
    
    if (strpos($content, 'Jr. Hildebrando') !== false || strpos($content, 'Hildebrando') !== false) {
        echo "[✓] FOUND: Dirección (Hildebrando)\n";
    } else {
        echo "[✗] NOT FOUND: Dirección\n";
    }
    
    if (strpos($content, '628347') !== false || strpos($content, '061') !== false) {
        echo "[✓] FOUND: Teléfono\n";
    } else {
        echo "[✗] NOT FOUND: Teléfono\n";
    }
    
    if (strpos($content, 'centromedicodrpagan') !== false || strpos($content, 'info@') !== false) {
        echo "[✓] FOUND: Email\n";
    } else {
        echo "[✗] NOT FOUND: Email\n";
    }
    
    if (strpos($content, '10100496289') !== false || strpos($content, 'RUC') !== false) {
        echo "[✓] FOUND: RUC\n";
    } else {
        echo "[✗] NOT FOUND: RUC\n";
    }
    
    // Check for signature image
    if (preg_match('/data:image\/(png|jpeg|jpg);base64,/', $content)) {
        echo "[✗] FOUND: Base64 image (firma) - SHOULD NOT EXIST\n";
    } else {
        echo "[✓] NOT FOUND: Base64 image (firma) - CORRECT\n";
    }
    
    echo "---\n";
    
    // Extract some text to verify rendering
    if (preg_match('/JORGE ALEX OLIVAS/', $content)) {
        echo "[✓] Found doctor name: JORGE ALEX OLIVAS\n";
    }
    
    if (preg_match('/ECOGRAFISTA/', $content)) {
        echo "[✓] Found specialty: ECOGRAFISTA\n";
    }
} else {
    echo "PDF file not found: $pdfPath\n";
}
?>
