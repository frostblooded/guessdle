@echo off
cd /d "%~dp0"
git pull && docker compose down && docker compose up --build -d
