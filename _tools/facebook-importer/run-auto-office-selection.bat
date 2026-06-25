@echo off
setlocal
chcp 65001 >nul
cd /d "D:\GitHub\ARCH-PORTFOLIO"
echo Ranking the local office archive catalog...
echo Source archive files remain read-only.
where python >nul 2>&1
if not errorlevel 1 (
  python _tools\facebook-importer\auto_select_office_items.py
  goto finished
)
where py >nul 2>&1
if not errorlevel 1 (
  py _tools\facebook-importer\auto_select_office_items.py
  goto finished
)
echo ERROR: Python was not found.
:finished
pause
