#!/usr/bin/env bash
# 监听 ashare-recommend 源码改动 → 防抖 → 自动 commit + push → 触发 Vercel Git 部署
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="main"
DEBOUNCE_SEC="${AUTO_GIT_DEBOUNCE:-8}"
LOG_FILE="${AUTO_GIT_LOG:-/var/log/ashare-auto-git.log}"
LOCK_FILE="/tmp/ashare-auto-git.lock"
PID_FILE="/tmp/ashare-auto-git.pid"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
touch "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/ashare-auto-git.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# 忽略：构建产物、依赖、密钥、本脚本运行时
should_ignore() {
  local p="$1"
  case "$p" in
    *node_modules*|.next/*|*/.next/*|.git/*|*/.git/*|.vercel/*|*/.vercel/*)
      return 0 ;;
    *.log|*.tsbuildinfo|.env*|.env.local)
      return 0 ;;
    */.DS_Store|*.swp|*.tmp|*~)
      return 0 ;;
  esac
  return 1
}

has_changes() {
  cd "$REPO_DIR"
  # 有未提交改动 或 有未跟踪文件（排除 .gitignore）
  if ! git diff --quiet || ! git diff --cached --quiet; then
    return 0
  fi
  if [ -n "$(git ls-files --others --exclude-standard)" ]; then
    return 0
  fi
  return 1
}

do_sync() {
  cd "$REPO_DIR"
  # 防并发
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "skip: another sync in progress"
    return 0
  fi

  if ! has_changes; then
    log "skip: no changes"
    return 0
  fi

  # 拉一下远程，避免 divergent（不 rebase 强推）
  git fetch origin "$BRANCH" 2>>"$LOG_FILE" || true
  if git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
    local behind
    behind=$(git rev-list --count HEAD.."origin/$BRANCH" 2>/dev/null || echo 0)
    if [ "${behind:-0}" -gt 0 ]; then
      log "warn: local behind origin/$BRANCH by $behind; trying pull --rebase"
      if ! git pull --rebase origin "$BRANCH" 2>>"$LOG_FILE"; then
        log "error: pull --rebase failed; abort push to protect remote"
        return 1
      fi
    fi
  fi

  git add -A
  # 再次确认 staged 有内容
  if git diff --cached --quiet; then
    log "skip: nothing staged after add"
    return 0
  fi

  local summary
  summary=$(git diff --cached --stat | tail -1 | sed 's/^ *//')
  local msg
  msg="auto: $(date '+%Y-%m-%d %H:%M:%S') ${summary}"

  if ! git commit -m "$msg" 2>>"$LOG_FILE"; then
    log "error: commit failed"
    return 1
  fi

  if git push origin "$BRANCH" 2>>"$LOG_FILE"; then
    local sha
    sha=$(git rev-parse --short HEAD)
    log "ok: pushed $sha — $msg"
  else
    log "error: push failed"
    return 1
  fi
}

watch_loop() {
  cd "$REPO_DIR"
  echo $$ >"$PID_FILE"
  log "start watch: $REPO_DIR (debounce=${DEBOUNCE_SEC}s)"

  # 只盯源码相关目录，减少噪音
  local watch_paths=()
  for p in src public scripts package.json package-lock.json next.config.ts tsconfig.json tailwind.config.ts postcss.config.mjs eslint.config.mjs README.md; do
    [ -e "$REPO_DIR/$p" ] && watch_paths+=("$REPO_DIR/$p")
  done
  if [ ${#watch_paths[@]} -eq 0 ]; then
    watch_paths=("$REPO_DIR")
  fi

  # 用 process substitution 读事件；任意改动后防抖再同步
  while true; do
    # 阻塞等第一个事件
    inotifywait -r -e modify,create,delete,move \
      --exclude '(\.git|node_modules|\.next|\.vercel|.*\.log$|.*\.tsbuildinfo$)' \
      "${watch_paths[@]}" >/tmp/ashare-inotify.evt 2>/dev/null || {
        log "inotifywait exit/error, sleep 3 and retry"
        sleep 3
        continue
      }

    local evt
    evt=$(cat /tmp/ashare-inotify.evt 2>/dev/null || true)
    log "event: $evt"

    # 防抖：在窗口内继续吞事件
    local end=$((SECONDS + DEBOUNCE_SEC))
    while [ "$SECONDS" -lt "$end" ]; do
      if inotifywait -r -t 1 -e modify,create,delete,move \
        --exclude '(\.git|node_modules|\.next|\.vercel|.*\.log$|.*\.tsbuildinfo$)' \
        "${watch_paths[@]}" >/tmp/ashare-inotify.evt 2>/dev/null; then
        end=$((SECONDS + DEBOUNCE_SEC))
      fi
    done

    do_sync || true
  done
}

case "${1:-watch}" in
  watch)
    watch_loop
    ;;
  once|sync)
    do_sync
    ;;
  status)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "running pid=$(cat "$PID_FILE")"
      tail -n 20 "$LOG_FILE" 2>/dev/null || true
    else
      echo "not running"
      tail -n 10 "$LOG_FILE" 2>/dev/null || true
    fi
    ;;
  *)
    echo "usage: $0 {watch|once|status}"
    exit 2
    ;;
esac
