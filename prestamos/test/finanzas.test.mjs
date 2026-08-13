import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcular,
  cuotaFrancesa,
  tasaPeriodica,
  tasaAnualEfectiva,
  tir,
  sumarMeses,
  validar,
  r2,
} from '../finanzas.js';

const base = {
  capital: 100000,
  tipoAnual: 6,
  convencion: 'nominal',
  sistema: 'frances',
  frecuencia: 'mensual',
  anos: 10,
  residual: 0,
  carencia: 0,
  tipoCarencia: 'parcial',
  comisionAperturaPct: 0,
  gastosIniciales: 0,
  fechaInicio: '2026-01-31',
};

const cerca = (a, b, tol = 0.02) =>
  assert.ok(Math.abs(a - b) <= tol, `esperaba ${b} ± ${tol}, obtuve ${a}`);

test('conversión de tipo nominal frente a efectivo', () => {
  cerca(tasaPeriodica(6, 4, 'nominal'), 0.015, 1e-12);
  cerca(tasaPeriodica(6, 4, 'efectivo'), Math.pow(1.06, 0.25) - 1, 1e-12);
  cerca(tasaAnualEfectiva(0.015, 4), 0.06136355, 1e-6);
  // Con convención efectiva, la TAE devuelta debe coincidir con el tipo introducido.
  cerca(tasaAnualEfectiva(tasaPeriodica(6, 12, 'efectivo'), 12), 0.06, 1e-12);
});

test('cuota francesa contra el valor de referencia', () => {
  // 100.000 € al 6 % nominal a 10 años mensual -> 1.110,21 €/mes
  cerca(cuotaFrancesa(100000, 0.06 / 12, 120), 1110.21);
  // Tipo cero: reparto lineal del capital.
  cerca(cuotaFrancesa(12000, 0, 12), 1000, 1e-9);
});

test('francés: cuota constante y saldo que cierra en cero', () => {
  const { filas, resumen } = calcular(base);
  assert.equal(filas.length, 120);
  cerca(resumen.cuotaPrimera, 1110.21);
  // Todas las cuotas iguales salvo el ajuste de redondeo de la última.
  const distintas = new Set(filas.slice(0, -1).map((f) => f.cuota));
  assert.equal(distintas.size, 1);
  assert.equal(filas.at(-1).saldoFinal, 0);
  cerca(resumen.totalIntereses, 33224.6, 1);
  // El capital amortizado suma exactamente el principal.
  cerca(r2(filas.reduce((s, f) => s + f.capital, 0)), 100000, 0.01);
  // Los intereses decrecen y el capital crece, cuota a cuota.
  for (let k = 1; k < filas.length; k++) {
    assert.ok(filas[k].interes <= filas[k - 1].interes);
    assert.ok(filas[k].capital >= filas[k - 1].capital);
  }
});

test('alemán: capital constante y cuota decreciente', () => {
  const { filas } = calcular({ ...base, sistema: 'aleman', frecuencia: 'anual', anos: 5 });
  assert.equal(filas.length, 5);
  for (const f of filas) cerca(f.capital, 20000);
  cerca(filas[0].cuota, 26000); // 20.000 + 6 % de 100.000
  cerca(filas[4].cuota, 21200); // 20.000 + 6 % de 20.000
  assert.equal(filas.at(-1).saldoFinal, 0);
  for (let k = 1; k < filas.length; k++) assert.ok(filas[k].cuota < filas[k - 1].cuota);
});

test('americano: solo intereses y devolución del principal al vencimiento', () => {
  const { filas, resumen } = calcular({ ...base, sistema: 'americano', frecuencia: 'anual', anos: 5 });
  assert.equal(filas.length, 5);
  for (const f of filas.slice(0, -1)) {
    cerca(f.cuota, 6000);
    assert.equal(f.capital, 0);
    cerca(f.saldoFinal, 100000);
  }
  cerca(filas.at(-1).cuota, 106000);
  cerca(filas.at(-1).balon, 100000);
  assert.equal(filas.at(-1).saldoFinal, 0);
  cerca(resumen.totalIntereses, 30000);
  cerca(resumen.valorResidual, 100000);
});

test('valor residual: la deuda queda en el balón pactado antes del último pago', () => {
  const res = calcular({ ...base, residual: 30000, frecuencia: 'anual', anos: 5 });
  const ultima = res.filas.at(-1);
  cerca(ultima.saldoInicial - ultima.interes * 0, ultima.saldoInicial); // saldo antes del balón
  cerca(res.filas.at(-2).saldoFinal, 30000 + (ultima.capital - ultima.balon), 0.02);
  cerca(ultima.balon, 30000);
  assert.equal(ultima.saldoFinal, 0);
  // Con balón se paga menos capital cada año, así que la cuota ordinaria baja.
  const sinResidual = calcular({ ...base, frecuencia: 'anual', anos: 5 });
  assert.ok(res.filas[0].cuota < sinResidual.filas[0].cuota);
});

