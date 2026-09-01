#!/usr/bin/env bash
#
# Run one browser suite inside a Linux network namespace that has loopback and
# nothing else, and prove — in the CI log — that the isolation actually engaged.
#
# Why a file and not two inline `run:` blocks: the privilege chain is
# sudo -> unshare --net -> setpriv (drop to the runner UID) -> env -> command,
# which crosses three quoting boundaries. Both the e2e and the visual phase need
# it, and a YAML block scalar cannot be syntax-checked or argument-tested. One
# file is `bash -n`/shellcheck-clean, testable, and guarantees the two phases
# behave identically instead of drifting apart.
#
# Usage: run-offline.sh <label> <log-path> <command> [args...]
#
# The command runs as the invoking (unprivileged) user, in the invoking working
# directory, with an explicit environment. Only root creates the namespace and
# brings loopback up; nothing under test ever runs as root.
#
# Exit status is the command's own status. A missing log, a missing proof
# sentinel or a UID that is not the invoking user's fails the step.

set -euo pipefail

readonly RESERVED_PROBE_ADDRESS="192.0.2.1"   # RFC 5737 TEST-NET-1: routed nowhere.

die() {
  echo "::error::$*" >&2
  exit "${EXIT_CODE:-1}"
}

# --------------------------------------------------------------------------
# Inner stage. Already root, already inside the fresh network namespace.
# Arguments are positional and were passed through argv, not the environment,
# because sudo resets the environment.
# --------------------------------------------------------------------------
if [ "${1-}" = "--isolated" ]; then
  shift
  [ "$#" -ge 8 ] || { echo "::error::--isolated needs label parent-netns uid gid home path workdir [NAME=VALUE...] -- command..." >&2; exit 2; }
  label="$1"; parent_netns="$2"; uid="$3"; gid="$4"; child_home="$5"; child_path="$6"; workdir="$7"
  shift 7
  # Forwarded variables cross the sudo boundary as argv, never as environment:
  # sudo resets the environment, and passing VAR=value through sudo depends on a
  # sudoers SETENV grant this workflow must not assume.
  forwarded=()
  while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do
    case "$1" in
      AZALENS_ACCEPT_BASELINES=*)
        echo "::error::AZALENS_ACCEPT_BASELINES must never be forwarded into an offline verification run." >&2
        exit 2
        ;;
      *=*) forwarded+=("$1") ;;
      *) echo "::error::--isolated expected NAME=VALUE or '--', got: $1" >&2; exit 2 ;;
    esac
    shift
  done
  [ "${1-}" = "--" ] || { echo "::error::--isolated expects '--' before the command." >&2; exit 2; }
  shift
  [ "$#" -ge 1 ] || { echo "::error::--isolated needs a command to run." >&2; exit 2; }

  for tool in ip setpriv env id readlink; do
    command -v "$tool" >/dev/null 2>&1 \
      || { echo "::error::Required executable '$tool' is missing inside the namespace; offline isolation cannot be proven." >&2; exit 3; }
  done

  ip link set lo up \
    || { echo "::error::Could not bring loopback up inside the namespace; the app server would be unreachable." >&2; exit 4; }

  # 1. Namespace identity: the child must not be the runner's namespace.
  # `|| true` so an unreadable /proc gives the explicit error below instead of a
  # silent `set -e` abort with no diagnosis.
  child_netns="$(readlink /proc/self/ns/net || true)"
  if [ -z "$child_netns" ]; then
    echo "::error::Could not read the child network namespace identity for ${label}; isolation cannot be proven." >&2
    exit 5
  fi
  echo "OFFLINE_LABEL=${label}"
  echo "OFFLINE_PARENT_NETNS=${parent_netns}"
  echo "OFFLINE_CHILD_NETNS=${child_netns}"
  if [ "$child_netns" = "$parent_netns" ]; then
    echo "::error::Network isolation did not engage for ${label}: child namespace ${child_netns} is the host namespace." >&2
    exit 5
  fi
  echo "OFFLINE_NETNS_PROOF=engaged"

  # 2. Interfaces: loopback present and UP, nothing else usable.
  echo "OFFLINE_LINK_TABLE_BEGIN"
  ip -o link show
  echo "OFFLINE_LINK_TABLE_END"
  # `grep -c -v` exits 1 when nothing is left, which is the *expected* case here,
  # so `|| true` keeps `pipefail` from aborting on a successful isolation.
  non_loopback="$(ip -o link show | awk -F': ' '{print $2}' | sed 's/@.*//' | grep -c -vx 'lo' || true)"
  echo "OFFLINE_NONLOOPBACK_COUNT=${non_loopback}"
  if [ "$non_loopback" -ne 0 ]; then
    echo "::error::Network isolation is incomplete for ${label}: ${non_loopback} non-loopback interface(s) exist inside the namespace." >&2
    exit 6
  fi
  if ! ip -o link show dev lo | grep -Eq '[<,]UP[,>]'; then
    echo "::error::Loopback is not UP inside the namespace for ${label}; the app server could not be reached." >&2
    exit 7
  fi
  if ! ip -o -4 addr show dev lo | grep -q '127\.0\.0\.1'; then
    # Bringing lo up normally makes the kernel assign 127.0.0.1/8 in a fresh
    # namespace. Assign it explicitly if this kernel did not, rather than
    # depending on that behaviour, then re-check and fail if it is still absent.
    ip addr add 127.0.0.1/8 dev lo || true
  fi
  if ! ip -o -4 addr show dev lo | grep -q '127\.0\.0\.1'; then
    echo "::error::Loopback has no 127.0.0.1 address inside the namespace for ${label}; the app server could not bind." >&2
    exit 7
  fi
  echo "OFFLINE_LOOPBACK_PROOF=up"

  # 3. Routing: no default route, and no route at all to a reserved address.
  echo "OFFLINE_ROUTE_TABLE_BEGIN"
  ip -4 route show
  ip -6 route show
  echo "OFFLINE_ROUTE_TABLE_END"
  default_routes="$( { ip -4 route show; ip -6 route show; } 2>/dev/null | grep -c '^default' || true )"
  echo "OFFLINE_DEFAULT_ROUTE_COUNT=${default_routes}"
  if [ "$default_routes" -ne 0 ]; then
    echo "::error::Network isolation is incomplete for ${label}: ${default_routes} default route(s) exist inside the namespace." >&2
    exit 8
  fi
  # A route lookup only asks the kernel; it contacts nothing. TEST-NET-1 is
  # reserved for documentation, so this can never reach a real service.
  route_probe=0
  route_output="$(ip route get "$RESERVED_PROBE_ADDRESS" 2>&1)" || route_probe=$?
  echo "OFFLINE_ROUTE_PROBE_STATUS=${route_probe}"
  echo "OFFLINE_ROUTE_PROBE_OUTPUT=${route_output}"
  if [ "$route_probe" -eq 0 ]; then
    echo "::error::Network isolation did not engage for ${label}: ${RESERVED_PROBE_ADDRESS} is routable inside the namespace." >&2
    exit 9
  fi
  echo "OFFLINE_ROUTE_PROOF=no-external-route"

  # 4. Drop to the invoking user and run the suite. `setpriv` does not touch the
  #    environment, so `env` supplies exactly the variables the suite needs and
  #    nothing else; AZALENS_ACCEPT_BASELINES cannot survive this boundary.
  echo "OFFLINE_COMMAND=$*"
  status=0
  setpriv --reuid="$uid" --regid="$gid" --init-groups -- \
    env -i \
      HOME="$child_home" \
      PATH="$child_path" \
      CI=1 \
      NPM_CONFIG_UPDATE_NOTIFIER=false \
      ${forwarded[@]+"${forwarded[@]}"} \
      /bin/bash -c '
        set -euo pipefail
        cd "$1" || exit 10
        shift
        echo "OFFLINE_TEST_UID_PROOF=$(id -u):$(id -g)"
        echo "OFFLINE_COMMAND_PROOF=started"
        exec "$@"
      ' offline-runner "$workdir" "$@" || status=$?
  echo "OFFLINE_COMMAND_EXIT=${status}"
  exit "$status"
