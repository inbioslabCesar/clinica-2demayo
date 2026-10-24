// Permite importar en Node los módulos de src/ (imports sin extensión de Vite) y stubea la config del navegador.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const stubConfig = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "config.stub.js")).href;

export async function resolve(specifier, context, nextResolve) {
  if (/(^|\/)config\/config$/.test(specifier)) {
    return { url: stubConfig, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !path.extname(specifier) && context.parentURL) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    for (const ext of [".js", ".jsx"]) {
      if (existsSync(base + ext)) {
        return { url: pathToFileURL(base + ext).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
