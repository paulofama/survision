// ============================================================
// aFecha — que una fecha sin hora no se corra un día
// ============================================================
// Es el tercer bug de fechas del proyecto. `new Date("2026-09-17")` se
// interpreta como medianoche UTC, que en Argentina (UTC−3) son las 21:00 del
// 16, así que la pantalla imprimía el día anterior. Todas las columnas `fecha`
// de la base son `date`, o sea sin hora, así que afectaba a cada pantalla que
// las mostrara.
// ============================================================

import { describe, it, expect } from 'vitest';
import { aFecha, formatDate } from '@shared/utils';

describe('aFecha', () => {
  it('una fecha sin hora NO se corre al día anterior', () => {
    // Es el caso exacto que se vio en Tesorería el 17/09/2026.
    expect(formatDate('2026-09-17')).toBe('17/09/2026');
    expect(aFecha('2026-09-17').getDate()).toBe(17);
    expect(aFecha('2026-09-17').getMonth()).toBe(8); // 0-based
  });

  it('demuestra el bug: `new Date` a secas sí lo corre en husos negativos', () => {
    const conBug = new Date('2026-09-17');
    const bien = aFecha('2026-09-17');
    // En UTC las dos caen el mismo día; la diferencia aparece en hora LOCAL.
    if (new Date().getTimezoneOffset() > 0) {
      expect(conBug.getDate()).toBe(16);
      expect(bien.getDate()).toBe(17);
    }
    expect(bien.getTime()).toBeGreaterThan(conBug.getTime());
  });

  it('el primero de mes tampoco cae al mes anterior', () => {
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
    expect(aFecha('2026-03-01').getMonth()).toBe(2);
  });

  it('un timestamp completo se respeta tal cual', () => {
    // Trae su hora: no hay que inventarle mediodía.
    const iso = '2026-09-17T23:30:00-03:00';
    expect(aFecha(iso).getTime()).toBe(new Date(iso).getTime());
  });

  it('un Date ya construido pasa sin tocarse', () => {
    const d = new Date(2026, 8, 17, 8, 30);
    expect(aFecha(d)).toBe(d);
  });

  it('tolera espacios alrededor', () => {
    expect(aFecha('  2026-09-17  ').getDate()).toBe(17);
  });

  it('el mediodía deja margen para cualquier huso', () => {
    // 12:00 local: ni UTC−11 ni UTC+13 alcanzan a cambiar el día.
    expect(aFecha('2026-09-17').getHours()).toBe(12);
  });
});
