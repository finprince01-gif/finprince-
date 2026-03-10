import multiprocessing

# Bind to 0.0.0.0:8000
bind = "0.0.0.0:8000"

# Workers: Reduced for memory efficiency on small EC2 instances
workers = 2
worker_class = "gthread" 
threads = 2

# Timeouts
timeout = 120
keepalive = 5

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
