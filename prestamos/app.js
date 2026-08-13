/**
 * Interfaz de la calculadora de préstamos.
 * Toda la aritmética vive en finanzas.js; aquí solo hay entrada/salida.
 */
import { calcular, validar, FRECUENCIAS, SISTEMAS } from './finanzas.js';

const $ = (id) => document.getElementById(id);
const CLAVE_ESCENARIOS = 'prestamos:escenarios:v1';
const CLAVE_ULTIMO = 'prestamos:ultimo:v1';

const fmtMoneda = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmtMonedaCorta = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const fmtFecha = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
// En el cuadro de amortización el símbolo € va en la cabecera: así caben más
// columnas en la pantalla de un móvil.
const fmtImporte = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dinero = (x) => fmtMoneda.format(x || 0);
const importe = (x) => fmtImporte.format(x || 0);
const porcentaje = (x, dec = 3) =>
  x === null || x === undefined || !isFinite(x)
    ? '—'
    : `${(x * 100).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })} %`;

/**
 * Interpreta un número escrito a la española (1.234,56) o a la inglesa
 * (1,234.56). Si aparecen los dos separadores, manda el último.
 */
function numero(valor) {
  if (typeof valor === 'number') return valor;
  let s = String(valor ?? '').trim().replace(/[\s€%]/g, '');
  if (!s) return 0;
  const coma = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');
  if (coma > -1 && punto > -1) {
    const decimal = coma > punto ? ',' : '.';
    const miles = decimal === ',' ? '.' : ',';
    s = s.split(miles).join('').replace(decimal, '.');
  } else if (coma > -1) {
    // Una sola coma: decimal, salvo que separe grupos de tres (1,234).
    s = /,\d{3}$/.test(s) && s.length > 4 ? s.replace(',', '') : s.replace(',', '.');
  } else if (punto > -1) {
    s = /\.\d{3}$/.test(s) && s.length > 4 ? s.replace('.', '') : s;
  }
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

const CAMPOS = [
  'capital', 'anos', 'tipoAnual', 'convencion', 'frecuencia', 'residual',
  'carencia', 'tipoCarencia', 'comisionAperturaPct', 'gastosIniciales', 'fechaInicio',
];

let ultimoResultado = null;

function leerFormulario() {
  const sistema = document.querySelector('input[name="sistema"]:checked').value;
  return {
    sistema,
    capital: numero($('capital').value),
    anos: numero($('anos').value),
    tipoAnual: numero($('tipoAnual').value),
    convencion: $('convencion').value,
    frecuencia: $('frecuencia').value,
    residual: sistema === 'americano' ? 0 : numero($('residual').value),
    carencia: Math.round(numero($('carencia').value)) || 0,
    tipoCarencia: $('tipoCarencia').value,
    comisionAperturaPct: numero($('comisionAperturaPct').value),
    gastosIniciales: numero($('gastosIniciales').value),
    fechaInicio: $('fechaInicio').value || null,
  };
}

function escribirFormulario(p) {
  const marcar = document.querySelector(`input[name="sistema"][value="${p.sistema}"]`);
  if (marcar) marcar.checked = true;
  $('capital').value = p.capital?.toLocaleString('es-ES') ?? '';
  $('anos').value = String(p.anos ?? '').replace('.', ',');
  $('tipoAnual').value = String(p.tipoAnual ?? '').replace('.', ',');
  $('convencion').value = p.convencion || 'nominal';
  $('frecuencia').value = p.frecuencia || 'mensual';
  $('residual').value = (p.residual || 0).toLocaleString('es-ES');
  $('carencia').value = p.carencia || 0;
  $('tipoCarencia').value = p.tipoCarencia || 'parcial';
  $('comisionAperturaPct').value = String(p.comisionAperturaPct || 0).replace('.', ',');
  $('gastosIniciales').value = (p.gastosIniciales || 0).toLocaleString('es-ES');
  if (p.fechaInicio) $('fechaInicio').value = String(p.fechaInicio).slice(0, 10);
}

/* --- Ayudas contextuales -------------------------------------------------- */

const EXPLICACION = {
  frances: 'Pagas siempre lo mismo. Al principio casi todo son intereses y el capital se amortiza despacio.',
  aleman: 'Amortizas la misma cantidad de capital cada periodo, así que la cuota empieza alta y va bajando.',
  americano: 'Solo pagas intereses durante toda la vida del préstamo y devuelves el capital de golpe al final.',
};

function actualizarAyudas(p) {
  $('ayuda-sistema').textContent = EXPLICACION[p.sistema];

  const esAmericano = p.sistema === 'americano';
  $('campo-residual').hidden = esAmericano;
  $('aviso-americano').hidden = !esAmericano;

  const pxa = FRECUENCIAS[p.frecuencia]?.periodosPorAno ?? 12;
  const tasa = p.convencion === 'efectivo'
    ? Math.pow(1 + p.tipoAnual / 100, 1 / pxa) - 1
    : p.tipoAnual / 100 / pxa;
  $('ayuda-convencion').textContent =
    p.convencion === 'efectivo'
      ? `El ${String(p.tipoAnual).replace('.', ',')} % se toma como tasa anual efectiva: equivale a ${porcentaje(tasa)} por periodo.`
      : `El ${String(p.tipoAnual).replace('.', ',')} % se divide entre ${pxa} periodo${pxa > 1 ? 's' : ''}: ${porcentaje(tasa)} por periodo (convención bancaria).`;

  $('etiqueta-carencia').textContent = p.carencia > 0
    ? `${p.carencia} cuota${p.carencia > 1 ? 's' : ''} · ${p.tipoCarencia === 'total' ? 'total' : 'solo intereses'}`
    : 'Sin carencia';

  const gastos = (p.capital * p.comisionAperturaPct) / 100 + p.gastosIniciales;
  $('etiqueta-gastos').textContent = gastos > 0 ? fmtMonedaCorta.format(gastos) : 'Sin gastos';
}

/* --- Pintado del resultado ------------------------------------------------ */

const NOMBRE_CUOTA = { mensual: 'mensual', trimestral: 'trimestral', semestral: 'semestral', anual: 'anual' };

function pintarResumen(res, p) {
  const r = res.resumen;
  $('etiqueta-cuota').textContent = `Cuota ${NOMBRE_CUOTA[p.frecuencia]}`;
  $('cuota-valor').textContent = dinero(r.cuotaPrimera);

  const matices = [];
  if (p.sistema === 'aleman') {
    matices.push(`decreciente hasta ${dinero(res.filas.at(-1).cuota - res.filas.at(-1).balon)}`);
  }
  if (p.carencia > 0) {
    matices.push(
      p.tipoCarencia === 'total'
        ? `tras ${p.carencia} cuota${p.carencia > 1 ? 's' : ''} sin pagar`
        : `las ${p.carencia} primeras, solo intereses`
    );
  }
  if (r.valorResidual > 0) {
    matices.push(`más un pago final de ${dinero(r.valorResidual)}`);
  }
  $('cuota-matiz').textContent = matices.length ? matices.join(' · ') : '';

  $('m-intereses').textContent = dinero(r.totalIntereses);
  $('m-coste').textContent = dinero(r.costeTotal);
  $('m-total').textContent = dinero(r.totalDesembolsado);
  $('m-cuotas').textContent = String(r.periodos);
  $('m-tae').textContent = porcentaje(r.taeReal, 2);
  $('m-tasa').textContent = porcentaje(r.tasaPeriodica);
}

function filaHTML(celdas, clase) {
  const tr = document.createElement('tr');
  if (clase) tr.className = clase;
  for (const c of celdas) {
    const td = document.createElement('td');
    td.textContent = c;
    tr.appendChild(td);
  }
  return tr;
}

function pintarTabla(res) {
  const cuerpo = $('cuerpo-tabla');
  const pie = $('pie-tabla');
  cuerpo.textContent = '';
  pie.textContent = '';
  const agrupar = $('agrupar-anual').checked;
  const pxa = res.resumen.periodosPorAno;
  const fecha = (d) => (d ? fmtFecha.format(new Date(d)) : '—');

  if (agrupar && pxa > 1) {
    for (let inicio = 0; inicio < res.filas.length; inicio += pxa) {
      const grupo = res.filas.slice(inicio, inicio + pxa);
      const ultima = grupo.at(-1);
      cuerpo.appendChild(
        filaHTML([
          `Año ${inicio / pxa + 1}`,
          fecha(ultima.fecha),
          importe(grupo.reduce((s, f) => s + f.cuota, 0)),
          importe(grupo.reduce((s, f) => s + f.interes, 0)),
          importe(grupo.reduce((s, f) => s + f.capital, 0)),
          importe(ultima.saldoFinal),
        ], 'anual')
      );
    }
  } else {
    for (const f of res.filas) {
      const clase = f.fase.startsWith('carencia') ? 'carencia' : f.fase === 'balon' ? 'balon' : '';
      cuerpo.appendChild(
        filaHTML([
          String(f.periodo),
          fecha(f.fecha),
          importe(f.cuota),
          importe(f.interes),
          importe(f.capital),
          importe(f.saldoFinal),
        ], clase)
      );
    }
  }

  const contenedor = $('contenedor-cuadro');
  $('pista-tabla').hidden = $('tabla').scrollWidth <= contenedor.clientWidth;

  pie.appendChild(
    filaHTML([
      'Total',
      '',
      importe(res.resumen.totalCuotas),
      importe(res.resumen.totalIntereses),
      importe(res.parametros.capital),
      importe(0),
    ])
  );
}

function mostrarErrores(lista) {
  const caja = $('errores');
  caja.hidden = lista.length === 0;
  caja.textContent = lista.join(' ');
  $('resultado').style.opacity = lista.length ? '.4' : '1';
  $('bloque-cuadro').style.opacity = lista.length ? '.4' : '1';
}

function recalcular() {
  avisar('');
  const p = leerFormulario();
  actualizarAyudas(p);

  const errores = validar(p);
  if (errores.length) {
    mostrarErrores(errores);
    return;
  }
  try {
    const res = calcular(p);
    ultimoResultado = res;
    mostrarErrores([]);
    pintarResumen(res, p);
    pintarTabla(res);
    try {
      localStorage.setItem(CLAVE_ULTIMO, JSON.stringify(p));
    } catch { /* almacenamiento no disponible (modo privado) */ }
  } catch (e) {
    mostrarErrores([e.message]);
  }
}

/* --- Exportar y compartir ------------------------------------------------- */

function csv(res) {
  const dec = (x) => (x ?? 0).toFixed(2).replace('.', ',');
  const p = res.parametros;
  const lineas = [
    ['Sistema', SISTEMAS[p.sistema]],
    ['Importe', dec(p.capital)],
    ['Tipo anual (%)', String(p.tipoAnual).replace('.', ',')],
    ['Convención', p.convencion === 'efectivo' ? 'Efectivo (tasa equivalente)' : 'Nominal (TIN / periodos)'],
    ['Periodicidad', FRECUENCIAS[p.frecuencia].etiqueta],
    ['Nº de cuotas', String(res.resumen.periodos)],
    ['Carencia', p.carencia ? `${p.carencia} (${p.tipoCarencia})` : 'No'],
    ['Valor residual', dec(res.resumen.valorResidual)],
    ['Gastos iniciales', dec(res.resumen.gastosTotales)],
    ['Intereses totales', dec(res.resumen.totalIntereses)],
    ['Coste total del crédito', dec(res.resumen.costeTotal)],
    ['TAE real (%)', dec((res.resumen.taeReal ?? 0) * 100)],
    [],
    ['Nº', 'Fecha', 'Cuota', 'Intereses', 'Capital', 'Pendiente'],
  ].map((f) => f.join(';'));

  for (const f of res.filas) {
    lineas.push([
      f.periodo,
      f.fecha ? fmtFecha.format(new Date(f.fecha)) : '',
      dec(f.cuota),
      dec(f.interes),
      dec(f.capital),
      dec(f.saldoFinal),
    ].join(';'));
  }
  return '﻿' + lineas.join('\r\n');
}

function nombreFichero(res) {
  const p = res.parametros;
  return `prestamo-${p.sistema}-${Math.round(p.capital)}-${p.frecuencia}.csv`;
}

function avisar(mensaje) {
  $('estado-acciones').textContent = mensaje;
}

const AVISOS_DESCARGA = {
  declined: '',
  rate_limited: 'Hay otra descarga en curso. Espera un momento y vuelve a intentarlo.',
  too_large: 'El cuadro es demasiado grande para descargarlo desde aquí.',
};

/**
 * Descarga el cuadro en CSV. Cuando la página va incrustada en un visor que
 * bloquea las descargas normales (claude.ai), se la pide al anfitrión, que
 * enseña su propia confirmación al usuario.
 */
async function descargarCSV() {
  if (!ultimoResultado) return;
  avisar('');
  const contenido = csv(ultimoResultado);
  const nombre = nombreFichero(ultimoResultado);

  if (window.claude?.downloads?.save) {
    try {
      await window.claude.downloads.save({ filename: nombre, data: contenido });
    } catch (e) {
      // Si el visor no admite la extensión .csv, se ofrece el mismo contenido
      // como texto plano.
      if (e?.code === 'extension_not_enabled') {
        try {
          await window.claude.downloads.save({
            filename: nombre.replace(/\.csv$/, '.txt'),
            data: contenido,
          });
        } catch (e2) {
          avisar(AVISOS_DESCARGA[e2?.code] ?? 'No se ha podido descargar el fichero desde aquí.');
        }
      } else {
        avisar(AVISOS_DESCARGA[e?.code] ?? 'No se ha podido descargar el fichero desde aquí.');
      }
    }
    return;
  }

  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function compartir() {
  if (!ultimoResultado) return;
  const res = ultimoResultado;
  const p = res.parametros;
  const texto =
    `${SISTEMAS[p.sistema]}\n` +
    `${dinero(p.capital)} al ${String(p.tipoAnual).replace('.', ',')} % · ${FRECUENCIAS[p.frecuencia].etiqueta.toLowerCase()} · ${res.resumen.periodos} cuotas\n` +
    `Cuota: ${dinero(res.resumen.cuotaPrimera)}\n` +
    `Intereses: ${dinero(res.resumen.totalIntereses)}\n` +
    `Coste total: ${dinero(res.resumen.costeTotal)}\n` +
    `TAE: ${porcentaje(res.resumen.taeReal, 2)}`;

  const fichero = new File([csv(res)], nombreFichero(res), { type: 'text/csv' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [fichero] })) {
      await navigator.share({ title: 'Cuadro de amortización', text: texto, files: [fichero] });
    } else {
      await navigator.share({ title: 'Cálculo del préstamo', text: texto });
    }
  } catch (e) {
    if (e?.name !== 'AbortError') descargarCSV();
  }
}

