// ============================================================
// SERVICIO: transiciones por tiempo del seguimiento (job del daemon)
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// Aplica el CIERRE automático "sin_respuesta": presupuestos entregados cuya 2ª
// ronda terminó en WhatsApp sin respuesta y ya pasaron 5 días.
//
//   cerrar si: presupuesto entregado + estado_contacto no cerrado + sin
//   rellamada agendada + ronda >= 2 + whatsapp enviado hace >= 5 días.
//
// El "reintento a +5 días" (ronda 1 -> ronda 2) NO necesita job: se deriva al
// vuelo (la cola lo muestra) y se aplica cuando el operador registra la llamada.
// Solo datos de Supabase (no toca GECLISA). Idempotente.
// ============================================================

const { Client } = require('pg');

const COND = `
  p.estado = 'entregado'
  AND s.estado_contacto NOT IN ('contactado','sin_respuesta')
  AND s.rellamada_at IS NULL
  AND s.ronda >= 2
  AND s.whatsapp_enviado_at IS NOT NULL
  AND s.whatsapp_enviado_at + interval '5 days' <= now()
`;

async function correrCierres({ write = false } = {}) {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const { rows } = await c.query(
      `SELECT count(*)::int n FROM presupuestos_seguimiento s JOIN presupuestos p ON p.id = s.presupuesto_id WHERE ${COND}`,
    );
    const n = rows[0].n;
    if (!write) return { aCerrar: n, escrito: false };
    if (n > 0) {
      await c.query(
        `UPDATE presupuestos_seguimiento s
         SET estado_contacto = 'sin_respuesta', cerrado_at = now(), updated_by = 'job_cierre'
         FROM presupuestos p
         WHERE p.id = s.presupuesto_id AND ${COND}`,
      );
    }
    return { cerrados: n, escrito: true };
  } finally {
    await c.end();
  }
}

module.exports = { correrCierres };
