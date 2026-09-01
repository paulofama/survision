# Circuito Quirúrgico — referencia

> Instituto Dr. Mercado · Sistema de Gestión Integral
> Última actualización: **2026-09-01** (correcciones FASE 3)
> Commits: `97b821c` correcciones Fases 1 y 2 · `10185ce` fecha de cirugía · `3df139a` pie sin crédito de desarrollo.
> Migraciones: **33** (LIOs + caja), **34** (recetas por sistema), **38** (placeholder del consentimiento), **44** (entregas de caja + leyenda del LIO).

Cubre el tramo **Aceptar presupuesto → Circuito de cirugía → Sobre Quirúrgico → Ingreso de caja**, con las reglas que fijó Administración en los testeos funcionales del **10-11/08/2026** (tres coberturas) y del **31/08/2026** (FASE 3: comprobante de caja contra el papel real, sobre P-2026-813).

Para el diseño original del circuito (resultado comercial, checklist, match con prácticas realizadas) ver la memoria `project-presupuestador-circuito` y la migración `25_presupuestos_circuito.sql`.

---

## 1. Reglas por cobertura

Las tres coberturas son **Particular**, **obra social vía directa** (ej. OSEP) y **obra social vía Círculo Médico**. Las dos últimas comparten la rama `OBRA_SOCIAL` y se distinguen por `sub_rama`.

| Aspecto | Particular | O.S. vía directa | Círculo Médico |
|---|---|---|---|
| LIO | El del presupuesto, **solo lectura** | ídem | ídem |
| Ítem "Autorización de OS" | **No existe** | Sí | Sí |
| Ítem "Orden autorizada / pedido recibido" | **No existe** | Sí | Sí |
| Pedido de cirugía | Ojo; **sin** N° de afiliado | Ojo + N° de afiliado | Ojo + N° de afiliado + vía |
| Recetas fijas (A/B/C) | Sí, una por hoja | Sí | Sí |
| Receta de medicación adicional | Sí | Sí, **+ leyenda** de carga por OSEP | Sí |
| Identificación en caja | DNI | DNI + N° de afiliado | DNI + N° de afiliado |
| VALOR TOTAL del comprobante | Total del presupuesto | **Importe a cargo del paciente** | ídem |
| Entrega / Resta pagar | Sí | Sí | Sí |
| Detalle de IVA | **Nunca** | **Nunca** | **Nunca** |
| Leyenda C/IVA — S/IVA | Según descuento | ídem | ídem |
| Descuento autorizado | Línea propia + "Exento de IVA" | ídem | ídem |
| Ítems adicionales (ej. Avastin) | Detallados en caja | ídem | ídem |
| Copias del comprobante | Paciente + Administración | ídem | ídem |
| Bloque de tesorería | En blanco | ídem | ídem |
| CUPO / fecha probable | Renglón único combinado | ídem | ídem |

---

## 2. El LIO sale de la prestación

**El presupuesto no tiene un campo LIO.** El LIO está implícito en la prestación elegida (códigos `0305xx` del catálogo `prestaciones`). El mapeo vive en `presupuestos_lios.codigo_practica`:

| Código | Prestación | LIO |
|---|---|---|
| 030501 | Facoemulsificación + LIO Básico | Básico |
| 030502 | Facoemulsificación + LIO Monofocal | Monofocal |
| 030503 | Facoemulsificación + LIO Tórico monofocal | Tórico monofocal |
| 030504 | Facoemulsificación + LIO Multifocal Panoptic | Multifocal Panoptic |
| 030505 | Facoemulsificación + LIO Rango Extendido Vivity | Rango Extendido Vivity |
| 030511 | Facoemulsificación con lente rígido | Lente rígido |
| 030514 | Facoemulsificación + LIO PanOptix Pro | Multifocal PanOptix Pro |
| 030508 | Implante secundario suturado | Implante secundario |

`lioSugerido()` (en `utils/circuito.ts`) resuelve por código y, si no matchea, compara el nombre del LIO contra la descripción de la prestación **probando los nombres más largos primero** — si no, "Tórico monofocal" caería en "Monofocal".