/* --- Escenarios guardados ------------------------------------------------- */

function leerEscenarios() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_ESCENARIOS) || '[]');
  } catch {
    return [];
  }
}

function guardarEscenarios(lista) {
  try {
    localStorage.setItem(CLAVE_ESCENARIOS, JSON.stringify(lista));
  } catch {
    alert('No se han podido guardar los escenarios: el almacenamiento del navegador no está disponible.');
  }
}

function guardarEscenario() {
  if (!ultimoResultado) return;
  const res = ultimoResultado;
  const p = res.parametros;
  const sugerido = `${SISTEMAS[p.sistema].split(' ')[0]} ${fmtMonedaCorta.format(p.capital)} · ${String(p.tipoAnual).replace('.', ',')} %`;

  // Algunos contextos (páginas incrustadas en un iframe) bloquean prompt();
  // en ese caso se guarda con el nombre sugerido en lugar de no hacer nada.
  let nombre = sugerido;
  try {
    const respuesta = prompt('Nombre del escenario', sugerido);
    if (respuesta === null) return;
    nombre = respuesta;
  } catch {
    /* diálogos no disponibles */
  }

  const lista = leerEscenarios();
  lista.push({
    id: `e${Date.now()}`,
    nombre: nombre.trim() || sugerido,
    parametros: leerFormulario(),
    resumen: {
      cuota: res.resumen.cuotaPrimera,
      intereses: res.resumen.totalIntereses,
      coste: res.resumen.costeTotal,
      tae: res.resumen.taeReal,
    },
  });
  guardarEscenarios(lista);
  pintarEscenarios();
}

