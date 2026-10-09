#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
if [ ! -f .env ]; then cp .env.example .env; fi
set -a; source .env; set +a
exec python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
