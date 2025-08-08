@echo off
echo Installing Reaper Control App dependencies with Python environment fix

REM Check if Python is available
python --version >nul 2>&1
if %errorlevel% neq 0 (
    python3 --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo Error: Python not found. Please install Python 3.8 or newer.
        exit /b 1
    ) else (
        set PYTHON_CMD=python3
    )
) else (
    set PYTHON_CMD=python
)

echo Using Python: %PYTHON_CMD%

REM Create Python virtual environment
echo Creating Python virtual environment...
%PYTHON_CMD% -m venv .venv

REM Activate virtual environment
call .venv\Scripts\activate.bat

REM Install setuptools
echo Installing setuptools...
pip install setuptools

REM Install dependencies
echo Installing project dependencies with pnpm...
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo pnpm not found. Attempting to install with npm...
    npm install -g pnpm
)
pnpm install

REM Add node_modules/.bin to PATH to ensure TypeScript compiler (tsc) is available
set PATH=%CD%\node_modules\.bin;%PATH%
echo Added node_modules\.bin to PATH

echo.
echo Installation complete!
echo To start the application in development mode, run: pnpm dev
