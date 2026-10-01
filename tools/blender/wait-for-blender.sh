#!/bin/bash
# Waits until no other headless Blender job runs on this machine, so heavy bakes run one at a
# time when several agents share it. Usage: tools/blender/wait-for-blender.sh && <blender command>
while pgrep -f "Blender -b" > /dev/null; do sleep 20; done
