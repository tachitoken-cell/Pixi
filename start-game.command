#!/bin/bash
# Double-click on macOS (or run ./start-game.command on Linux) to start the game on http://localhost:8080
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js is not installed. Install Node.js 22 LTS from https://nodejs.org"; exit 1; }
( sleep 2; if command -v open >/dev/null; then open http://localhost:8080/; elif command -v xdg-open >/dev/null; then xdg-open http://localhost:8080/; fi ) &
node server.mjs
