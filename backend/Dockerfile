# Use official Python runtime as a parent image
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . /app/

# Collect static files
# Note: We need secret key to run collectstatic (dummy key is fine for build)
RUN DJANGO_SECRET=build_key python manage.py collectstatic --noinput

# Expose port
EXPOSE 8000

# Gunicorn entrypoint
CMD ["gunicorn", "--config", "gunicorn_config.py", "backend.wsgi:application"]