fi

# --------------------------------------------------------------------------
# Outer stage. Runs as the ordinary runner user.
# --------------------------------------------------------------------------
EXIT_CODE=2
[ "$#" -ge 3 ] || die "Usage: run-offline.sh <label> <log-path> <command> [args...]"
label="$1"; log_path="$2"; shift 2
[ -n "$label" ] || die "The isolation label must not be empty."
[ -n "$log_path" ] || die "The log path must not be empty."
log_dir="$(dirname "$log_path")"
[ -d "$log_dir" ] || die "Log directory $log_dir does not exist."
[ -w "$log_dir" ] || die "Log directory $log_dir is not writable."

uid="$(id -u)"; gid="$(id -g)"
[ "$uid" -ne 0 ] || die "run-offline.sh must be invoked as the unprivileged runner user, not as root."
[ -n "${HOME-}" ] || die "HOME is unset; the suite would run without a usable home directory."
[ -n "${PATH-}" ] || die "PATH is unset."
if [ -n "${AZALENS_ACCEPT_BASELINES-}" ]; then
  die "AZALENS_ACCEPT_BASELINES is set; an offline verification run must never be able to accept a baseline."
fi

EXIT_CODE=3
for tool in sudo unshare setpriv ip readlink tee; do
  command -v "$tool" >/dev/null 2>&1 \
    || die "Required executable '$tool' is not available on this runner; network-namespace isolation cannot be established."
