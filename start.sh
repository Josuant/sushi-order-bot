#!/bin/bash
# No set -e: queremos que el bot y el servidor sean independientes
# Si el bot falla, el servidor sigue funcionando y viceversa

echo "=== Iniciando EriZushi Backend ==="

# Iniciar el bot de Telegram en segundo plano
echo "[bot] Iniciando bot de Telegram..."
python bot/telegram_bot.py > /tmp/bot.log 2>&1 &
BOT_PID=$!
echo "[bot] PID: $BOT_PID"

# Iniciar el backend FastAPI con Uvicorn en primer plano
echo "[api] Iniciando servidor FastAPI en puerto 8080..."
exec uvicorn backend.main:app --host 0.0.0.0 --port 8080