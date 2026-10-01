#!/bin/bash
# Headless Blender on the Linux build machine (lpg-arch over Tailscale), as a drop-in for the
# Blender binary: the job runs there with every CPU thread and none of this Mac's memory pressure.
#   BLENDER_BIN=/Users/lucas_gaspe/dev/ultima-capivara/tools/blender/remote-blender.sh node tools/blender/build-characters.mjs
# Run it from the repository or worktree root (the build scripts do). Each job:
#   1. sends the build inputs that differ from the remote copy (tools/, src/shared/, public/textures/
#      and the output/ caches the scripts read), and removes remote inputs deleted here;
#   2. runs Blender 5.0.1 there, one job at a time, with every thread (-t 0 and BLENDER_THREADS=0);
#   3. brings back every file the job wrote or changed, with its time stamp.
# Paths inside the root are made relative. The job runs on this Mac's Blender instead, unchanged,
# when the machine cannot be reached or an argument points outside the root.
set -uo pipefail
LOCAL=/Applications/Blender.app/Contents/MacOS/Blender
HOST=${REMOTE_BLENDER_HOST:-lucas@100.127.155.117}
KEY=${REMOTE_BLENDER_KEY:-$HOME/.ssh/arch_pc}
BIN=blender/blender-5.0.1-linux-x64/blender
SYNC=(tools src/shared public/textures output/characters output/fp output/arsenal output/kit output/supply-drop)
orig=("$@")
say() { echo "remote-blender: $*" >&2; }
fallback() { say "$1; running on this Mac"; exec "$LOCAL" "${orig[@]}"; }
ssh_() { ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=8 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 "$HOST" "$@"; }

root=$(pwd -P)
dir="capivara-remote/$(basename "$root")-$(printf %s "$root" | shasum | cut -c1-8)"
job="$(date +%Y%m%d-%H%M%S)-$$"
args=()
while [ $# -gt 0 ]; do
  a=$1; shift
  case "$a" in
    -t) [ $# -gt 0 ] && shift; args+=(-t 0) ;;
    "$root"/*) args+=("${a#"$root"/}") ;;
    /*) fallback "argument outside the repository ($a)" ;;
    *) args+=("$a") ;;
  esac
done
ssh_ true 2>/dev/null || fallback "$HOST cannot be reached"

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
paths=(); for p in "${SYNC[@]}"; do [ -e "$p" ] && paths+=("$p"); done
# Files named on the command line (a --python script or a data file elsewhere in the root) go too.
for a in "${args[@]}"; do [ -f "$a" ] && paths+=("$a"); done
manifest_local() { find "${paths[@]}" -type f ! -name .DS_Store ! -name '._*' -print0 | xargs -0 stat -f '%m%t%z%t%N' | LC_ALL=C sort; }
manifest_remote() { ssh_ "bash -c 'cd $dir 2>/dev/null && find $1 -type f -printf \"%Ts\t%s\t%p\n\" 2>/dev/null | sed \"s|^\([0-9]*\)\t\([0-9]*\)\t\./|\1\t\2\t|\" | LC_ALL=C sort'"; }

# 1. Inputs.
manifest_local > "$tmp/local"
manifest_remote "${paths[*]}" > "$tmp/remote" || : > "$tmp/remote"
LC_ALL=C comm -23 "$tmp/local" "$tmp/remote" | cut -f3- | tr '\n' '\0' > "$tmp/send"
cut -f3- "$tmp/local" | LC_ALL=C sort > "$tmp/local-paths"
cut -f3- "$tmp/remote" | LC_ALL=C sort > "$tmp/remote-paths"
LC_ALL=C comm -13 "$tmp/local-paths" "$tmp/remote-paths" | tr '\n' '\0' > "$tmp/gone"
if [ -s "$tmp/send" ]; then
  say "sending $(tr -cd '\0' < "$tmp/send" | wc -c | tr -d ' ') changed input files"
  COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata --null -T "$tmp/send" -cf - | ssh_ "mkdir -p $dir && tar -xf - -C $dir" || { say "input upload failed"; exit 1; }
fi
[ -s "$tmp/gone" ] && ssh_ "cd $dir && xargs -0 rm -f" < "$tmp/gone"
manifest_remote . > "$tmp/before" || { say "remote manifest failed"; exit 1; }

# 2. The job: queued behind any other remote Blender job, stopped if this script is interrupted.
{
  echo "cd \"\$HOME/$dir\" || exit 97"
  echo "echo \$\$ > \"\$HOME/capivara-remote/.jobs/$job.pid\""
  echo "exec 9>\"\$HOME/capivara-remote/.lock\"; flock 9"
  printf 'BLENDER_THREADS=0 "$HOME/%s"' "$BIN"; printf ' %q' "${args[@]}"; echo
} > "$tmp/job.sh"
ssh_ "mkdir -p capivara-remote/.jobs && cat > capivara-remote/.jobs/$job.sh" < "$tmp/job.sh" || { say "job upload failed"; exit 1; }
stop_remote() { ssh_ "bash -c 'p=\$(cat capivara-remote/.jobs/$job.pid 2>/dev/null) && pkill -P \$p; kill \$p'" 2>/dev/null; exit 143; }
trap stop_remote INT TERM
say "running on $HOST: blender ${args[*]}"
start=$(date +%s)
ssh_ "bash capivara-remote/.jobs/$job.sh"
status=$?
say "remote job finished with status $status in $(( $(date +%s) - start )) s"

# 3. Everything the job wrote comes back, successful or not (logs and partial caches help debugging).
manifest_remote . > "$tmp/after" || { say "remote manifest failed"; exit 1; }
LC_ALL=C comm -13 "$tmp/before" "$tmp/after" | cut -f3- | tr '\n' '\0' > "$tmp/back"
if [ -s "$tmp/back" ]; then
  say "bringing back $(tr -cd '\0' < "$tmp/back" | wc -c | tr -d ' ') files"
  ssh_ "cd $dir && tar --null -T - -cf -" < "$tmp/back" | tar -xf - -C "$root" || { say "result download failed"; exit 1; }
fi
exit $status
