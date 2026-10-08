#!/usr/bin/env bash
# Runs a command with a clean environment: only what the CLI needs, the API key
# from ORCHESTRATOR_API_KEY, and no variables inherited from an outer Claude Code
# session (session id, remote-session tools, and so on).
exec env -i HOME="$HOME" PATH="$PATH" TERM=dumb LANG=C.UTF-8 \
  HTTPS_PROXY="${HTTPS_PROXY:-}" HTTP_PROXY="${HTTP_PROXY:-}" NO_PROXY="${NO_PROXY:-}" \
  SSL_CERT_FILE="${SSL_CERT_FILE:-}" NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-}" REQUESTS_CA_BUNDLE="${REQUESTS_CA_BUNDLE:-}" \
  ANTHROPIC_API_KEY="${ORCHESTRATOR_API_KEY:?set ORCHESTRATOR_API_KEY}" "$@"
