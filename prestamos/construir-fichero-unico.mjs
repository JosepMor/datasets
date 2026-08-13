/**
 * Genera una versión de la app en un único fichero HTML, con el CSS y el
 * JavaScript incrustados. Sirve para abrirla sin servidor (doble clic, adjunta
 * en un correo, en el iPhone desde Archivos) o para publicarla en cualquier
 * sitio donde solo se pueda subir una página suelta.
 *
 *   node construir-fichero-unico.mjs
 *
 * Produce:
 *   calculadora-prestamos.html   página completa y autónoma
 *   .artefacto.html              solo el contenido, sin <html>/<head>/<body>,
 *                                para incrustar en otra página
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));
const leer = (f) => readFileSync(join(raiz, f), 'utf8');

const html = leer('index.html');
const css = leer('estilos.css');
const finanzas = leer('finanzas.js');
const app = leer('app.js');

const exigir = (condicion, mensaje) => {
  if (!condicion) throw new Error(`No se puede construir el fichero único: ${mensaje}`);
};

// --- JavaScript: un solo módulo con los dos ficheros concatenados ----------
const REGISTRO_SW = `  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {
      $('estado-offline').textContent = 'Uso sin conexión no disponible en este navegador.';
    });
  }
`;
const IMPORTACION = "import { calcular, validar, FRECUENCIAS, SISTEMAS } from './finanzas.js';";

exigir(app.includes(IMPORTACION), 'no encuentro la importación de finanzas.js en app.js');
exigir(app.includes(REGISTRO_SW), 'no encuentro el registro del service worker en app.js');

const script = [
  '/* ---- finanzas.js ---- */',
  finanzas.replace(/^export /gm, ''),
  '/* ---- app.js ---- */',
  // Sin service worker: en un fichero suelto no hay nada que cachear, y el
  // propio fichero ya funciona sin conexión.
  app.replace(IMPORTACION, '').replace(REGISTRO_SW, ''),
].join('\n');

exigir(!/^\s*(import|export)\s/m.test(script), 'han quedado import/export sin resolver');

// --- Contenido de la página ------------------------------------------------
const cuerpo = html.match(/<body>([\s\S]*?)<\/body>/);
exigir(cuerpo, 'no encuentro el <body> en index.html');
const contenido = cuerpo[1]
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .trim();

const titulo = html.match(/<title>(.*?)<\/title>/)[1];
const descripcion = html.match(/name="description" content="(.*?)"/)[1];

const pagina = `<style>\n${css}\n</style>\n\n${contenido}\n\n<script type="module">\n${script}\n</script>\n`;

writeFileSync(
  join(raiz, 'calculadora-prestamos.html'),
  `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titulo}</title>
<meta name="description" content="${descripcion}">
<meta name="theme-color" content="#0b3d2e">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Préstamos">
</head>
<body>
${pagina}</body>
</html>
`
);

writeFileSync(join(raiz, '.artefacto.html'), `<title>${titulo}</title>\n${pagina}`);

console.log('Generados calculadora-prestamos.html y .artefacto.html');
