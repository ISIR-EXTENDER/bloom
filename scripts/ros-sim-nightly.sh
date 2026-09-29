#!/usr/bin/env bash
# The nightly simulation gate: scripts/ros-sim-e2e.sh for each arm, one after the other, every result kept.
#
#   BLOOM_E2E_ROBOTS=both|explorer|kinova   arms to drive (default: both)
#   BLOOM_E2E_OUT=dir                       where captures and logs go (default: /tmp/bloom-ros-sim-nightly)
#
# A failed arm does not stop the other; the exit status says whether every arm passed. On GitHub Actions the
# per-arm results are appended to the job summary.
set -uo pipefail

BLOOM_ROOT=${BLOOM_ROOT:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"}
OUT_DIR=${BLOOM_E2E_OUT:-"${TMPDIR:-/tmp}/bloom-ros-sim-nightly"}
ROBOTS=${BLOOM_E2E_ROBOTS:-both}

case "${ROBOTS}" in
  both) ROBOT_LIST=(explorer kinova) ;;
  explorer | kinova) ROBOT_LIST=("${ROBOTS}") ;;
  *)
    echo "BLOOM_E2E_ROBOTS must be both, explorer or kinova" >&2
    exit 2
    ;;
esac

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"
summary="${OUT_DIR}/summary.md"
printf '| arm | result | seconds |\n| --- | --- | --- |\n' > "${summary}"

failed=0
for robot in "${ROBOT_LIST[@]}"; do
  started=${SECONDS}
  if bash "${BLOOM_ROOT}/scripts/ros-sim-e2e.sh" --robot "${robot}" --out "${OUT_DIR}/${robot}" \
    > "${OUT_DIR}/${robot}.log" 2>&1; then
    result=pass
  else
    result=fail
    failed=1
  fi
  printf '| %s | %s | %s |\n' "${robot}" "${result}" "$((SECONDS - started))" >> "${summary}"
  echo "[ros-sim-nightly] ${robot}: ${result} (log: ${OUT_DIR}/${robot}.log)"
done

cat "${summary}"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  cat "${summary}" >> "${GITHUB_STEP_SUMMARY}"
fi
exit "${failed}"
