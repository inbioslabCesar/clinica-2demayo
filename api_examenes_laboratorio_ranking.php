<?php
require_once __DIR__ . '/init_api.php';
require_once 'config.php';
require_once __DIR__ . '/modules/RankingExamenesLab.php';

// Ranking de exámenes más solicitados (conteo en PHP con caché corto; ver RankingExamenesLab).
echo json_encode(["success" => true, "ranking" => RankingExamenesLab::conCache($conn)], JSON_UNESCAPED_UNICODE);
