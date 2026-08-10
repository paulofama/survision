# Circuito Quirúrgico — referencia

> Instituto Dr. Mercado · Sistema de Gestión Integral
> Última actualización: **2026-08-10**
> Commits: `97b821c` correcciones Fases 1 y 2 · `10185ce` fecha de cirugía · `3df139a` pie sin crédito de desarrollo.
> Migraciones: **33** (LIOs + caja), **34** (recetas por sistema), **38** (placeholder del consentimiento).

Cubre el tramo **Aceptar presupuesto → Circuito de cirugía → Sobre Quirúrgico → Ingreso de caja**, con las reglas que fijó Administración en el testeo funcional del 10-11/08/2026 sobre las tres coberturas.

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
| Receta de medicación adicional | Sí | **No** (sistema propio) | Sí |
| Ingreso de caja | Depósito por **monto o %** | **Monto único** | **Monto único** |
| Detalle de IVA | **Nunca** | **Nunca** | **Nunca** |
| Descuento autorizado | Línea propia + "Exento de IVA" | ídem | ídem |
| Ítems adicionales (ej. Avastin) | Detallados en caja | ídem | ídem |

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

El selector del modal queda **deshabilitado** con ese valor. Excepción deliberada: si la prestación no identifica ningún LIO (ej. un Yag Laser), el campo vuelve a ser editable, porque si no el operador no podría aceptar el presupuesto.

**Para volver a hacerlo editable:** `<AceptacionModal lioEditable />`.

---

## 3. Sobre Quirúrgico

Ocho documentos independientes, cada uno arrancando en hoja propia. `docsDelSobre()` los ordena: primero lo del paciente, al final lo de quirófano.

| # | Clave | Destino | Notas |
|---|---|---|---|
| 1 | `pedido` | Paciente | Ojo siempre; N° de afiliado solo si hay OS |
| 2 | `indicaciones` | Paciente | Prequirúrgico, día de la cirugía, cuidados post |
| 3 | `cronograma` | Paciente | **A4 apaisado, 14pt.** Ocupa 2 hojas |
| 4 | `recetas` | Paciente | **Una por hoja**, 3 fijas + 1 por medicación adicional |
| 5 | `analisis` | Paciente | Solo si el circuito requiere análisis/ECG |
| 6 | `caja` | Paciente | Comprobante de ingreso de caja |
| 7 | `trazabilidad` | **Quirófano** | Hoja propia, sello "ARCHIVAR EN QUIRÓFANO" |
| 8 | `consentimiento` | **Quirófano** | ídem |

Trazabilidad y consentimiento van últimos y separados **para poder desprenderlos al imprimir** y archivarlos en quirófano. Antes iban embebidos al pie de las indicaciones.

Páginas resultantes: Particular 11 (con análisis), OSEP 10, Círculo Médico 11 (la receta extra de la medicación).

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

El monto **siempre lo carga el operador a mano** (`CajaIngresoModal`), nunca se deduce. El modal se interpone antes de generar el comprobante o el sobre completo, y persiste lo cargado en `presupuestos_aceptacion`.

- **Particular:** depósito en garantía por **monto fijo** o por **porcentaje**. La base del porcentaje es el valor total de la cirugía, aislada en `baseDeposito()` para poder cambiarla en un solo lugar. Sin valor precargado.
- **Obra social:** **monto único**. Viene prellenado con la base del presupuesto antes del descuento; el operador puede pisarlo.

**Ningún comprobante discrimina IVA, en ninguna cobertura.** Las líneas replican el detalle del PDF del presupuesto que el paciente ya tiene firmado (subtotal / descuento / insumos / total) — ese PDF tampoco discrimina IVA. Espejarlo evita inventar un recálculo sobre un documento de dinero.

El **descuento autorizado** sale como línea propia con la aclaración **"Exento de IVA"** (con descuento no se emite factura) y descuenta del total. El descuento siempre estuvo bien persistido en `datos_completos.precios.descuento`; lo que fallaba es que el comprobante lo ignoraba.

El comprobante detalla el **ojo a operar** y el **concepto completo**: `Cirugía de catarata con LIO Monofocal + AVASTIN` (`conceptoCompleto()`), más cada ítem adicional con su importe.

---

## 5. Dónde se configura cada cosa

Todo lo que Administración puede querer cambiar está en datos, no en código:

