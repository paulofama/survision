@echo off
REM ============================================================
REM Ingesta bancaria diaria - Sistema de Gestion Integral
REM Lee C:\ia\extracto bco*.xlsx, sube, extrae GECLISA y concilia.
REM ============================================================
cd /d "%~dp0.."
"C:\Program Files\nodejs\node.exe" "%~dp0banco-ingest.cjs"
