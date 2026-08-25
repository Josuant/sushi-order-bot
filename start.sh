#!/bin/bash
set -e

# Iniciar el bot de Telegram en segundo plano
python bot/telegram_bot.py &

# Iniciar el backend FastAPI con Uvicorn (también sirve frontend)
exec uvicorn backend.main:app --host 0.0.0.0 --port 8080
