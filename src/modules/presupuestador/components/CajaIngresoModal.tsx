// ============================================================
// Modal de Ingreso de caja — parámetros del comprobante según cobertura
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Antes, el comprobante deducía todo del presupuesto (valor total + IVA) sin
// que el operador pudiera definir nada. Ahora el monto lo carga SIEMPRE el
// operador a mano:
//   - PARTICULAR: el depósito en garantía, por MONTO fijo o por PORCENTAJE
//     (sobre el valor total de la cirugía). Sin valor precargado.
//   - OBRA SOCIAL (directa o Círculo Médico): monto único.
// NINGUNA cobertura discrimina IVA. El descuento autorizado se muestra como
// línea propia con la aclaración "Exento de IVA" y descuenta del total, y los
// ítems adicionales (ej. ampolla de Avastin) se detallan siempre.
// ============================================================

import { useState } from "react";
import { CajaOpts, SobreCtx, calcularDeposito, totalObraSocial, baseDeposito } from "../utils/sobre";
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
  const [depositoTxt, setDepositoTxt] = useState<string>(
    ctx.caja.depositoValor != null ? String(ctx.caja.depositoValor) : "",
  );
  // Monto único de OS: si nunca se cargó, se propone la base del presupuesto
  // (antes del descuento autorizado); el operador puede pisarla.
  const [montoTxt, setMontoTxt] = useState<string>(
    ctx.caja.montoUnico != null
      ? String(ctx.caja.montoUnico)
      : (ctx.precios.baseAntesDescuento ? String(ctx.precios.baseAntesDescuento.toFixed(2)) : ""),
  );
  const [guardando, setGuardando] = useState(false);

  const caja: CajaOpts = esOS
    ? { depositoModalidad: null, depositoValor: null, montoUnico: aNumero(montoTxt) }
    : { depositoModalidad: modalidad, depositoValor: aNumero(depositoTxt), montoUnico: null };

  const preview: SobreCtx = { ...ctx, caja };
  const dep = calcularDeposito(preview);
  const totalOS = totalObraSocial(preview);
  const adicionales = ctx.itemsAdicionales.reduce((s, i) => s + i.monto, 0);

  const valido = esOS
    ? caja.montoUnico != null && caja.montoUnico >= 0
    : caja.depositoValor != null &&
      caja.depositoValor >= 0 &&
      (modalidad !== "PORCENTAJE" || caja.depositoValor <= 100);

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
          {esOS ? (
            <>
              <label className="block text-sm">
                <span className="block text-gray-600 mb-1 font-medium">Monto de la cirugía * (carga manual)</span>
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
                  Monto único, sin discriminar IVA. Cargalo <strong>antes</strong> del descuento autorizado.
                </span>
              </label>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600">Monto de la cirugía</span>
                  <span className="font-medium text-gray-800">{$(caja.montoUnico ?? 0)}</span>
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
                  <span className="font-semibold text-gray-800">TOTAL</span>
                  <span className="font-bold text-gray-900">{$(totalOS)}</span>
                </div>
              </div>
              <p className="text-[11px] text-gray-500">
                El comprobante no discrimina IVA.
              </p>
            </>
          ) : (
            <>
              <div>
                <span className="block text-sm text-gray-600 mb-1 font-medium">Cómo se determina el depósito *</span>
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

              <label className="block text-sm">
                <span className="block text-gray-600 mb-1 font-medium">
                  {modalidad === "MONTO" ? "Monto del depósito ($) *" : "Porcentaje del depósito (%) *"}
                </span>
                <input
                  type="number"
                  min={0}
                  max={modalidad === "PORCENTAJE" ? 100 : undefined}
                  step="0.01"
                  value={depositoTxt}
                  onChange={(e) => setDepositoTxt(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  placeholder={modalidad === "MONTO" ? "0,00" : "0"}
                />
                {modalidad === "PORCENTAJE" && (
                  <span className="text-[11px] text-gray-500 mt-1 block">
                    Se calcula sobre el valor total de la cirugía ({$(baseDeposito(ctx))}).
                  </span>
                )}
              </label>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600">Cirugía con LIO {ctx.lioNombre}</span>
                  <span className="font-medium text-gray-800">{$(ctx.precios.baseAntesDescuento)}</span>
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
                  <span className="font-semibold text-gray-800">Valor total de la cirugía</span>
                  <span className="font-bold text-gray-900">{$(ctx.precios.total)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-300 pt-1 mt-1">
                  <span className="font-semibold text-emerald-700">Depósito en garantía</span>
                  <span className="font-bold text-emerald-700">{dep ? $(dep.monto) : "—"}</span>
                </div>
                {dep && (
                  <div className="flex justify-between text-gray-500 text-xs">
                    <span>Saldo a abonar</span>
                    <span>{$(Math.max(0, ctx.precios.total - dep.monto))}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {adicionales > 0 && (
            <p className="text-[11px] text-blue-700">
              Se detallan {ctx.itemsAdicionales.length} ítem(s) adicional(es) del presupuesto por {$(adicionales)}.
            </p>
          )}
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
