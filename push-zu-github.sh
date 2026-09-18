#!/usr/bin/env bash
# Legt das Repository an und schiebt den Code zu GitHub.
# Voraussetzung: GitHub CLI installiert und angemeldet (brew install gh && gh auth login)
# Aufruf im entpackten Ordner:  bash push-zu-github.sh empfehlung-pfs
set -e
NAME="${1:-empfehlung-pfs}"

git init -b main
git add .
git commit -m "Empfehlungsprogramm Putzfrauenservice: Kundenseite, Willkommensseite, Adminbereich, API"

if command -v gh >/dev/null 2>&1; then
  gh repo create "$NAME" --private --source=. --remote=origin --push
  echo "Fertig. Repository: $(gh repo view --json url -q .url)"
else
  echo "GitHub CLI nicht gefunden."
  echo "Repository manuell auf github.com anlegen, dann:"
  echo "  git remote add origin https://github.com/<DEIN-KONTO>/$NAME.git"
  echo "  git push -u origin main"
fi
