#!/usr/bin/env bash
set -euo pipefail

curl -fsSL https://claude.ai/install.sh | bash -s stable

export PATH="$HOME/.local/bin:$PATH"

CLAUDE_JSON="$HOME/.claude.json"
[ -f "$CLAUDE_JSON" ] || echo '{}' > "$CLAUDE_JSON"
python3 - "$CLAUDE_JSON" <<'PY'
import json, sys
p = sys.argv[1]
try:
    with open(p) as f:
        cfg = json.load(f)
except Exception:
    cfg = {}
cfg["theme"] = "auto"
with open(p, "w") as f:
    json.dump(cfg, f, indent=2)
PY
