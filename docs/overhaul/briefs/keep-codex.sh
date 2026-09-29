#!/bin/bash
# Keeps a Codex agent working until its last message contains ALL WEAPONS DONE.
# Usage (from the repo root): docs/overhaul/briefs/keep-codex.sh <name> <worktree> <thread id> <brief file>
# Resumes the saved thread from inside the worktree, waits out "at capacity" errors with
# backoff, and starts a fresh session on the brief if the thread cannot be resumed.
name=$1; wt=$2; id=$3; brief=$4
root=$(pwd); logs=$root/output/agents; mkdir -p "$logs"
CONT="Continue your brief from where you stopped (the orchestrator paused you). Check git log since 9934dda and git status in your worktree, commit what is good, then finish every weapon to the quality bar. End with ALL WEAPONS DONE only when all are genuinely finished."
wait_s=60
for round in $(seq 1 40); do
  grep -q "ALL WEAPONS DONE" "$logs/$name.last.txt" 2>/dev/null && break
  touch "$logs/$name.jsonl"; before=$(wc -l < "$logs/$name.jsonl")
  echo "ROUND $round $(date +%H:%M) resume $id" >> "$logs/$name.rounds"
  (cd "$wt" && codex exec resume --skip-git-repo-check --json -c model_reasoning_effort=max -o "$logs/$name.last.txt" "$id" "$CONT") >> "$logs/$name.jsonl" 2>> "$logs/$name.err"
  added=$(( $(wc -l < "$logs/$name.jsonl") - before ))
  if tail -n 3 "$logs/$name.jsonl" | grep -q "at capacity"; then
    echo "  capacity, waiting ${wait_s}s" >> "$logs/$name.rounds"; sleep $wait_s; wait_s=$(( wait_s < 600 ? wait_s * 2 : 600 )); continue
  fi
  wait_s=60
  if [ "$added" -lt 3 ]; then
    echo "  fresh session" >> "$logs/$name.rounds"
    { cat "$root/$brief"; echo; echo "RESUMING AFTER AN INTERRUPTION: a previous session of yours already did part of this job in this worktree. Start by reading git log since 9934dda and git status, keep and commit what is good, and continue with what remains."; } > "$logs/$name.fresh"
    (cd "$wt" && codex exec --skip-git-repo-check --json -m gpt-6-astra -c model_reasoning_effort=max -o "$logs/$name.last.txt" - < "$logs/$name.fresh") >> "$logs/$name.jsonl" 2>> "$logs/$name.err"
    id=$(grep -o '"thread_id":"[^"]*"' "$logs/$name.jsonl" | tail -1 | cut -d'"' -f4)
  fi
done
echo "EXIT $name $(tail -c 1200 "$logs/$name.last.txt" 2>/dev/null)"
