#!/usr/bin/env bash
# Run only inside a new, dedicated Mossvale CI guest, never on Proxmox/game hosts.
set -euo pipefail
set +x
umask 077

runner_user=mossvale-runner
runner_home=/home/mossvale-runner
runner_dir=/opt/mossvale-runner
runner_work=/var/lib/mossvale-runner/work
runner_version=2.337.0
runner_sha256=70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613
repository=https://github.com/trappyon/mossvale

die() { printf '%s\n' "$*" >&2; exit 1; }
usage() {
  printf '%s\n' 'Usage: setup.sh --check | --install | --register' \
    '  --check     Read-only Ubuntu/KVM/hostname checks.' \
    '  --install   Install dependencies and prepare one runner in a fresh guest.' \
    '  --register Read a short-lived repository registration token from stdin; start service.'
}

[[ $# == 1 ]] || { usage; exit 1; }
case "$1" in --check|--install|--register) ;; *) usage; exit 1 ;; esac
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || die 'Requires an x86_64 Linux guest.'
[[ -r /etc/os-release ]] || die 'Missing guest OS identity.'
# shellcheck disable=SC1091
. /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || die 'Requires Ubuntu 24.04.'
[[ $(systemd-detect-virt --vm) == kvm ]] || die 'Refusing a non-KVM system.'
[[ ! -e /etc/pve && ! -x /usr/sbin/qm ]] || die 'Refusing a Proxmox host.'
guest_name=$(hostname -s)
case "$guest_name" in mossvale-ci-1|mossvale-ci-2) ;; *) die 'Requires hostname mossvale-ci-1 or mossvale-ci-2.' ;; esac
if [[ $1 == --check ]]; then
  printf 'Guest checks passed: %s, Ubuntu 24.04, x86_64, KVM. No changes made.\n' "$guest_name"
  exit 0
fi
[[ $EUID == 0 ]] || die 'Run installation/registration as root inside the guest.'

if [[ $1 == --install ]]; then
  [[ ! -e $runner_dir && ! -e /var/lib/mossvale-runner ]] || die 'Runner files already exist; inspect the guest instead of overwriting them.'
  ! id "$runner_user" >/dev/null 2>&1 || die 'Runner account already exists; refusing to repurpose it.'
  [[ ! -d /var/lib/docker && ! -d /var/lib/containerd ]] || die 'Docker/containerd data already exists; use a fresh guest.'
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends ca-certificates curl git jq unzip xz-utils \
    python3 build-essential openssh-client rsync sudo qemu-guest-agent
  install -d -m 0755 /etc/apt/keyrings
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod 0644 /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/docker.sources <<'DOCKER_APT'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
DOCKER_APT
  chmod 0644 /etc/apt/sources.list.d/docker.sources
  apt-get update
  apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
  install -d -m 0755 /etc/docker
  [[ ! -e /etc/docker/daemon.json ]] || die 'Docker daemon configuration already exists; refusing to replace it.'
  printf '%s\n' '{"log-driver":"local","log-opts":{"max-size":"10m","max-file":"3"}}' > /etc/docker/daemon.json
  chmod 0644 /etc/docker/daemon.json
  systemctl enable docker
  systemctl restart docker
  systemctl start qemu-guest-agent
  useradd --create-home --home-dir "$runner_home" --shell /bin/bash "$runner_user"
  usermod -aG docker "$runner_user"
  chmod 0700 "$runner_home"
  install -d -m 0755 /var/lib/mossvale-runner
  install -d -m 0700 -o "$runner_user" -g "$runner_user" "$runner_dir" "$runner_work"
  archive=$(mktemp /var/tmp/mossvale-runner.XXXXXX.tar.gz)
  trap 'rm -f -- "$archive"' EXIT
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    "https://github.com/actions/runner/releases/download/v${runner_version}/actions-runner-linux-x64-${runner_version}.tar.gz" -o "$archive"
  printf '%s  %s\n' "$runner_sha256" "$archive" | sha256sum --check --status
  tar -xzf "$archive" -C "$runner_dir" --no-same-owner
  "$runner_dir/bin/installdependencies.sh"
  chown -R "$runner_user:$runner_user" "$runner_dir"

  # This guest runs only one job at a time. Clean abandoned job resources too.
  install -d -m 0755 /usr/local/lib/mossvale-runner
  cat > /usr/local/lib/mossvale-runner/cleanup.sh <<'CLEANUP'
