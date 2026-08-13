FROM python:3.13-slim

WORKDIR /app

# Instalar dependencias
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código del proyecto
COPY . .

# Crear directorio para base de datos SQLite
RUN mkdir -p /data && chmod 777 /data

# Script de entrada para ejecutar ambos procesos (Web UI + Bot Worker)
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8080

CMD ["/start.sh"]
