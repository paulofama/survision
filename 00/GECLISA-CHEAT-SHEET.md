# GECLISA - CHEAT SHEET
## Referencia Rápida de Tablas y Columnas

**Servidor:** 192.168.1.73 | **Base:** Geclisa | **Versión:** SQL Server 2012

---

## 🔑 TABLAS PRINCIPALES

### FICHA (Pacientes)
```
Ficha_id (PK) | fic_ape | fic_nombre | fic_nrodoc | fic_sexo | fic_fechanac
td_id → TipoDoc | loc_id → Localidades | bar_id → Barrios
fic_cel | fic_email | Ben_idGecros (integración)
```

### MOVENCA (Atenciones) ⭐ CENTRAL
```
Me_id (PK) | Ficha_id → Ficha | Me_Fecha | Me_Hs
Os_id → ObrasSociales | Plan_id → Planes | Turno_id → Turnos
Me_Area ('A'mbulatorio/'I'nternación) | Nro_Afiliado | Cod_Auto
Me_Diagnostico | Me_Cose (coseguro) | Me_PacTot (total paciente)
PreFac_id → PreFac | Liq_id → Liquidaciones | Me_estado
Usu_Alta | Fec_Alta | Facturable | Controlado
```

### MOVPRAC (Prácticas por Atención) ⭐
```
Mp_id (PK) | Me_id → MovEnca
nom_id + nom_cod → Nomenclador | Serv_id → Servicios
Mp_Fecha | Mp_Can (cantidad) | Mp_Pre (precio) | Mp_Tot (total)
Mp_OsPorc (% OS) | Mp_CoseTotal (coseguro)
MovEst_id (estado) | AutorizadoWs
```

### MOVPRE (Prestadores por Práctica) ⭐
```
MPre_id (PK) | Mp_id → MovPrac
Pre_id → Prestadores | Conc_id → Conceptos
MPre_Pre (importe) | MPre_PrePorc (%) | MPre_Tot (total)
MPre_Forzado | MPre_CoseTotal
```

---

## 💰 FACTURACIÓN

### PFCOMP (Comprobantes Prefacturación)
```
PFComp_id (PK) | TComp_id → TipoComp | PreFac_id → PreFac
PF_Fecha | PF_Letra | PF_Suc | PF_NroDoc
os_id → ObrasSociales | EntFac_id → EntidadesFacturantes
PF_Neto | PF_Iva | PF_Total | PFComp_Anulado
Periodo (AAAAMM) | CAE | CAE_FecVen
```

### PFMOVPRAC (Prácticas Facturadas)
```
PFMp_id (PK) | Mp_id → MovPrac | Me_id → MovEnca
nom_id + nom_cod | Mp_Can | Mp_Pre | Mp_Tot
```

### PFMOVPRE (Prestadores Facturados)
```
PFMPre_id (PK) | PFComp_id → PFComp | Pre_id → Prestadores
MPre_Pre | MPre_Tot | PFMp_id → PFMovPrac
```

---

## 📋 LIQUIDACIONES

### LIQUIDACIONES (Encabezado)
```
Liq_id (PK) | Periodo | fec_ini | fec_fin
os_id → ObrasSociales | Plan_id → Planes | Pre_id → Prestadores
EntFac_id → EntidadesFacturantes | Conc_id → Conceptos
Neto | Iva | Total | Cerrada
```

### LIQUIDACIONESDETA (Detalle)
```
LiqDeta_id (PK) | Liq_id → Liquidaciones | Mpre_id → MovPre
Valor | IvaPorc | Iva | Total | LiqComp_id → LiqComp
```

### LIQCOMP (Comprobantes Liquidación)
```
LiqComp_id (PK) | Liq_id → Liquidaciones | Pre_id → Prestadores
LiqComp_Fecha | LiqComp_Letra | LiqComp_NroDoc
LiqComp_Neto | LiqComp_Iva | LiqComp_Total | LiqComp_Anulado
```

---

## 📅 TURNOS

### TURNOS
```
turno_id (PK) | ficha_id → Ficha | tur_fecha | Hs_Ini | Hs_Fin
os_id → ObrasSociales | plan_id → Planes | pre_id → Prestadores
serv_id → Servicios | nom_id + nom_cod → Nomenclador
Cons_id → Consultorios | Cro_id → Cronograma
Me_id → MovEnca (si atendido) | confirmado | esWeb
```

### CRONOGRAMA
```
Cro_id (PK) | pre_id → Prestadores | Serv_id → Servicios
dia_id (1-7) | Hs_Ini | Hs_Fin | Fec_Ini | Fec_Fin
Cons_id → Consultorios | disponibleWeb
```

---

## 📦 STOCK

