#!/usr/bin/env bash

set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
subject_script="${script_dir}/package-games-sources.sh"
test_root=$(mktemp -d)
trap 'rm -rf -- "${test_root}"' EXIT

fixture_root="${test_root}/Documents"
games_root="${fixture_root}/games"
backend_root="${fixture_root}/cabezudo.dev"
mkdir -p "${games_root}/scripts" "${games_root}/frontend" \
    "${backend_root}/api/backend/games"
cp "${subject_script}" "${games_root}/scripts/package-games-sources.sh"
printf 'tracked\n' > "${games_root}/frontend/tracked.txt"
printf 'backend\n' > "${backend_root}/api/backend/games/tracked.txt"

git -C "${games_root}" init -q
git -C "${games_root}" add -- scripts/package-games-sources.sh frontend/tracked.txt
git -C "${games_root}" -c user.name=Test -c user.email=test@example.invalid \
    commit -qm 'fixture baseline'
git -C "${backend_root}" init -q
git -C "${backend_root}" add -- api/backend/games/tracked.txt
git -C "${backend_root}" -c user.name=Test -c user.email=test@example.invalid \
    commit -qm 'fixture baseline'

package_script="${games_root}/scripts/package-games-sources.sh"
archive_has_once() {
    local archive=$1
    local path=$2
    local count
    count=$(unzip -Z1 "${archive}" | awk -v target="${path}" \
        '$0 == target { count += 1 } END { print count + 0 }')
    [[ ${count} -eq 1 ]] || {
        printf 'Expected exactly one %s in %s, found %s.\n' "${path}" "${archive}" "${count}" >&2
        return 1
    }
}

archive_lacks() {
    local archive=$1
    local path=$2
    ! unzip -Z1 "${archive}" | grep -Fx -- "${path}" >/dev/null
}

expect_failure() {
    local expected=$1
    shift
    local log="${test_root}/failure.log"
    if "$@" >"${log}" 2>&1; then
        printf 'Expected command to fail: %s\n' "$*" >&2
        return 1
    fi
    grep -F -- "${expected}" "${log}" >/dev/null || {
        printf 'Missing expected error %q. Output:\n' "${expected}" >&2
        sed -n '1,120p' "${log}" >&2
        return 1
    }
}

printf 'untracked\n' > "${games_root}/frontend/untracked.txt"
compatibility_zip="${test_root}/compatibility.zip"
"${package_script}" --output "${compatibility_zip}" >/dev/null
archive_has_once "${compatibility_zip}" games/frontend/tracked.txt
archive_lacks "${compatibility_zip}" games/frontend/untracked.txt

printf 'one\n' > "${games_root}/frontend/new-one.js"
git -C "${games_root}" add -- frontend/new-one.js
one_zip="${test_root}/one.zip"
"${package_script}" --files games/frontend/new-one.js --output "${one_zip}" >/dev/null
archive_has_once "${one_zip}" games/frontend/new-one.js

printf 'two\n' > "${games_root}/frontend/new-two.js"
printf 'backend-new\n' > "${backend_root}/api/backend/games/new-backend.txt"
git -C "${games_root}" add -- frontend/new-two.js
git -C "${backend_root}" add -- api/backend/games/new-backend.txt
multiple_zip="${test_root}/multiple.zip"
"${package_script}" --output "${multiple_zip}" --files \
    games/frontend/new-one.js \
    games/frontend/new-two.js \
    cabezudo.dev/api/backend/games/new-backend.txt >/dev/null
archive_has_once "${multiple_zip}" games/frontend/new-one.js
archive_has_once "${multiple_zip}" games/frontend/new-two.js
archive_has_once "${multiple_zip}" cabezudo.dev/api/backend/games/new-backend.txt

expect_failure 'run git add -- frontend/untracked.txt' \
    "${package_script}" --output "${test_root}/untracked.zip" \
    --files games/frontend/untracked.txt
expect_failure 'explicit file does not exist' \
    "${package_script}" --output "${test_root}/missing.zip" \
    --files games/frontend/missing.txt
expect_failure 'explicit path must be relative' \
    "${package_script}" --output "${test_root}/absolute.zip" \
    --files /tmp/absolute.txt
expect_failure "explicit path must not contain '..'" \
    "${package_script}" --output "${test_root}/parent.zip" \
    --files games/frontend/../outside.txt
expect_failure 'explicit path must begin with games/ or cabezudo.dev/' \
    "${package_script}" --output "${test_root}/prefix.zip" \
    --files other/frontend/new-one.js
expect_failure 'explicit path must be a regular file' \
    "${package_script}" --output "${test_root}/directory.zip" \
    --files games/frontend

ln -s tracked.txt "${games_root}/frontend/tracked-link.txt"
git -C "${games_root}" add -- frontend/tracked-link.txt
expect_failure 'explicit file must not be a symbolic link' \
    "${package_script}" --output "${test_root}/symlink.zip" \
    --files games/frontend/tracked-link.txt
git -C "${games_root}" rm -q --cached -- frontend/tracked-link.txt
rm -- "${games_root}/frontend/tracked-link.txt"

printf 'undeclared staged\n' > "${games_root}/frontend/undeclared-staged.js"
git -C "${games_root}" add -- frontend/undeclared-staged.js
expect_failure 'new Git-indexed file must be declared with --files: games/frontend/undeclared-staged.js' \
    "${package_script}" --output "${test_root}/undeclared-staged.zip" --files \
    games/frontend/new-one.js games/frontend/new-two.js

[[ -f ${multiple_zip} ]]
unzip -tq "${multiple_zip}" >/dev/null
printf 'package-games-sources tests: OK\n'
