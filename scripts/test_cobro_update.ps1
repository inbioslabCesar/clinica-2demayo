# PowerShell test script for api_cobro_actualizar and api_cobro_eliminar_item
# Adjust $baseUrl and $cobroId as needed
$baseUrl = 'http://localhost/clinica-2demayo/'
$cobroId = 123

# 1) Merge add
$body = @{
  cobro_id = $cobroId
  servicio_tipo = 'laboratorio'
  items = @(@{ servicio_id = 9999; descripcion = 'Examen Test'; cantidad = 1; precio_unitario = 10.0; subtotal = 10.0 })
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri ($baseUrl + 'api_cobro_actualizar.php') -Method Post -Body $body -ContentType 'application/json' | ConvertTo-Json

# 2) Replace
$body2 = @{
  cobro_id = $cobroId
  servicio_tipo = 'laboratorio'
  replace = $true
  items = @(@{ servicio_id = 8888; descripcion = 'Examen Replace'; cantidad = 1; precio_unitario = 20.0; subtotal = 20.0 })
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri ($baseUrl + 'api_cobro_actualizar.php') -Method Post -Body $body2 -ContentType 'application/json' | ConvertTo-Json

# 3) Delete item
$body3 = @{
  cobro_id = $cobroId
  servicio_tipo = 'laboratorio'
  motivo = 'Prueba'
  item = @{ servicio_id = 8888; descripcion = 'Examen Replace'; cantidad = 1; subtotal = 20.0 }
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri ($baseUrl + 'api_cobro_eliminar_item.php') -Method Post -Body $body3 -ContentType 'application/json' | ConvertTo-Json
