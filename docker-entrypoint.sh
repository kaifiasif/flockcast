#!/bin/sh
# Persistent disks (Render, Fly) mount at /app/data owned by root. Give the
# directory to the node user, then drop root before starting the app.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  chown node:node /app/data
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
