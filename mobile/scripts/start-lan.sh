#!/usr/bin/env bash
set -euo pipefail

# Expo can advertise a VPN, Docker, or loopback address in the QR code. Force
# the phone-reachable Wi-Fi/Ethernet address instead.
IP=""

if command -v ip >/dev/null 2>&1; then
  IP="$(
    ip -4 -o addr show scope global 2>/dev/null |
      awk '$2 ~ /^(wl|en|eth)/ { split($4, parts, "/"); print parts[1]; exit }'
  )"
elif command -v ipconfig >/dev/null 2>&1; then
  IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
fi

if [[ -z "${IP}" ]]; then
  echo "Could not detect a LAN IP." >&2
  echo "Run: REACT_NATIVE_PACKAGER_HOSTNAME=<your-lan-ip> npx expo start -c" >&2
  exit 1
fi

if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -qE '[:.]8081[[:space:]]'; then
  echo "Port 8081 is already in use. Stop the old Expo server (Ctrl+C) and try again." >&2
  exit 1
fi

echo "Using LAN host ${IP}:8081"
echo "The phone must be on the same Wi-Fi and able to open http://${IP}:8081"
REACT_NATIVE_PACKAGER_HOSTNAME="${IP}" exec npx expo start -c "$@"
