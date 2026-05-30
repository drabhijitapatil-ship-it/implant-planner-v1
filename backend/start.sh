#!/bin/bash
exec gunicorn -c gunicorn.conf.py server:app