function pintarEscenarios() {
  const lista = leerEscenarios();
  const bloque = $('bloque-escenarios');
  const cuerpo = $('cuerpo-escenarios');
  bloque.hidden = lista.length === 0;
  cuerpo.textContent = '';

  for (const esc of lista) {
    const tr = document.createElement('tr');
    const celdas = [
      esc.nombre,
      dinero(esc.resumen.cuota),
      dinero(esc.resumen.intereses),
      dinero(esc.resumen.coste),
      porcentaje(esc.resumen.tae, 2),
    ];
    for (const c of celdas) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    const acciones = document.createElement('td');
    const contenedor = document.createElement('div');
    contenedor.className = 'acciones-fila';

    const cargar = document.createElement('button');
    cargar.type = 'button';
    cargar.textContent = 'Cargar';
    cargar.addEventListener('click', () => {
      escribirFormulario(esc.parametros);
      recalcular();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    const borrar = document.createElement('button');
    borrar.type = 'button';
    borrar.textContent = 'Borrar';
    borrar.setAttribute('aria-label', `Borrar ${esc.nombre}`);
    borrar.addEventListener('click', () => {
      guardarEscenarios(leerEscenarios().filter((x) => x.id !== esc.id));
      pintarEscenarios();
    });

    contenedor.append(cargar, borrar);
    acciones.appendChild(contenedor);
    tr.appendChild(acciones);
    cuerpo.appendChild(tr);
  }
}

/* --- Arranque ------------------------------------------------------------- */

function inicializar() {
  const hoy = new Date();
  $('fechaInicio').value = hoy.toISOString().slice(0, 10);

  try {
    const guardado = localStorage.getItem(CLAVE_ULTIMO);
    if (guardado) escribirFormulario(JSON.parse(guardado));
  } catch { /* sin almacenamiento: se usan los valores por defecto */ }

  let temporizador;
  const alCambiar = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(recalcular, 120);
  };
  for (const id of CAMPOS) $(id).addEventListener('input', alCambiar);
  for (const radio of document.querySelectorAll('input[name="sistema"]')) {
    radio.addEventListener('change', recalcular);
  }
  $('formulario').addEventListener('submit', (e) => {
    e.preventDefault();
    document.activeElement?.blur();
    recalcular();
  });
  $('agrupar-anual').addEventListener('change', () => ultimoResultado && pintarTabla(ultimoResultado));

  $('btn-csv').addEventListener('click', descargarCSV);
  $('btn-guardar').addEventListener('click', guardarEscenario);
  $('btn-borrar-todo').addEventListener('click', () => {
    if (confirm('¿Borrar todos los escenarios guardados?')) {
      guardarEscenarios([]);
      pintarEscenarios();
    }
  });
  if (navigator.share) {
    $('btn-compartir').hidden = false;
    $('btn-compartir').addEventListener('click', compartir);
  }

  recalcular();
  pintarEscenarios();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {
      $('estado-offline').textContent = 'Uso sin conexión no disponible en este navegador.';
    });
  }
}

inicializar();
