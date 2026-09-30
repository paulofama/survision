-- ============================================================
-- Migración 67 — la cola de procedimientos sin diagnóstico
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- PRIMERO: EL 89,4 % VENÍA DILUIDO
-- ---------------------------------
-- La cobertura de diagnósticos se medía sobre TODOS los presupuestos con
-- código de prestación, y ahí adentro hay 93 que no pueden tener diagnóstico
-- de cirugía ni deberían:
--
--   · 60 son ESTUDIOS e INSUMOS — ecografía, ecometría, RFG, biometría,
--     paquimetría, topografía, test de Schirmer, punctum plug como insumo.
--     Códigos 01xx, 02xx y 04xx.
--   · 33 son el placeholder 'otro' ("Otra prestación, especificar en
--     comentarios"), que por definición no tiene una práctica fija.
--
-- Un estudio no genera pedido de cirugía, así que no le corresponde ni
-- diagnóstico ni solicitud. Y no es una hipótesis: de esos 93 presupuestos,
-- CERO llegaron alguna vez a aceptarse. Los 19 aceptados son todos 03xx.
--
-- Medida sobre las prácticas que realmente van a quirófano (03xx), la
-- cobertura no era 89,4 % sino 97,5 % — 1007 de 1033. Lo que faltaba de
-- verdad son los 26 presupuestos de 10 códigos que carga esta migración.
--
-- QUÉ SE CARGA
-- ------------
--   030312   1  Sutura o cauterización de punto lagrimal
--   030315   5  Blefaroplastia no cosmética
--   030323   1  Blefaroplastia superior cosmética bilateral
--   030325   2  Distiquiasis o triquiasis .................. 2 opciones
--   030412   3  Extracción de material para biopsia o cultivo  2 opciones
--   030413   7  Recubrimiento conjuntival
--   030507   1  Extracción de ICL
--   030512   2  Extracción de lente intraocular
--   030607   1  Vitrectomía anterior
--   031005   3  Inyección subconjuntival
--
-- Dos van a la tabla de OPCIONES porque el nombre de la práctica trae la
-- disyunción puesta: "distiquiasis O triquiasis", "biopsia O cultivo". Cuál
-- corresponde lo decide el caso, así que se elige al aceptar el presupuesto.
--
-- DE DÓNDE SALEN LAS INDICACIONES
-- --------------------------------
-- De la práctica misma y del estilo ya cargado: el diagnóstico es la
-- condición que la práctica trata, la solicitud es la práctica en prosa.
-- Van anotadas una por una en `nota_interna`.
--
-- TRES QUE CONVIENE QUE MERCADO CONFIRME (no bloquean, quedan activas)
-- --------------------------------------------------------------------
--   · 030315 vs 030323 — funcional contra cosmética. El ERP escribe las dos
--     como "Blefaroplastia" (y una vez como "Blefarospatia", con el typo), y
--     la diferencia es justo la que decide si la cobertura la paga: la no
--     cosmética se indica por dermatocalasia que obstruye el campo visual.
--     Si el criterio de la casa es otro, se corrige el diagnóstico de 030315.
--   · 030412 — abrí biopsia y cultivo como dos opciones. Si en la práctica
--     siempre se pide junto, se reemplaza por un diagnóstico único.
--   · 030507 — puse "complicación de ICL" como motivo genérico del explante.
--     Los motivos reales (catarata, pérdida endotelial, vault) son distintos
--     y si conviene distinguirlos esto pasa a ser un menú de opciones.
--
-- `lleva_lio` VA EN NO EN LAS DOS EXTRACCIONES DE LENTE
-- -----------------------------------------------------
-- 030507 (ICL) y 030512 (LIO) sacan una lente, no la implantan, así que no
-- corresponde imprimir el renglón "LIO indicado". En la ICL además vale lo
-- de la migración 66: el catálogo `presupuestos_lios` sólo tiene lentes de
-- catarata y no hay ninguna ICL. El implante secundario, cuando hace falta,
-- ya tiene su propio código (030509, con `lleva_lio` en true).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Diagnóstico único (8 códigos)
-- ------------------------------------------------------------
INSERT INTO public.presupuestos_diagnosticos
  (codigo_practica, diagnostico, solicitud, lleva_lio, activo, nota_interna)
VALUES
  ('030312', 'Ojo seco {ojo}',
   'Sutura o cauterización de punto lagrimal.', false, true,
   'Ocluir el punto lagrimal de forma definitiva se indica por ojo seco, igual que el '
   || 'punctum plug de 030804, que es la versión reversible y ya tiene ese diagnóstico. '
   || 'Criterio de la migración 67.'),

  ('030315', 'Dermatocalasia con obstrucción del campo visual {ojo}',
   'Blefaroplastia funcional, no cosmética.', false, true,
   'Lo que hace a la blefaroplastia NO cosmética es la indicación funcional: piel '
   || 'palpebral redundante que tapa el campo visual. Es la diferencia con 030323. '
   || 'Criterio de la migración 67 — conviene que lo confirme la Dirección.'),

  ('030323', 'Dermatocalasia palpebral superior {ojo}',
   'Blefaroplastia superior cosmética, bilateral.', false, true,
   'Cosmética: no hay patología que tratar, así que el diagnóstico es el hallazgo '
   || 'anatómico y nada más. No se le pone obstrucción del campo visual a propósito, '
   || 'porque eso la volvería funcional (030315). Criterio de la migración 67.'),

  ('030413', 'Úlcera corneal persistente {ojo}',
   'Recubrimiento conjuntival.', false, true,
   'El recubrimiento conjuntival se indica para cubrir una úlcera corneal que no cierra. '
   || 'Criterio de la migración 67.'),

  ('030507', 'Complicación de lente intraocular fáquica (ICL) {ojo}',
   'Extracción de lente intraocular fáquica (ICL).', false, true,
   'Motivo genérico del explante. `lleva_lio` en NO: se saca la lente, no se implanta, y '
   || 'además el catálogo de lentes no tiene ICL (ver migración 66). Criterio de la '
   || 'migración 67 — conviene que la Dirección diga si hay que distinguir los motivos.'),

  ('030512', 'Luxación o descentrado de lente intraocular {ojo}',
   'Extracción de lente intraocular.', false, true,
   'Motivo habitual para explantar un LIO ya implantado. `lleva_lio` en NO porque esta '
   || 'práctica sólo extrae; el implante secundario tiene su propio código (030509). '
   || 'Criterio de la migración 67.'),

  ('030607', 'Prolapso de vítreo en cámara anterior {ojo}',
   'Vitrectomía anterior.', false, true,
   'La vitrectomía anterior se hace cuando el vítreo se prolapsa a cámara anterior. '
   || 'Criterio de la migración 67.'),

  ('031005', 'Inflamación ocular {ojo}',
   'Inyección subconjuntival.', false, true,
   'La inyección subconjuntival se usa para tratamiento antiinflamatorio o antibiótico '
   || 'local; queda genérico porque la práctica no dice la droga. Criterio de la '
   || 'migración 67.')
ON CONFLICT (codigo_practica) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Distiquiasis o triquiasis: la práctica trae la disyunción
-- ------------------------------------------------------------
INSERT INTO public.presupuestos_diagnostico_opciones
  (codigo_practica, diagnostico, solicitud, lleva_lio, orden, created_by, nota_interna)
VALUES
  ('030325', 'Distiquiasis {ojo}',
   'Tratamiento de distiquiasis con láser argón o cirugía lamelar, unilateral.',
   false, 1, 'migracion_67',
   'Distiquiasis: hilera de pestañas de más. La práctica nombra las dos condiciones, '
   || 'así que cuál va se elige al aceptar.'),
  ('030325', 'Triquiasis {ojo}',
   'Tratamiento de triquiasis con láser argón o cirugía lamelar, unilateral.',
   false, 2, 'migracion_67',
   'Triquiasis: pestañas mal dirigidas que roban contra la córnea. La práctica nombra '
   || 'las dos condiciones, así que cuál va se elige al aceptar.')
ON CONFLICT (codigo_practica, diagnostico) DO NOTHING;

-- ------------------------------------------------------------
-- 3. Material para biopsia o cultivo: distinto para qué se manda
-- ------------------------------------------------------------
INSERT INTO public.presupuestos_diagnostico_opciones
  (codigo_practica, diagnostico, solicitud, lleva_lio, orden, created_by, nota_interna)
VALUES
  ('030412', 'Lesión ocular a estudiar {ojo}',
   'Extracción de material para biopsia.', false, 1, 'migracion_67',
   'Rama biopsia: se sospecha una lesión y se manda a anatomía patológica. Mismo estilo '
   || 'que 031003 ("Lesión conjuntival a estudiar").'),
  ('030412', 'Proceso infeccioso ocular a estudiar {ojo}',
   'Extracción de material para cultivo.', false, 2, 'migracion_67',
   'Rama cultivo: se sospecha infección y se manda a microbiología. Mismo estilo que '
   || '030513 ("Endoftalmitis", que también toma material para cultivo).')
ON CONFLICT (codigo_practica, diagnostico) DO NOTHING;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_unicos integer;
  v_opciones integer;
  v_practicas_opc integer;
  v_lio_extraccion integer;
  v_choque integer;
  v_solas integer;
  v_cub_proc integer;
  v_tot_proc integer;
  v_pend_proc integer;
BEGIN
  SELECT count(*) INTO v_unicos FROM public.presupuestos_diagnosticos
   WHERE activo AND codigo_practica IN
     ('030312', '030315', '030323', '030413', '030507', '030512', '030607', '031005');
  IF v_unicos <> 8 THEN
    RAISE EXCEPTION 'ABORTA: se esperaban 8 diagnósticos únicos, hay %', v_unicos;
  END IF;

  SELECT count(*), count(DISTINCT codigo_practica) INTO v_opciones, v_practicas_opc
    FROM public.presupuestos_diagnostico_opciones
   WHERE created_by = 'migracion_67' AND activo;
  IF v_opciones <> 4 OR v_practicas_opc <> 2 THEN
    RAISE EXCEPTION 'ABORTA: se esperaban 4 opciones en 2 prácticas, hay % en %',
      v_opciones, v_practicas_opc;
  END IF;

  -- Sacar una lente no puede pedir el renglón del LIO.
  SELECT count(*) INTO v_lio_extraccion FROM public.presupuestos_diagnosticos
   WHERE codigo_practica IN ('030507', '030512') AND lleva_lio;
  IF v_lio_extraccion > 0 THEN
    RAISE EXCEPTION 'ABORTA: % extracción(es) de lente quedaron pidiendo el renglón del LIO',
      v_lio_extraccion;
  END IF;

  -- Invariantes de siempre: ninguna práctica con diagnóstico único Y opciones
  -- activas, y ninguna con una sola opción (un menú de uno no es un menú).
  SELECT count(*) INTO v_choque
    FROM public.presupuestos_diagnostico_opciones o
    JOIN public.presupuestos_diagnosticos d ON d.codigo_practica = o.codigo_practica
   WHERE o.activo AND d.activo;
  IF v_choque > 0 THEN
    RAISE EXCEPTION 'ABORTA: % práctica(s) con diagnóstico único Y opciones activas', v_choque;
  END IF;

  SELECT count(*) INTO v_solas FROM (
    SELECT codigo_practica FROM public.presupuestos_diagnostico_opciones
     WHERE activo GROUP BY codigo_practica HAVING count(*) < 2) q;
  IF v_solas > 0 THEN
    RAISE EXCEPTION 'ABORTA: % práctica(s) con una sola opción', v_solas;
  END IF;

  -- La cobertura que importa: sólo procedimientos (03xx). Los estudios y el
  -- placeholder 'otro' no generan pedido de cirugía y no entran al cálculo.
  SELECT count(*) FILTER (WHERE
           EXISTS (SELECT 1 FROM public.presupuestos_diagnosticos d
                    WHERE d.codigo_practica = p.prestacion_codigo AND d.activo)
        OR EXISTS (SELECT 1 FROM public.presupuestos_diagnostico_opciones o
                    WHERE o.codigo_practica = p.prestacion_codigo AND o.activo)),
         count(*)
    INTO v_cub_proc, v_tot_proc
    FROM public.presupuestos p
   WHERE p.prestacion_codigo LIKE '03%';

  v_pend_proc := v_tot_proc - v_cub_proc;
  IF v_pend_proc > 0 THEN
    RAISE EXCEPTION 'ABORTA: quedaron % presupuesto(s) de procedimiento sin diagnóstico',
      v_pend_proc;
  END IF;

  RAISE NOTICE 'Cola cerrada. Procedimientos (03xx) con diagnóstico: % de % (%%%).',
    v_cub_proc, v_tot_proc, round(v_cub_proc * 100.0 / NULLIF(v_tot_proc, 0), 1);
END $$;
