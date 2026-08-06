# Ingesta bancaria diaria (subsección Bancos de Tesorería)

Automatiza: leer el extracto Santander de `C:\ia`, subirlo a Supabase (idempotente),
sincronizar los valores de GECLISA del período y correr la conciliación.

## Qué corre

- **Script**: `server/scripts/banco-ingest.cjs` (reutiliza el mismo parser/ingesta/motor
  que la subida manual del navegador — una sola implementación).
- **Archivo de entrada**: el más reciente que matchee `C:\ia\extracto bco*.xlsx`.
  (Se puede cambiar la carpeta con la variable de entorno `BANCO_EXTRACTO_DIR`.)
- **Log**: `server/banco-ingest.log`.
- **Registro de cada corrida**: tabla `banco_importaciones` (estado ok / rechazada / omitida).

## Comportamiento sin intervención

- Sin archivo → se omite (log).
- Archivo **sin cambios** desde la última corrida OK (mismo sha256) → se omite (no re-procesa).
- **Cadena de saldos no cierra** contra el saldo declarado → se **rechaza el archivo entero**
  (no sube nada) y queda registrado con el motivo.
- Re-subir días ya cargados no duplica nada (dedup por hash).

## Probar a mano

```bat
cd C:\IA\COSTOS\sistema-costos\server
node scripts\banco-ingest.cjs
```

## Agendar (Programador de tareas de Windows)

Corre OCULTO (sin ventana negra) vía `run-banco-ingest-hidden.vbs`, igual que las otras
tareas del sistema. Registrala una vez desde PowerShell (ajustá el/los horarios; la tesorera
deja el archivo a la mañana):

```powershell
$accion  = New-ScheduledTaskAction -Execute "wscript.exe" `
  -Argument '"C:\IA\COSTOS\sistema-costos\server\scripts\run-banco-ingest-hidden.vbs"'
# Un disparo diario 09:30 (agregá más -Trigger si querés varias corridas)
$trigger = New-ScheduledTaskTrigger -Daily -At 9:30am
$set     = New-ScheduledTaskSettingsSet -StartWhenAvailable -Hidden
Register-ScheduledTask -TaskName "Survision-BancoIngesta" -Action $accion `
  -Trigger $trigger -Settings $set -RunLevel Highest -Force
```

Para forzar una corrida: `Start-ScheduledTask -TaskName "Survision-BancoIngesta"`
Para ver el resultado: revisá `server/banco-ingest.log` o la pestaña **Bancos → Importar** (historial).

> Nota: corre en la PC de la clínica (acceso a `C:\ia` y a GECLISA `192.168.1.73`).
> El frontend remoto (Netlify) solo lee de Supabase; esta tarea es la que mantiene el espejo fresco.
