# MANUAL TÉCNICO - BASE DE DATOS GECLISA
## Sistema de Gestión de Salud - Instituto Dr. Mercado

**Servidor:** 192.168.1.73  
**Instancia:** SQL Server 11.0.6020 (survision)  
**Base de Datos Principal:** Geclisa  
**Fecha Documentación:** 29 de noviembre de 2025  
**Generado por:** Claude AI

---

## ÍNDICE

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura de la Base de Datos](#2-arquitectura-de-la-base-de-datos)
3. [Módulo Pacientes](#3-módulo-pacientes)
4. [Módulo Atenciones y Prácticas](#4-módulo-atenciones-y-prácticas)
5. [Módulo Facturación](#5-módulo-facturación)
6. [Módulo Liquidaciones](#6-módulo-liquidaciones)
7. [Módulo Turnos](#7-módulo-turnos)
8. [Módulo Stock/Farmacia](#8-módulo-stockfarmacia)
9. [Módulo Proveedores](#9-módulo-proveedores)
10. [Módulo Historias Clínicas](#10-módulo-historias-clínicas)
11. [Tablas Maestras](#11-tablas-maestras)
12. [Seguridad y Usuarios](#12-seguridad-y-usuarios)
13. [Índices y Performance](#13-índices-y-performance)
14. [Relaciones (Foreign Keys)](#14-relaciones-foreign-keys)
15. [Vistas del Sistema](#15-vistas-del-sistema)
16. [Estadísticas de Datos](#16-estadísticas-de-datos)

---

## 1. RESUMEN EJECUTIVO

### 1.1 Descripción General

Geclisa es un sistema integral de gestión de salud que administra todas las operaciones de un centro médico, incluyendo:

- Gestión de pacientes y fichas médicas
- Administración de turnos y agenda médica
- Registro de atenciones ambulatorias e internaciones
- Facturación a obras sociales y particulares
- Liquidación de honorarios a prestadores
- Control de stock y farmacia
- Historias clínicas electrónicas
- Gestión de proveedores

### 1.2 Métricas de la Base de Datos

| Métrica | Valor |
|---------|-------|
| **Total de Tablas** | ~600+ |
| **Tablas con Datos** | ~200 activas |
| **Registros Totales** | ~3.5 millones |
| **Claves Primarias** | ~500 definidas |
| **Foreign Keys** | ~800+ relaciones |
| **Índices** | ~1000+ |
| **Vistas** | 30 |

### 1.3 Tablas Principales por Volumen

| Tabla | Registros | Descripción |
|-------|-----------|-------------|
| HcControlValor | 828,991 | Valores de controles HC |
| MovValoresEncaLog | 366,844 | Log de comprobantes |
| LogGeclisa | 351,910 | Log del sistema |
| LogHc | 234,936 | Log historias clínicas |
| MovPre | 167,644 | Prestadores por práctica |
| HistoriasClinicas | 164,195 | Historias clínicas |
| PFMovPre | 159,844 | Prefacturación prestadores |
| PFMovPrac | 153,420 | Prefacturación prácticas |
| MovPrac | 153,017 | Prácticas realizadas |
| MovEnca | 144,712 | Atenciones/Encabezados |

---

## 2. ARQUITECTURA DE LA BASE DE DATOS

### 2.1 Bases de Datos Disponibles

| Base | Propósito |
|------|-----------|
| **Geclisa** | Base principal operativa |
| **Conta** | Contabilidad (asientos, cuentas) |
| **EDWGeclisa** | Data Warehouse / BI |
| **pentahoGeclisa** | Reportes Pentaho |

### 2.2 Diagrama de Módulos

```
┌─────────────────────────────────────────────────────────────────┐
│                        GECLISA - MÓDULOS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   PACIENTES  │───▶│   TURNOS     │───▶│  ATENCIONES  │      │
│  │    Ficha     │    │   Turnos     │    │   MovEnca    │      │
│  │  FichaPlan   │    │  Cronograma  │    │   MovPrac    │      │
│  └──────────────┘    └──────────────┘    │   MovPre     │      │
│         │                                 └──────────────┘      │
│         │                                        │              │
│         ▼                                        ▼              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  HISTORIAS   │    │    STOCK     │    │ FACTURACIÓN  │      │
│  │  CLÍNICAS    │    │  StockEnca   │    │   PFComp     │      │
│  │HistoriasC..  │    │  StockItem   │    │  PFMovPrac   │      │
│  │HcControlValor│    │  Elementos   │    │  PFMovPre    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                  │              │
│                                                  ▼              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ PROVEEDORES  │    │   COBRANZA   │    │LIQUIDACIONES │      │
│  │   MovProv    │    │MovValoresEnca│    │Liquidaciones │      │
│  │ Proveedores  │    │  MovValores  │    │LiquidacDeta  │      │
│  └──────────────┘    └──────────────┘    │   LiqComp    │      │
│                                          └──────────────┘      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   TABLAS MAESTRAS                        │   │
│  │  ObrasSociales │ Planes │ Prestadores │ Nomenclador     │   │
│  │  Servicios │ Especialidades │ TipoComp │ TipoValores    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Convenciones de Nomenclatura

| Prefijo/Sufijo | Significado | Ejemplo |
|----------------|-------------|---------|
| `_id` | Clave primaria/foránea | `Ficha_id`, `Os_id` |
| `Fec_` | Campo fecha | `Fec_Alta`, `Fec_Modi` |
| `Usu_` | Usuario que realizó acción | `Usu_Alta`, `Usu_Modi` |
| `PF` | Prefacturación | `PFComp`, `PFMovPrac` |
| `Mov` | Movimiento | `MovEnca`, `MovPrac` |
| `Liq` | Liquidación | `LiqComp`, `LiquidacionesDeta` |
| `Hc` | Historia Clínica | `HcControlValor` |
| `Pre_` | Prestador | `Pre_id`, `Pre_nombre` |
| `Os_` | Obra Social | `Os_id`, `Os_nombre` |

---

## 3. MÓDULO PACIENTES

### 3.1 Tabla: Ficha (Pacientes)

**Descripción:** Almacena todos los datos demográficos y de contacto de los pacientes.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Ficha_id** | int | - | NO | 🔑 PK - Identificador único |
| fic_ape | varchar | 50 | NO | Apellido |
| fic_nombre | varchar | 50 | NO | Nombre |
| td_id | smallint | - | NO | FK → TipoDoc |
| fic_historiac | varchar | 25 | YES | Número de historia clínica |
| fic_nrodoc | varchar | 20 | NO | Número de documento |
| fic_sexo | char | 1 | NO | Sexo (M/F) |
| fic_fechanac | datetime | - | NO | Fecha de nacimiento |
| fic_calle | varchar | 50 | NO | Dirección - Calle |
| fic_nro | char | 5 | YES | Dirección - Número |
| fic_piso | char | 2 | YES | Dirección - Piso |
| fic_dpto | char | 2 | YES | Dirección - Departamento |
| bar_id | smallint | - | NO | FK → Barrios |
| loc_id | smallint | - | NO | FK → Localidades |
| fic_tele | char | 15 | YES | Teléfono fijo |
| fic_cel | char | 15 | YES | Celular |
| fic_Alergia | varchar | 200 | YES | Alergias conocidas |
| fic_cpostal | char | 10 | YES | Código postal |
| fic_obs | nvarchar | 150 | YES | Observaciones |
| fic_email | nvarchar | 100 | YES | Email |
| fic_ObsHC | nvarchar | 1000 | YES | Observaciones HC |
| fic_pre_idCab | int | - | YES | FK → Prestadores (médico cabecera) |
| Pre_id | int | - | YES | FK → Prestadores |
| TIva_idFicha | smallint | - | YES | Tipo IVA |
| fic_cuit | varchar | 20 | YES | CUIT/CUIL |
| Ben_idGecros | int | - | YES | ID beneficiario Gecros |
| Fic_ApeMaterno | varchar | 50 | YES | Apellido materno |
| Fic_SegundoNombre | varchar | 50 | YES | Segundo nombre |
| Loc_idNacimiento | smallint | - | YES | Localidad nacimiento |
| Pais_idNacimiento | smallint | - | YES | País nacimiento |
| GruCul_id | int | - | YES | Grupo cultural |
| EstadoCivil_id | smallint | - | YES | Estado civil |
| NivelEst_id | int | - | YES | Nivel de estudios |
| Ocupacion_id | int | - | YES | Ocupación |
| txtBarrio | varchar | 100 | YES | Barrio (texto libre) |
| concIB_id | smallint | - | YES | Concepto Ing. Brutos |
| condIB_id | smallint | - | YES | Condición Ing. Brutos |
| HabilitadoPortalPaciente | bit | - | YES | Acceso portal web |
| Fec_alta | datetime | - | YES | Fecha de alta |
| fic_conapn | nvarchar | 250 | YES | CONAPN |
| fic_email_tmp | nvarchar | 100 | YES | Email temporal |

**Índices:**
- `PK_Ficha` (CLUSTERED, único) - Ficha_id
- `apenom` (NONCLUSTERED) - Búsqueda por apellido/nombre
- `fechanac` (NONCLUSTERED) - Búsqueda por fecha nacimiento
- `apenomfechanac` (NONCLUSTERED) - Búsqueda combinada
- `Fic_historiac` (NONCLUSTERED) - Búsqueda por HC
- `Ben_idGecros` (NONCLUSTERED) - Integración Gecros

### 3.2 Tabla: FichaPlan (Planes por Paciente)

**Descripción:** Relación entre pacientes y sus planes de obra social.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **FicPlan_id** | int | - | NO | 🔑 PK |
| Ficha_id | int | - | NO | FK → Ficha |
| Plan_id | smallint | - | NO | FK → Planes |
| Nro_Afiliado | varchar | 25 | YES | Número de afiliado |
| IvaPorc_id | smallint | - | YES | FK → IvaPorc |

---

## 4. MÓDULO ATENCIONES Y PRÁCTICAS

### 4.1 Tabla: MovEnca (Encabezado de Atenciones)

**Descripción:** Registro principal de cada atención médica (ambulatoria o internación).

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Me_id** | int | - | NO | 🔑 PK - ID único de atención |
| Turno_id | int | - | YES | FK → Turnos |
| Ficha_id | int | - | NO | FK → Ficha (paciente) |
| Me_Fecha | datetime | - | NO | Fecha de atención |
| Me_Hs | smallint | - | YES | Hora (formato HHMM) |
| EntDer_id | int | - | YES | Entidad derivadora |
| SolProf_id | smallint | - | YES | Solicitud profesional |
| Sol_id | int | - | YES | Solicitud |
| Me_FechaSol | datetime | - | YES | Fecha solicitud |
| Pre_idMedCab | int | - | YES | FK → Prestadores (médico cabecera) |
| Serv_id_Ingreso | int | - | YES | FK → Servicios (ingreso) |
| Pre_idEgr | int | - | YES | FK → Prestadores (egreso) |
| Me_FechaEgrProb | datetime | - | YES | Fecha egreso probable |
| Me_HsEgrProb | smallint | - | YES | Hora egreso probable |
| Me_FechaEgr | datetime | - | YES | Fecha egreso real |
| Me_HsEgr | smallint | - | YES | Hora egreso real |
| Ta_id | smallint | - | YES | Tipo atención |
| Os_id | smallint | - | YES | FK → ObrasSociales |
| Plan_id | smallint | - | YES | FK → Planes |
| TInt_id | smallint | - | YES | Tipo internación |
| Nro_Afiliado | varchar | 25 | YES | Número de afiliado |
| IvaPorc_id | smallint | - | YES | FK → IvaPorc |
| Tb_id | smallint | - | YES | Tipo bono |
| Nro_Orden | varchar | 14 | YES | Número de orden |
| Nro_Int | varchar | 14 | YES | Número internación |
| Cod_Auto | varchar | 14 | YES | Código autorización |
| ResInt_id | int | - | YES | Responsable internación |
| Me_Ape | varchar | 50 | YES | Apellido (snapshot) |
| Me_Nombre | varchar | 50 | YES | Nombre (snapshot) |
| Me_Edad | smallint | - | YES | Edad al momento |
| Td_id | smallint | - | YES | FK → TipoDoc |
| Me_NroDoc | varchar | 20 | YES | Documento (snapshot) |
| **Me_Area** | char | 1 | NO | **A**mbulatorio / **I**nternación |
| Me_Rotulo | bit | - | YES | Tiene rótulo |
| Me_Diagnostico | varchar | 200 | YES | Diagnóstico |
| Me_Alergia | varchar | 200 | YES | Alergias |
| Me_CoseOs | decimal | - | YES | Coseguro OS |
| Me_Cose | decimal | - | YES | Coseguro total |
| Me_Ele | decimal | - | YES | Elementos |
| Me_PacIva | decimal | - | NO | IVA paciente |
| TIva_id | smallint | - | YES | Tipo IVA |
| Me_PacTot | decimal | - | YES | Total paciente |
| Me_obs | varchar | 200 | YES | Observaciones |
| PreFac_id | int | - | YES | FK → PreFac |
| Liq_id | int | - | YES | FK → Liquidaciones |
| Me_estado | varchar | 2 | YES | Estado |
| Usu_Alta | varchar | 50 | YES | Usuario alta |
| Fec_Alta | datetime | - | YES | Fecha alta sistema |
| Usu_Modi | varchar | 50 | YES | Usuario modificación |
| Fec_Modi | datetime | - | YES | Fecha modificación |
| Controlado | bit | - | YES | Controlado |
| Facturable | bit | - | YES | Es facturable |
| Controlado_liq | bit | - | YES | Controlado liquidación |
| Cons_id | smallint | - | YES | FK → Consultorios |
| TipoPrestacion | smallint | - | YES | Tipo prestación |
| Moneda_id | smallint | - | YES | FK → Monedas |
| enCurso | bit | - | YES | En curso |

**Índices Críticos:**
- `PK_MovEnca` (CLUSTERED, único) - Me_id
- `IX_MovEnca_Ficha_id` - Búsqueda por paciente
- `IX_MovEnca_Os_id` - Búsqueda por obra social
- `IX_MovEnca_Me_Fecha` - Búsqueda por fecha
- `IX_MovEnca_Plan_id` - Búsqueda por plan
- `IX_MovEnca_Me_Area` - Filtro ambulatorio/internación
- `IX_MovEncaMeOsPlanFecha` - Multiconsulta

### 4.2 Tabla: MovPrac (Prácticas por Atención)

**Descripción:** Detalle de prácticas/estudios realizados en cada atención.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Mp_id** | int | - | NO | 🔑 PK |
| Me_id | int | - | NO | FK → MovEnca |
| nom_id | smallint | - | NO | FK → Nomenclador |
| nom_cod | char | 10 | NO | Código nomenclador |
| Serv_id | smallint | - | YES | FK → Servicios |
| Mp_Fecha | datetime | - | YES | Fecha práctica |
| Mp_Can | decimal | - | NO | Cantidad |
| Mp_Pre | decimal | - | YES | Precio unitario |
| Mp_Iva | decimal | - | YES | IVA |
| Mp_IvaPorc | decimal | - | YES | % IVA |
| Mp_Tot | decimal | - | YES | Total |
| Mp_Obs | varchar | 100 | YES | Observaciones |
| MovEst_id | char | 2 | YES | Estado movimiento |
| MotDeb_id | int | - | YES | Motivo débito |
| Tmp_id | int | - | YES | Template |
| Usu_Alta | varchar | 50 | YES | Usuario alta |
| Fec_Alta | datetime | - | YES | Fecha alta |
| Usu_Modi | varchar | 50 | YES | Usuario modificación |
| Fec_Modi | datetime | - | YES | Fecha modificación |
| Mp_OsPorc | decimal | - | YES | % cobertura OS |
| EsModuloPrincipal | bit | - | YES | Es módulo principal |
| pedEstP_id | int | - | YES | Pedido estudios |
| Mp_Hs | smallint | - | YES | Hora |
| Plazo_id | int | - | YES | Plazo entrega |
| mp_CodAuto | varchar | 14 | YES | Código autorización |
| Mp_CoseNeto | decimal | - | YES | Coseguro neto |
| Mp_CoseIVA | decimal | - | YES | Coseguro IVA |
| Mp_CoseTotal | decimal | - | YES | Coseguro total |
| Mp_CoseOSNeto | decimal | - | YES | Coseguro OS neto |
| Mp_CoseOSIva | decimal | - | YES | Coseguro OS IVA |
| Mp_CoseOsTotal | decimal | - | YES | Coseguro OS total |
| AutorizadoWs | bit | - | YES | Autorizado por WS |
| EstadoAutorizadoWs | varchar | 255 | YES | Estado autorización WS |

**Índices:**
- `PK_MovPrac` (CLUSTERED, único) - Mp_id
- `Ind_MovPrac_Me_id` - Búsqueda por atención
- `Ind_MovPrac_Codigo` - Búsqueda por código
- `IX_MovPracServ_id` - Búsqueda por servicio

### 4.3 Tabla: MovPre (Prestadores por Práctica)

**Descripción:** Asignación de prestadores a cada práctica realizada.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **MPre_id** | int | - | NO | 🔑 PK |
| Mp_id | int | - | NO | FK → MovPrac |
| Conc_id | smallint | - | NO | FK → Conceptos |
| Pre_id | int | - | NO | FK → Prestadores |
| MPre_Pre | decimal | - | NO | Importe prestador |
| MPre_Iva | decimal | - | YES | IVA |
| MPre_IvaPorc | decimal | - | YES | % IVA |
| MPre_Tot | decimal | - | YES | Total |
| MPre_Forzado | bit | - | NO | Valor forzado |
| MPre_PrePorc | decimal | - | NO | % del prestador |
| Usu_Alta | varchar | 50 | YES | Usuario alta |
| Fec_Alta | datetime | - | YES | Fecha alta |
| Usu_Modi | varchar | 50 | YES | Usuario modificación |
| Fec_Modi | datetime | - | YES | Fecha modificación |
| MPre_CoseNeto | decimal | - | YES | Coseguro neto |
| MPre_CoseIVA | decimal | - | YES | Coseguro IVA |
| MPre_CoseTotal | decimal | - | YES | Coseguro total |
| Mpre_CoseOSNeto | decimal | - | YES | Coseguro OS neto |
| Mpre_CoseOSIva | decimal | - | YES | Coseguro OS IVA |
| Mpre_CoseOSTotal | decimal | - | YES | Coseguro OS total |

---

## 5. MÓDULO FACTURACIÓN

### 5.1 Tabla: PFComp (Comprobantes de Prefacturación)

**Descripción:** Comprobantes de facturación a obras sociales.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **PFComp_id** | int | - | NO | 🔑 PK |
| TComp_id | int | - | YES | FK → TipoComp |
| PreFac_id | int | - | YES | FK → PreFac |
| PF_Fecha | datetime | - | YES | Fecha comprobante |
| PF_Letra | char | 1 | YES | Letra (A/B/C) |
| PF_Suc | numeric | - | YES | Sucursal |
| PF_NroDoc | numeric | - | YES | Número documento |
| PF_Nombre | varchar | 100 | YES | Razón social |
| PF_Dir | varchar | 100 | YES | Dirección |
| PF_Cuit | varchar | 14 | YES | CUIT |
| Tiva_id | smallint | - | YES | Tipo IVA |
| PF_Neto | numeric | - | YES | Neto |
| PF_Iva | numeric | - | YES | IVA |
| PF_Total | numeric | - | YES | Total |
| PF_Obs | varchar | 250 | YES | Observaciones |
| PFComp_Anulado | bit | - | YES | Anulado |
| EntFac_id | int | - | YES | FK → EntidadesFacturantes |
| AgeFact_id | int | - | YES | FK → AgentesFacturacion |
| os_id | smallint | - | YES | FK → ObrasSociales |
| Periodo | char | 6 | YES | Período (AAAAMM) |
| CAE | varchar | 200 | YES | CAE AFIP |
| CAE_FecVen | datetime | - | YES | Vencimiento CAE |
| Moneda_id | smallint | - | YES | FK → Monedas |

### 5.2 Tabla: PFMovPrac (Prácticas Prefacturadas)

**Descripción:** Detalle de prácticas incluidas en prefacturación.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **PFMp_id** | int | - | NO | 🔑 PK |
| PFMe_id | int | - | YES | Encabezado PF |
| Mp_id | int | - | NO | FK → MovPrac |
| Me_id | int | - | NO | FK → MovEnca |
| nom_id | smallint | - | NO | FK → Nomenclador |
| nom_cod | char | 10 | NO | Código |
| Serv_id | smallint | - | YES | FK → Servicios |
| Mp_Fecha | datetime | - | YES | Fecha |
| Mp_Can | decimal | - | NO | Cantidad |
| Mp_Pre | decimal | - | YES | Precio |
| Mp_Iva | decimal | - | YES | IVA |
| Mp_Tot | decimal | - | YES | Total |
| Mp_OsPorc | decimal | - | YES | % OS |
| Mp_CoseNeto | decimal | - | YES | Coseguro neto |
| Mp_CoseTotal | decimal | - | YES | Coseguro total |

### 5.3 Tabla: PFMovPre (Prestadores Prefacturados)

**Descripción:** Detalle de prestadores en prefacturación.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **PFMPre_id** | int | - | NO | 🔑 PK |
| PFMp_id | int | - | YES | FK → PFMovPrac |
| MPre_id | int | - | NO | FK → MovPre |
| Mp_id | int | - | NO | FK → MovPrac |
| Conc_id | smallint | - | NO | FK → Conceptos |
| Pre_id | int | - | NO | FK → Prestadores |
| MPre_Pre | decimal | - | NO | Importe |
| MPre_Iva | decimal | - | YES | IVA |
| MPre_Tot | decimal | - | YES | Total |
| PreFac_id | int | - | YES | FK → PreFac |
| PFComp_id | int | - | YES | FK → PFComp |

---

## 6. MÓDULO LIQUIDACIONES

### 6.1 Tabla: Liquidaciones

**Descripción:** Encabezado de liquidaciones a prestadores.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Liq_id** | int | - | NO | 🔑 PK |
| Periodo | char | 6 | YES | Período (AAAAMM) |
| PeriodoTitulo | varchar | 50 | YES | Título período |
| fec_ini | datetime | - | YES | Fecha inicio |
| fec_fin | datetime | - | YES | Fecha fin |
| os_id | smallint | - | YES | FK → ObrasSociales |
| GruPra_id | int | - | YES | Grupo prácticas |
| Area | char | 1 | YES | A/I |
| Conc_id | smallint | - | YES | FK → Conceptos |
| Pre_id | int | - | YES | FK → Prestadores |
| IvaPorc_id | smallint | - | YES | FK → IvaPorc |
| EntFac_id | int | - | YES | FK → EntidadesFacturantes |
| Elementos | bit | - | YES | Incluye elementos |
| Neto | decimal | - | YES | Total neto |
| Iva | decimal | - | YES | Total IVA |
| Total | decimal | - | YES | Total |
| Cerrada | bit | - | YES | Liquidación cerrada |
| Plan_id | smallint | - | YES | FK → Planes |
| Moneda_id | smallint | - | YES | FK → Monedas |

### 6.2 Tabla: LiquidacionesDeta

**Descripción:** Detalle de prácticas liquidadas.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **LiqDeta_id** | int | - | NO | 🔑 PK |
| PreAge_id | int | - | YES | Prestador agente |
| Mpre_id | int | - | YES | FK → MovPre |
| Valor | decimal | - | YES | Valor liquidado |
| Liq_id | int | - | YES | FK → Liquidaciones |
| LiqFormu_id | int | - | YES | FK → LiqFormulas |
| LiqComp_id | int | - | YES | FK → LiqComp |
| IvaPorc | decimal | - | YES | % IVA |
| Iva | decimal | - | YES | IVA |
| Total | decimal | - | YES | Total |

### 6.3 Tabla: LiqComp (Comprobantes de Liquidación)

**Descripción:** Comprobantes emitidos por liquidaciones.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **LiqComp_id** | int | - | NO | 🔑 PK |
| TComp_id | int | - | YES | FK → TipoComp |
| Liq_id | int | - | YES | FK → Liquidaciones |
| LiqComp_Fecha | datetime | - | YES | Fecha |
| LiqComp_Letra | char | 1 | YES | Letra |
| LiqComp_Suc | numeric | - | YES | Sucursal |
| LiqComp_NroDoc | numeric | - | YES | Número |
| LiqComp_Nombre | varchar | 100 | YES | Nombre |
| LiqComp_Cuit | varchar | 14 | YES | CUIT |
| LiqComp_Neto | money | - | YES | Neto |
| LiqComp_Iva | money | - | YES | IVA |
| LiqComp_Total | money | - | YES | Total |
| LiqComp_Anulado | bit | - | YES | Anulado |
| Pre_id | int | - | YES | FK → Prestadores |
| Me_id | int | - | YES | FK → MovEnca |

---

## 7. MÓDULO TURNOS

### 7.1 Tabla: Turnos

**Descripción:** Agenda de turnos de pacientes.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **turno_id** | int | - | NO | 🔑 PK |
| serv_id | smallint | - | NO | FK → Servicios |
| tur_fsol | datetime | - | NO | Fecha solicitud |
| tur_fecha | datetime | - | NO | Fecha turno |
| Hs_Ini | smallint | - | NO | Hora inicio |
| Hs_Fin | smallint | - | NO | Hora fin |
| tur_tiempo | smallint | - | NO | Duración minutos |
| ficha_id | int | - | NO | FK → Ficha |
| ttd_id | smallint | - | YES | Tipo documento |
| tfic_nrodoc | varchar | 20 | YES | Documento |
| tfic_ape | varchar | 50 | NO | Apellido |
| tfic_nombre | varchar | 50 | NO | Nombre |
| tsexo | char | 1 | NO | Sexo |
| tedad | smallint | - | NO | Edad |
| ttelefono | varchar | 40 | YES | Teléfono |
| os_id | smallint | - | NO | FK → ObrasSociales |
| plan_id | smallint | - | YES | FK → Planes |
| pre_id | int | - | NO | FK → Prestadores |
| nom_id | smallint | - | NO | FK → Nomenclador |
| nom_cod | char | 10 | NO | Código práctica |
| nom_nom | char | 50 | NO | Nombre práctica |
| turt_id | smallint | - | NO | Tipo turno |
| Me_id | int | - | YES | FK → MovEnca (si se atendió) |
| Cons_id | smallint | - | YES | FK → Consultorios |
| Nro_Afiliado | varchar | 25 | YES | Número afiliado |
| confirmado | bit | - | YES | Turno confirmado |
| esWeb | bit | - | YES | Turno online |
| esVideoConsulta | bit | - | YES | Videoconsulta |
| Cro_id | int | - | YES | FK → Cronograma |

**Índices:**
- `PK_turnos` (CLUSTERED, único) - turno_id
- `IX_Turnos_Ficha` - Búsqueda por paciente
- `IX_Turnos` - Búsqueda general

### 7.2 Tabla: Cronograma

**Descripción:** Configuración de agenda de profesionales.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Cro_id** | int | - | NO | 🔑 PK |
| dia_id | smallint | - | NO | Día semana (1-7) |
| Serv_id | smallint | - | NO | FK → Servicios |
| pre_id | int | - | NO | FK → Prestadores |
| Hs_Ini | smallint | - | NO | Hora inicio |
| Hs_Fin | smallint | - | NO | Hora fin |
| Fec_Ini | datetime | - | NO | Vigencia desde |
| Fec_Fin | datetime | - | NO | Vigencia hasta |
| turt_id | smallint | - | NO | Tipo turno |
| Cons_id | smallint | - | YES | FK → Consultorios |
| disponibleWeb | bit | - | YES | Disponible web |
| disponibleWhatapps | bit | - | YES | Disponible WhatsApp |
| CantMaxEntreTur | smallint | - | YES | Máx turnos simultáneos |
| Tipo | char | 1 | YES | Tipo cronograma |
| CantPacientesSimultaneos | smallint | - | YES | Pacientes simultáneos |

### 7.3 Tabla: Consultorios

**Descripción:** Consultorios/salas disponibles.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Cons_id** | smallint | - | NO | 🔑 PK |
| Cons_Nombre | nvarchar | 50 | YES | Nombre |
| Cons_Direccion | nvarchar | 100 | YES | Dirección |
| Cons_Telefono | nvarchar | 50 | YES | Teléfono |
| Loc_id | smallint | - | YES | FK → Localidades |
| Ubic_id | smallint | - | YES | Ubicación |
| sala_id | smallint | - | YES | Sala |

---

## 8. MÓDULO STOCK/FARMACIA

### 8.1 Tabla: StockEnca (Movimientos de Stock)

**Descripción:** Encabezado de movimientos de inventario.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Se_id** | int | - | NO | 🔑 PK |
| Se_Fecha | datetime | - | YES | Fecha movimiento |
| Se_Letra | char | 1 | YES | Letra comprobante |
| Se_Suc | smallint | - | YES | Sucursal |
| Se_Nro | int | - | YES | Número |
| Prov_id | int | - | YES | FK → Proveedores |
| Se_Hs | smallint | - | YES | Hora |
| Dep_idOrigen | smallint | - | YES | FK → Depositos (origen) |
| Dep_idDestino | smallint | - | YES | FK → Depositos (destino) |
| Tms_id | int | - | YES | Tipo movimiento stock |
| Se_SignoOrigen | smallint | - | YES | Signo origen (+/-) |
| Se_SignoDestino | smallint | - | YES | Signo destino (+/-) |
| MProv_id | int | - | YES | FK → MovProv |
| se_Obs | varchar | 250 | YES | Observaciones |
| Moneda_id | smallint | - | YES | FK → Monedas |

### 8.2 Tabla: StockItem (Ítems de Stock)

**Descripción:** Detalle de productos en movimientos.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Si_Id** | int | - | NO | 🔑 PK |
| Se_id | int | - | NO | FK → StockEnca |
| Ele_id | int | - | YES | FK → Elementos |
| SI_preuni | decimal | - | YES | Precio unitario |
| Can | decimal | - | YES | Cantidad |
| Si_Iva | decimal | - | YES | IVA |
| Si_Tot | decimal | - | YES | Total |
| IvaPorc | decimal | - | YES | % IVA |
| IvaPorc_id | smallint | - | YES | FK → IvaPorc |
| Lote | nvarchar | 50 | YES | Número lote |
| FechaVto | datetime | - | YES | Vencimiento |
| GTIN | nvarchar | 14 | YES | Código GTIN |
| NroSerie | nvarchar | 20 | YES | Número serie |

### 8.3 Tabla: Elementos (Productos/Insumos)

**Descripción:** Catálogo de productos e insumos.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Ele_id** | int | - | NO | 🔑 PK |
| Ele_Cod | varchar | 25 | NO | Código producto |
| Te_id | smallint | - | NO | Tipo elemento |
| EleFormula_id | varchar | 3 | YES | Fórmula |
| Ele_coef | decimal | - | YES | Coeficiente |
| Stock_Min | decimal | - | YES | Stock mínimo |
| Punto_Reposicion | decimal | - | YES | Punto reposición |
| Can_Pedido | decimal | - | YES | Cantidad pedido |
| Stock_Actual | decimal | - | YES | Stock actual |
| UnidadMedida | char | 10 | YES | Unidad medida |
| LlevaTrazabilidad | bit | - | YES | Requiere trazabilidad |
| LlevaLoteVto | bit | - | YES | Requiere lote/vto |
| Ele_nombre | varchar | 250 | YES | Nombre producto |
| Fraccionable | bit | - | YES | Es fraccionable |
| Potencia | decimal | - | YES | Potencia |
| tipoadm_id | smallint | - | YES | Tipo administración |
| UnidadesPorEnvase | decimal | - | YES | Unidades por envase |

### 8.4 Tabla: Depositos

**Descripción:** Depósitos/almacenes.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Dep_id** | smallint | - | NO | 🔑 PK |
| Dep_Nombre | varchar | 50 | YES | Nombre depósito |

---

## 9. MÓDULO PROVEEDORES

### 9.1 Tabla: Proveedores

**Descripción:** Maestro de proveedores.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Prov_id** | int | - | NO | 🔑 PK |
| Prov_Nombre | varchar | 50 | YES | Razón social |
| CUIT | varchar | 20 | YES | CUIT |
| IngrBrutos_Nro | varchar | 20 | YES | Nro Ing. Brutos |
| Iva_id | smallint | - | YES | Condición IVA |
| Prov_Calle | varchar | 50 | YES | Dirección |
| Prov_Nro | varchar | 20 | YES | Número |
| Bar_id | smallint | - | YES | FK → Barrios |
| Loc_id | smallint | - | YES | FK → Localidades |
| CodigoPostal | varchar | 20 | YES | CP |
| Prov_tel | varchar | 20 | YES | Teléfono |
| Prov_Cod | varchar | 10 | YES | Código interno |
| concGan_id | smallint | - | YES | Concepto ganancias |
| condGan_id | smallint | - | YES | Condición ganancias |
| tipoProv_id | smallint | - | YES | Tipo proveedor |
| prov_aorden | varchar | 50 | YES | A orden de |
| prov_plazopago | smallint | - | YES | Plazo pago |
| RetieneSuss | bit | - | YES | Retiene SUSS |
| Prov_email | varchar | 200 | YES | Email |
| Prov_cbu | varchar | 22 | YES | CBU |
| Prov_cbuAlias | varchar | 20 | YES | Alias CBU |

### 9.2 Tabla: MovProv (Comprobantes de Proveedores)

**Descripción:** Facturas y comprobantes de proveedores.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **MProv_id** | int | - | NO | 🔑 PK |
| Fecha | datetime | - | YES | Fecha comprobante |
| FechaVenc | datetime | - | YES | Vencimiento |
| FecContable | datetime | - | YES | Fecha contable |
| Prov_id | int | - | YES | FK → Proveedores |
| Nombre | varchar | 50 | YES | Nombre |
| CUIT | varchar | 20 | YES | CUIT |
| Direccion | varchar | 100 | YES | Dirección |
| TComp_id | int | - | YES | FK → TipoComp |
| Letra | char | 2 | YES | Letra |
| Numero | int | - | YES | Número |
| TIva_id | smallint | - | YES | Tipo IVA |
| Neto | numeric | - | YES | Neto |
| IVA | numeric | - | YES | IVA |
| Total | numeric | - | YES | Total |
| Obs | varchar | 100 | YES | Observaciones |
| EntFac_id | int | - | YES | FK → EntidadesFacturantes |
| Anulado | bit | - | YES | Anulado |
| PercepcionIva | numeric | - | YES | Percepción IVA |
| PercepcionIB | numeric | - | YES | Percepción IIBB |
| OtrosConceptos | numeric | - | YES | Otros conceptos |
| Moneda_id | smallint | - | YES | FK → Monedas |
| Suc | int | - | YES | Sucursal |

### 9.3 Tabla: MovProv_Deta (Detalle Comprobantes)

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| MProv_id | int | - | YES | FK → MovProv |
| Neto | numeric | - | YES | Neto |
| IvaPorc | numeric | - | YES | % IVA |
| Iva | numeric | - | YES | IVA |
| Total | numeric | - | YES | Total |
| IvaPorc_id | smallint | - | YES | FK → IvaPorc |
| concepto | varchar | 50 | YES | Concepto |

---

## 10. MÓDULO HISTORIAS CLÍNICAS

### 10.1 Tabla: HistoriasClinicas

**Descripción:** Evoluciones y registros de historia clínica.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Hc_id** | int | - | NO | 🔑 PK |
| Hc_Fecha | datetime | - | YES | Fecha registro |
| Hc_Hs | smallint | - | YES | Hora |
| Pre_id | int | - | YES | FK → Prestadores |
| Ficha_id | int | - | YES | FK → Ficha |
| Texto | text | MAX | YES | Contenido HC |
| Usu_Alta | varchar | 50 | YES | Usuario alta |
| Fec_Alta | datetime | - | YES | Fecha alta |
| Usu_Modi | varchar | 50 | YES | Usuario modificación |
| Fec_Modi | datetime | - | YES | Fecha modificación |
| Me_id | int | - | YES | FK → MovEnca |
| Esp_id | smallint | - | YES | FK → Especialidades |
| np_id | int | - | YES | Nota predefinida |

### 10.2 Tabla: HcControlValor

**Descripción:** Valores de controles estructurados en HC.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **HcCtrValor_id** | int | - | NO | 🔑 PK |
| PanCtr_id | int | - | YES | Control de pantalla |
| valorSiNo | bit | - | YES | Valor booleano |
| valorFecha | datetime | - | YES | Valor fecha |
| esCadena | bit | - | YES | Es tipo cadena |
| esNumerico | bit | - | YES | Es tipo numérico |
| esSiNo | bit | - | YES | Es tipo si/no |
| esFecha | bit | - | YES | Es tipo fecha |
| HcPan_id | int | - | YES | Panel HC |
| valorCadena | varchar | 1000 | YES | Valor texto |
| valorNumerico | decimal | - | YES | Valor numérico |

---

## 11. TABLAS MAESTRAS

### 11.1 Tabla: ObrasSociales

**Descripción:** Maestro de obras sociales y prepagas.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **os_id** | smallint | - | NO | 🔑 PK |
| os_cod | int | - | NO | Código OS |
| os_sigla | varchar | 15 | NO | Sigla |
| os_nombre | varchar | 100 | NO | Nombre completo |
| os_calle | varchar | 50 | YES | Dirección |
| os_nro | char | 10 | YES | Número |
| bar_id | smallint | - | NO | FK → Barrios |
| loc_id | smallint | - | NO | FK → Localidades |
| os_codenos | varchar | 20 | YES | Código ENOS |
| os_telefono | char | 20 | YES | Teléfono |
| estado | smallint | - | NO | Estado (activo/inactivo) |
| AgeFact_id | int | - | YES | FK → AgentesFacturacion |
| eliminado | bit | - | NO | Eliminado lógico |
| DiaCorte | int | - | YES | Día corte facturación |
| DiasVencimientoAutorizacion | smallint | - | YES | Días vigencia autoriz. |
| esParticular | bit | - | YES | Es particular |
| ValidaPadron | bit | - | YES | Valida padrón |
| diasVtoFact | smallint | - | YES | Días vto factura |
| validaPadronWS | bit | - | YES | Valida padrón WS |
| grabaAutorizacionWs | bit | - | YES | Graba autoriz. WS |
| ComponenteWs | char | 50 | YES | Componente WS |
| BonoObligatorioAmb | bit | - | YES | Bono obligatorio amb. |
| DiagObligatorioAmb | bit | - | YES | Diagnóstico obligatorio |
| disponibleWeb | bit | - | YES | Disponible turnos web |
| os_email | varchar | 100 | YES | Email |
| AutorizaWsDirecto | bit | - | YES | Autoriza WS directo |
| VademecumRestringido | bit | - | YES | Vademecum restringido |
| disponibleAutoRecepcion | bit | - | YES | Auto recepción |
| wsURL | nvarchar | 250 | YES | URL WebService |
| wsCuit | nvarchar | 50 | YES | CUIT WS |
| disponibleWhatsApp | bit | - | YES | WhatsApp habilitado |

### 11.2 Tabla: Planes

**Descripción:** Planes por obra social.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **plan_id** | smallint | - | NO | 🔑 PK |
| plan_nombre | varchar | 50 | NO | Nombre plan |
| fec_ini | datetime | - | YES | Vigencia desde |
| fec_fin | datetime | - | YES | Vigencia hasta |
| os_id | smallint | - | NO | FK → ObrasSociales |
| plan_Codigo | nvarchar | 25 | YES | Código |
| disponibleWhatsApp | bit | - | YES | WhatsApp habilitado |
| plan_nombreWhatsApp | varchar | 50 | YES | Nombre WhatsApp |

### 11.3 Tabla: Prestadores

**Descripción:** Profesionales y técnicos.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **pre_id** | int | - | NO | 🔑 PK |
| pre_nombre | varchar | 50 | NO | Nombre completo |
| pre_dir | varchar | 50 | YES | Dirección |
| loc_id | smallint | - | YES | FK → Localidades |
| bar_id | smallint | - | YES | FK → Barrios |
| pre_cpostal | smallint | - | YES | Código postal |
| pre_tel | varchar | 15 | YES | Teléfono |
| pre_cel | varchar | 15 | YES | Celular |
| pre_matn | int | - | YES | Matrícula nacional |
| pre_matp | int | - | NO | Matrícula provincial |
| pre_cod | int | - | YES | Código interno |
| td_id | smallint | - | NO | FK → TipoDoc |
| doc_id | varchar | 20 | NO | Documento |
| pre_cuit | varchar | 20 | YES | CUIT |
| tp_id | smallint | - | NO | Tipo prestador |
| prof_id | smallint | - | NO | FK → Profesiones |
| pre_email | varchar | 50 | YES | Email |
| TIva_id | smallint | - | YES | Condición IVA |
| concGan_id | smallint | - | YES | Concepto ganancias |
| condGan_Id | smallint | - | YES | Condición ganancias |
| ConcIB_id | smallint | - | YES | Concepto IIBB |
| CondIB_id | smallint | - | YES | Condición IIBB |
| pre_observaciones | varchar | 2000 | YES | Observaciones |
| ReporteReceta | nvarchar | 50 | YES | Reporte receta |
| Cod_OS | varchar | 50 | YES | Código OS |
| Pre_cbu | varchar | 22 | YES | CBU |
| Pre_cbuAlias | varchar | 20 | YES | Alias CBU |
| OcultarTurnosLibres | bit | - | YES | Ocultar turnos web |
| SexoAtiende | char | 1 | YES | Sexo que atiende |

### 11.4 Tabla: Nomenclador

**Descripción:** Catálogo de prácticas médicas.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **nom_id** | smallint | - | NO | 🔑 PK (compuesta) |
| **nom_cod** | char | 10 | NO | 🔑 PK (compuesta) - Código |
| nom_nom | varchar | 100 | NO | Nombre práctica |
| turt_id | smallint | - | NO | Tipo turno |
| nom_tcir | smallint | - | YES | Tiempo cirugía |
| nom_diasInt | smallint | - | YES | Días internación |
| nom_obs | text | MAX | YES | Observaciones |
| nom_CantMax | int | - | YES | Cantidad máxima |
| nom_DuracionDias | int | - | YES | Duración días |
| nom_Orden | smallint | - | YES | Orden |
| ModPami | smallint | - | YES | Módulo PAMI |
| nom_Modulo | char | 10 | YES | Módulo |

### 11.5 Tabla: Servicios

**Descripción:** Servicios/áreas del centro médico.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Serv_Id** | smallint | - | NO | 🔑 PK |
| Serv_Nombre | varchar | 50 | YES | Nombre servicio |
| EntFac_id | int | - | YES | FK → EntidadesFacturantes |
| Dep_id | smallint | - | YES | FK → Depositos |
| GeneraRotulo | bit | - | YES | Genera rótulo |
| cr_id | smallint | - | YES | Centro responsabilidad |
| PrgImprime | nvarchar | 100 | YES | Programa impresión |
| generainfolab | bit | - | YES | Genera info laboratorio |
| Serv_reporte | varchar | 50 | YES | Reporte |
| Nom_IdTur | smallint | - | YES | Nomenclador turno |
| Nom_CodTur | char | 10 | YES | Código nomenclador |
| disponibleWeb | bit | - | YES | Disponible web |
| NombreAPP | varchar | 50 | YES | Nombre en APP |
| NoSolicAmb | bit | - | YES | No solicita ambulatorio |
| PidePlazoInforme | bit | - | YES | Pide plazo informe |
| Plazo_idAmb | int | - | YES | Plazo ambulatorio |
| Plazo_idInt | int | - | YES | Plazo internación |
| RecibeSolicitudesEstudios | bit | - | YES | Recibe solicitudes |
| serv_inactivo | bit | - | YES | Inactivo |
| EnviaInformePorMail | smallint | - | YES | Envía informe mail |
| LlevaTriaje | bit | - | YES | Lleva triaje |

### 11.6 Tabla: Cobertura

**Descripción:** Cobertura de prácticas por plan.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Cob_id** | int | - | NO | 🔑 PK |
| Plan_id | smallint | - | NO | FK → Planes |
| Area | char | 1 | NO | A/I |
| Nom_id | smallint | - | NO | FK → Nomenclador |
| Cob_Codd | char | 10 | NO | Código desde |
| Cob_Codh | char | 10 | NO | Código hasta |
| Fec_Ini | datetime | - | NO | Vigencia desde |
| Fec_Fin | datetime | - | NO | Vigencia hasta |
| Autoriza | smallint | - | NO | Requiere autorización |
| Bono | smallint | - | YES | Requiere bono |
| Derivacion | smallint | - | YES | Requiere derivación |
| OsPorc | decimal | - | YES | % cobertura OS |

**Índices Críticos:**
- `PK_Cobertura` (CLUSTERED, único)
- `IX_CoberturaBusqueda` - Búsqueda general
- `IX_CoberturaCodigos` - Por códigos
- `IX_CoberturaFechas` - Por fechas

### 11.7 Tabla: TipoComp (Tipos de Comprobante)

**Descripción:** Configuración de tipos de comprobantes.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **TComp_id** | int | - | NO | 🔑 PK |
| TComp_Nombre | varchar | 50 | YES | Nombre |
| TComp_LibroIva | bit | - | YES | Incluye libro IVA |
| TComp_Signo | smallint | - | YES | Signo (+1/-1) |
| TComp_Copias | smallint | - | YES | Cantidad copias |
| TComp_ModulosUso | char | 3 | YES | Módulos uso |
| EntFac_id | int | - | YES | FK → EntidadesFacturantes |
| Nro_Cai | varchar | 50 | YES | Número CAI |
| TComp_sigla | varchar | 3 | YES | Sigla |
| EsFactura | bit | - | YES | Es factura |
| esNc | bit | - | YES | Es nota crédito |
| esNd | bit | - | YES | Es nota débito |
| esRecibo | bit | - | YES | Es recibo |
| esOP | bit | - | YES | Es orden pago |
| esCompProv | bit | - | YES | Es comp. proveedor |
| esLiqInt | bit | - | YES | Es liq. interna |
| Valores | bit | - | YES | Maneja valores |
| LlevaStock | bit | - | YES | Afecta stock |
| NumAuto | bit | - | YES | Numeración automática |
| NumAuto_Letra | char | 1 | YES | Letra automática |
| NumAuto_Suc | numeric | - | YES | Sucursal automática |

### 11.8 Tabla: TipoValores

**Descripción:** Tipos de valores/medios de pago.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Tv_id** | smallint | - | NO | 🔑 PK |
| Tv_Nombre | varchar | 50 | YES | Nombre |
| Fecha | bit | - | YES | Requiere fecha |
| Numero | bit | - | YES | Requiere número |
| Banco | bit | - | YES | Requiere banco |
| xDefecto | bit | - | YES | Por defecto |
| esCtaCte | bit | - | YES | Es cuenta corriente |
| esDescuento | bit | - | YES | Es descuento |
| esCartera | bit | - | YES | Es cartera |
| esEfectivo | bit | - | YES | Es efectivo |
| esPropio | bit | - | YES | Es propio |
| esRetGanancias | bit | - | YES | Es ret. ganancias |
| esRetIngrBrutos | bit | - | YES | Es ret. IIBB |
| esRetIva | bit | - | YES | Es ret. IVA |
| esRetMunicipal | bit | - | YES | Es ret. municipal |
| esTarjeta | bit | - | YES | Es tarjeta |
| esTransferencia | bit | - | YES | Es transferencia |
| Signo | smallint | - | YES | Signo |

### 11.9 Otras Tablas Maestras

#### Localidades
| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| **loc_id** | smallint | NO | 🔑 PK |
| loc_nombre | varchar(40) | NO | Nombre |
| cod_postal | nvarchar(20) | NO | CP |
| prov_id | smallint | YES | Provincia |

#### Barrios
| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| **bar_id** | smallint | NO | 🔑 PK |
| bar_nombre | varchar(30) | NO | Nombre |
| loc_id | smallint | YES | FK → Localidades |

#### TipoDoc
| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| **td_id** | smallint | NO | 🔑 PK |
| td_nombre | varchar(15) | NO | Nombre (DNI, LE, etc) |
| td_codigo | varchar(3) | YES | Código AFIP |

#### Conceptos
| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| **Conc_id** | smallint | NO | 🔑 PK |
| Conc_Nombre | varchar(50) | YES | Nombre |
| esMedicamento | bit | YES | Es medicamento |

#### Monedas
| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| **Moneda_id** | smallint | NO | 🔑 PK |
| Moneda_nombre | nvarchar(100) | YES | Nombre |
| PorDefecto_Desde | datetime | YES | Vigencia desde |
| Habilitado_carga | bit | YES | Habilitado |

#### IvaPorc
| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| **IvaPorc_id** | smallint | NO | 🔑 PK |
| IvaPorc_nombre | varchar(30) | NO | Nombre (21%, 10.5%, etc) |

#### Bancos
| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| **Banco_id** | int | NO | 🔑 PK |
| Banco_Cod | varchar(6) | YES | Código |
| Banco_Nombre | varchar(50) | YES | Nombre |

#### Especialidades
| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| **esp_id** | smallint | NO | 🔑 PK |
| esp_nombre | varchar(100) | NO | Nombre |

#### Profesiones
| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| **prof_id** | smallint | NO | 🔑 PK |
| prof_nombre | varchar(50) | NO | Nombre |

---

## 12. SEGURIDAD Y USUARIOS

### 12.1 Tabla: Usuarios

**Descripción:** Usuarios del sistema Geclisa.

| Columna | Tipo | Tamaño | Nullable | Descripción |
|---------|------|--------|----------|-------------|
| **Usuario_id** | int | - | NO | 🔑 PK |
| Usuario_nom | varchar | 50 | NO | Nombre usuario (login) |
| Usuario_pass | varbinary | 50 | YES | Password encriptado |
| FechaAlta | datetime | - | YES | Fecha alta |
| Inicio | datetime | - | YES | Último inicio sesión |
| Maquina | varchar | 100 | YES | Última máquina |
| Usuario_Suc | numeric | - | YES | Sucursal |
| Usu_nom | nvarchar | 50 | YES | Nombre |
| Usu_Ape | nvarchar | 50 | YES | Apellido |
| esCajero | bit | - | YES | Es cajero |
| EditaInfoLab | bit | - | YES | Edita info lab |
| EditaCoseguroAmb | bit | - | YES | Edita coseguro amb |
| EditaValoresEleAmb | bit | - | YES | Edita valores elementos |
| Usu_Mail | nvarchar | 100 | YES | Email |
| esReceptorHC | bit | - | YES | Receptor HC |
| Certificado | varchar | 50 | YES | Certificado digital |
| TieneToken | bit | - | YES | Tiene token |
| esFirmante | bit | - | YES | Puede firmar |
| Usuario_EsEnfermero | bit | - | YES | Es enfermero |
| Usuario_Inactivo | bit | - | YES | Inactivo |
| UsaNuevaHc | bit | - | YES | Usa nueva HC |
| SuperEditorHc | bit | - | YES | Super editor HC |
| EsPrestadorTecnico | bit | - | YES | Es técnico |
| DobleFactorAut | bit | - | YES | 2FA habilitado |
| DobleFactorAutDias | smallint | - | YES | Días vigencia 2FA |

### 12.2 Tablas ASP.NET Identity

#### AspNetUsers
| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| **Id** | nvarchar(128) | NO | 🔑 PK |
| UserName | nvarchar(256) | NO | Usuario |
| Email | nvarchar(256) | YES | Email |
| PasswordHash | nvarchar(MAX) | YES | Hash password |
| SecurityStamp | nvarchar(MAX) | YES | Stamp seguridad |
| TwoFactorEnabled | bit | NO | 2FA |
| LockoutEnabled | bit | NO | Bloqueo habilitado |
| AccessFailedCount | int | NO | Intentos fallidos |

#### AspNetRoles
| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| **Id** | nvarchar(128) | NO | 🔑 PK |
| Name | nvarchar(256) | NO | Nombre rol |

#### AspNetUserRoles
| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| **UserId** | nvarchar(128) | NO | 🔑 PK, FK → AspNetUsers |
| **RoleId** | nvarchar(128) | NO | 🔑 PK, FK → AspNetRoles |

---

## 13. ÍNDICES Y PERFORMANCE

### 13.1 Índices Críticos por Tabla

| Tabla | Índice | Tipo | Columnas | Propósito |
|-------|--------|------|----------|-----------|
| **Ficha** | PK_Ficha | CLUSTERED | Ficha_id | PK |
| | apenom | NC | fic_ape, fic_nombre | Búsqueda pacientes |
| | fechanac | NC | fic_fechanac | Filtro fecha nac |
| | Ben_idGecros | NC | Ben_idGecros | Integración |
| **MovEnca** | PK_MovEnca | CLUSTERED | Me_id | PK |
| | IX_MovEnca_Ficha_id | NC | Ficha_id | Por paciente |
| | IX_MovEnca_Os_id | NC | Os_id | Por OS |
| | IX_MovEnca_Me_Fecha | NC | Me_Fecha | Por fecha |
| | IX_MovEnca_Plan_id | NC | Plan_id | Por plan |
| **MovPrac** | PK_MovPrac | CLUSTERED | Mp_id | PK |
| | Ind_MovPrac_Me_id | NC | Me_id | Por atención |
| | Ind_MovPrac_Codigo | NC | nom_cod | Por código |
| **Cobertura** | PK_Cobertura | CLUSTERED | Cob_id | PK |
| | IX_CoberturaBusqueda | NC | Plan_id, Area, Nom_id | Consulta cobertura |
| | IX_CoberturaCodigos | NC | Cob_Codd, Cob_Codh | Por rango códigos |
| **Turnos** | PK_turnos | CLUSTERED | turno_id | PK |
| | IX_Turnos_Ficha | NC | ficha_id | Por paciente |
| **PFComp** | PK_PFComp | CLUSTERED | PFComp_id | PK |
| | IX_PFComp_pf_Fecha | NC | PF_Fecha | Por fecha |

### 13.2 Recomendaciones de Performance

1. **Consultas frecuentes de atenciones:** Usar índice `IX_MovEncaMeOsPlanFecha` para filtros combinados
2. **Búsqueda de pacientes:** El índice `apenom` optimiza búsquedas por apellido
3. **Consulta de cobertura:** Los índices de Cobertura son críticos para validación en tiempo real
4. **Facturación:** Usar `IX_PFComp_pf_Fecha` para reportes por período

---

## 14. RELACIONES (FOREIGN KEYS)

### 14.1 Diagrama de Relaciones Principales

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Ficha     │────▶│  FichaPlan  │◀────│   Planes    │
│  (Paciente) │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
      │                                       │
      │                                       │
      ▼                                       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Turnos    │────▶│  MovEnca    │◀────│ObrasSociales│
│             │     │ (Atención)  │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │  MovPrac    │ │MovValoresEnca│ │HistoriasC.. │
    │ (Práctica)  │ │  (Cobranza) │ │    (HC)     │
    └─────────────┘ └─────────────┘ └─────────────┘
          │               │
          ▼               ▼
    ┌─────────────┐ ┌─────────────┐
    │   MovPre    │ │ MovValores  │
    │(Prestadores)│ │  (Valores)  │
    └─────────────┘ └─────────────┘
          │
          ▼
    ┌─────────────┐
    │ Prestadores │
    └─────────────┘
```

### 14.2 Relaciones Detalladas por Módulo

#### Módulo Pacientes
| Tabla Origen | Columna | → | Tabla Destino | Columna |
|--------------|---------|---|---------------|---------|
| Ficha | loc_id | → | Localidades | loc_id |
| Ficha | bar_id | → | Barrios | bar_id |
| Ficha | td_id | → | TipoDoc | td_id |
| Ficha | Pre_id | → | Prestadores | pre_id |
| FichaPlan | Ficha_id | → | Ficha | Ficha_id |
| FichaPlan | Plan_id | → | Planes | plan_id |

#### Módulo Atenciones
| Tabla Origen | Columna | → | Tabla Destino | Columna |
|--------------|---------|---|---------------|---------|
| MovEnca | Ficha_id | → | Ficha | Ficha_id |
| MovEnca | Os_id | → | ObrasSociales | os_id |
| MovEnca | Plan_id | → | Planes | plan_id |
| MovEnca | Turno_id | → | Turnos | turno_id |
| MovEnca | Moneda_id | → | Monedas | Moneda_id |
| MovPrac | Me_id | → | MovEnca | Me_id |
| MovPrac | nom_id, nom_cod | → | Nomenclador | nom_id, nom_cod |
| MovPrac | Serv_id | → | Servicios | Serv_Id |
| MovPre | Mp_id | → | MovPrac | Mp_id |
| MovPre | Pre_id | → | Prestadores | pre_id |
| MovPre | Conc_id | → | Conceptos | Conc_id |

#### Módulo Facturación
| Tabla Origen | Columna | → | Tabla Destino | Columna |
|--------------|---------|---|---------------|---------|
| PFComp | TComp_id | → | TipoComp | TComp_id |
| PFComp | os_id | → | ObrasSociales | os_id |
| PFComp | EntFac_id | → | EntidadesFacturantes | EntFac_id |
| PFComp | AgeFact_id | → | AgentesFacturacion | AgeFact_id |
| PFMovPrac | Mp_id | → | MovPrac | Mp_id |
| PFMovPrac | Me_id | → | MovEnca | Me_id |
| PFMovPre | PFComp_id | → | PFComp | PFComp_id |
| PFMovPre | Pre_id | → | Prestadores | pre_id |

#### Módulo Liquidaciones
| Tabla Origen | Columna | → | Tabla Destino | Columna |
|--------------|---------|---|---------------|---------|
| Liquidaciones | os_id | → | ObrasSociales | os_id |
| Liquidaciones | Plan_id | → | Planes | plan_id |
| Liquidaciones | EntFac_id | → | EntidadesFacturantes | EntFac_id |
| LiquidacionesDeta | Liq_id | → | Liquidaciones | Liq_id |
| LiquidacionesDeta | Mpre_id | → | MovPre | MPre_id |
| LiqComp | Liq_id | → | Liquidaciones | Liq_id |
| LiqComp | Pre_id | → | Prestadores | pre_id |

#### Módulo Stock
| Tabla Origen | Columna | → | Tabla Destino | Columna |
|--------------|---------|---|---------------|---------|
| StockEnca | Dep_idOrigen | → | Depositos | Dep_id |
| StockEnca | Dep_idDestino | → | Depositos | Dep_id |
| StockEnca | Prov_id | → | Proveedores | Prov_id |
| StockItem | Se_id | → | StockEnca | Se_id |
| StockItem | Ele_id | → | Elementos | Ele_id |

#### Módulo Turnos
| Tabla Origen | Columna | → | Tabla Destino | Columna |
|--------------|---------|---|---------------|---------|
| Turnos | ficha_id | → | Ficha | Ficha_id |
| Turnos | os_id | → | ObrasSociales | os_id |
| Turnos | plan_id | → | Planes | plan_id |
| Turnos | pre_id | → | Prestadores | pre_id |
| Turnos | Cons_id | → | Consultorios | Cons_id |
| Turnos | Cro_id | → | Cronograma | Cro_id |
| Cronograma | pre_id | → | Prestadores | pre_id |
| Cronograma | Serv_id | → | Servicios | Serv_Id |

---

## 15. VISTAS DEL SISTEMA

### 15.1 Listado de Vistas

| Vista | Propósito |
|-------|-----------|
| **pixeon_Informes** | Integración PACS - Informes |
| **pixeon_worklist_v** | Integración PACS - Worklist |
| **SRol** | Roles del sistema |
| **SUsuario** | Usuarios del sistema |
| **SUsuarioRol** | Relación usuarios-roles |
| **v_Elementos** | Vista de elementos/productos |
| **v_ficha** | Vista consolidada de pacientes |
| **v_LiqComp** | Comprobantes de liquidación |
| **v_Menu** | Menú del sistema |
| **v_MovPre** | Movimientos de prestadores |
| **v_Nomenclador** | Vista de nomenclador |
| **v_Os_Plan** | Obras sociales con planes |
| **v_OsMovL** | Movimientos por OS |
| **v_OsTipoBonoL** | Tipos de bono por OS |
| **v_pfComp** | Comprobantes prefacturación |
| **v_pfMovPre** | Movimientos prefacturación |
| **v_pfPraPre** | Prácticas-Prestadores PF |
| **v_PracticasFacturadas** | Prácticas facturadas |
| **v_PracticasRealizadas** | Prácticas realizadas |
| **v_PreEspL** | Prestadores-Especialidades |
| **v_PreFac** | Prefacturación |
| **v_PrefacEle** | Prefacturación elementos |
| **v_PreOsMovL** | Prestadores-OS movimientos |
| **v_PreRadicL** | Prestadores radicación |
| **v_PreServMovL** | Prestadores-Servicios mov. |
| **v_Tablas_Valores_Conceptos** | Tablas valores conceptos |
| **v_TablasUsuarios** | Tablas de usuarios |
| **v_TipoCompDes** | Tipos comprobante descripción |
| **vAfiliados** | Vista de afiliados |
| **VistaTipoMov** | Tipos de movimiento |
| **vMulticonsulta** | Vista multiconsulta |

---

## 16. ESTADÍSTICAS DE DATOS

### 16.1 Volumen por Módulo

| Módulo | Tabla Principal | Registros | Observaciones |
|--------|-----------------|-----------|---------------|
| **Pacientes** | Ficha | ~50,000+ | Estimado |
| **Atenciones** | MovEnca | 144,712 | Histórico completo |
| **Prácticas** | MovPrac | 153,017 | Detalle atenciones |
| **Prestadores Mov** | MovPre | 167,644 | Liquidaciones |
| **Historias Clínicas** | HistoriasClinicas | 164,195 | Evoluciones |
| **Controles HC** | HcControlValor | 828,991 | Mayor tabla |
| **Prefacturación** | PFMovPrac | 153,420 | Facturación OS |
| **Logs** | LogGeclisa | 351,910 | Auditoría |

### 16.2 Crecimiento Estimado

- **Atenciones diarias:** ~100-200 MovEnca nuevos
- **Prácticas diarias:** ~300-500 MovPrac nuevos
- **Turnos diarios:** ~150-300 Turnos nuevos
- **Evoluciones HC:** ~50-100 HistoriasClinicas nuevas

---

## ANEXO A: QUERIES ÚTILES

### A.1 Consulta de Atenciones por Período

```sql
SELECT 
    me.Me_id,
    me.Me_Fecha,
    f.fic_ape + ', ' + f.fic_nombre AS Paciente,
    os.os_nombre AS ObraSocial,
    p.plan_nombre AS Plan,
    me.Me_Area,
    COUNT(mp.Mp_id) AS CantPracticas,
    SUM(mp.Mp_Tot) AS TotalPracticas
FROM MovEnca me
INNER JOIN Ficha f ON me.Ficha_id = f.Ficha_id
LEFT JOIN ObrasSociales os ON me.Os_id = os.os_id
LEFT JOIN Planes p ON me.Plan_id = p.plan_id
LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
WHERE me.Me_Fecha BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY me.Me_id, me.Me_Fecha, f.fic_ape, f.fic_nombre, 
         os.os_nombre, p.plan_nombre, me.Me_Area
ORDER BY me.Me_Fecha DESC
```

### A.2 Facturación por Obra Social

```sql
SELECT 
    os.os_nombre,
    COUNT(DISTINCT pf.PFComp_id) AS CantComprobantes,
    SUM(pf.PF_Neto) AS TotalNeto,
    SUM(pf.PF_Iva) AS TotalIva,
    SUM(pf.PF_Total) AS TotalFacturado
FROM PFComp pf
INNER JOIN ObrasSociales os ON pf.os_id = os.os_id
WHERE pf.PFComp_Anulado = 0
  AND pf.PF_Fecha BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY os.os_nombre
ORDER BY SUM(pf.PF_Total) DESC
```

### A.3 Liquidación por Prestador

```sql
SELECT 
    pre.pre_nombre AS Prestador,
    COUNT(DISTINCT l.Liq_id) AS CantLiquidaciones,
    SUM(l.Neto) AS TotalNeto,
    SUM(l.Total) AS TotalLiquidado
FROM Liquidaciones l
INNER JOIN Prestadores pre ON l.Pre_id = pre.pre_id
WHERE l.Cerrada = 1
  AND l.fec_ini BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY pre.pre_nombre
ORDER BY SUM(l.Total) DESC
```

### A.4 Stock Actual por Elemento

```sql
SELECT 
    e.Ele_Cod,
    e.Ele_nombre,
    e.Stock_Actual,
    e.Stock_Min,
    e.Punto_Reposicion,
    CASE 
        WHEN e.Stock_Actual <= e.Stock_Min THEN 'CRÍTICO'
        WHEN e.Stock_Actual <= e.Punto_Reposicion THEN 'REPONER'
        ELSE 'OK'
    END AS Estado
FROM Elementos e
WHERE e.Stock_Actual IS NOT NULL
ORDER BY e.Stock_Actual ASC
```

---

## ANEXO B: DICCIONARIO DE ABREVIATURAS

| Abreviatura | Significado |
|-------------|-------------|
| **Me** | Movimiento Encabezado |
| **Mp** | Movimiento Práctica |
| **MPre** | Movimiento Prestador |
| **PF** | Prefacturación |
| **Liq** | Liquidación |
| **OS** | Obra Social |
| **HC** | Historia Clínica |
| **Fic** | Ficha |
| **Pre** | Prestador |
| **Nom** | Nomenclador |
| **Serv** | Servicio |
| **Ele** | Elemento |
| **Dep** | Depósito |
| **Prov** | Proveedor |
| **Comp** | Comprobante |
| **Cob** | Cobertura |
| **Tur** | Turno |
| **Cro** | Cronograma |
| **Cons** | Consultorio |

---

## CONTROL DE VERSIONES

| Versión | Fecha | Autor | Cambios |
|---------|-------|-------|---------|
| 1.0 | 29/11/2025 | Claude AI | Documento inicial |

---

**FIN DEL DOCUMENTO**

*Generado automáticamente por Claude AI*
*Instituto Dr. Mercado - Sistema de Costos*
