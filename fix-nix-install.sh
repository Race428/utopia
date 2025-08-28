#!/usr/bin/env bash
# macOS (Apple Silicon) one-shot: install/repair Nix, wire up zsh, and provide a nix-shell shim if legacy nix-shell is absent.
# Paste into a file, chmod +x it, then run. It will exec into a new login zsh at the end.

set -euo pipefail

log() { printf "\033[1;32m>>> %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m!!  %s\033[0m\n" "$*"; }
err() { printf "\033[1;31m!!  %s\033[0m\n" "$*"; }

ensure_env_now() {
  # Make Nix available in THIS running shell (not just future sessions)
  export NIX_REMOTE=daemon
  if [ -e /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh ]; then
    # shellcheck disable=SC1091
    . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
  fi
  export PATH="$HOME/.nix-profile/bin:/nix/var/nix/profiles/default/bin:$PATH"
}

append_zshrc_block() {
  local tag="### NIX MULTI-USER (Determinate/daemon) ###"
  if ! grep -q "$tag" "${ZDOTDIR:-$HOME}/.zshrc" 2>/dev/null; then
    log "Adding Nix init block to ~/.zshrc"
    cat >> "${ZDOTDIR:-$HOME}/.zshrc" <<'EOF'

### NIX MULTI-USER (Determinate/daemon) ###
export NIX_REMOTE=daemon
if [ -e /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh ]; then
  . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
fi
export PATH="$HOME/.nix-profile/bin:/nix/var/nix/profiles/default/bin:$PATH"
### END NIX MULTI-USER ###
EOF
  fi
}

install_determinate_nix() {
  log "Installing Nix via Determinate Systems installer (requires sudo)..."
  /bin/bash -lc "curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install"
}

clean_partial_installs_if_needed() {
  # If a previous failed plan exists, uninstall first to avoid the 'existing plan' error.
  if [ -x /nix/nix-installer ]; then
    if /nix/nix-installer plan show >/dev/null 2>&1 || [ -e /nix/receipt.json ]; then
      warn "Found an existing/partial Nix install; removing it first."
      sudo /nix/nix-installer uninstall --no-confirm || true
      # Best-effort cleanup (safe if files absent)
      sudo launchctl unload /Library/LaunchDaemons/org.nixos.nix-daemon.plist 2>/dev/null || true
      sudo rm -f /Library/LaunchDaemons/org.nixos.nix-daemon.plist
      sudo rm -rf /etc/nix
      sudo rm -rf /var/root/.nix-profile /var/root/.nix-defexpr /var/root/.nix-channels
      sudo rm -rf "/Users/$USER/.nix-profile" "/Users/$USER/.nix-defexpr" "/Users/$USER/.nix-channels"
      sudo rm -rf /nix
      sudo pkgutil --forget org.nixos.nix.daemon 2>/dev/null || true
      sudo pkgutil --forget systems.determinate.nix-installer 2>/dev/null || true
    fi
  fi
}

ensure_nix_installed() {
  if command -v nix >/dev/null 2>&1; then
    log "Nix is already in PATH."
    return
  fi

  # Try sourcing env if installed but not loaded
  ensure_env_now
  if command -v nix >/dev/null 2>&1; then
    log "Nix found after sourcing environment."
    return
  fi

  # Otherwise install fresh
  clean_partial_installs_if_needed
  install_determinate_nix

  # Try again after install
  ensure_env_now
  if ! command -v nix >/dev/null 2>&1; then
    err "Nix still not found in PATH after install. Try opening a NEW terminal window and run this script again."
    exit 1
  fi
}

install_nix_shell_shim_if_missing() {
  if command -v nix-shell >/dev/null 2>&1; then
    log "Legacy nix-shell is available; no shim needed."
    return
  fi
  # Add a zsh function shim into ~/.zshrc to emulate common nix-shell behaviors using modern nix.
  local tag="### NIX-SHELL SHIM ###"
  if ! grep -q "$tag" "${ZDOTDIR:-$HOME}/.zshrc" 2>/dev/null; then
    log "Installing nix-shell shim into ~/.zshrc"
    cat >> "${ZDOTDIR:-$HOME}/.zshrc" <<'EOF'

### NIX-SHELL SHIM ###
nix-shell() {
  local _feat="nix-command flakes"
  # If nix is still not available in this session, try to source it
  if ! command -v nix >/dev/null 2>&1; then
    if [ -e /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh ]; then
      . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
    fi
    export PATH="$HOME/.nix-profile/bin:/nix/var/nix/profiles/default/bin:$PATH"
  fi
  if ! command -v nix >/dev/null 2>&1; then
    echo "nix-shell shim: 'nix' not found; ensure Determinate Nix is installed and open a new terminal." >&2
    return 1
  fi

  # Case: nix-shell -p pkg1 pkg2 ...
  if [ "${1:-}" = "-p" ]; then
    shift
    if [ "$#" -eq 0 ]; then
      echo "nix-shell shim: no packages provided after -p" >&2
      return 1
    fi
    local pkgs=()
    for arg in "$@"; do pkgs+=("nixpkgs#${arg}"); done
    exec nix --experimental-features "$_feat" shell "${pkgs[@]}" -c "${SHELL:-/bin/zsh}"
  fi

  # Case: flake repo with devShell
  if [ -f flake.nix ]; then
    exec nix --experimental-features "$_feat" develop -c "${SHELL:-/bin/zsh}"
  fi

  # Case: legacy shell.nix/default.nix (best effort)
  if [ -f shell.nix ] || [ -f default.nix ]; then
    echo "nix-shell shim: detected legacy shell.nix/default.nix; attempting best-effort env via 'nix shell .'" >&2
    exec nix --experimental-features "$_feat" shell . -c "${SHELL:-/bin/zsh}"
  fi

  # Pass-through to nix shell
  exec nix --experimental-features "$_feat" shell "$@" -c "${SHELL:-/bin/zsh}"
}
### END NIX-SHELL SHIM ###
EOF
  fi
}

main() {
  log "Ensuring Nix is installed and usable from zsh..."
  ensure_nix_installed
  append_zshrc_block
  install_nix_shell_shim_if_missing

  log "Verifying commands..."
  ensure_env_now
  command -v nix >/dev/null 2>&1 || { err "nix not in PATH"; exit 1; }
  log "nix: $(nix --version 2>/dev/null || echo 'ok')"

  if command -v nix-shell >/dev/null 2>&1; then
    log "nix-shell found (legacy binary). Quick test:"
    nix-shell -p hello --run "hello --version" || warn "nix-shell test failed"
  else
    log "Using nix-shell shim. Quick test with flakes:"
    nix --experimental-features 'nix-command flakes' shell nixpkgs#hello -c hello --version || warn "flakes shell test failed"
  fi

  log "Reloading into a fresh login zsh so your current session has Nix available..."
  exec zsh -l
}

main "$@"