| Qué | Dónde |
|---|---|
| LIOs y su mapeo a prestación | `presupuestos_lios` (`nombre`, `codigo_practica`) |
| Convenios, códigos, leyendas, cuenta, cupo | `presupuestos_convenios.config` (jsonb) |
| Qué convenio NO imprime recetas | `presupuestos_convenios.config.recetas_por_sistema` |
| Texto del consentimiento | `presupuestos_textos_legales` (versionable, una vigente) |
| Plazo de "sin respuesta" | `presupuestos_config.plazo_sin_respuesta_dias` |
| Ítems del checklist por cobertura | `CHECKLIST_ITEMS` en `utils/circuito.ts` (declarativo) |

`recetas_por_sistema` es la excepción de OSEP, que carga sus recetas electrónicamente. Está en config y no hardcodeado para que sumar OSDE mañana no requiera tocar código (hay un match por nombre como respaldo).

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
src/test/sobreQuirurgico.test.ts                  48 casos sobre los 3 circuitos
```

Los tests extraen el **texto real del PDF** con regex sobre los operadores `(texto) Tj` del stream sin comprimir, así se puede afirmar sobre el contenido y no solo sobre que el PDF no explote.

---

## 7. Gotchas de jsPDF (encontrados acá, cuestan caro de diagnosticar)

1. **Caracteres fuera de WinAnsi rompen el literal entero.** El menos tipográfico `−` (U+2212) hacía que jsPDF codificara toda la cadena en UTF-16 y el importe del descuento salía ilegible. Usar guion ASCII. El test tiene un guard que detecta bytes NUL en el texto extraído.

2. **`jspdf-autotable` crea páginas por su cuenta.** Al partir una tabla llama a `addPage()` internamente, sin pasar por `nuevaHoja()`, y esa página queda **sin membrete ni pie**. Solución estructural: `nuevaHoja()` ya no dibuja el pie, `cerrar()` lo estampa recorriendo **todas** las páginas (respetando que la apaisada mide distinto), y el cronograma repone el membrete vía el hook `didDrawPage` + `margin.top`. Lo detecta la aserción `count(membrete) === getNumberOfPages()`.

3. **Columnas `date` y zona horaria.** `fecha_tentativa_cirugia` es `date` y llega como `"2026-08-11"`; `new Date()` la ubica a medianoche UTC, que en Argentina es el día anterior — la fecha de cirugía salía impresa un día antes. Ver la memoria `feedback-fechas-date-offbyone`.

---

## 8. Cómo regenerar un sobre sin pasar por la UI

Para verificar cambios contra datos reales, sin clics: un test temporal que lee el presupuesto y su aceptación de Supabase con la service key, arma el contexto y escribe el PDF. El patrón está en el historial (`_sobre813.test.ts`, borrado tras usarlo).

Para inspeccionar el resultado **no hace falta ver la imagen**: `pdfjs-dist` (está en `server/node_modules`) extrae el texto con coordenadas, y eso alcanza para verificar el membrete, detectar solapamientos y confirmar posiciones. Sirve también el regex sobre los operadores `(texto) Tj` del stream, que es lo que usa el test.

> No hay rasterizador de PDF en la máquina (ni poppler, ni ghostscript, ni ImageMagick — el `convert` que aparece en el PATH es el de Windows). No se pueden convertir páginas a imagen para revisarlas a ojo.

---

## 9. Pendiente

1. **Texto legal del consentimiento.** Hoy hay un placeholder neutro (migración 38). Cuando Administración lo entregue, se carga como **nueva versión vigente** en `presupuestos_textos_legales` (clave `consentimiento_catarata`) — nueva fila, no editar la versión 1. No requiere tocar código. Confirmado que es **uno solo para todas las cataratas**, sin variantes por cobertura.

2. **Logo institucional.** Falta el archivo. Ver la sección de membrete.

3. **Decisión abierta:** el monto único de obra social viene prellenado con la base del presupuesto. Administración pidió "carga manual"; si lo quieren en blanco para forzarla, es una línea en `CajaIngresoModal`.

4. **Prueba funcional pendiente** (Administración, 11/08/2026): **P-2026-813** para caja, Avastin y las 4 recetas; **P-2026-814** para el LIO de sólo lectura (tiene que preseleccionar "Multifocal PanOptix Pro" y no dejar cambiarlo); **P-2026-810** para el checklist de Particular sin "Orden autorizada".
