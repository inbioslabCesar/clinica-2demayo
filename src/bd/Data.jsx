// src/bd/Data.jsx
import { BASE_URL } from "../config/config";


// Función para obtener clientes
export async function obtenerClientes(pagina = 1, limite = 10, busqueda = "") {
  const url = `${BASE_URL}api_clientes.php?pagina=${pagina}&limite=${limite}&busqueda=${encodeURIComponent(busqueda)}`;
  const res = await fetch(url);
  return await res.json();
}

// Función para insertar cliente
export async function insertarCliente(nombre, apellido) {
  const res = await fetch(`${BASE_URL}api_clientes.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre, apellido }),
  });
  return await res.json();
}
// Función para eliminar cliente
export async function eliminarCliente(id) {
  const res = await fetch(`${BASE_URL}api_clientes.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, _method: "DELETE" }),
  });
  return await res.json();
}
// Función para actualizar cliente
export async function actualizarCliente(id, nombre, apellido) {
  const res = await fetch(`${BASE_URL}api_clientes.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, nombre, apellido, _method: "PUT" }),
  });
  return await res.json();
}

// Función para insertar entrevista
export async function insertarEntrevista(datosEntrevista) {
  const res = await fetch(`${BASE_URL}api_entrevistas.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datosEntrevista),
  });
  return await res.json();
}

// Función para actualizar entrevista
export async function actualizarEntrevista(id, datosEntrevista) {
  const res = await fetch(`${BASE_URL}api_entrevistas.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...datosEntrevista, _method: "PUT" }),
  });
  return await res.json();
}

export async function obtenerEntrevistaPorCliente(cliente_id) {
  const res = await fetch(`${BASE_URL}api_entrevistas.php?cliente_id=${cliente_id}`);
  return await res.json();
}

// Función para obtener datos de Levey-Jennings


export async function obtenerDatosLJ(folder, prueba, control, fromDate, toDate) {
  const res = await fetch(`${BASE_URL}api_levey_jennings.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder, prueba, control, fromDate, toDate }),
  });
  return await res.json();
}