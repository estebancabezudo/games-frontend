#!/usr/bin/env bash

set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
product_root=$(CDPATH= cd -- "${script_dir}/.." && pwd)
documents_root=$(CDPATH= cd -- "${product_root}/.." && pwd)
backend_root="${product_root}/backend"
platform_root="${product_root}/platform"
timestamp=$(date +%Y%m%d-%H%M%S)
output_path="${script_dir}/games-sources-review-${timestamp}.zip"
declare -a explicit_archive_paths=()
declare -A explicit_archive_path_set=()
output_option_seen=false
files_option_seen=false

usage() {
    printf 'Usage: %s [--output ZIP] [--files ARCHIVE_PATH...]\n' "${BASH_SOURCE[0]}" >&2
}

while (( $# > 0 )); do
    case $1 in
        --output)
            [[ ${output_option_seen} == false ]] || {
                printf 'Error: --output may only be provided once.\n' >&2
                usage
                exit 2
            }
            (( $# >= 2 )) && [[ -n $2 && $2 != --* ]] || {
                printf 'Error: --output requires a ZIP path.\n' >&2
                usage
                exit 2
            }
            output_option_seen=true
            output_path=$2
            shift 2
            ;;
        --files)
            [[ ${files_option_seen} == false ]] || {
                printf 'Error: --files may only be provided once.\n' >&2
                usage
                exit 2
            }
            files_option_seen=true
            shift
            files_before=${#explicit_archive_paths[@]}
            while (( $# > 0 )) && [[ $1 != --* ]]; do
                explicit_archive_paths+=("$1")
                shift
            done
            (( ${#explicit_archive_paths[@]} > files_before )) || {
                printf 'Error: --files requires at least one archive path.\n' >&2
                usage
                exit 2
            }
            ;;
        *)
            printf 'Error: unknown option: %s\n' "$1" >&2
            usage
            exit 2
            ;;
    esac
done

fail() {
    printf 'Error: %s\n' "$*" >&2
    exit 1
}

for command_name in git zip unzip sha256sum mktemp openssl; do
    command -v "${command_name}" >/dev/null 2>&1 || fail "missing command: ${command_name}"
done
[[ -d ${product_root} ]] || fail "missing Games project: ${product_root}"
[[ ! -e ${output_path} ]] || fail "refusing to overwrite: ${output_path}"

temporary_directory=$(mktemp -d)
staging_root="${temporary_directory}/staging"
candidate_archive="${temporary_directory}/sources.zip"
trap 'rm -rf -- "${temporary_directory}"' EXIT
mkdir -p -- "${staging_root}"
declare -A staged_paths=()

is_excluded() {
    local path=${1,,}
    case "/${path}/" in
        */.git/*|*/.gradle/*|*/build/*|*/target/*|*/node_modules/*|*/dist/*|*/coverage/*|*/.idea/*|*/.kotlin/*|*/.local-secrets/*)
            return 0
            ;;
    esac
    case "${path}" in
        local.properties|*/local.properties|.env|.env.*|*/.env|*/.env.*|*.apk|*.aab|*.zip|*.log|*.tmp|*.temp|*.bak|*.swp|*.swo|*~|*.db|*.sqlite|*.sqlite3)
            return 0
            ;;
    esac
    return 1
}

is_sensitive_path() {
    local path=${1,,}
    case "/${path}/" in
        */secrets/*|*/credentials/*|*/private-keys/*|*/private_keys/*|*/.ssh/*|*/.gnupg/*|*/.aws/*|*/.codex/*|*/.agents/*)
            return 0
            ;;
    esac
    case "${path}" in
        *.key|*.p12|*.pfx|*.jks|*.keystore|*private-key*|*private_key*)
            return 0
            ;;
    esac
    return 1
}

contains_secret() {
    openssl pkey -in "$1" -inform PEM -noout >/dev/null 2>&1 && return 0
    openssl pkey -in "$1" -inform DER -noout >/dev/null 2>&1 && return 0
    LC_ALL=C grep -aEq -- \
        '^[[:space:]]*-----BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY-----[[:space:]]*$|(^|[^A-Za-z0-9])(sk-proj-|sk-)[A-Za-z0-9_-]{20,}|(^|[^A-Z0-9])AKIA[A-Z0-9]{16}([^A-Z0-9]|$)' \
        "$1"
}

stage_file() {
    local source_file=$1
    local archive_path=$2
    [[ -f ${source_file} && ! -L ${source_file} ]] || return 0
    is_excluded "${archive_path}" && return 0
    is_sensitive_path "${archive_path}" && fail "sensitive path selected: ${archive_path}"
    contains_secret "${source_file}" && fail "possible secret found in: ${archive_path}"
    [[ -z ${staged_paths["${archive_path}"]+x} ]] || return 0
    staged_paths["${archive_path}"]=1
    mkdir -p -- "${staging_root}/$(dirname -- "${archive_path}")"
    cp -p -- "${source_file}" "${staging_root}/${archive_path}"
}

stage_git_selection() {
    local repository=$1
    local archive_prefix=$2
    shift 2
    local relative_path
    while IFS= read -r -d '' relative_path; do
        stage_file "${repository}/${relative_path}" "${archive_prefix}/${relative_path}"
    done < <(git -C "${repository}" ls-files -z --cached --others --exclude-standard -- "$@")
}

explicit_source() {
    local archive_path=$1
    case ${archive_path} in
        games/*)
            case ${archive_path} in
                games/backend/*)
                    explicit_repository=${backend_root}
                    explicit_relative_path=${archive_path#games/backend/}
                    ;;
                games/platform/*)
                    explicit_repository=${platform_root}
                    explicit_relative_path=${archive_path#games/platform/}
                    ;;
                *)
                    explicit_repository=${product_root}
                    explicit_relative_path=${archive_path#games/}
                    ;;
            esac
            ;;
        *)
            fail "explicit path must begin with games/: ${archive_path}"
            ;;
    esac
}

validate_explicit_file() {
    local archive_path=$1
    [[ -n ${archive_path} ]] || fail 'explicit archive path must not be empty'
    [[ ${archive_path} != /* ]] || fail "explicit path must be relative: ${archive_path}"
    case "/${archive_path}/" in
        */../*) fail "explicit path must not contain '..': ${archive_path}" ;;
    esac
    explicit_source "${archive_path}"
    [[ -n ${explicit_relative_path} ]] \
        || fail "explicit path must identify a file: ${archive_path}"
    [[ -d ${explicit_repository} ]] \
        || fail "repository does not exist for explicit path: ${archive_path}"
    local source_file="${explicit_repository}/${explicit_relative_path}"
    [[ -e ${source_file} || -L ${source_file} ]] \
        || fail "explicit file does not exist: ${archive_path}"
    [[ ! -L ${source_file} ]] || fail "explicit file must not be a symbolic link: ${archive_path}"
    [[ -f ${source_file} ]] || fail "explicit path must be a regular file: ${archive_path}"
    is_excluded "${archive_path}" && fail "explicit file is excluded: ${archive_path}"
    is_sensitive_path "${archive_path}" && fail "sensitive explicit path selected: ${archive_path}"
    git -C "${explicit_repository}" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
        || fail "explicit file is not inside a Git repository: ${archive_path}"
    git -C "${explicit_repository}" ls-files --error-unmatch -- "${explicit_relative_path}" \
        >/dev/null 2>&1 \
        || fail "explicit file is not added to the Git index; run git add -- ${explicit_relative_path}"
    contains_secret "${source_file}" && fail "possible secret found in: ${archive_path}"
    return 0
}

git -C "${product_root}" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || fail "Games project is not a Git repository: ${product_root}"

for explicit_archive_path in "${explicit_archive_paths[@]}"; do
    validate_explicit_file "${explicit_archive_path}"
    [[ -z ${explicit_archive_path_set["${explicit_archive_path}"]+x} ]] \
        || fail "explicit file was declared more than once: ${explicit_archive_path}"
    explicit_archive_path_set["${explicit_archive_path}"]=1
done

stage_git_selection "${product_root}" 'games' '.'
stage_git_selection "${backend_root}" 'games/backend' '.'
stage_git_selection "${platform_root}" 'games/platform' \
    'AGENTS.md' 'pom.xml' 'mvnw' 'mvnw.cmd' '.mvn' 'platform' \
    'docs/projects/games'

file_count=$(find -P "${staging_root}" -type f -printf . | wc -c)
(( file_count > 0 )) || fail 'no source files selected'
(cd "${staging_root}" && zip -q -r "${candidate_archive}" .)
unzip -tq "${candidate_archive}" >/dev/null || fail 'unzip validation failed'
for explicit_archive_path in "${explicit_archive_paths[@]}"; do
    occurrence_count=$(unzip -Z1 "${candidate_archive}" \
        | awk -v target="${explicit_archive_path}" '$0 == target { count += 1 } END { print count + 0 }')
    [[ ${occurrence_count} -eq 1 ]] \
        || fail "explicit file must appear exactly once in ZIP (${occurrence_count}): ${explicit_archive_path}"
done
mkdir -p -- "$(dirname -- "${output_path}")"
mv -- "${candidate_archive}" "${output_path}"

archive_size=$(stat -c '%s' "${output_path}")
archive_sha256=$(sha256sum "${output_path}" | awk '{print $1}')
printf 'ZIP: %s\nFiles: %s\nSize: %s bytes\nSHA-256: %s\nunzip -t: OK\n' \
    "${output_path}" "${file_count}" "${archive_size}" "${archive_sha256}"
