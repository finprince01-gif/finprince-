FROM python:3.10-slim

# System dependencies
RUN apt-get update && apt-get install -y \
    default-libmysqlclient-dev \
    build-essential \
    pkg-config \
    python3-dev \
    libpq-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Static collection setup
RUN mkdir -p /app/static /app/media

EXPOSE 8000

# CMD handled by docker-compose or overridden
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
