#!/bin/sh
# Rowan HVAC van terminal - Linux installer (Debian/Ubuntu/antiX/etc.).
# Run as the van's normal user. Re-run to update; saved data is kept.
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/.local/opt/rowanvan"

if ! python3 -c "import tkinter" 2>/dev/null; then
  echo "Installing Python 3 + Tk (needs sudo)..."
  sudo apt-get install -y python3 python3-tk
fi

mkdir -p "$DEST"
cp -r "$HERE/rowanvan" "$HERE/certs" "$HERE/vendor" "$HERE/RowanVan.pyw" "$DEST/"
# Serial port access for the OBD-II adapter
if ! id -nG | grep -qw dialout; then sudo usermod -aG dialout "$USER" || true; fi

ENTRY="[Desktop Entry]
Type=Application
Name=Rowan Van
Comment=Rowan HVAC van terminal
Exec=python3 $DEST/RowanVan.pyw
Terminal=false
Categories=Office;"

mkdir -p "$HOME/.local/share/applications" "$HOME/.config/autostart"
echo "$ENTRY" > "$HOME/.local/share/applications/rowanvan.desktop"
echo "$ENTRY" > "$HOME/.config/autostart/rowanvan.desktop"
if [ -d "$HOME/Desktop" ]; then
  echo "$ENTRY" > "$HOME/Desktop/rowanvan.desktop"
  chmod +x "$HOME/Desktop/rowanvan.desktop"
fi
echo "Done. Start 'Rowan Van' from the menu or desktop; it also starts at login."
