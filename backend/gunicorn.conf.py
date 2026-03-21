import multiprocessing

workers = 2
worker_class = "uvicorn.workers.UvicornWorker"
bind = "0.0.0.0:8001"
timeout = 120
keepalive = 5
accesslog = "-"
errorlog = "-"
