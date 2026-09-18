#!/bin/sh
# usage: kill-port.sh <port>
for pid in $(netstat -ano | grep -E "LISTENING" | grep ":$1 " | awk "{print \$NF}" | sort -u); do
  echo "killing pid $pid on port $1"
  taskkill //F //PID "$pid" 2>/dev/null
done
exit 0
