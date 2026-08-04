' ============================================================
' Lanzador OCULTO del sync de TURNOS FUTUROS GECLISA -> Supabase
' Sistema de Gestion Integral - Survision S.A.
' ============================================================
' Ejecuta cargar-turnos-futuros-geclisa.cjs --write SIN abrir ninguna
' ventana de consola. Lo usa la tarea programada "Survision-SyncTurnos",
' que corre CADA 1 MINUTO para mantener frescos los turnos de las
' proximas horas (recordatorios WhatsApp). Antes abria una ventana negra
' que parpadeaba cada minuto.
'
' Parametro Run: 0 = ventana oculta ; False = no esperar (fire and forget).
' ============================================================
Dim sh
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\IA\COSTOS\sistema-costos\server"
sh.Run """C:\Program Files\nodejs\node.exe"" ""C:\IA\COSTOS\sistema-costos\server\scripts\cargar-turnos-futuros-geclisa.cjs"" --write", 0, False
