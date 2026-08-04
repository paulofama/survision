' ============================================================
' Lanzador OCULTO del sync GECLISA -> Supabase
' Sistema de Gestion Integral - Survision S.A.
' ============================================================
' Ejecuta sync-all.cjs con node SIN abrir ninguna ventana de consola.
' Lo usa la tarea programada "Survision-SyncGECLISA" para que la
' sincronizacion corra en segundo plano (antes abria una ventana negra
' cada vez que corria: 08/12/17 hs).
'
' El sync sigue logueando a server\sync-daemon.log, asi que no se pierde
' el registro por ocultar la ventana.
'
' Parametro Run: 0 = ventana oculta ; False = no esperar (fire and forget).
' ============================================================
Dim sh
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\IA\COSTOS\sistema-costos\server"
sh.Run """C:\Program Files\nodejs\node.exe"" ""C:\IA\COSTOS\sistema-costos\server\scripts\sync-all.cjs""", 0, False
