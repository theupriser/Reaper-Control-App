#!/bin/bash

echo "Installing Reaper Control App dependencies with Python environment fix"

# Check if Python is available
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "Error: Python not found. Please install Python 3.8 or newer."
    exit 1
fi

echo "Using Python: $($PYTHON_CMD --version)"

# Create Python virtual environment
echo "Creating Python virtual environment..."
$PYTHON_CMD -m venv .venv

# Activate virtual environment
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows
    source .venv/Scripts/activate
else
    # macOS/Linux
    source .venv/bin/activate
fi

# Install setuptools
echo "Installing setuptools..."
pip install setuptools

# Install dependencies
echo "Installing project dependencies with pnpm..."
if command -v pnpm &> /dev/null; then
    pnpm install
else
    echo "pnpm not found. Attempting to install with npm..."
    npm install -g pnpm
    pnpm install
fi

echo "Installation complete!"
echo "To start the application in development mode, run: pnpm dev"
