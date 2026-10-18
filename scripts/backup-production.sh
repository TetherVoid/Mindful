#!/usr/bin/env bash
# Back up the production database, and keep backups for 30 days only.
#
#   scripts/backup-production.sh <label>     dump, then prune
#   scripts/backup-production.sh --prune-only
#
# The human runs this, never an agent: it reads production with the linked
# Supabase project. Run it before every production migration (label it
# "pre-<migration>"), and schedule `--prune-only` hourly (supabase/MIGRATIONS.md
# § Backups) so the 30 days hold even in a week nobody takes a backup, and a
# laptop asleep at the scheduled time catches up within the hour after waking.
#
# Where the dumps go: $MINDFUL_BACKUP_DIR, default ~/mindful-backups — an
# absolute path, never inside this repository (where one `git add -A` would
# commit every student's journal), never / or your home folder itself. Each run
# gets its own folder, YYYYMMDD-HHMMSS-<label>, holding the three dumps and a
# marker file; umask 077 makes all of it readable by you alone.
#
# Retention: a backup folder is deleted once the time in its NAME is 29 days
# old, so with a regular prune nothing outlives 30 days. The name is the clock,
# not the folder's modification time, which moves when anything inside changes
# and resets on copy or restore. Only folders carrying the marker are touched.
# The privacy page (src/frontend/content/privacy.js, § Keeping, copying and
# deleting) promises "up to 30 days after you delete": do not raise
# DELETE_AFTER_DAYS without changing that copy in the same commit. Copies made
# elsewhere (cloud sync, a USB stick) are outside this script and must not exist.

set -euo pipefail
umask 077

DELETE_AFTER_DAYS=29
MARKER=.mindful-backup
DIR="${MINDFUL_BACKUP_DIR:-$HOME/mindful-backups}"
REPO="$(cd "$(dirname "$0")/.." && pwd -P)"

refuse() {
  echo "backup: refusing $DIR — $1" >&2
  exit 1
}

case "$DIR" in
  /*) ;;
  *) refuse 'it must be an absolute path' ;;
esac
case "/$DIR/" in
  */../* | */./*) refuse 'it may not contain . or .. components' ;;
esac

# Walk up to the nearest folder that exists. Comparisons below are by identity
# (-ef), not by text, so letter case and symlinks cannot slip past them.
existing="$DIR"
while [ ! -d "$existing" ]; do existing="$(dirname "$existing")"; done
p="$(cd "$existing" && pwd -P)"
while :; do
  [ "$p" -ef "$REPO" ] && refuse "it is inside the repository ($REPO)"
  [ "$p" = / ] && break
  p="$(dirname "$p")"
done
if [ -d "$DIR" ]; then
  [ "$DIR" -ef / ] && refuse 'it is the root folder'
  [ "$DIR" -ef "$HOME" ] && refuse 'it is your home folder itself'
  # Follow a symlinked backup folder to where the dumps really are, so pruning
  # looks inside it.
  DIR="$(cd "$DIR" && pwd -P)"
  [ -O "$DIR" ] || refuse 'it exists and is not yours'
  [ -n "$(find "$DIR" -maxdepth 0 -perm 700)" ] ||
    refuse 'it exists and is not mode 700 (chmod 700 it yourself if it is the right folder)'
fi

cutoff() {
  date -v-"${DELETE_AFTER_DAYS}"d +%Y%m%d-%H%M%S 2>/dev/null ||
    date -d "${DELETE_AFTER_DAYS} days ago" +%Y%m%d-%H%M%S
}

prune() {
  [ -d "$DIR" ] || return 0
  local limit name
  limit="$(cutoff)"
  for folder in "$DIR"/*/; do
    folder="${folder%/}"
    [ -d "$folder" ] && [ ! -L "$folder" ] && [ -f "$folder/$MARKER" ] || continue
    name="$(basename "$folder")"
    [[ "$name" =~ ^[0-9]{8}-[0-9]{6}-[A-Za-z0-9._-]+$ ]] || continue
    if [[ "${name:0:15}" < "$limit" || "${name:0:15}" == "$limit" ]]; then
      echo "backup: deleting $folder"
      rm -rf -- "$folder"
    fi
  done
}

if [ "${1:-}" = "--prune-only" ]; then
  prune
  exit 0
fi

label="${1:?usage: backup-production.sh <label> | --prune-only}"
[[ "$label" =~ ^[A-Za-z0-9._-]+$ ]] || refuse 'the label may use letters, digits, . _ - only'

mkdir -p "$DIR"
DIR="$(cd "$DIR" && pwd -P)"
B="$DIR/$(date +%Y%m%d-%H%M%S)-$label"
mkdir "$B"
: > "$B/$MARKER"

# The linked project is read from the checkout, so dump from there. Every path
# check has passed, and the dumps are written to absolute paths outside it.
cd "$REPO"

# `db dump` defaults to SCHEMA ONLY. Take all three, or the journals are missing.
supabase db dump --linked -f "$B/backup-schema.sql"
supabase db dump --linked --data-only -f "$B/backup-data.sql"
supabase db dump --linked --data-only --schema auth -f "$B/backup-auth-data.sql"

ls -l "$B"
prune
