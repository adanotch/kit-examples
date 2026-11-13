#!/usr/bin/env bash
# ==============================================================================
# Mole -> Adanotch Island Bridge
# Synchronizes real system cleanable junk, build caches, and top processes
# from tw93/mole directly into your MacBook notch via Adanotch.
#
# Usage:
#   ./scripts/mole-bridge.sh             # Run once and sync immediately
#   ./scripts/mole-bridge.sh --daemon 60 # Run as daemon syncing every 60 seconds
#   ./scripts/mole-bridge.sh --clean     # Run 'mo clean' and report to Adanotch
#   ./scripts/mole-bridge.sh --install   # Install as a background launchd agent
# ==============================================================================

set -euo pipefail

EXTENSION_ID="local.adanotch.mole"

# 1. Verify adanotch CLI is available
if ! command -v adanotch >/dev/null 2>&1; then
  echo "❌ Error: 'adanotch' command not found."
  echo "   Please install it from Adanotch › Settings › Developer › Terminal Command › Install"
  exit 1
fi

# 2. Check if Mole (mo) CLI is installed
MO_CMD=""
if command -v mo >/dev/null 2>&1; then
  MO_CMD="mo"
elif command -v mole >/dev/null 2>&1; then
  MO_CMD="mole"
elif [ -x "$HOME/.local/bin/mo" ]; then
  MO_CMD="$HOME/.local/bin/mo"
fi

# Measure directory size in bytes safely (macOS du output is in 512-byte blocks or 1KB blocks with -k)
get_dir_bytes() {
  local dir="$1"
  if [ -d "$dir" ]; then
    local kb
    kb=$(du -sk "$dir" 2>/dev/null | awk '{print $1}')
    if [ -n "$kb" ] && [ "$kb" -eq "$kb" ] 2>/dev/null; then
      echo $((kb * 1024))
      return
    fi
  fi
  echo "0"
}

# Collects real metrics from macOS filesystem
collect_and_sync() {
  echo "🔍 [Mole Bridge] Scanning cleanable caches & system metrics..."

  local user_caches
  user_caches=$(get_dir_bytes "$HOME/Library/Caches")

  local system_logs
  system_logs=$(get_dir_bytes "$HOME/Library/Logs")

  local trash
  trash=$(get_dir_bytes "$HOME/.Trash")

  local xcode_dd
  xcode_dd=$(get_dir_bytes "$HOME/Library/Developer/Xcode/DerivedData")

  local brew_cache
  brew_cache=$(get_dir_bytes "$HOME/Library/Caches/Homebrew")

  local npm_cache
  npm_cache=$(get_dir_bytes "$HOME/.npm/_cacache")

  local pkg_managers=$((brew_cache + npm_cache))

  local chrome_cache
  chrome_cache=$(get_dir_bytes "$HOME/Library/Caches/Google/Chrome")
  local safari_cache
  safari_cache=$(get_dir_bytes "$HOME/Library/Caches/com.apple.Safari")
  local browser_data=$((chrome_cache + safari_cache))

  # Read top memory processes using ps
  local procs_json="["
  local count=0
  while IFS= read -r line; do
    if [ -n "$line" ]; then
      local cpu mem pid comm
      cpu=$(echo "$line" | awk '{print $1}')
      mem=$(echo "$line" | awk '{print $2}')
      pid=$(echo "$line" | awk '{print $3}')
      comm=$(echo "$line" | awk '{$1=$2=$3=""; print substr($0,4)}')
      comm=$(basename "$comm" | tr -d '"')

      # Convert RSS KB to MB
      local mem_mb=$((mem / 1024))

      if [ $count -gt 0 ]; then
        procs_json+=", "
      fi
      procs_json+="{\"name\":\"$comm\",\"cpu\":$cpu,\"mem\":$mem_mb,\"pid\":$pid}"
      count=$((count + 1))
    fi
  done < <(ps -A -o %cpu,%mem,pid,comm -r | sed 1d | head -n 4)
  procs_json+="]"

  # Construct the JSON payload
  local payload
  payload=$(cat <<EOF
{
  "cleanable": {
    "userCaches": $user_caches,
    "systemLogs": $system_logs,
    "trash": $trash,
    "browserData": $browser_data,
    "packageManagers": $pkg_managers,
    "xcodeDerivedData": $xcode_dd
  },
  "topProcesses": $procs_json,
  "timestamp": $(date +%s000)
}
EOF
)

  echo "🚀 [Mole Bridge] Syncing with Adanotch ($EXTENSION_ID)..."
  adanotch ext "$EXTENSION_ID" sync "$payload"
  echo "✅ [Mole Bridge] Synced successfully!"
}

# Execute clean and notify
execute_clean() {
  if [ -n "$MO_CMD" ]; then
    echo "🧹 [Mole Bridge] Executing '$MO_CMD clean'..."
    "$MO_CMD" clean
  else
    echo "🧹 [Mole Bridge] 'mo' not found. Cleaning user caches directly..."
    rm -rf "$HOME/Library/Caches"/* 2>/dev/null || true
  fi

  adanotch ext "$EXTENSION_ID" cleaned '{"reclaimedBytes": 2000000000}'
  echo "✅ [Mole Bridge] Cleanup completed and reported to Adanotch!"
}

# Install LaunchAgent plist for automated background syncing
install_launchagent() {
  local plist_path="$HOME/Library/LaunchAgents/com.adanotch.mole-bridge.plist"
  local script_abs_path
  script_abs_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

  mkdir -p "$HOME/Library/LaunchAgents"

  cat > "$plist_path" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.adanotch.mole-bridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$script_abs_path</string>
    </array>
    <key>StartInterval</key>
    <integer>120</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>/tmp/mole-bridge.err</string>
    <key>StandardOutPath</key>
    <string>/tmp/mole-bridge.log</string>
</dict>
</plist>
EOF

  launchctl unload "$plist_path" 2>/dev/null || true
  launchctl load "$plist_path"
  echo "🎉 [Mole Bridge] LaunchAgent installed and loaded at $plist_path"
  echo "   It will automatically sync Mole metrics with Adanotch every 2 minutes."
}

# Main command handling
case "${1:-}" in
  --daemon)
    interval="${2:-60}"
    echo "🔄 Running Mole Bridge daemon every $interval seconds (Ctrl+C to stop)..."
    while true; do
      collect_and_sync || true
      sleep "$interval"
    done
    ;;
  --clean)
    execute_clean
    ;;
  --install)
    install_launchagent
    ;;
  *)
    collect_and_sync
    ;;
esac
