#!/bin/bash
# Mossvale (Pixi): double-click on macOS (or run ./start-game.command on Linux) to start the local game.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node.js 22 LTS from https://nodejs.org and run this again."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing the game's packages (first start only, this takes a minute)..."
  npm install || { echo "Install failed."; exit 1; }
fi
echo "Starting the game server and client. Keep this window open while you play; close it to stop the game."
( sleep 6; if command -v open >/dev/null; then open http://localhost:5173/; elif command -v xdg-open >/dev/null; then xdg-open http://localhost:5173/; fi ) &
npm run dev
