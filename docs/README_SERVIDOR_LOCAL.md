# 🏥 Sistema de Costos - Instituto Dr. Mercado

## Conexión con Servidor Local GECLISA

Este sistema conecta con la base de datos **SQL Server local** para obtener las prestaciones del Nomenclador.

---

## 📋 Requisitos Previos

1. **Node.js** v18 o superior - [Descargar](https://nodejs.org)
2. **Acceso de red** al servidor `192.168.1.73` (Servergeclisa)
3. **Puerto 1433** habilitado para SQL Server

---

## 🚀 Instalación Rápida

### Opción 1: Script Automático (Windows)
```bash
# Doble clic en START.bat o ejecutar:
START.bat
```

### Opción 2: Manual

#### Paso 1: Instalar dependencias del Backend
```bash
cd server
npm install
```

#### Paso 2: Instalar dependencias del Frontend
```bash
cd ..
npm install
```

#### Paso 3: Iniciar Backend (Terminal 1)
```bash
cd server
npm start
```

#### Paso 4: Iniciar Frontend (Terminal 2)
```bash
npm run dev
```

---

## 🔗 URLs del Sistema

| Servicio | URL |
|----------|-----|
| **Frontend** | http://localhost:3000 |
| **Backend API** | http://localhost:3001 |
| **Health Check** | http://localhost:3001/api/health |
| **Nomenclador** | http://localhost:3001/api/nomenclador |
| **Test Conexión** | http://localhost:3001/api/nomenclador/test/connection |

---

## 📊 Configuración de Base de Datos

La conexión al servidor SQL Server se configura en `server/config/database.js`, que lee
las credenciales de `server/.env` (NUNCA hardcodear credenciales en el código ni en docs):

```javascript
const dbConfig = {
  server: process.env.DB_SERVER,                   // ej. 192.168.1.73 (GECLISA, LAN)
  database: process.env.DB_DATABASE,               // ej. GECLISA
  user: process.env.DB_USER,                       // usuario
  password: process.env.DB_PASSWORD,               // contraseña (solo en server/.env)
  port: parseInt(process.env.DB_PORT, 10) || 1433, // puerto SQL Server
};
```

Las variables van en `server/.env` (ignorado por git): `DB_SERVER`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`, `DB_PORT`.

### Tabla Nomenclador
- **Filtro aplicado**: `nom_id = 10` (Agrupación de cirugías)
- **Campos principales**:
  - `nom_cod` → Código de la práctica
  - `nom_nom` → Nombre de la práctica
  - `SegmentoGral` → Segmento (Cirugías)

---

## 🔧 Endpoints de la API

### GET /api/nomenclador
Obtiene todas las prestaciones con `nom_id = 10`

```bash
curl http://localhost:3001/api/nomenclador
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "local-030001",
      "codigo": "030001",
      "practica": "Yag Laser - Iridectomia",
      "agrupacion_nombre": "Cirugías",
      "precio": 0,
      "activa": true
    }
  ],
  "total": 163,
  "fuente": "SQL Server Local - GECLISA"
}
```

### GET /api/nomenclador/:codigo
Obtiene una prestación específica

```bash
curl http://localhost:3001/api/nomenclador/030001
```

### GET /api/nomenclador/search/:termino
Busca prestaciones por término

```bash
curl http://localhost:3001/api/nomenclador/search/laser
```

### GET /api/nomenclador/test/connection
Verifica la conexión con SQL Server

```bash
curl http://localhost:3001/api/nomenclador/test/connection
```

---

## 🔍 Solución de Problemas

### ❌ "El servidor API no está disponible"
1. Verificar que el backend esté corriendo en el puerto 3001
2. Ejecutar: `cd server && npm start`

### ❌ "Error conectando a SQL Server"
1. Verificar que el servidor `192.168.1.73` esté accesible
2. Hacer ping: `ping 192.168.1.73`
3. Verificar credenciales en `server/config/database.js`
4. Verificar que el puerto 1433 esté abierto

### ❌ "ECONNREFUSED"
- El servidor SQL Server no está aceptando conexiones
- Verificar firewall de Windows en el servidor
- Verificar que SQL Server esté configurado para conexiones TCP/IP

---

## 📁 Estructura del Proyecto

```
sistema-costos/
├── server/                    # Backend Express
│   ├── index.js              # Servidor principal
│   ├── config/
│   │   └── database.js       # Conexión SQL Server
│   ├── routes/
│   │   └── nomenclador.js    # Rutas de prestaciones
│   └── package.json          # Dependencias backend
├── src/                       # Frontend React
│   ├── hooks/
│   │   └── usePrestaciones.ts  # Hook modificado
│   ├── lib/
│   │   └── apiLocal.ts       # Cliente HTTP
│   └── ...
├── vite.config.ts            # Config con proxy
├── START.bat                 # Script de inicio
└── README.md                 # Este archivo
```

---

## ⚠️ Notas Importantes

1. **Solo Lectura**: Las operaciones de crear, editar y eliminar prestaciones están deshabilitadas ya que los datos provienen del servidor local.

2. **Cache**: Los datos se cachean en `sessionStorage` por 5 minutos para mejorar el rendimiento.

3. **Precios**: Por ahora los precios vienen en 0. Se agregarán desde otra tabla en una próxima actualización.

4. **Red Local**: La máquina donde corre el frontend debe tener acceso de red al servidor `192.168.1.73`.

---

## 👨‍💻 Desarrollador

**P. Famá | Desarrollo**

---

*Sistema de Costos v1.0.0 - Instituto Dr. Mercado*
