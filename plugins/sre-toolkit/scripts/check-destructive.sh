#!/usr/bin/env bash
set -euo pipefail

# check-destructive.sh — Hook PreToolUse para Claude Code
# Autor: Erick Diaz | Ambiente: lab WSL2 | Fecha: 2026-08-04
# Propósito: Bloquear comandos destructivos en el cluster kind
# sin confirmación explícita del usuario

# Lee el input JSON de Claude por stdin
INPUT=$(cat)

# Extrae el comando que Claude quiere ejecutar
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
cmd = data.get('tool_input', {}).get('command', '')
print(cmd)
" 2>/dev/null || echo "")

# Patrones destructivos — bloquear siempre
DESTRUCTIVE_PATTERNS="kubectl (delete|drain|cordon|uncordon|taint)|kubectl rollout restart|docker (rm|rmi|system prune)|rm -rf|pkill|killall"

if echo "$COMMAND" | grep -qE "$DESTRUCTIVE_PATTERNS"; then
  echo "{\"decision\": \"block\", \"reason\": \"Comando destructivo detectado: '$COMMAND'. Requiere confirmacion explicita del usuario antes de ejecutar. Muestra el comando y pide aprobacion manual.\"}"
  exit 0
fi

# Todo lo demás — permitir
exit 0
