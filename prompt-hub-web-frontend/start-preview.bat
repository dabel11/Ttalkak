@echo off
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" "%~dp0preview-server.cjs" > "%~dp0preview-server.out.log" 2> "%~dp0preview-server.err.log"
