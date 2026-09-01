// ============================================================
// Modal de Ingreso de caja — parámetros del comprobante según cobertura
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// El comprobante registra una ENTREGA (pago parcial), no el total del
// presupuesto: ese era el bug conceptual que relevó Administración el
// 31/08/2026 contra el comprobante en papel que usan hoy.
//
//   VALOR TOTAL   de dónde sale según la cobertura:
//                 · PARTICULAR   → el total del presupuesto (no editable).
//                 · OBRA SOCIAL  → el importe a cargo del paciente, que carga
//                                  el operador (la diferencia no cubierta).
//   ENTREGA       la carga SIEMPRE el operador. En Particular puede expresarla
//                 como monto fijo o como porcentaje del valor total.
//   RESTA PAGAR   valor total − entregas anteriores − esta entrega.
//
// NINGUNA cobertura discrimina IVA. Lo único que se imprime al lado del valor
// total es la sigla C/IVA o S/IVA, que le dice a Administración si corresponde
// factura; es automática y el operador no la elige.
// ============================================================

import { useState } from "react";
import {
  CajaOpts, SobreCtx, calcularDeposito, baseDeposito,
  valorTotalCaja, restaPagar, requiereFactura, leyendaIva,
} from "../utils/sobre";
import { DepositoModalidad } from "../utils/circuito";

/** Los inputs son type=number: parseFloat, NUNCA parser es-AR (inflaba x10/x100). */
const aNumero = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};

