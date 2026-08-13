/**
 * Motor de cálculo financiero de préstamos.
 *
 * Sistemas soportados:
 *   - frances    : cuota total constante (capital creciente, intereses decrecientes)
 *   - aleman     : cuota de capital constante (cuota total decreciente)
 *   - americano  : solo intereses cada periodo y devolución del principal al vencimiento
 *
 * Admite valor residual (pago balón) en francés y alemán, carencia inicial
 * parcial (solo intereses) o total (los intereses se capitalizan), comisión de
 * apertura y gastos iniciales, con cálculo de la TAE real.
 *
 * Módulo puro: sin dependencias y sin acceso al DOM, para poder probarlo con
 * `node --test`.
 */

export const FRECUENCIAS = {
  mensual: { periodosPorAno: 12, meses: 1, etiqueta: 'Mensual' },
  trimestral: { periodosPorAno: 4, meses: 3, etiqueta: 'Trimestral' },
  semestral: { periodosPorAno: 2, meses: 6, etiqueta: 'Semestral' },
  anual: { periodosPorAno: 1, meses: 12, etiqueta: 'Anual' },
};

export const SISTEMAS = {
  frances: 'Francés (cuota constante)',
  aleman: 'Alemán (capital constante)',
  americano: 'Americano (solo intereses)',
};

/** Redondeo a céntimos evitando los errores clásicos de coma flotante. */
export function r2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/**
 * Convierte el tipo de interés anual en la tasa del periodo de pago.
 *
 * - `nominal`: convención bancaria española. TIN / número de periodos.
 *   6 % anual con pago trimestral -> 1,5 % por trimestre.
 * - `efectivo`: el tipo introducido es una tasa anual efectiva (TAE) y se
 *   busca la tasa periódica equivalente.
 *   6 % anual con pago trimestral -> (1,06)^(1/4) - 1 = 1,4674 % por trimestre.
 */
export function tasaPeriodica(tipoAnualPct, periodosPorAno, convencion = 'nominal') {
  const t = tipoAnualPct / 100;
  if (convencion === 'efectivo') return Math.pow(1 + t, 1 / periodosPorAno) - 1;
  return t / periodosPorAno;
}

/** Tasa anual efectiva equivalente a una tasa periódica. */
export function tasaAnualEfectiva(tasaPeriodo, periodosPorAno) {
  return Math.pow(1 + tasaPeriodo, periodosPorAno) - 1;
}

/**
 * Cuota constante (sistema francés) que amortiza `saldo` en `n` periodos
 * dejando pendiente un valor residual `residual` al vencimiento.
 *
 *   saldo = cuota · a(n,i) + residual · (1+i)^-n
 */
export function cuotaFrancesa(saldo, tasa, n, residual = 0) {
  if (n <= 0) return 0;
  if (tasa === 0) return (saldo - residual) / n;
  const v = Math.pow(1 + tasa, -n);
  return ((saldo - residual * v) * tasa) / (1 - v);
}

/** Rejilla de tasas donde buscar el cambio de signo del VAN. */
const REJILLA_TIR = [
  -0.99, -0.95, -0.9, -0.8, -0.7, -0.6, -0.5, -0.4, -0.3, -0.2, -0.1, -0.05,
  -0.02, -0.005, 0, 0.005, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 1, 2, 5, 10,
];

/**
 * Tasa interna de rentabilidad de una serie de flujos `flujos[k]` situados en
 * el periodo k (k = 0 es hoy).
 *
 * Primero se recorre una rejilla para acotar el primer cambio de signo y luego
 * se bisecciona ese intervalo. Es más lento que Newton pero no diverge, y en
 * plazos largos evita el desbordamiento a infinito que produce evaluar el VAN
 * en tasas cercanas a -100 %.
 * Devuelve `null` si no encuentra ningún cambio de signo.
 */
export function tir(flujos, iteraciones = 200) {
  const van = (r) => flujos.reduce((acc, f, k) => acc + f / Math.pow(1 + r, k), 0);

  let lo = null;
  let hi = null;
  let vLo = 0;
  let vHi = 0;
  let anterior = null;
  for (const r of REJILLA_TIR) {
    const v = van(r);
    if (!isFinite(v)) continue;
    if (v === 0) return r;
    if (anterior && anterior.v * v < 0) {
      lo = anterior.r;
      vLo = anterior.v;
      hi = r;
      vHi = v;
      break;
    }
    anterior = { r, v };
  }
  if (lo === null) return null;

  for (let k = 0; k < iteraciones; k++) {
    const medio = (lo + hi) / 2;
    const vMedio = van(medio);
    if (vMedio === 0) return medio;
    if (vLo * vMedio < 0) {
      hi = medio;
      vHi = vMedio;
    } else {
      lo = medio;
      vLo = vMedio;
    }
  }
  return (lo + hi) / 2;
}

