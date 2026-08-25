FROM python:3.13-slim

WORKDIR /app

# Instalar dependencias del sistema
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar todo el proyecto
COPY . .

# Exponer puerto
EXPOSE 8080

# Script de entrada
COPY start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]