### STOCKENCA (Movimientos)
```
Se_id (PK) | Se_Fecha | Prov_id → Proveedores
Dep_idOrigen → Depositos | Dep_idDestino → Depositos
Tms_id (tipo mov) | Se_SignoOrigen | Se_SignoDestino
```

### STOCKITEM (Detalle)
```
Si_Id (PK) | Se_id → StockEnca | Ele_id → Elementos
Can (cantidad) | SI_preuni | Si_Tot | Lote | FechaVto | GTIN
```

### ELEMENTOS (Productos)
```
Ele_id (PK) | Ele_Cod | Ele_nombre | Te_id (tipo)
Stock_Actual | Stock_Min | Punto_Reposicion
UnidadMedida | LlevaTrazabilidad | LlevaLoteVto
```

---

## 🏢 MAESTROS PRINCIPALES

### OBRASSOCIALES
```
os_id (PK) | os_cod | os_sigla | os_nombre
AgeFact_id → AgentesFacturacion | esParticular
ValidaPadron | validaPadronWS | disponibleWeb
```

### PLANES
```
plan_id (PK) | os_id → ObrasSociales | plan_nombre | plan_Codigo
```

### PRESTADORES
```
pre_id (PK) | pre_nombre | pre_matp (matrícula prov)
pre_cuit | prof_id → Profesiones | tp_id (tipo)
TIva_id | Pre_cbu | pre_email
```

### NOMENCLADOR (Prácticas) 🔑 PK Compuesta
```
nom_id + nom_cod (PK) | nom_nom (nombre)
turt_id (tipo turno) | nom_diasInt | nom_Modulo
```

### SERVICIOS
```
Serv_Id (PK) | Serv_Nombre | EntFac_id → EntidadesFacturantes
Dep_id → Depositos | disponibleWeb | serv_inactivo
```

### COBERTURA
```
Cob_id (PK) | Plan_id → Planes | Area ('A'/'I')
Nom_id | Cob_Codd | Cob_Codh (rango códigos)
Fec_Ini | Fec_Fin | Autoriza | OsPorc (% cobertura)
```

---

## 🔗 JOINS MÁS COMUNES

```sql
-- Atención completa con paciente y OS
FROM MovEnca me
INNER JOIN Ficha f ON me.Ficha_id = f.Ficha_id
LEFT JOIN ObrasSociales os ON me.Os_id = os.os_id
LEFT JOIN Planes p ON me.Plan_id = p.plan_id

-- Prácticas con nomenclador
FROM MovPrac mp
INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod

-- Prestadores por práctica
FROM MovPre mpr
INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
INNER JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id

-- Facturación completa
FROM PFComp pf
INNER JOIN PFMovPre pfmp ON pf.PFComp_id = pfmp.PFComp_id
INNER JOIN ObrasSociales os ON pf.os_id = os.os_id
```

---

## 📊 QUERIES FRECUENTES

### Atenciones por período
```sql
SELECT Me_Fecha, COUNT(*) AS Cant, SUM(Me_PacTot) AS Total
FROM MovEnca
WHERE Me_Fecha BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY Me_Fecha
```

### Facturado por OS
```sql
SELECT os.os_nombre, SUM(pf.PF_Total) AS Total
FROM PFComp pf
INNER JOIN ObrasSociales os ON pf.os_id = os.os_id
WHERE pf.PFComp_Anulado = 0
GROUP BY os.os_nombre
ORDER BY Total DESC
```

### Prácticas más realizadas
```sql
SELECT n.nom_nom, COUNT(*) AS Cant
FROM MovPrac mp
INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
GROUP BY n.nom_nom
ORDER BY Cant DESC
```

### Liquidado por prestador
```sql
SELECT pre.pre_nombre, SUM(ld.Total) AS Total
FROM LiquidacionesDeta ld
INNER JOIN MovPre mpr ON ld.Mpre_id = mpr.MPre_id
INNER JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id
GROUP BY pre.pre_nombre
ORDER BY Total DESC
```

---

## ⚠️ NOTAS IMPORTANTES

| Tema | Detalle |
|------|---------|
| **Nomenclador** | PK compuesta: `nom_id` + `nom_cod` |
| **Área** | 'A' = Ambulatorio, 'I' = Internación |
| **Horas** | Formato HHMM (ej: 1430 = 14:30) |
| **Período** | Formato AAAAMM (ej: 202511) |
| **Anulados** | Siempre filtrar `Anulado = 0` o `PFComp_Anulado = 0` |
| **Contabilidad** | Base separada "Conta" (sin acceso actual) |

---

## 📈 VOLUMEN DE DATOS

| Tabla | Registros |
|-------|-----------|
| HcControlValor | 828,991 |
| MovPre | 167,644 |
| HistoriasClinicas | 164,195 |
| PFMovPrac | 153,420 |
| MovPrac | 153,017 |
| MovEnca | 144,712 |

---

*Última actualización: 29/11/2025*