#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 && $# == 0 ]] || exit 1
case "$(hostname -s)" in mossvale-ci-1|mossvale-ci-2) ;; *) exit 1 ;; esac
[[ $(systemd-detect-virt --vm) == kvm && ! -e /etc/pve ]] || exit 1
work=/var/lib/mossvale-runner/work
[[ -d $work && ! -L $work && $(realpath "$work") == "$work" ]] || exit 1
workspace=$work/mossvale/mossvale
for directory in "$work/mossvale" "$workspace"; do
  [[ -d $directory && ! -L $directory && $(realpath "$directory") == "$directory" ]] || exit 1
done
# GitHub creates the workspace before JOB_STARTED, including jobs without a
# checkout. Preserve its directory/inode so the next step can use it as cwd.
# Keep runner-managed _tool, _actions and _temp metadata outside this path.
find "$workspace" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
rm -rf -- /home/mossvale-runner/.docker /home/mossvale-runner/.ssh
if [[ -d $work/_temp && ! -L $work/_temp ]]; then
  find "$work/_temp" -maxdepth 1 -type f \
    \( -name 'mossvale-*-deploy-key' -o -name 'mossvale-*-known-hosts' \) -delete
fi
# Fix the daemon address: a job's Docker context cannot redirect this cleanup.
export DOCKER_HOST=unix:///var/run/docker.sock
unset DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
docker container ls -aq | xargs -r docker container rm -f >/dev/null
docker volume prune --all --force >/dev/null
docker network prune --force >/dev/null
docker builder prune --all --force --keep-storage 8GB >/dev/null
docker image prune --all --force >/dev/null
CLEANUP
  cat > /usr/local/lib/mossvale-runner/job-hook.sh <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
# timeout covers the privileged child; no checkout files are executed as root.
exec timeout --kill-after=10s 120s sudo -n /usr/local/lib/mossvale-runner/cleanup.sh
HOOK
  chmod 0755 /usr/local/lib/mossvale-runner/{cleanup,job-hook}.sh
  printf '%s\n' 'mossvale-runner ALL=(root) NOPASSWD: /usr/local/lib/mossvale-runner/cleanup.sh ""' > /etc/sudoers.d/mossvale-runner-cleanup
  chmod 0440 /etc/sudoers.d/mossvale-runner-cleanup
  visudo -cf /etc/sudoers.d/mossvale-runner-cleanup
  cat > "$runner_dir/.env" <<'RUNNER_ENV'
ACTIONS_RUNNER_HOOK_JOB_STARTED=/usr/local/lib/mossvale-runner/job-hook.sh
ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/usr/local/lib/mossvale-runner/job-hook.sh
RUNNER_ENV
  chown "$runner_user:$runner_user" "$runner_dir/.env"
  chmod 0600 "$runner_dir/.env"
  runuser -u "$runner_user" -- docker info --format '{{.ServerVersion}}'
  printf 'Guest prepared: %s. Supply a fresh repository registration token to --register next.\n' "$guest_name"
  exit 0
fi

[[ -x $runner_dir/config.sh && -f $runner_dir/.env ]] || die 'Run --install first.'
[[ ! -e $runner_dir/.runner ]] || die 'This guest is already registered; refusing duplicate registration.'
printf 'Repository runner registration token (stdin; not echoed): ' >&2
IFS= read -r -s registration_token || [[ -n ${registration_token:-} ]]
printf '\n' >&2
[[ -n ${registration_token:-} && $registration_token != *[[:space:]]* ]] || die 'Missing or invalid registration token.'
case "$registration_token" in gh?_*|github_pat_*) die 'Supply a runner registration token, not a personal/access token.' ;; esac
export ACTIONS_RUNNER_INPUT_TOKEN=$registration_token
unset registration_token
trap 'unset ACTIONS_RUNNER_INPUT_TOKEN' EXIT
cd "$runner_dir"
# The official runner reads and masks this environment input. Never use a PAT,
# put the token in argv, or write it to .env/cloud-init.
runuser -u "$runner_user" -- ./config.sh --unattended --url "$repository" \
  --name "$guest_name" --labels mossvale-ci --work "$runner_work"
unset ACTIONS_RUNNER_INPUT_TOKEN
./svc.sh install "$runner_user"
./svc.sh start
./svc.sh status
printf 'Registered %s for %s; one job at a time, automatic runner updates enabled.\n' "$guest_name" "$repository"
