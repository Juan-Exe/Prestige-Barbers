@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Planos de Penta{sys}4.0
echo.
start "" "index.html"
echo  Se abrio la vista previa en el navegador.
echo.
echo  Para exportar en calidad de edicion, escribe aqui:
echo    node exportar.cjs        (los cuatro planos)
echo    node exportar.cjs 1      (solo el plano 01)
echo    node exportar.cjs todo   (la secuencia completa)
echo.
cmd /k
