#!/usr/bin/env bash
# Starts the backend for local development.
#
# The OpenAI key already lives in the project's `.dev.vars`, which the Next.js dev server reads and
# which git ignores. Rather than keep a second copy of the same secret in `backend/.env`, this script
# reads it from there when the environment does not already carry one. One secret, one file.
#
#   ./run-local.sh              # bootRun
#   ./run-local.sh --debug-jvm  # arguments are passed through to Gradle
set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -z "${OPENAI_API_KEY:-}" ] && [ -f ../.dev.vars ]; then
  OPENAI_API_KEY="$(sed -n 's/^OPENAI_API_KEY=//p' ../.dev.vars | head -1)"
  export OPENAI_API_KEY
fi

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "note: no OPENAI_API_KEY found — the five model-backed endpoints will answer 503." >&2
fi

if [ -z "${JAVA_HOME:-}" ] && command -v /usr/libexec/java_home >/dev/null 2>&1; then
  JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
  [ -n "$JAVA_HOME" ] && export JAVA_HOME
fi

exec ./gradlew bootRun "$@"