En el modal el LIO se muestra como **dato de sólo lectura, no como `<select disabled>`**. El select apagado se renderizaba en gris claro y Administración lo leía como "no se cargó el LIO" (31/08/2026); ahora va en alto contraste y la aclaración de que no se modifica queda debajo, en letra menor. Excepción deliberada: si la prestación no identifica ningún LIO (ej. un Yag Laser), vuelve a ser un select editable, porque si no el operador no podría aceptar el presupuesto.

**Para volver a hacerlo editable:** `<AceptacionModal lioEditable />`.

### Leyenda de resultado visual

`presupuestos_lios.leyenda_resultado` (migración 44) guarda la frase que el comprobante de caja imprime debajo del nombre del lente. **Hoy sólo la tiene el Básico**: *"La pte. continúa usando anteojos de lejos y cerca"*.

No es una omisión en los demás: en los lentes no básicos **el objetivo refractivo lo elige el paciente** y cambia caso por caso — hay pacientes que piden quedar bien de cerca y mal de lejos por su oficio, y el resultado también cambia si hubo cirugía refractiva previa. Una frase fija sería clínicamente incorrecta. En el Básico no cambia nunca, y la leyenda protege a la clínica del reclamo posterior.

Está en el catálogo y no en el código para que agregar una frase a otro lente no toque el render.

> **Discrepancia abierta con Administración.** El catálogo tiene **8 lentes** y la definición de la FASE 3 lista **5**, con dos nombres invertidos ("Monofocal tórico" vs `Tórico monofocal`, "Vivity rango extendido" vs `Rango Extendido Vivity`) y sin mencionar `Lente rígido` ni `Implante secundario`. Además conviven `030504 Multifocal Panoptic` y `030514 Multifocal PanOptix Pro`: si "Panoptic" es la grafía mala del mismo lente hay presupuestos históricos con ese código, así que **se da de baja, no se renombra**. Pendiente de que Administración defina cuál es cuál.

---

## 3. Sobre Quirúrgico

Ocho documentos independientes, cada uno arrancando en hoja propia. `docsDelSobre()` los ordena: primero lo del paciente, al final lo de quirófano.

| # | Clave | Destino | Notas |
|---|---|---|---|
| 1 | `pedido` | Paciente | Ojo siempre; N° de afiliado solo si hay OS |
| 2 | `indicaciones` | Paciente | Prequirúrgico, día de la cirugía, cuidados post |
| 3 | `cronograma` | Paciente | **A4 apaisado, 13pt.** 2 hojas: tabla + instructivo |
| 4 | `recetas` | Paciente | **Una por hoja**, 3 fijas + 1 por medicación adicional |
| 5 | `analisis` | Paciente | Solo si el circuito requiere análisis/ECG |
| 6 | `caja` | Paciente | **2 hojas**: copia paciente + copia administración |
| 7 | `trazabilidad` | **Quirófano** | Hoja propia, sello "ARCHIVAR EN QUIRÓFANO" |
| 8 | `consentimiento` | **Quirófano** | ídem |

Trazabilidad y consentimiento van últimos y separados **para poder desprenderlos al imprimir** y archivarlos en quirófano. Antes iban embebidos al pie de las indicaciones.

Páginas resultantes: Particular 11 (12 con análisis), OSEP 12 y Círculo Médico 12 (la receta extra de la medicación).

### Pedido de cirugía — renglón CUPO / fecha

Un **único renglón combinado**: `CUPO / FECHA PROBABLE DE CIRUGÍA`. Antes había un campo `CUPO` que salía siempre vacío (lo asigna OSEP, se completa a mano) más una `Fecha de cirugía` aparte. Un solo renglón sirve para todas las obras sociales y evita mantener lógica por convenio: si hay fecha cargada se imprime, y si no queda en blanco.

### Cronograma — no se parte nunca

El cronograma y el instructivo de gotas **son hojas distintas**. Antes compartían documento, la tabla no entraba y `autoTable` la paginaba sola llevándose la fila de las **24:00** a la hoja siguiente: *"ver de que entre, porque no verán la última colocación"*.

