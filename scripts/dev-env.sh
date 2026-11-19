# Source this file (". scripts/dev-env.sh") to load user-local GTK 3 for Electron on Linux.
if [ -d "$HOME/.local/task-tracker-gtk/usr/lib/x86_64-linux-gnu" ]; then
  export LD_LIBRARY_PATH="$HOME/.local/task-tracker-gtk/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