/** Suma `meses` a una fecha ajustando el día si el mes destino es más corto. */
export function sumarMeses(fecha, meses) {
  const d = new Date(fecha.getTime());
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + meses);
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimoDia));
  return d;
}

/**
 * Comprueba los datos de entrada. Devuelve un array de mensajes de error
 * (vacío si todo es correcto).
 */
export function validar(p) {
  const errores = [];
  const capital = Number(p.capital);
  const tipoAnual = Number(p.tipoAnual);
  const anos = Number(p.anos);
  const residual = Number(p.residual || 0);
  const carencia = Number(p.carencia || 0);

  if (!(capital > 0)) errores.push('El importe del préstamo debe ser mayor que cero.');
  if (!isFinite(tipoAnual) || tipoAnual < 0) errores.push('El tipo de interés no puede ser negativo.');
  if (tipoAnual > 100) errores.push('El tipo de interés debe expresarse en porcentaje (por ejemplo 3,5).');
  if (!(anos > 0)) errores.push('El plazo debe ser mayor que cero.');
  if (!FRECUENCIAS[p.frecuencia]) errores.push('Periodicidad de pago no válida.');
  if (!SISTEMAS[p.sistema]) errores.push('Sistema de amortización no válido.');

  if (FRECUENCIAS[p.frecuencia] && anos > 0) {
    const n = Math.round(anos * FRECUENCIAS[p.frecuencia].periodosPorAno);
    if (n < 1) errores.push('El plazo es demasiado corto para la periodicidad elegida: no llega a una cuota.');
    if (carencia < 0 || !Number.isFinite(carencia)) errores.push('La carencia no puede ser negativa.');
    if (carencia >= n) errores.push('La carencia debe ser menor que el número total de cuotas.');
  }

  if (p.sistema !== 'americano') {
    if (residual < 0) errores.push('El valor residual no puede ser negativo.');
    if (capital > 0 && residual >= capital) {
      errores.push('El valor residual debe ser menor que el importe del préstamo.');
    }
  }
  return errores;
}

/**
 * Calcula el cuadro de amortización completo.
 *
 * Parámetros esperados:
 *   capital, tipoAnual (%), convencion ('nominal'|'efectivo'),
 *   sistema ('frances'|'aleman'|'americano'), frecuencia (clave de FRECUENCIAS),
 *   anos, residual, carencia (nº de periodos), tipoCarencia ('parcial'|'total'),
 *   comisionAperturaPct, gastosIniciales, fechaInicio (Date | string ISO).
 */