export default function CajaIngresoModal({
  ctx,
  titulo,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  /** Contexto del sobre armado con los datos persistidos (para prellenar). */
  ctx: SobreCtx;
  titulo: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (caja: CajaOpts) => void | Promise<void>;
}) {
  const esOS = ctx.esObraSocial;

  const [modalidad, setModalidad] = useState<DepositoModalidad>(
    ctx.caja.depositoModalidad ?? "MONTO",
  );
  // Valor de la entrega en Particular: $ si MONTO, % si PORCENTAJE.
  const [depositoTxt, setDepositoTxt] = useState<string>("");
  // Entrega en obra social, siempre en pesos.
  const [entregaTxt, setEntregaTxt] = useState<string>("");
  // Importe a cargo del paciente (obra social): si nunca se cargó, se propone
  // la base del presupuesto antes del descuento; el operador puede pisarla.
  const [montoTxt, setMontoTxt] = useState<string>(
    ctx.caja.montoUnico != null
      ? String(ctx.caja.montoUnico)
      : (ctx.precios.baseAntesDescuento ? String(ctx.precios.baseAntesDescuento.toFixed(2)) : ""),
  );
  const [guardando, setGuardando] = useState(false);

  // Se arma primero sin la entrega resuelta, porque en Particular el porcentaje
  // se calcula SOBRE el valor total y éste depende del resto del contexto.
  const parcial: CajaOpts = esOS
    ? { depositoModalidad: null, depositoValor: null, montoUnico: aNumero(montoTxt), entrega: null }
    : { depositoModalidad: modalidad, depositoValor: aNumero(depositoTxt), montoUnico: null, entrega: null };

  const dep = esOS ? null : calcularDeposito({ ...ctx, caja: parcial });
  const entrega = esOS ? aNumero(entregaTxt) : (dep ? dep.monto : null);

  const caja: CajaOpts = { ...parcial, entrega };
  const preview: SobreCtx = { ...ctx, caja };

  const total = valorTotalCaja(preview);
  const resta = restaPagar(preview);
  const adicionales = ctx.itemsAdicionales.reduce((s, i) => s + i.monto, 0);

  const entregaValida = entrega != null && entrega > 0;
  const valido = entregaValida && (
    esOS
      ? caja.montoUnico != null && caja.montoUnico >= 0
      : caja.depositoValor != null &&
        caja.depositoValor >= 0 &&
        (modalidad !== "PORCENTAJE" || caja.depositoValor <= 100)
  );

  const confirmar = async () => {
    if (!valido || guardando) return;
    setGuardando(true);
    try {
      await onConfirm(caja);
    } finally {
      setGuardando(false);
    }
  };

  const $ = (n: number) => `$ ${ctx.fmtARS(n)}`;

  return (
    // stopPropagation: el modal se monta dentro del backdrop del CircuitoPanel;
    // sin esto, cerrar la caja cerraría también el panel de atrás.
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b bg-emerald-50 border-emerald-100">
          <h3 className="font-bold text-gray-900">{titulo}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {ctx.numeroPresupuesto} — {ctx.paciente.apellidoNombre} · {esOS ? ctx.coberturaLabel : "Particular"}
          </p>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {esOS && (
            <label className="block text-sm">
              <span className="block text-gray-600 mb-1 font-medium">Importe a cargo del paciente * (carga manual)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={montoTxt}
                onChange={(e) => setMontoTxt(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="0,00"
              />
              <span className="text-[11px] text-gray-500 mt-1 block">
                Es la diferencia que NO cubre la obra social, sin discriminar IVA.
                Cargala <strong>antes</strong> del descuento autorizado.
              </span>
            </label>
          )}

          {!esOS && (
            <div>
              <span className="block text-sm text-gray-600 mb-1 font-medium">Cómo se expresa la entrega *</span>
              <div className="flex gap-2">
                {([
                  { v: "MONTO" as DepositoModalidad, l: "$ Monto fijo" },
                  { v: "PORCENTAJE" as DepositoModalidad, l: "% Porcentaje" },
                ]).map((o) => (
                  <button
                    key={o.v}
                    onClick={() => { setModalidad(o.v); setDepositoTxt(""); }}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      modalidad === o.v
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Entrega recibida ahora ── */}
          <label className="block text-sm">
            <span className="block text-gray-600 mb-1 font-medium">
              {esOS
                ? "Entrega recibida ahora ($) *"
                : modalidad === "MONTO" ? "Entrega recibida ahora ($) *" : "Entrega recibida ahora (%) *"}
            </span>
            <input
              type="number"
              min={0}
              max={!esOS && modalidad === "PORCENTAJE" ? 100 : undefined}
              step="0.01"
              value={esOS ? entregaTxt : depositoTxt}
              onChange={(e) => (esOS ? setEntregaTxt(e.target.value) : setDepositoTxt(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder={!esOS && modalidad === "PORCENTAJE" ? "0" : "0,00"}
            />
            <span className="text-[11px] text-gray-500 mt-1 block">
              {!esOS && modalidad === "PORCENTAJE"
                ? `Se calcula sobre el valor total (${$(baseDeposito(preview))}).`
                : "Es el dinero que se recibe en este comprobante, no el total de la cirugía."}
            </span>
          </label>

          {/* ── Resumen: es exactamente lo que va a salir impreso ── */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">
                {esOS ? "Importe a cargo del paciente" : `Cirugía con LIO ${ctx.lioNombre}`}
              </span>
              <span className="font-medium text-gray-800">
                {$(esOS ? (caja.montoUnico ?? 0) : ctx.precios.baseAntesDescuento)}
              </span>
            </div>
            {ctx.precios.descuento > 0 && (
              <div className="flex justify-between text-orange-600">
                <span>
                  Descuento autorizado
                  {ctx.precios.porcentajeDescuento > 0 ? ` (${ctx.fmtARS(ctx.precios.porcentajeDescuento)} %)` : ""}
                  {" "}- Exento de IVA
                </span>
                <span className="font-medium">− {$(ctx.precios.descuento)}</span>
              </div>
            )}
            {ctx.itemsAdicionales.map((it, i) => (
              <div key={i} className="flex justify-between text-blue-700">
                <span>+ {it.descripcion}</span>
                <span className="font-medium">{$(it.monto)}</span>
              </div>
            ))}

            <div className="flex justify-between border-t border-gray-300 pt-1 mt-1">
              <span className="font-semibold text-gray-800">
                VALOR TOTAL{" "}
                <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  requiereFactura(preview)
                    ? "bg-blue-100 text-blue-700"
                    : "bg-orange-100 text-orange-700"
                }`}>
                  {leyendaIva(preview)}
                </span>
              </span>
              <span className="font-bold text-gray-900">{$(total)}</span>
            </div>

            {ctx.entregasPrevias > 0 && (
              <div className="flex justify-between text-gray-500 text-xs">
                <span>Entregas anteriores</span>
                <span>− {$(ctx.entregasPrevias)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-300 pt-1 mt-1">
              <span className="font-semibold text-emerald-700">ENTREGA</span>
              <span className="font-bold text-emerald-700">{entregaValida ? $(entrega) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-gray-800">RESTA PAGAR</span>
              <span className="font-bold text-gray-900">{entregaValida ? $(resta) : "—"}</span>
            </div>
          </div>

          {/* La leyenda es una regla de facturación, no una decisión del operador. */}
          <p className={`text-[11px] ${requiereFactura(preview) ? "text-blue-700" : "text-orange-700"}`}>
            {requiereFactura(preview)
              ? "Sin descuento: el comprobante sale C/IVA y corresponde emitir factura el día de la cirugía."
              : "Con descuento: el comprobante sale S/IVA y no corresponde factura."}
          </p>

          {adicionales > 0 && (
            <p className="text-[11px] text-blue-700">
              Se detallan {ctx.itemsAdicionales.length} ítem(s) adicional(es) del presupuesto por {$(adicionales)}.
            </p>
          )}

          <p className="text-[11px] text-gray-500">
            Se imprimen dos copias (paciente y administración). El bloque de
            tesorería sale en blanco: lo completa y firma Tesorería.
          </p>
        </div>

        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            disabled={!valido || guardando}
            onClick={confirmar}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-40"
          >
            {guardando ? "Generando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