Ahora la tabla lleva `pageBreak: "avoid"` + `rowPageBreak: "avoid"` y el instructivo abre su propia hoja. Medido: la tabla termina en **170,4 mm** sobre una hoja apaisada de 210 mm, con el pie en 190 mm — **19,6 mm de aire**. El `margin.bottom` de autoTable es **24 mm** justamente para que cubra la franja del pie (`FOOTER_ALTO = 20`); si fuera menor, la tabla dibujaría encima del pie en vez de cortar.

Cada columna de semana trae espacio para el rango de fechas (`SEMANA n / del __/__ al __/__ / AL OJO: ____`), **en blanco**: el esquema varía según indicación médica y Administración lo completa frente al paciente. El armado está en `encabezadoSemana(ctx, n)`, que ya recibe el `ctx` para que calcularlo desde la fecha de cirugía sea un cambio de una línea.

### Recetas

`Dx` unificado en **`DX_RECETAS = "Cirugía ocular"`** para todas. Antes la A y la B decían "Cataratas": la medicación se prescribe por la cirugía, no por la catarata.

En OSEP **se imprimen igual** y llevan al pie *"Receta a cargar por el sistema de OSEP."* Antes se suprimía la receta de medicación adicional y se perdía el respaldo en papel del sobre. Suprimirlas es un flag del convenio (`config.recetas_suprimir`), no un borrado de código.

### Membrete

Cada hoja lleva el membrete completo, verificado por test (la cantidad de membretes tiene que ser igual a la cantidad de páginas):

| elemento | y desde arriba | cuerpo | alineación |
|---|---|---|---|
| INSTITUTO DR. MERCADO | 14 mm | 15 pt | centrado |
| San Rafael, dd/mm/aaaa (emisión) | 14 mm | 8 pt | derecha |
| Survisión S.A. | 19,5 mm | 9 pt | centrado |
| Lema | 24 mm | 8 pt | centrado |
| Dirección + teléfonos | 29 mm | 7,5 pt | centrado |
| línea divisoria | 32 mm | | |
| **contenido** | **38 mm** | | |

Al pie, guardia y email. **No lleva crédito de desarrollo**: los documentos salen del instituto y los ve el paciente o la obra social (ver `src/CLAUDE.md`, sección de convenciones).

**Todavía no hay logo**: el membrete es sólo texto porque no existe ningún archivo de logo en el proyecto. Cuando lo haya, se dibuja en `cabecera()` de `pdfBase.ts` y lo toman las 11 páginas de una.

El cronograma **no se modifica en contenido ni estructura** — Administración lo confirmó como está; lo único que cambió es el cuerpo de letra y la orientación.

---

## 4. Ingreso de caja

El comprobante replica el **papel real** que aportó Administración (paciente Segovia Mercedes, 19/08/26). Es un **pago parcial**, no el total del presupuesto: ése era el bug conceptual de la ronda anterior.

```
Paciente / O. Social / N° afiliado (solo OS) / Ojo / Fecha / DNI

CIRUGÍA DE CATARATA CON LIO <tipo>:
<leyenda de resultado visual — sólo si es Básico>
LIO ELEGIDO: <tipo>

  <detalle: base, descuento, ítems adicionales>
  VALOR TOTAL      C/IVA        $ …
  ENTREGA                       $ …
  RESTA PAGAR                   $ …

  TESORERÍA / MONTO / FECHA / FIRMA   ← en blanco
```

**Los tres renglones de dinero:**

- **VALOR TOTAL** — Particular: el total del presupuesto. Obra social: el **importe a cargo del paciente**, que carga el operador. El comprobante documenta lo que el paciente paga, no lo que liquida la obra social.
- **ENTREGA** — siempre a mano. En Particular puede expresarse como monto fijo o como **porcentaje** del valor total (`baseDeposito()`, aislado para cambiarlo en un solo lugar).
- **RESTA PAGAR** — `valor total − entregas anteriores − esta entrega`.

**Cada entrega es una fila de `presupuestos_caja_entregas`** (migración 44), nunca un upsert: los campos de caja de `presupuestos_aceptacion` guardan un solo importe, así que una segunda entrega pisaba la primera y el saldo se perdía. Se congelan con la entrega el `valor_total` y el `requiere_factura`, para que reimprimir un comprobante viejo dé el mismo saldo y la misma sigla aunque después se edite el presupuesto.

### La leyenda C/IVA — S/IVA

