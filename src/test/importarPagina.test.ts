import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { importarPagina } from '@shared/lib/importarPagina';

const Pagina = () => null;
const Fallback = () => null;

describe('importarPagina', () => {
  const reload = vi.fn();
  const locationOriginal = window.location;

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...locationOriginal, reload },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: locationOriginal });
    vi.restoreAllMocks();
  });

  it('si el import anda, devuelve la página', async () => {
    const mod = await importarPagina(async () => ({ default: Pagina }), Fallback)();
    expect(mod.default).toBe(Pagina);
    expect(reload).not.toHaveBeenCalled();
  });

  it('si falla por primera vez, recarga en vez de mostrar el fallback', async () => {
    const cargar = importarPagina<object>(() => Promise.reject(new Error('chunk viejo')), Fallback);
    const resultado = await Promise.race([
      cargar().then(() => 'resolvió'),
      new Promise((r) => setTimeout(() => r('pendiente'), 20)),
    ]);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(resultado).toBe('pendiente');
  });

  it('si ya recargó y vuelve a fallar, muestra el fallback sin entrar en bucle', async () => {
    sessionStorage.setItem('importarPagina:recargado', String(Date.now()));
    const mod = await importarPagina<object>(() => Promise.reject(new Error('roto')), Fallback)();
    expect(mod.default).toBe(Fallback);
    expect(reload).not.toHaveBeenCalled();
  });

  it('una recarga vieja no bloquea la del próximo deploy', async () => {
    sessionStorage.setItem('importarPagina:recargado', String(Date.now() - 5 * 60_000));
    void importarPagina<object>(() => Promise.reject(new Error('chunk viejo')), Fallback)();
    await new Promise((r) => setTimeout(r, 0));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
