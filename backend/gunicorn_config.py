import multiprocessing

# Bind to 0.0.0.0:8000
bind = "0.0.0.0:8000"

# Workers: (2 * CPUs) + 1 recommended
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "gthread" # Threaded worker for I/O bound tasks
threads = 4

# Timeouts
timeout = 120
keepalive = 5

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
