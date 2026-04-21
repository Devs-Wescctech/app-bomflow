#!/bin/bash
# Post-merge setup for Wescctech CRM (Bom Flow).
# Runs automatically after a task is merged into the main branch.
# Must be idempotent and non-interactive (stdin is closed).
set -e

echo "[post-merge] Installing frontend dependencies..."
npm install --no-audit --no-fund --silent

echo "[post-merge] Installing backend dependencies..."
(cd backend && npm install --no-audit --no-fund --silent)

# Database schema is applied automatically by backend/src/config/database.js
# when the Backend API Server workflow (re)starts, so no migration step here.

echo "[post-merge] Done."
