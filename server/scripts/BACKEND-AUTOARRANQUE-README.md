# Backend: arranque automático (tarea `Survision-Backend`)

El backend Express (puerto 3001) arranca solo al iniciar sesión en la PC de la clínica,
sin ventana, y se vuelve a levantar si se cae.

## Para qué hace falta hoy el backend

Casi para nada: el frontend (Netlify y local) lee **todo** de Supabase, y los datos de GECLISA
los mantienen frescos las otras tareas programadas (`Survision-SyncGECLISA`, `Survision-SyncTurnos`,
`Survision-BancoIngesta`), que **no pasan por el backend**.

El único consumidor que queda es el **módulo Fiscal**: el botón "Actualizar desde GECLISA" y la
auto-actualización de IVA Ventas / IVA Compras / Dashboard Fiscal
(`src/modules/fiscal/hooks/useFiscalIva.ts` → `/api/fiscal/:periodo/sync` y `/freshness`).
Sin backend esas pantallas muestran lo que cargó el sync horario; sólo no se puede forzar al momento.

El **frontend local** (Vite, `npm.cmd run dev`, puerto 3000) **no** arranca solo a propósito:
para usar el sistema está Netlify; Vite queda para desarrollar.

## Qué corre

- **Tarea**: `Survision-Backend` — disparo **al iniciar sesión** del usuario, oculta, **sin límite
  de tiempo**, no se detiene con batería, `IgnoreNew` (nunca dos a la vez).
- **Acción**: `wscript.exe server\scripts\run-backend-hidden.vbs`.
- **El `.vbs`** corre `node index.js` (desde `server/`, así toma `server/.env`) y queda vigilándolo:
  - Al **arrancar**, si el 3001 está ocupado asume un `node` huérfano de una sesión anterior y lo mata.
  - Si el backend **termina** (crash, error, alguien lo mató) lo relanza a los **10 s**.
  - En los **reintentos no mata nada**: si el 3001 está ocupado es que alguien levantó un backend
    a mano (`npm run dev`), y espera 60 s antes de volver a mirar.
- **Logs**:
  - `server/backend.log` → salida de la corrida actual (se pisa en cada arranque).
  - `server/backend.prev.log` → la corrida anterior, con una última línea
    `[fecha] El backend termino (codigo N)`. Es donde mirar **por qué se cayó**.
  - Ambos ignorados por git (`*.log`). Si se abren desde PowerShell los acentos/emojis se ven
    rotos: es la consola, el archivo está bien.

`START.bat` detecta que el 3001 ya escucha y **no** levanta un segundo backend (fallaría con
`EADDRINUSE`); el frontend lo sigue abriendo igual.

## Operación

```powershell
# ¿Está vivo?
Invoke-WebRequest http://localhost:3001/api/health -UseBasicParsing   # → 200

# Estado de la tarea
Get-ScheduledTask Survision-Backend | Select-Object TaskName, State

# REINICIAR (p. ej. después de un cambio en server/): matar el node; el .vbs lo relanza en ~10 s
Get-NetTCPConnection -LocalPort 3001 -State Listen |
  Select-Object -Expand OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }

# APAGAR del todo (hasta el próximo inicio de sesión).
# Detener la tarea NO alcanza: el wscript vigilante sigue vivo y relanza el node.
Stop-ScheduledTask Survision-Backend
Get-CimInstance Win32_Process -Filter "Name='wscript.exe'" |
  Where-Object CommandLine -like '*run-backend-hidden*' |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -Expand OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }

# Volver a prenderlo sin reiniciar la PC
Start-ScheduledTask Survision-Backend
```

## Registrar la tarea (una sola vez por PC)

La tarea **no viaja con el repo**: en una PC nueva hay que registrarla. Ajustar las rutas si el
proyecto no está en `C:\IA\COSTOS\sistema-costos` (también las constantes del `.vbs`, junto con la
de `node.exe`).

```powershell
$user      = "$env:USERDOMAIN\$env:USERNAME"
$action    = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument '"C:\IA\COSTOS\sistema-costos\server\scripts\run-backend-hidden.vbs"'
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -Hidden -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Survision-Backend' `
  -Description 'Backend del Sistema de Gestion Integral (Express 3001), oculto y con auto-relanzado.' `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal
Start-ScheduledTask Survision-Backend
```

> **`-ExecutionTimeLimit 0` es imprescindible**: el valor por defecto (72 h, o 30 min en las otras
> tareas del sistema) haría que Windows mate el backend.

Para quitarla: apagarlo (ver arriba) y `Unregister-ScheduledTask Survision-Backend -Confirm:$false`.

## Problemas

- **`/api/health` no responde** → mirar `server/backend.prev.log` (motivo de la última caída) y
  `server/backend.log`. Si el log dice `EADDRINUSE`, hay otro proceso en el 3001 que no es este backend.
- **Se relanza en loop** (el `.prev.log` cambia cada ~10 s) → el backend no llega a arrancar; el
  error está al final de `backend.prev.log` (típico: `server/.env` faltante o mal armado).
- **Cambios en `server/` no se ven** → el backend sigue con el código viejo: reiniciarlo (ver arriba).
  Las otras tareas programadas no tienen este problema porque lanzan un `node` nuevo en cada corrida.
- **Dejó de arrancar al prender la PC** → la tarea dispara al **iniciar sesión**: si la PC queda en
  la pantalla de login, no corre hasta que alguien entra.