**Ningún comprobante discrimina IVA, en ninguna cobertura.** Lo único que se imprime al lado del valor total es una sigla que le dice a Administración si esa cirugía se factura:

| Presupuesto | Leyenda | Significado |
|---|---|---|
| Sin descuento | **C/IVA** | Corresponde factura el día de la cirugía |
| Con descuento | **S/IVA** | No corresponde (el descuento se dio a cambio) |

Es automática (`requiereFactura()`), el operador no la elige. El umbral está en `UMBRAL_DESCUENTO_SIN_FACTURA = 0` — cualquier descuento dispara `S/IVA` — porque Administración no cerró todavía si es cualquiera o sólo el 10%. En el papel va **sólo la sigla**: la interpretación fiscal queda del lado interno, en el flag persistido. Ivana la usa para saber si emite factura, Flavio para cerrar el ingreso el día de la cirugía.

El **descuento autorizado** sigue saliendo como línea propia con la aclaración **"Exento de IVA"** y descuenta del total.

### Dos copias y el bloque de tesorería

Se imprimen **dos hojas idénticas** salvo el rótulo: `COPIA PARA EL PACIENTE` y `COPIA PARA ADMINISTRACIÓN`.

El bloque **TESORERÍA / MONTO / FECHA / FIRMA** va **vacío**. Flavio lo completa de puño y letra y pone su sello: eso es lo que deja constancia de que él recibió el dinero. Si el sistema lo imprimiera prellenado saldría en las dos copias y perdería su función de registro manual.

Al pie de los comprobantes de obra social va `LEYENDA_A_CARGO_PACIENTE`, que reemplaza a *"Importe registrado por convenio con la obra social"* — incorrecta, porque ese importe **no lo cubre la obra social**: es justamente lo que el paciente debe abonar.

---

## 4b. La cobertura sale del convenio, no de la ficha

**Bug transversal corregido el 31/08/2026.** En P-2026-813 se aceptó con convenio **OSEP** y todos los documentos salían con **"Ospelsym"**: *"cargué OSEP y todo lo extiende por Ospelsym"*.

La causa era la precedencia en `coberturaLabel` (`utils/sobre/index.ts`), que ponía primero `datos_completos.paciente.obraSocial` — **texto libre copiado de la ficha del paciente al crear el presupuesto**, sin relación con el catálogo de convenios. "Ospelsym" no existe como convenio; el catálogo tiene sólo OSEP, Círculo Médico San Rafael y OSDE. No estaban mapeados juntos: uno es catálogo y el otro un campo escrito a mano.

Ahora manda **el convenio de la aceptación** en los seis documentos que imprimen cobertura. Eso además cumple el snapshot: `convenio_id` se fija al aceptar, así que editar después la ficha del paciente no altera ningún documento ya emitido. `dp.obraSocial` queda sólo como último recurso para una aceptación vieja marcada como obra social pero sin `convenio_id`.

`recetasPorSistema` también dejó de mirar el texto libre: se decide por el convenio.

Y al aceptar, si el convenio difiere de la obra social de la ficha, el modal muestra un **aviso no bloqueante** con ambos valores — el error se detecta ahí y no en el papel impreso.

---

## 5. Dónde se configura cada cosa

Todo lo que Administración puede querer cambiar está en datos, no en código:

| Qué | Dónde |
|---|---|
| LIOs y su mapeo a prestación | `presupuestos_lios` (`nombre`, `codigo_practica`) |
| Leyenda de resultado visual del lente | `presupuestos_lios.leyenda_resultado` |
| Convenios, códigos, leyendas, cuenta | `presupuestos_convenios.config` (jsonb) |
| Qué convenio agrega la leyenda de receta electrónica | `presupuestos_convenios.config.recetas_por_sistema` |
| Qué convenio NO imprime recetas | `presupuestos_convenios.config.recetas_suprimir` |
| Texto del consentimiento | `presupuestos_textos_legales` (versionable, una vigente) |
| Plazo de "sin respuesta" | `presupuestos_config.plazo_sin_respuesta_dias` |
| Ítems del checklist por cobertura | `CHECKLIST_ITEMS` en `utils/circuito.ts` (declarativo) |

