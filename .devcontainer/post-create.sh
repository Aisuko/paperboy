#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

sudo apt update
sudo apt upgrade -y
sudo apt install tmux -y

TMUX_CONF="$HOME/.tmux.conf"
MARK_BEGIN='# >>> devcontainer tmux (claude) >>>'
MARK_END='# <<< devcontainer tmux (claude) <<<'

touch "$TMUX_CONF"
if grep -qxF "$MARK_BEGIN" "$TMUX_CONF"; then
	sed -i "/^${MARK_BEGIN}$/,/^${MARK_END}$/d" "$TMUX_CONF"
fi

cat >> "$TMUX_CONF" <<'EOF'
# >>> devcontainer tmux (claude) >>>
set -g mouse on
set -g history-limit 200000
set -g default-terminal "tmux-256color"
set -ag terminal-overrides ",xterm-256color:RGB,*256col*:RGB"
set -s escape-time 0
set -g focus-events on
set -g set-clipboard on
set -g allow-passthrough on
set -g base-index 1
setw -g pane-base-index 1
setw -g mode-keys vi
setw -g aggressive-resize on
set -g status-interval 5
# <<< devcontainer tmux (claude) <<<
EOF

tmux source-file "$TMUX_CONF" 2>/dev/null || true

"$(dirname "$0")/install-claude.sh"

if ! tmux has-session -t claude 2>/dev/null; then
	tmux new-session -d -s claude -c "${PWD}"
	tmux source-file "$TMUX_CONF" 2>/dev/null || true
fi
