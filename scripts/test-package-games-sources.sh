#!/usr/bin/env bash

set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
subject_script="${script_dir}/package-games-sources.sh"
test_root=$(mktemp -d)
trap 'rm -rf -- "${test_root}"' EXIT

documents_root="${test_root}/Documents"
games_root="${documents_root}/games"
backend_root="${games_root}/backend"
platform_root="${games_root}/platform"
mkdir -p "${games_root}/scripts" "${games_root}/frontend/build" \
    "${backend_root}/src" "${platform_root}/platform" \
    "${platform_root}/docs/projects/games"
cp "${subject_script}" "${games_root}/scripts/package-games-sources.sh"
printf 'frontend\n' > "${games_root}/frontend/tracked.txt"
printf 'backend\n' > "${backend_root}/src/tracked.txt"
printf 'platform\n' > "${platform_root}/platform/tracked.txt"
printf 'memory\n' > "${platform_root}/docs/projects/games/agent-memory.md"
printf 'ignored build\n' > "${games_root}/frontend/build/generated.txt"
printf '/frontend/build/\n' > "${games_root}/.gitignore"

for repository in "${games_root}" "${backend_root}" "${platform_root}"; do
    git -C "${repository}" init -q
done
git -C "${games_root}" add -- .gitignore scripts/package-games-sources.sh frontend/tracked.txt
git -C "${backend_root}" add -- src/tracked.txt
git -C "${platform_root}" add -- platform/tracked.txt \
    docs/projects/games/agent-memory.md
for repository in "${games_root}" "${backend_root}" "${platform_root}"; do
    git -C "${repository}" -c user.name=Test -c user.email=test@example.invalid \
        commit -qm 'fixture baseline'
done

printf 'new frontend\n' > "${games_root}/frontend/new.js"
printf 'new backend\n' > "${backend_root}/src/new.txt"
printf 'new platform\n' > "${platform_root}/platform/new.txt"

package_script="${games_root}/scripts/package-games-sources.sh"
archive="${test_root}/games.zip"
"${package_script}" --output "${archive}" >/dev/null
unzip -tq "${archive}" >/dev/null

for expected_path in \
    games/frontend/tracked.txt \
    games/frontend/new.js \
    games/backend/src/tracked.txt \
    games/backend/src/new.txt \
    games/platform/platform/tracked.txt \
    games/platform/platform/new.txt \
    games/platform/docs/projects/games/agent-memory.md; do
    count=$(unzip -Z1 "${archive}" | awk -v target="${expected_path}" \
        '$0 == target { count += 1 } END { print count + 0 }')
    [[ ${count} -eq 1 ]] || {
        printf 'Expected exactly one %s, found %s.\n' "${expected_path}" "${count}" >&2
        exit 1
    }
done

if unzip -Z1 "${archive}" | grep -Fx -- 'games/frontend/build/generated.txt' >/dev/null; then
    printf 'Ignored build output was included.\n' >&2
    exit 1
fi

printf 'package-games-sources tests: OK\n'