export function calcular(p) {
  const errores = validar(p);
  if (errores.length) throw new Error(errores.join(' '));

  const frec = FRECUENCIAS[p.frecuencia];
  const periodosPorAno = frec.periodosPorAno;
  const capital = Number(p.capital);
  const n = Math.round(Number(p.anos) * periodosPorAno);
  const tasa = tasaPeriodica(Number(p.tipoAnual), periodosPorAno, p.convencion);
  const carencia = Math.min(Math.max(Math.round(Number(p.carencia || 0)), 0), n - 1);
  const tipoCarencia = p.tipoCarencia === 'total' ? 'total' : 'parcial';
  // En el sistema americano el "valor residual" es, por definición, todo el principal.
  const residual = p.sistema === 'americano' ? 0 : Number(p.residual || 0);

  const fechaInicio = p.fechaInicio ? new Date(p.fechaInicio) : null;
  const fechaCuota = (k) =>
    fechaInicio && !isNaN(fechaInicio) ? sumarMeses(fechaInicio, frec.meses * (k - 1)) : null;

  const filas = [];
  let saldo = r2(capital);

  // --- Fase de carencia -----------------------------------------------------
  for (let k = 1; k <= carencia; k++) {
    const interes = r2(saldo * tasa);
    const saldoInicial = saldo;
    let cuota;
    let amortizado;
    if (tipoCarencia === 'total') {
      // No se paga nada: el interés se capitaliza y engorda la deuda.
      cuota = 0;
      amortizado = r2(-interes);
      saldo = r2(saldo + interes);
    } else {
      cuota = interes;
      amortizado = 0;
    }
    filas.push({
      periodo: k,
      fecha: fechaCuota(k),
      fase: `carencia-${tipoCarencia}`,
      saldoInicial,
      cuota,
      interes,
      capital: amortizado,
      balon: 0,
      saldoFinal: saldo,
    });
  }

  // --- Fase de amortización -------------------------------------------------
  const m = n - carencia;
  const saldoTrasCarencia = saldo;

  if (p.sistema !== 'americano' && residual >= saldoTrasCarencia) {
    throw new Error(
      'Tras la carencia el valor residual sería igual o mayor que la deuda pendiente: el préstamo no llegaría a amortizarse.'
    );
  }

  let cuotaTeorica = 0;
  let capitalFijo = 0;
  if (p.sistema === 'frances') {
    cuotaTeorica = cuotaFrancesa(saldoTrasCarencia, tasa, m, residual);
  } else if (p.sistema === 'aleman') {
    capitalFijo = (saldoTrasCarencia - residual) / m;
  }

  for (let j = 1; j <= m; j++) {
    const k = carencia + j;
    const ultima = j === m;
    const saldoInicial = saldo;
    const interes = r2(saldo * tasa);
    let amortizado;

    if (p.sistema === 'americano') {
      amortizado = 0;
    } else if (p.sistema === 'frances') {
      amortizado = r2(r2(cuotaTeorica) - interes);
    } else {
      amortizado = r2(capitalFijo);
    }

    // La última cuota absorbe los redondeos acumulados y deja el saldo en el
    // valor residual pactado.
    if (ultima) amortizado = r2(saldo - (p.sistema === 'americano' ? saldo : residual));
    if (amortizado > saldo) amortizado = saldo;

    const balon = ultima ? r2(p.sistema === 'americano' ? saldo - amortizado : residual) : 0;
    saldo = r2(saldo - amortizado - balon);

    filas.push({
      periodo: k,
      fecha: fechaCuota(k),
      fase: ultima && balon > 0 ? 'balon' : 'amortizacion',
      saldoInicial,
      cuota: r2(interes + amortizado + balon),
      interes,
      capital: r2(amortizado + balon),
      balon,
      saldoFinal: saldo,
    });
  }

  // --- Resumen --------------------------------------------------------------
  const totalIntereses = r2(filas.reduce((s, f) => s + f.interes, 0));
  const totalCuotas = r2(filas.reduce((s, f) => s + f.cuota, 0));
  const comisionApertura = r2((capital * Number(p.comisionAperturaPct || 0)) / 100);
  const gastosIniciales = r2(Number(p.gastosIniciales || 0));
  const gastosTotales = r2(comisionApertura + gastosIniciales);

  const cuotasAmortizacion = filas.filter((f) => f.fase !== 'carencia-total');
  const importes = cuotasAmortizacion.map((f) => f.cuota);
  const cuotaPrimera = importes.length ? importes[0] : 0;
  const cuotaUltima = importes.length ? importes[importes.length - 1] : 0;
  const cuotaMinima = importes.length ? Math.min(...importes) : 0;
  const cuotaMaxima = importes.length ? Math.max(...importes) : 0;

  // TAE real: se recibe el capital menos los gastos y se devuelven las cuotas.
  const flujos = [r2(capital - gastosTotales)];
  for (const f of filas) flujos.push(-f.cuota);
  const tirPeriodica = tir(flujos);
  const taeReal = tirPeriodica === null ? null : tasaAnualEfectiva(tirPeriodica, periodosPorAno);

  return {
    parametros: {
      ...p,
      capital,
      residual,
      carencia,
      tipoCarencia,
      periodos: n,
      periodosPorAno,
      m,
    },
    resumen: {
      tasaPeriodica: tasa,
      periodos: n,
      periodosPorAno,
      cuotaPrimera,
      cuotaUltima,
      cuotaMinima,
      cuotaMaxima,
      cuotaConstante: p.sistema === 'frances' && carencia === 0,
      totalIntereses,
      totalCuotas,
      comisionApertura,
      gastosIniciales,
      gastosTotales,
      costeTotal: r2(totalIntereses + gastosTotales),
      totalDesembolsado: r2(totalCuotas + gastosTotales),
      valorResidual: p.sistema === 'americano' ? capital : residual,
      taeSinGastos: tasaAnualEfectiva(tasa, periodosPorAno),
      taeReal,
    },
    filas,
  };
}
