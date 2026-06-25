@echo off
setlocal
chcp 65001 >nul
cd /d "D:\GitHub\ARCH-PORTFOLIO"

echo ==================================================
echo   Architectural Center - Office Archive Importer
echo ==================================================
echo.
echo Sources are scanned recursively and remain read-only.
echo Catalog output is written under _imports\office_catalog.
echo.

where python >nul 2>&1
if not errorlevel 1 (
    python _tools\facebook-importer\import_facebook_archive.py "E:\New folder (7)\فيس بوك" "E:\FOR SHARE"
    goto finished
)

where py >nul 2>&1
if not errorlevel 1 (
    py _tools\facebook-importer\import_facebook_archive.py "E:\New folder (7)\فيس بوك" "E:\FOR SHARE"
    goto finished
)

echo ERROR: Python was not found.

:finished
echo.
pause
