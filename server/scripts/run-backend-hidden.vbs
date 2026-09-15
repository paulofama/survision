' ============================================================
' Lanzador OCULTO del backend (Express, puerto 3001)
' Sistema de Gestion Integral - Survision S.A.
' ============================================================
' Lo usa la tarea programada "Survision-Backend" (al iniciar sesion).
' Levanta server\index.js SIN ventana de consola y lo vigila: si el
' proceso termina (crash, corte de GECLISA, etc.) lo vuelve a levantar
' a los 10 segundos.
'
' Logs:
'   server\backend.log       -> salida de la corrida actual
'   server\backend.prev.log  -> la corrida anterior (para ver por que se cayo)
'
' Puerto 3001:
'   - Al arrancar, si esta ocupado se asume un node huerfano de una
'     sesion anterior y se lo mata (si Vite o un backend viejo lo tienen
'     tomado, las rutas nuevas no aparecen o el proxy entra en loop).
'   - En los reintentos NO se mata nada: si el puerto esta ocupado es
'     porque alguien levanto el backend a mano (npm run dev); se espera.
'
' Para apagarlo: detener la tarea no alcanza (wscript sigue vivo);
' usar  Stop-ScheduledTask Survision-Backend  y matar el node del 3001.
' ============================================================
Option Explicit

Const SERVER_DIR = "C:\IA\COSTOS\sistema-costos\server"
Const NODE_EXE = "C:\Program Files\nodejs\node.exe"

Dim sh, fso, logPath, prevPath, rc, primeraVez
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
sh.CurrentDirectory = SERVER_DIR
logPath = SERVER_DIR & "\backend.log"
prevPath = SERVER_DIR & "\backend.prev.log"
primeraVez = True

Do
  If PuertoOcupado() Then
    If primeraVez Then
      LiberarPuerto
      WScript.Sleep 2000
    Else
      WScript.Sleep 60000
    End If
  End If

  If Not PuertoOcupado() Then
    If fso.FileExists(logPath) Then fso.CopyFile logPath, prevPath, True
    ' Run(cmd, 0 = oculta, True = esperar a que node termine)
    rc = sh.Run("cmd /c """"" & NODE_EXE & """ index.js > """ & logPath & """ 2>&1""", 0, True)
    AnotarSalida rc
    WScript.Sleep 10000
  End If

  primeraVez = False
Loop

Function PuertoOcupado()
  PuertoOcupado = (sh.Run("powershell -NoProfile -Command ""if (Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }""", 0, True) = 1)
End Function

Sub LiberarPuerto()
  sh.Run "powershell -NoProfile -Command ""Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }""", 0, True
End Sub

Sub AnotarSalida(codigo)
  Dim f
  Set f = fso.OpenTextFile(logPath, 8, True)
  f.WriteLine ""
  f.WriteLine "[" & Now & "] El backend termino (codigo " & codigo & "). Se relanza en 10 s."
  f.Close
End Sub
