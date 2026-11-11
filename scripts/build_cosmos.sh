#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root/cosmos"
mkdir -p "$repo_root/assets/wasm"
# The support script must come from the compiler used to build this Wasm binary.
GOOS=js GOARCH=wasm go build -trimpath -ldflags='-s -w' -o "$repo_root/assets/wasm/cosmos.wasm" .
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" "$repo_root/assets/wasm/wasm_exec.js"
printf 'Built Cosmos WebAssembly with %s\n' "$(go version)"