test('carencia parcial: solo intereses y deuda intacta', () => {
  const { filas } = calcular({ ...base, frecuencia: 'anual', anos: 5, carencia: 2, tipoCarencia: 'parcial' });
  cerca(filas[0].cuota, 6000);
  assert.equal(filas[0].capital, 0);
  cerca(filas[1].saldoFinal, 100000);
  // Quedan 3 cuotas para amortizar los 100.000.
  cerca(filas[2].cuota, cuotaFrancesa(100000, 0.06, 3));
  assert.equal(filas.at(-1).saldoFinal, 0);
});

test('carencia total: los intereses se capitalizan', () => {
  const { filas } = calcular({ ...base, frecuencia: 'anual', anos: 5, carencia: 2, tipoCarencia: 'total' });
  assert.equal(filas[0].cuota, 0);
  cerca(filas[0].saldoFinal, 106000);
  cerca(filas[1].saldoFinal, 112360);
  cerca(filas[2].saldoInicial, 112360);
  assert.equal(filas.at(-1).saldoFinal, 0);
});

test('TAE: sin gastos coincide con la tasa equivalente; con gastos sube', () => {
  const sinGastos = calcular({ ...base, frecuencia: 'anual', anos: 5 });
  cerca(sinGastos.resumen.taeSinGastos, 0.06, 1e-6);
  cerca(sinGastos.resumen.taeReal, 0.06, 1e-4);

  const conGastos = calcular({
    ...base,
    frecuencia: 'anual',
    anos: 5,
    comisionAperturaPct: 1,
    gastosIniciales: 500,
  });
  assert.ok(conGastos.resumen.taeReal > conGastos.resumen.taeSinGastos);
  cerca(conGastos.resumen.gastosTotales, 1500);
  cerca(conGastos.resumen.costeTotal, conGastos.resumen.totalIntereses + 1500);
});

test('tir resuelve un caso conocido', () => {
  // 1.000 hoy contra 12 pagos de 88,85 -> 1 % periódico.
  const flujos = [1000, ...Array(12).fill(-88.85)];
  cerca(tir(flujos), 0.01, 1e-4);
  assert.equal(tir([100, 200]), null); // sin cambio de signo
});

test('las fechas respetan la periodicidad y los meses cortos', () => {
  const { filas } = calcular({ ...base, frecuencia: 'trimestral', anos: 1, fechaInicio: '2026-01-31' });
  const iso = (d) => d.toISOString().slice(0, 10);
  assert.deepEqual(filas.map((f) => iso(f.fecha)), [
    '2026-01-31',
    '2026-04-30',
    '2026-07-31',
    '2026-10-31',
  ]);
  assert.equal(iso(sumarMeses(new Date('2026-01-31'), 1)), '2026-02-28');
});

test('validaciones de entrada', () => {
  assert.ok(validar({ ...base, capital: 0 }).length);
  assert.ok(validar({ ...base, anos: 0 }).length);
  assert.ok(validar({ ...base, tipoAnual: -1 }).length);
  assert.ok(validar({ ...base, residual: 100000 }).length);
  assert.ok(validar({ ...base, carencia: 120 }).length);
  assert.equal(validar(base).length, 0);
  assert.throws(() => calcular({ ...base, capital: -5 }));
});

test('tipo de interés cero', () => {
  const { filas, resumen } = calcular({ ...base, tipoAnual: 0, frecuencia: 'anual', anos: 4 });
  assert.equal(resumen.totalIntereses, 0);
  for (const f of filas) cerca(f.cuota, 25000);
  assert.equal(filas.at(-1).saldoFinal, 0);
});

test('el total desembolsado cuadra con capital, intereses y gastos', () => {
  for (const sistema of ['frances', 'aleman', 'americano']) {
    for (const frecuencia of ['mensual', 'trimestral', 'semestral', 'anual']) {
      const res = calcular({ ...base, sistema, frecuencia, anos: 7, comisionAperturaPct: 0.5 });
      cerca(
        res.resumen.totalDesembolsado,
        res.parametros.capital + res.resumen.totalIntereses + res.resumen.gastosTotales,
        0.05
      );
      assert.equal(res.filas.at(-1).saldoFinal, 0, `${sistema}/${frecuencia}`);
    }
  }
});
