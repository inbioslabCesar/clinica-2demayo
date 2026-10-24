// Clona la BD de desarrollo en una BD de pruebas (estructura + datos) para ejecutar cobros reales sin tocar la caja real.
//   npm run test:db:clone            -> crea/recrea poli2demayo_test a partir de poli2demayo
// Variables opcionales: MYSQL_BIN (carpeta de mysql.exe/mysqldump.exe), DB_ORIGEN, DB_DESTINO (debe terminar en _test).
import { spawn } from "node:child_process";
import path from "node:path";

const bin = process.env.MYSQL_BIN || "C:\\laragon\\bin\\mysql\\mysql-8.4.3-winx64\\bin";
const origen = process.env.DB_ORIGEN || "poli2demayo";
const destino = process.env.DB_DESTINO || "poli2demayo_test";
if (!destino.endsWith("_test")) {
  console.error("DB_DESTINO debe terminar en _test");
  process.exit(2);
}
const exe = (n) => path.join(bin, `${n}.exe`);

const ejecutar = (comando, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(comando, args, { stdio: "inherit" });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(comando)} terminó con código ${code}`))));
  });

await ejecutar(exe("mysql"), ["-uroot", "-e", `DROP DATABASE IF EXISTS \`${destino}\`; CREATE DATABASE \`${destino}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;`]);

const dump = spawn(exe("mysqldump"), ["-uroot", "--single-transaction", "--routines", "--triggers", "--default-character-set=utf8mb4", origen], { stdio: ["ignore", "pipe", "inherit"] });
const carga = spawn(exe("mysql"), ["-uroot", "--default-character-set=utf8mb4", destino], { stdio: ["pipe", "inherit", "inherit"] });
dump.stdout.pipe(carga.stdin);
const [codDump, codCarga] = await Promise.all([
  new Promise((r) => dump.on("close", r)),
  new Promise((r) => carga.on("close", r)),
]);
if (codDump !== 0 || codCarga !== 0) {
  console.error("Falló la clonación");
  process.exit(1);
}
console.log(`BD ${destino} clonada desde ${origen}`);
