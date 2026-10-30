// ============================================================
// Informe mensual de presupuestos — vista en pantalla
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Sólo dibuja: los números salen de `utils/informePresupuestos.ts`, los
// mismos que lee el PDF.
// ============================================================

import React from 'react';
import {
  fmtFecha,
  variacion,
  type CantidadMonto,
  type InformePresupuestos,
} from '../utils/informePresupuestos';

// ── Formato ─────────────────────────────────────────────────────────────────

const fmtMoneda = (n: number): string =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const fmtNum = (n: number): string => new Intl.NumberFormat('es-AR').format(n);

const fmtPct = (n: number): string =>
  `${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)}%`;

const fmtDias = (n: number | null): string =>
  n === null ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n);

// ── Piezas ──────────────────────────────────────────────────────────────────

const Seccion: React.FC<{ titulo: string; nota?: string; children: React.ReactNode }> = ({ titulo, nota, children }) => (
  <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
    <h3 className="text-sm font-semibold text-gray-800">{titulo}</h3>
    {nota && <p className="text-xs text-gray-500 mt-1">{nota}</p>}
    <div className="mt-3">{children}</div>
  </section>
);

const Variacion: React.FC<{ actual: number; anterior: number }> = ({ actual, anterior }) => {
  const v = variacion(actual, anterior);
  if (v === null) return <span className="text-xs text-gray-400">sin base para comparar</span>;
  return (
    <span className={`text-xs font-semibold ${v >= 0 ? 'text-green-600' : 'text-red-600'}`}>
      {v >= 0 ? '▲ +' : '▼ '}{fmtPct(v)} vs mes ant.
    </span>
  );
};

const Kpi: React.FC<{
  label: string;
  actual: CantidadMonto | null;
  anterior: CantidadMonto | null;
  sinDato?: string;
}> = ({ label, actual, anterior, sinDato }) => (
  <div className="bg-gray-50 rounded-lg p-3">
    <p className="text-xs text-gray-500 mb-1">{label}</p>
    {actual === null ? (
      <p className="text-sm text-gray-500">{sinDato}</p>
    ) : (
      <>
        <p className="text-lg font-bold text-gray-900">{fmtMoneda(actual.neto)}</p>
        <p className="text-xs text-gray-600">{fmtNum(actual.cantidad)} presupuestos</p>
        {anterior !== null && <Variacion actual={actual.neto} anterior={anterior.neto} />}
      </>
    )}
  </div>
);

const Th: React.FC<{ children?: React.ReactNode; izq?: boolean }> = ({ children, izq }) => (
  <th className={`px-2 py-1.5 text-xs font-medium text-gray-500 ${izq ? 'text-left' : 'text-right'}`}>{children}</th>
);

