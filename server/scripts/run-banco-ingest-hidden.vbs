' ============================================================
' Lanzador OCULTO de la ingesta bancaria diaria
' Sistema de Gestion Integral - Survision S.A.
' Ejecuta banco-ingest.cjs con node SIN abrir ventana de consola.
' Lo usa la tarea programada "Survision-BancoIngesta".
' Loguea a server\banco-ingest.log.
' ============================================================
Dim sh
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\IA\COSTOS\sistema-costos\server"
sh.Run """C:\Program Files\nodejs\node.exe"" ""C:\IA\COSTOS\sistema-costos\server\scripts\banco-ingest.cjs""", 0, False
