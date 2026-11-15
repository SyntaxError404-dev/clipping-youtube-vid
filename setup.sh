#!/bin/bash
# Clipi setup — installs everything the site needs to run locally.
# Needs: Node 18+, Python 3.10+, ffmpeg on PATH, internet for pip/npm.
set -e
cd "$(dirname "$0")"

echo "== checks =="
node --version
python3 --version
ffmpeg -version | head -1

echo "== python tools (yt-dlp + faster-whisper) =="
if [ ! -x server/tools/venv/bin/yt-dlp ]; then
  python3 -m venv server/tools/venv
  server/tools/venv/bin/pip install -q --upgrade pip
  server/tools/venv/bin/pip install -q yt-dlp faster-whisper numpy pillow
fi
server/tools/venv/bin/yt-dlp --version
server/tools/venv/bin/python -c "import faster_whisper; print('faster-whisper', faster_whisper.__version__ if hasattr(faster_whisper,'__version__') else 'ok')"

echo "== node deps =="
npm install --prefix server
npm install --prefix client
npm install

mkdir -p data/jobs
echo
echo "All set. Run:  npm run dev"
echo "Then open:    http://localhost:5173"
echo "Server API:   http://localhost:4000/api/health"
