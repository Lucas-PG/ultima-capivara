#!/bin/bash
# Starts a fresh Codex agent on a brief, then keeps it working until it reports the done marker.
# Usage (from the repo root): docs/overhaul/briefs/start-codex.sh <name> <worktree> <brief file>
name=$1; wt=$2; brief=$3
root=$(pwd); logs=$root/output/agents; mkdir -p "$logs"
(cd "$wt" && codex exec --skip-git-repo-check --json -m gpt-6-astra -c model_reasoning_effort=max -o "$logs/$name.last.txt" - < "$root/$brief") >> "$logs/$name.jsonl" 2>> "$logs/$name.err"
id=$(grep -o '"thread_id":"[^"]*"' "$logs/$name.jsonl" | head -1 | cut -d'"' -f4)
echo "START $name thread $id" >> "$logs/$name.rounds"
MARKER="TASK DONE" "$root/docs/overhaul/briefs/keep-codex.sh" "$name" "$wt" "$id" "$brief"