done
command -v "$1" >/dev/null 2>&1 || die "Command '$1' was not found on PATH."
EXIT_CODE=1

self_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
self="${self_dir}/$(basename -- "$0")"
parent_netns="$(readlink /proc/self/ns/net || true)"
[ -n "$parent_netns" ] || die "Could not read the host network namespace identity; isolation could not be compared against it."

echo "OFFLINE_PHASE=${label}"
echo "OFFLINE_HOST_NETNS=${parent_netns}"
echo "OFFLINE_EXPECTED_UID=${uid}:${gid}"

# Only variables the suite actually reads are forwarded, and only when the
# current step already sets them, so the isolated environment stays identical to
# today's for anything that could move a pixel (locale drives fontconfig
# matching) or that a spec reads (REVIEW_HEAD_SHA). Everything else is dropped,
# which is what makes "AZALENS_ACCEPT_BASELINES is unset inside" structural
# rather than a promise.
forwarded=()
for name in REVIEW_HEAD_SHA LANG LANGUAGE LC_ALL LC_CTYPE TZ; do
  if [ -n "${!name-}" ]; then
    forwarded+=("${name}=${!name}")
  fi
done

# `set -e` is lifted for exactly this pipeline, so a failing suite cannot abort
# the script before its status has been captured. PIPESTATUS[0] is the isolated
# command's own status; PIPESTATUS[1] is tee's and is never used as the test
# result. This is the shape that makes the `docker pull ... | tail` class of
# error — reporting a log consumer's status as the command's — impossible here.
set +e
sudo -n unshare --net -- \
  /bin/bash "$self" --isolated \
    "$label" "$parent_netns" "$uid" "$gid" "$HOME" "$PATH" "$PWD" \
    ${forwarded[@]+"${forwarded[@]}"} -- "$@" 2>&1 | tee "$log_path"
pipe_status=("${PIPESTATUS[@]}")
set -e
status="${pipe_status[0]}"
log_writer_status="${pipe_status[1]-0}"
echo "OFFLINE_ISOLATED_EXIT=${status}"
echo "OFFLINE_LOG_WRITER_EXIT=${log_writer_status}"

[ -f "$log_path" ] || die "Offline log $log_path is missing; the ${label} isolation proof could not be verified."

missing=""
require_sentinel() {
  grep -F -q -e "$1" "$log_path" || missing="${missing} $1"
}
require_sentinel "OFFLINE_NETNS_PROOF=engaged"
require_sentinel "OFFLINE_NONLOOPBACK_COUNT=0"
require_sentinel "OFFLINE_LOOPBACK_PROOF=up"
require_sentinel "OFFLINE_DEFAULT_ROUTE_COUNT=0"
require_sentinel "OFFLINE_ROUTE_PROOF=no-external-route"
require_sentinel "OFFLINE_TEST_UID_PROOF=${uid}:${gid}"
require_sentinel "OFFLINE_COMMAND_PROOF=started"
require_sentinel "OFFLINE_COMMAND_EXIT=${status}"

if [ -n "$missing" ]; then
  echo "::error::The ${label} offline run is missing required proof sentinels:${missing}. The isolation gate fails closed."
fi
if [ "$log_writer_status" -ne 0 ]; then
  echo "::error::Writing the ${label} offline log failed (log writer exited ${log_writer_status}); downstream log gates cannot be trusted."
fi
if [ "$status" -ne 0 ]; then
  echo "::error::The isolated ${label} command exited ${status}."
  exit "$status"
fi
if [ -n "$missing" ] || [ "$log_writer_status" -ne 0 ]; then
  exit 1
fi

echo "Offline verification for ${label}: namespace ${parent_netns} -> isolated child, loopback up, 0 non-loopback interfaces, 0 default routes, ${RESERVED_PROBE_ADDRESS} unroutable, suite run as ${uid}:${gid}, command exited 0."
