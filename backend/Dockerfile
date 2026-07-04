FROM python:3.11-slim

WORKDIR /app

# System deps for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Run Alembic migrations then start Uvicorn.
# --limit-concurrency turns excess concurrent requests into fast 503s instead
# of letting them queue toward OOM on the small VM; legit concurrency is a
# handful of requests.
CMD ["sh", "-c", "cd /app && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --limit-concurrency 64 --timeout-keep-alive 5 --backlog 128"]