`recetas_por_sistema` es la excepción de OSEP, que carga sus recetas electrónicamente. Está en config y no hardcodeado para que sumar OSDE mañana no requiera tocar código (hay un match por nombre como respaldo).

Los `[DEFAULT]` de la FASE 3 que Administración todavía no cerró viven en **constantes de `utils/sobre/documentos.ts`**, no dispersos en el render: `UMBRAL_DESCUENTO_SIN_FACTURA`, `LEYENDA_A_CARGO_PACIENTE`, `LEYENDA_RECETA_POR_SISTEMA`, `DX_RECETAS` y `encabezadoSemana()`.

---

## 6. Archivos

```
src/modules/presupuestador/
├── components/
│   ├── AceptacionModal.tsx     rama del circuito al aceptar (LIO solo lectura)
│   ├── CircuitoPanel.tsx       checklist + botones del Sobre
│   └── CajaIngresoModal.tsx    montos del comprobante de caja
├── utils/
│   ├── circuito.ts             tipos, REST, CHECKLIST_ITEMS, lioSugerido()
│   └── sobre/
│       ├── pdfBase.ts          primitivas jsPDF, membrete, orientación por hoja
│       ├── documentos.ts       los 8 builders
│       └── index.ts            contexto + ensamblado + nombres de archivo
└── pages/BusquedaPresupuestosPage.tsx   donde vive toda la UI del circuito

migrations/33_presupuestos_lios_y_caja.sql        LIOs + columnas de caja + backfill
migrations/34_convenios_recetas_por_sistema.sql   flag recetas_por_sistema
migrations/44_caja_entregas_y_leyenda_lio.sql     entregas parciales + leyenda del LIO
src/test/sobreQuirurgico.test.ts                  77 casos sobre los 3 circuitos
```

Los tests extraen el **texto real del PDF** con regex sobre los operadores `(texto) Tj` del stream sin comprimir, así se puede afirmar sobre el contenido y no solo sobre que el PDF no explote.

Ojo con la extracción: el stream guarda **WinAnsi (CP1252), un byte por carácter**, y en `0x80–0x9F` CP1252 no coincide con Unicode. El guion largo se guarda como `0x97` y salía como `U+0097` en vez de `U+2014`, así que comparar contra el literal del código fallaba **aunque el PDF estuviera bien**. El helper `deWinAnsi()` remapea ese rango. Fuera de él los códigos coinciden (la "í" es `0xED` en los dos).

---

## 7. Gotchas de jsPDF (encontrados acá, cuestan caro de diagnosticar)

1. **Caracteres fuera de WinAnsi rompen el literal entero.** El menos tipográfico `−` (U+2212) hacía que jsPDF codificara toda la cadena en UTF-16 y el importe del descuento salía ilegible. Usar guion ASCII. El test tiene un guard que detecta bytes NUL en el texto extraído.

2. **`jspdf-autotable` crea páginas por su cuenta.** Al partir una tabla llama a `addPage()` internamente, sin pasar por `nuevaHoja()`, y esa página queda **sin membrete ni pie**. Solución estructural: `nuevaHoja()` ya no dibuja el pie, `cerrar()` lo estampa recorriendo **todas** las páginas (respetando que la apaisada mide distinto), y el cronograma repone el membrete vía el hook `didDrawPage` + `margin.top`. Lo detecta la aserción `count(membrete) === getNumberOfPages()`.

3. **Columnas `date` y zona horaria.** `fecha_tentativa_cirugia` es `date` y llega como `"2026-08-11"`; `new Date()` la ubica a medianoche UTC, que en Argentina es el día anterior — la fecha de cirugía salía impresa un día antes. Ver la memoria `feedback-fechas-date-offbyone`.

---

## 8. Cómo regenerar un sobre sin pasar por la UI

Para verificar cambios contra datos reales, sin clics: un test temporal que lee el presupuesto y su aceptación de Supabase con la service key, arma el contexto y escribe el PDF. El patrón está en el historial (`_sobre813.test.ts`, borrado tras usarlo).

Para inspeccionar el resultado **no hace falta ver la imagen**: `pdfjs-dist` (está en `server/node_modules`) extrae el texto con coordenadas, y eso alcanza para verificar el membrete, detectar solapamientos y confirmar posiciones. Sirve también el regex sobre los operadores `(texto) Tj` del stream, que es lo que usa el test.

