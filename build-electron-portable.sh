#!/usr/bin/env bash
# AIO Hub Electron distribution build
set -e
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export PATH="$HOME/.bun/bin:$PATH"

if [[ -f "scripts/vm-sync.sh" ]]; then
  source scripts/vm-sync.sh
fi

exec bun run electron:package:portable:local "$@"