const Td: React.FC<{ children?: React.ReactNode; izq?: boolean; fuerte?: boolean }> = ({ children, izq, fuerte }) => (
  <td className={`px-2 py-1.5 text-sm ${izq ? 'text-left' : 'text-right tabular-nums'} ${fuerte ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
    {children}
  </td>
);

const Tabla: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="overflow-x-auto">
    <table className="w-full border-collapse">{children}</table>
  </div>
);

const Vacio: React.FC<{ texto: string }> = ({ texto }) => <p className="text-sm text-gray-500">{texto}</p>;

const SIN_ACEPTACION = 'Se registra desde julio 2026';

// ── Vista ───────────────────────────────────────────────────────────────────

const InformePresupuestosVista: React.FC<{ informe: InformePresupuestos }> = ({ informe: inf }) => {
  const { resumen: r, resumenAnterior: ra } = inf;

  return (
    <div className="space-y-4">
      <Seccion titulo={`Resumen · ${inf.label}`} nota={`Comparado con ${inf.labelAnterior}. Montos: neto que paga el paciente, sin IVA.`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Convertidos (operados, respaldo GECLISA)" actual={r.convertidos} anterior={ra.convertidos} />
          <Kpi label="Aceptados en el mes" actual={r.aceptados} anterior={ra.aceptados} sinDato={SIN_ACEPTACION} />
          <Kpi label="Cartera: aceptados sin operar al cierre" actual={r.cartera} anterior={ra.cartera} sinDato={SIN_ACEPTACION} />
          <Kpi label="Presupuestos entregados" actual={r.entregados} anterior={ra.entregados} />
        </div>
      </Seccion>

      <Seccion
        titulo="Ranking de presupuestadoras"
        nota="Por monto convertido en el mes. «1.ª semana»: parte del monto que se operó dentro de los 7 días de la entrega (llega con la cirugía decidida)."
      >
        {inf.ranking.length === 0 ? <Vacio texto="No hubo cirugías convertidas en el mes." /> : (
          <Tabla>
            <thead className="border-b border-gray-200">
              <tr>
                <Th izq>#</Th><Th izq>Presupuestadora</Th><Th>Cirugías</Th><Th>Monto neto</Th><Th>% total</Th>
                <Th>1.ª semana</Th><Th>Mediana días</Th><Th>Aceptados</Th><Th>Cobertura OS</Th>
              </tr>
            </thead>
            <tbody>
              {inf.ranking.map((f, i) => (
                <tr key={f.clave || '-'} className="border-b border-gray-100">
                  <Td izq>{i + 1}</Td>
                  <Td izq fuerte>{f.nombre}</Td>
                  <Td>{fmtNum(f.cirugias)}</Td>
                  <Td fuerte>{fmtMoneda(f.neto)}</Td>
                  <Td>{fmtPct(f.pctTotal)}</Td>
                  <Td>{f.cirugias ? fmtPct(f.pctPrimeraSemana) : '—'}</Td>
                  <Td>{fmtDias(f.medianaDias)}</Td>
                  <Td>{f.aceptados === null ? '—' : fmtNum(f.aceptados)}</Td>
                  <Td>{fmtMoneda(f.cobertura)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Seccion>

      <Seccion titulo="Por cobertura" nota="Obra social = el presupuesto descontó cobertura. Un afiliado que pagó todo cuenta como particular.">
        {r.convertidos.cantidad === 0 ? <Vacio texto="Sin cirugías en el mes." /> : (
          <Tabla>
            <thead className="border-b border-gray-200">
              <tr><Th izq>Cobertura</Th><Th>Cirugías</Th><Th>Monto neto</Th><Th>% total</Th><Th>Cobertura OS</Th></tr>
            </thead>
            <tbody>
              {[inf.obraSocial, inf.particular].map((f) => (
                <tr key={f.nombre} className="border-b border-gray-100">
                  <Td izq fuerte>{f.nombre}</Td><Td>{fmtNum(f.cirugias)}</Td><Td fuerte>{fmtMoneda(f.neto)}</Td>
                  <Td>{fmtPct(f.pctTotal)}</Td><Td>{fmtMoneda(f.cobertura)}</Td>
                </tr>
              ))}
              {inf.porObraSocial.map((f) => (
                <tr key={'os-' + f.nombre} className="border-b border-gray-50">
                  <Td izq><span className="pl-4 text-gray-600">{f.nombre}</span></Td><Td>{fmtNum(f.cirugias)}</Td>
                  <Td>{fmtMoneda(f.neto)}</Td><Td>{fmtPct(f.pctTotal)}</Td><Td>{fmtMoneda(f.cobertura)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Seccion>

      <Seccion titulo="Por cirujano">
        {inf.cirujanos.length === 0 ? <Vacio texto="Sin cirugías en el mes." /> : (
          <Tabla>
            <thead className="border-b border-gray-200">
              <tr><Th izq>Cirujano</Th><Th>Cirugías</Th><Th>Monto neto</Th><Th>% total</Th><Th>Mediana días</Th></tr>
            </thead>
            <tbody>
              {inf.cirujanos.map((f) => (
                <tr key={f.clave || '-'} className="border-b border-gray-100">
                  <Td izq fuerte>{f.nombre}</Td><Td>{fmtNum(f.cirugias)}</Td><Td fuerte>{fmtMoneda(f.neto)}</Td>
                  <Td>{fmtPct(f.pctTotal)}</Td><Td>{fmtDias(f.medianaDias)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Seccion>

      <Seccion titulo="Tiempo a la práctica" nota="De la entrega del presupuesto (o su creación, si no se registró la entrega) a la cirugía en GECLISA.">
        <Tabla>
          <thead className="border-b border-gray-200">
            <tr><Th izq>Tramo</Th><Th>Cirugías</Th><Th>Monto neto</Th><Th>% del monto</Th></tr>
          </thead>
          <tbody>
            {inf.tramos.map((f) => (
              <tr key={f.tramo} className="border-b border-gray-100">
                <Td izq fuerte>{f.tramo}</Td><Td>{fmtNum(f.cirugias)}</Td><Td>{fmtMoneda(f.neto)}</Td><Td>{fmtPct(f.pctNeto)}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Seccion>

      <Seccion
        titulo="Conversión por mes de entrega"
        nota="De los presupuestos entregados cada mes, cuántos ya se operaron a hoy. «En curso»: menos de 60 días desde el fin del mes, la tasa todavía sube."
      >
        <Tabla>
          <thead className="border-b border-gray-200">
            <tr><Th izq>Mes de entrega</Th><Th>Entregados</Th><Th>Operados</Th><Th>Tasa</Th><Th>Monto operado</Th><Th izq /></tr>
          </thead>
          <tbody>
            {inf.cohortes.map((f) => (
              <tr key={f.label} className="border-b border-gray-100">
                <Td izq fuerte>{f.label}</Td><Td>{fmtNum(f.entregados)}</Td><Td>{fmtNum(f.convertidos)}</Td>
                <Td fuerte>{fmtPct(f.tasa)}</Td><Td>{fmtMoneda(f.netoConvertido)}</Td>
                <Td izq>{f.enCurso && <span className="text-xs bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded">en curso</span>}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Seccion>

      <Seccion titulo={`Cartera: aceptados sin operar al cierre de ${inf.label}`}>
        {r.cartera === null ? <Vacio texto={SIN_ACEPTACION} /> : inf.cartera.length === 0 ? <Vacio texto="No hay aceptados pendientes de operar." /> : (
          <Tabla>
            <thead className="border-b border-gray-200">
              <tr><Th izq>Presupuesto</Th><Th izq>Paciente</Th><Th izq>Práctica</Th><Th izq>Presupuestadora</Th><Th izq>Cirujano</Th><Th>Aceptado</Th><Th>Días</Th><Th>Monto neto</Th></tr>
            </thead>
            <tbody>
              {inf.cartera.map((f) => (
                <tr key={f.numero} className="border-b border-gray-100">
                  <Td izq fuerte>{f.numero}</Td><Td izq>{f.paciente}</Td><Td izq>{f.prestacion}</Td><Td izq>{f.presupuestadora}</Td>
                  <Td izq>{f.cirujano}</Td><Td>{fmtFecha(f.fechaAceptacion)}</Td><Td>{fmtNum(f.diasDesdeAceptacion)}</Td><Td>{fmtMoneda(f.neto)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Seccion>

      <Seccion
        titulo="Practicados sin respaldo en GECLISA"
        nota="Marcados practicados a mano con fecha en el mes, sin la práctica facturada en GECLISA. No suman en ningún número del informe: revisar."
      >
        {inf.sinRespaldo.length === 0 ? <Vacio texto="Ninguno en el mes." /> : (
          <Tabla>
            <thead className="border-b border-gray-200">
              <tr><Th izq>Presupuesto</Th><Th izq>Paciente</Th><Th izq>Práctica</Th><Th izq>Presupuestadora</Th><Th izq>Cirujano</Th><Th>Fecha marcada</Th><Th>Monto neto</Th></tr>
            </thead>
            <tbody>
              {inf.sinRespaldo.map((f) => (
                <tr key={f.numero} className="border-b border-gray-100">
                  <Td izq fuerte>{f.numero}</Td><Td izq>{f.paciente}</Td><Td izq>{f.prestacion}</Td><Td izq>{f.presupuestadora}</Td>
                  <Td izq>{f.cirujano}</Td><Td>{fmtFecha(f.fechaPractica)}</Td><Td>{fmtMoneda(f.neto)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Seccion>
    </div>
  );
};

export default InformePresupuestosVista;