**Sí se pueden revisar a ojo**, contra lo que decía esta sección: no hay rasterizador en la máquina (ni poppler, ni ghostscript, ni ImageMagick — el `convert` del PATH es el de Windows), pero el visor de PDF de Chrome alcanza. `file://` está bloqueado para la automatización, así que hay que servirlos por HTTP: un `http.createServer` de 15 líneas sobre la carpeta de salida y abrir `http://localhost:<puerto>/<archivo>.pdf`.

> Dos limitaciones del visor, medidas el 01/09/2026: **no responde** a `#page=N` cuando ya tenía estado, y el scroll con rueda **se interpreta como zoom**. Conviene emitir un PDF por documento (`docCaja` solo, `docCronograma` solo) y abrir cada uno en su URL: se ve la página 1 sin pelear con el visor.

**Para medir si algo se corta** —que es el problema real— no hace falta mirar: `(doc as any).lastAutoTable.finalY` da dónde termina la tabla, y se compara contra `ph - FOOTER_ALTO`.

---

## 9. Pendiente

1. **Texto legal del consentimiento.** Hoy hay un placeholder neutro (migración 38). Cuando Administración lo entregue, se carga como **nueva versión vigente** en `presupuestos_textos_legales` (clave `consentimiento_catarata`) — nueva fila, no editar la versión 1. No requiere tocar código. Confirmado que es **uno solo para todas las cataratas**, sin variantes por cobertura.

2. **Logo institucional.** Falta el archivo. Ver la sección de membrete.

3. **Decisión abierta:** el importe a cargo del paciente en obra social viene prellenado con la base del presupuesto. Administración pidió "carga manual"; si lo quieren en blanco para forzarla, es una línea en `CajaIngresoModal`.

4. **Prueba funcional pendiente** (Administración, 11/08/2026): **P-2026-813** para caja, Avastin y las 4 recetas; **P-2026-814** para el LIO de sólo lectura (tiene que preseleccionar "Multifocal PanOptix Pro" y no dejar cambiarlo); **P-2026-810** para el checklist de Particular sin "Orden autorizada".

### Lo que la FASE 3 dejó afuera, y por qué

5. **Una práctica por presupuesto — bloqueante de la sección 8 del prompt.** Administración pidió que un presupuesto con más de una práctica quirúrgica emita **un ingreso de caja, un pedido y un consentimiento por práctica**, porque se liquidan por separado y entran con códigos distintos.

   **Hoy no se puede.** `presupuestos.prestacion_codigo` es singular. En P-2026-813 la inyección de Avastin **no está cargada como práctica**: está como **insumo** (`datos_completos.insumos`, $106.973,11), y `prestacion_codigo` es `030502` (Monofocal). El sistema no imprime las dos juntas por un problema de layout — para el modelo hay **una sola práctica y un insumo caro**, así que no existe una segunda práctica sobre la cual emitir nada.

   Salir de ahí es decisión de negocio, y es el cambio más grande de toda la FASE 3: que el presupuestador acepte **múltiples prácticas** (modelo + UI de carga), y recién ahí iterar los documentos. La columna `practica_codigo` de `presupuestos_caja_entregas` ya está creada y queda en `NULL` hasta entonces, para no necesitar otra migración.

   Mientras tanto **los ítems e insumos se siguen detallando** en el comprobante (regla de FASE 1): lo que no se separa son las prácticas facturables.

6. **Código de la inyección intravítrea.** Administración lo debe informar. El de la catarata con facoemulsificación e implante de LIO plegable es **02.09.03** — ojo que ese mismo valor está hoy en `presupuestos_convenios.codigo_practica` de OSEP, que parece un doble uso del campo y conviene revisar.

7. **Preguntas abiertas de la FASE 3**, todas implementadas con su `[DEFAULT]` y aisladas en una constante: umbral del descuento que dispara `S/IVA`; redacción final de `LEYENDA_A_CARGO_PACIENTE`; confirmación de que en obra social el VALOR TOTAL es el importe a cargo del paciente; si las recetas de OSEP se imprimen o se suprimen; si el rango de fechas de las semanas se calcula automáticamente.
