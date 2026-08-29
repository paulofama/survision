// ============================================================
// Panel de costos de una prestación — Prestaciones Realizadas
// ============================================================
//
// Se abre desde la fila de una atención y muestra qué consume esa práctica:
// los pools que la alcanzan y los insumos directos con cantidad y precio.
//
// QUÉ MUESTRA Y A QUIÉN
// ---------------------
// Solo COSTO de insumos y pools, gateado por el permiso `insumos` — que es el
// mismo que ya da acceso a /recetas-costos, así que no expone nada nuevo.
// NO muestra honorarios ni margen: eso es `analisis_marginal`, que hoy tiene
// una sola persona, y los honorarios dejan ver cuánto cobra cada médico.
//
// EL COSTO ES POR PRÁCTICA, NO POR ATENCIÓN
// -----------------------------------------
// La receta vale lo mismo en la faco de $283.000 que en la de $6.513.000. Por
// eso el encabezado dice "Costo estándar de la práctica" y no "costo de esta
// cirugía": son cosas distintas y la diferencia importa.
//
// LA SEÑAL
// --------
// Cuando lo facturado se dispara contra el costo estándar, casi siempre es que
// se usó un insumo más caro que el de la receta. Las 47 cataratas de 2026 están
// todas con el código de LIO Básico y van de $283.000 a $6.513.000: las caras
// llevan un lente premium que tiene su propio código en GECLISA. El panel lo
// marca en ámbar para que se vea sin tener que ir a buscarlo.
// ============================================================

import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Info, Layers, Package, XCircle } from 'lucide-react';
import { useCostoPrestacion } from '@shared/hooks/useCostoPrestacion';

/**
 * A partir de acá se marca la fila. Doce veces el costo estándar es mucho más
 * de lo que explica un arancel distinto: sugiere otro insumo.
 */
const RATIO_LLAMATIVO = 12;

const money = (n: number): string =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);

/** Cantidades como 0.3333 se muestran con decimales; las enteras, sin. */
const cant = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');

interface Props {
  codigo: string | null | undefined;
  nombre: string | null | undefined;
  facturado: number;
  colSpan: number;
  /** El permiso `insumos` del usuario. Sin él, el panel no se abre. */
  puedeVerCostos: boolean;
}

const PanelCostoPrestacion: React.FC<Props> = ({ codigo, nombre, facturado, colSpan, puedeVerCostos }) => {
  const { costo, loading, error, sinReceta } = useCostoPrestacion(codigo, nombre, facturado, puedeVerCostos);

  const celda = (contenido: React.ReactNode, clase = 'bg-slate-50') => (
    <tr className={clase}>
      <td colSpan={colSpan} className="px-6 py-3 border-y border-slate-200">{contenido}</td>
    </tr>
  );

  if (!puedeVerCostos) {
    return celda(
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span>No tenés permiso para ver los costos de las prácticas.</span>
      </div>,
    );
  }

  if (loading) {
    return celda(
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <div className="w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <span>Cargando el costo de la práctica…</span>
      </div>,
    );
  }

  if (error) {
    return celda(
      <div className="flex items-center gap-2 text-xs text-red-700">
        <XCircle className="w-3.5 h-3.5 shrink-0" />
        <span>No se pudo cargar el costo: {error}</span>
      </div>,
      'bg-red-50',
    );
  }

  if (sinReceta || !costo) {
    return celda(
      <div className="flex items-start gap-2 text-xs text-amber-800">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Esta práctica no tiene receta de costos cargada.</p>
          <p className="mt-0.5 text-amber-700">
            Se computa con costo cero, así que su margen aparece más alto de lo real.{' '}
            <Link to="/recetas-costos" className="underline hover:text-amber-900">Cargar la receta</Link>
          </p>
        </div>
      </div>,
      'bg-amber-50',
    );
  }

  const llamativo = costo.ratio !== null && costo.ratio >= RATIO_LLAMATIVO;

  return (
    <tr className="bg-slate-50">
      <td colSpan={colSpan} className="px-6 py-4 border-y border-slate-200">
        {/* Encabezado: qué receta matcheó y cuánto suma */}
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div className="min-w-0">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">Costo estándar de la práctica</span>
            <p className="text-sm font-semibold text-slate-800 truncate">
              <span className="font-mono text-xs text-slate-400 mr-2">{costo.codigoReceta}</span>
              {costo.nombreReceta}
            </p>
          </div>
          <div className="text-right">
            <span className="text-lg font-bold text-slate-800 tabular-nums">{money(costo.costoTotal)}</span>
            <p className="text-[11px] text-slate-500">
              pools {money(costo.costoPools)} · insumos {money(costo.costoInsumos)}
            </p>
          </div>
        </div>

        {llamativo && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <p className="font-medium">
                Se facturó {costo.ratio!.toFixed(0)} veces el costo estándar ({money(facturado)} contra {money(costo.costoTotal)}).
              </p>
              <p className="mt-0.5 text-amber-800">
                Puede que se haya usado un insumo más caro que el de esta receta —por ejemplo un lente
                premium en vez del básico—. Si es así, conviene facturar con el código que corresponde
                para que el costo salga bien.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Pools */}
          <div>
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
              <Layers className="w-3 h-3" /> Pools ({costo.pools.length})
            </p>
            {costo.pools.length === 0 ? (
              <p className="text-xs text-slate-400">Sin pools asignados.</p>
            ) : (
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-200">
                  {costo.pools.map((p) => (
                    <tr key={p.nombre}>
                      <td className="py-1 text-slate-700">{p.nombre}</td>
                      <td className="py-1 text-right tabular-nums text-slate-600">{money(p.costo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Insumos directos */}
          <div>
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
              <Package className="w-3 h-3" /> Insumos directos ({costo.insumos.length})
            </p>
            {costo.insumos.length === 0 ? (
              <p className="text-xs text-slate-400">Sin insumos directos.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase text-slate-400">
                    <th className="text-left font-medium pb-1">Insumo</th>
                    <th className="text-right font-medium pb-1 w-14">Cant.</th>
                    <th className="text-right font-medium pb-1 w-24">Unitario</th>
                    <th className="text-right font-medium pb-1 w-24">Costo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {costo.insumos.map((i) => (
                    <tr key={i.codigo + i.descripcion}>
                      <td className="py-1 text-slate-700">
                        <span className="font-mono text-[10px] text-slate-400 mr-1.5">{i.codigo}</span>
                        {i.descripcion}
                      </td>
                      <td className="py-1 text-right tabular-nums text-slate-500">{cant(i.cantidad)}</td>
                      <td className="py-1 text-right tabular-nums text-slate-500">{money(i.precioUnitario)}</td>
                      <td className="py-1 text-right tabular-nums text-slate-700 font-medium">{money(i.costo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
          <p className="text-[11px] text-slate-500">
            Es el costo que el modelo asigna a esta práctica, no lo que costó esta atención en particular.
          </p>
          <Link
            to="/recetas-costos"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline shrink-0"
          >
            Editar la receta <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </td>
    </tr>
  );
};

export default PanelCostoPrestacion;
