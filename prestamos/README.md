# Calculadora de préstamos

App web instalable (PWA) para calcular el cuadro de amortización de un préstamo
desde el móvil. Sin dependencias, sin compilación y sin conexión una vez
instalada: son ficheros estáticos que se abren directamente en el navegador.

## Qué calcula

| Sistema | Cómo funciona |
| --- | --- |
| **Francés** | Cuota total constante. Los intereses decrecen y el capital amortizado crece. |
| **Alemán** | Cuota de capital constante (`principal / nº de cuotas`) más los intereses del saldo vivo, así que la cuota total va bajando. |
| **Americano** | Solo intereses cada periodo y devolución íntegra del capital al vencimiento. |

Además:

- **Periodicidad** mensual, trimestral, semestral o anual.
- **Tipo fijo** interpretado de dos formas, a elegir:
  - *Nominal*: `TIN ÷ nº de periodos` (convención bancaria española). 6 % anual con pago trimestral → 1,5 % por trimestre.
  - *Efectivo*: tasa periódica equivalente. 6 % anual con pago trimestral → `(1,06)^(1/4) − 1` = 1,4674 %.
- **Valor residual o pago balón** en francés y alemán: la cuota se calcula para
  que al vencimiento quede pendiente justo ese importe, que se paga con la
  última cuota.
- **Carencia inicial**, parcial (solo intereses, la deuda no baja) o total (no se
  paga nada y los intereses se capitalizan).
- **Comisión de apertura y gastos iniciales**, con la **TAE real** resultante
  calculada por TIR sobre los flujos de caja.
- **Cuadro de amortización** completo, con vista detallada o agrupada por años.
- **Exportar a CSV** (separador `;` y coma decimal, listo para Excel en español)
  y **compartir** con la hoja de compartir de iOS.
- **Escenarios guardados** en el propio dispositivo para comparar alternativas.

Los importes se muestran en euros y los cálculos se hacen con redondeo a
céntimos cuota a cuota; la última cuota absorbe el desajuste de redondeo
acumulado, como hacen los bancos.

## Instalarla en el iPhone

1. Publica la carpeta (ver más abajo) y abre la URL en **Safari** (tiene que ser
   Safari: Chrome en iPhone no sabe instalar apps en la pantalla de inicio).
2. Toca el botón *Compartir* (el cuadrado con la flecha hacia arriba, abajo en
   el centro) → **Añadir a pantalla de inicio** → *Añadir*.
3. Ya tienes el icono junto al resto de apps. Se abre a pantalla completa, sin
   barra de navegador, y funciona sin conexión.

## Publicar con GitHub Pages

En la página del repositorio en GitHub, desde el ordenador o desde el móvil:

1. **Settings** (la pestaña con el engranaje, arriba del todo).
2. En la columna de la izquierda, **Pages**.
3. En *Source* elige **Deploy from a branch**.
4. En *Branch* elige la rama y la carpeta **/ (root)**, y pulsa **Save**.

A los dos o tres minutos la app está en:

```
https://josepmor.github.io/datasets/prestamos/
```

Si el repositorio es privado, GitHub Pages exige un plan de pago; en ese caso
usa el fichero único que se describe justo debajo.

## Versión en un solo fichero

`calculadora-prestamos.html` es la misma app con el CSS y el JavaScript
incrustados: un único fichero que funciona con doble clic, sin servidor y sin
conexión. Sirve para enviárselo por correo a alguien, guardarlo en Archivos del
iPhone o subirlo a cualquier alojamiento que solo acepte una página suelta.

Se regenera desde los ficheros sueltos con:

```bash
node construir-fichero-unico.mjs
```

Hay que volver a ejecutarlo cada vez que se toque `index.html`, `estilos.css`,
`app.js` o `finanzas.js`; si no, el fichero único se queda con la versión
antigua.

## Ejecutarla en local

```bash
cd prestamos
npx http-server -p 8080 -c-1 .   # o: python3 -m http.server 8080
```

Y abre <http://localhost:8080>. Hace falta servirla por HTTP: al abrir el fichero
con `file://` el navegador bloquea los módulos de JavaScript y el service worker.

## Pruebas

El motor de cálculo (`finanzas.js`) es un módulo puro sin acceso al DOM y tiene
pruebas con el ejecutor de Node:

```bash
node --test test/finanzas.test.mjs
```

Cubren la cuota francesa contra valores de referencia, el capital constante
alemán, el americano con devolución final, el balón, los dos tipos de carencia,
la conversión nominal/efectiva, la TAE con y sin gastos, el tipo cero, las fechas
en meses cortos y el cuadre de totales en las doce combinaciones de sistema y
periodicidad.

## Estructura

```
prestamos/
├── index.html                    Estructura de la página
├── estilos.css                   Estilos (modo claro y oscuro automáticos)
├── app.js                        Interfaz: formulario, tabla, CSV, escenarios
├── finanzas.js                   Motor de cálculo (módulo puro, sin DOM)
├── manifest.webmanifest          Metadatos de la PWA
├── sw.js                         Service worker (uso sin conexión)
├── iconos/                       Iconos de la app
├── test/                         Pruebas del motor de cálculo
├── construir-fichero-unico.mjs   Genera la versión de un solo fichero
└── calculadora-prestamos.html    Versión de un solo fichero (generada)
```

Al modificar cualquier fichero hay que subir el número de `VERSION` en `sw.js`
para que los dispositivos que ya la tengan instalada recojan la versión nueva.

## Limitaciones conocidas

- Solo **tipo fijo**. No hay tipo variable ni revisiones de Euríbor.
- La base de cálculo es el periodo completo: no se prorratean días reales
  (30/360, ACT/360…), así que puede haber diferencias de céntimos con el cuadro
  de una entidad concreta.
- No contempla amortizaciones anticipadas, comisiones periódicas, seguros
  vinculados ni bonificaciones.
- Los cálculos son orientativos y no constituyen una oferta financiera.
