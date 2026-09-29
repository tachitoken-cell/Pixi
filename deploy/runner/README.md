# Mossvale CI guests

`setup.sh` provisions **only a fresh Ubuntu 24.04 x86_64 KVM guest** named
`mossvale-ci-1` or `mossvale-ci-2`. It refuses a Proxmox host, another hostname,
an existing runner installation, or existing Docker/containerd data. It does
not create VMs or change Proxmox, host networking, or game services.

The two runners use dedicated Proxmox VMs **104 and 105 on `stockholm01`**, named
`mossvale-ci-1` and `mossvale-ci-2`. Each has 2 vCPU, 8 GiB RAM and a 40 GiB disk,
with one runner/job at a time. Their disks and Docker daemons are separate from
other VMs. They share the LAN through `vmbr0`; no separate network isolation is
claimed. SSH listeners are disabled, and guest administration uses the QEMU
guest agent.

Keep host directories, Docker sockets, devices and host SSH private keys out
of the guests. Docker privileges grant root inside the guest. These persistent
runners therefore accept only trusted code in the private `trappyon/mossvale`
repository, with forking disabled. They do not reset the operating system
between jobs. Future untrusted workloads would require a separate network and
guest-reset policy before being admitted.

## Prepare and register

Copy the reviewed script into the new guest, then run there:

```sh
bash setup.sh --check
sudo bash setup.sh --install
sudo bash setup.sh --register
```

The final command reads one **short-lived repository runner registration token**
from standard input without echoing it. Obtain it from the repository's
Settings → Actions → Runners → New self-hosted runner, or the registration-token
API. Paste it only at the prompt. For automation, send the token through a pipe
to this same command, with shell tracing disabled; do not place it in command
arguments, a file, cloud-init, Git, or an SSH command string. No personal access
token is accepted or needed by this script. The repository URL is fixed in the
reviewed script. It refuses to replace an already registered runner.

Installation uses Docker's official signed Ubuntu apt repository and GitHub's
official runner **2.337.0**, verifying the Linux x64 archive SHA-256 before
extraction:

```text
70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613
```

The dedicated `mossvale-runner` account has a locked password, a private home and
Docker access inside the guest. GitHub's service runs as that user with the
`self-hosted`, `linux`, `x64`, and `mossvale-ci` labels. Automatic runner updates
remain enabled. `actions/setup-node` installs each workflow's requested Node
version; the guest also contains build tools, Python, Git, jq, curl, OpenSSH,
rsync, Docker Buildx/Compose and the QEMU guest agent. The latter requires the
guest-agent device to be enabled in Proxmox.

## Dedicated runner SSD

**Migration completed, 24 September 2026:** storage ID, volume group and thin
pool `mossvale-ci` have been created on the separately verified 480,103,981,056-byte
SSD `/dev/sdb`, model `VK000480GXNZA`, persistent ID
`ata-VK000480GXNZA_253552B3653E`. Only runner VMs 104 and 105 were moved.
The game remains on `pve`/`local-lvm`, backed by `/dev/sda3`. Both main workload
disks have copied successfully and their mappings have been verified. Both VMs
have healthy guest filesystems, working Docker and active runner services, and
both GitHub runners are online. The tiny cloud-init CD-ROM volumes remain on
`local-lvm`. CI workload and player-experience validation on the new storage
remain separate follow-up checks.

The original VM and storage configurations are backed up in
`/root/mossvale-ci-ssd-20260924T1712Z` (directory mode `700`, files mode `600`).
Verified active disks are `mossvale-ci:vm-104-disk-0` and
`mossvale-ci:vm-105-disk-0`. The original `local-lvm:vm-104-disk-0` and
`local-lvm:vm-105-disk-0` must remain as unused rollback volumes. Keep the saved
configurations and both source volumes until their later removal is approved.

Move one idle runner at a time: stop its runner service, shut down the VM
gracefully, confirm it is stopped, then use `qm disk move <vmid> scsi0 mossvale-ci
--delete 0 --bwlimit 0`. Run the move in its own transient systemd service
with `IOReadBandwidthMax=/dev/sda 20971520`,
`IOWriteBandwidthMax=/dev/sdb 20971520`, `IOWeight=10`, `CPUWeight=10`,
`MemoryHigh=1G` and `MemoryMax=2G`. The physical source reads and destination
writes remain capped at 20 MiB/s. **These physical cgroup limits are mandatory
when using `--bwlimit 0`**: disabling the logical conversion limit lets sparse
zero scans proceed quickly without removing the physical disk protection.
The memory limits bound the copy's page cache. Verify the service's `io.max`,
`memory.high` and `memory.max`, and that its task and `qemu-img` processes belong
to that cgroup. Sparse copying can skip zero writes, but does not promise a copy
time based only on the guest's used space.

After each successful move, verify the active `scsi0` volume and unchanged disk
properties, the retained unused source, no pending disk change, and the backing
physical device. Start that runner VM and check its filesystem, Docker and
GitHub registration before moving the next. Disk rollback requires an idle,
stopped runner VM and reattaching its saved original volume; keep the SSD copy
as well. It returns the runner to the migration-time state and does not change
any game disk or game container.

Separate virtual disks on the same SSD did not prevent reported game lag during
CI. The dedicated SSD separates their storage I/O; CPU, memory and the LAN are
still shared, so verify player experience and game VM pressure during a real run.
Host-wide I/O pressure alone is not evidence of game stalls: it also counts the
copy service waiting on its own limits. Check VM 101's cgroup pressure and
physical disk latency alongside player experience.

## Runner disk I/O limits

On `stockholm01`, keep each runner's `scsi0` at **100 MiB/s and 5,000 IOPS**, total
reads and writes combined, with no bursts. Keep `cpulimit=2` and `cpuunits=100`
unchanged. Verify game VM pressure and normal CI cleanup after changing limits.

Host configuration backups for the adjustment are
`/root/mossvale-ci-io-20260924T184229Z` and
`/root/mossvale-ci-io-105-20260924T184751Z`.

Before changing either VM, back up its configuration with mode `600`. Confirm
the SSD-backed disk definitions below match its verified current configuration,
preserving every existing disk property. During migration, do not use these
commands for a VM that still has its original active disk. Run on the Proxmox host:

```sh
runner_io_backup="/root/mossvale-runner-io-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 "$runner_io_backup"
install -m 600 /etc/pve/qemu-server/104.conf "$runner_io_backup/104.conf"
install -m 600 /etc/pve/qemu-server/105.conf "$runner_io_backup/105.conf"
qm set 104 --scsi0 mossvale-ci:vm-104-disk-0,discard=on,iothread=1,size=40G,ssd=1,mbps=100,iops=5000
qm set 105 --scsi0 mossvale-ci:vm-105-disk-0,discard=on,iothread=1,size=40G,ssd=1,mbps=100,iops=5000
qm config 104 --current 1
qm pending 104
qm config 105 --current 1
qm pending 105
```

`qm set` applies these limits to the running guests without a restart. Verify
the current values and no pending disk change, then use `qm monitor 104` and
`qm monitor 105`. In each monitor, run `qom-get throttle-drive-scsi0 limits`:
the live limits must show `bps-total: 104857600`, `iops-total: 5000` and zero
burst limits. Exit the monitor with Ctrl+C.

To roll back this adjustment, restore the previous 20 MiB/s / 1,000 IOPS limits
while preserving the active SSD volume and all other disk properties, then
repeat the current/pending and live-monitor checks (expect `bps-total: 20971520`
and `iops-total: 1000`). Do not reattach a retained rollback volume merely to
change an I/O limit:

```sh
qm set 104 --scsi0 mossvale-ci:vm-104-disk-0,discard=on,iothread=1,size=40G,ssd=1,mbps=20,iops=1000
qm set 105 --scsi0 mossvale-ci:vm-105-disk-0,discard=on,iothread=1,size=40G,ssd=1,mbps=20,iops=1000
```

## Guest root filesystem discard

Use `nodiscard` on both runner guests' ext4 root filesystems. Proxmox
`discard=on` and the enabled guest
`fstrim.timer` remain in place for periodic trimming. In upstream Linux 6.8,
freed ranges are queued when `discard` is enabled, but the worker drains its
captured list without rechecking that option. Existing work can therefore
continue after remounting with `nodiscard`; see the
[Linux 6.8 ext4 worker](https://github.com/torvalds/linux/blob/v6.8/fs/ext4/mballoc.c#L3524-L3564)
and [queueing path](https://github.com/torvalds/linux/blob/v6.8/fs/ext4/mballoc.c#L3903-L3926).

After changing the mount option, verify pending discards settle and a normal
CI cleanup completes; the remount alone does not establish either result.

Before changing a guest, inspect its live root mount and the single `/` ext4
entry in `/etc/fstab`, save a protected backup, and record the file's owner and
mode. The 24 September backups are
`/root/mossvale-runner-fstab-20260924T184610Z` on VM104 and
`/root/mossvale-runner-fstab-20260924T184804Z` on VM105. Change only the root
entry's comma-delimited `discard` token to `nodiscard`, preserving whitespace,
every other line and option, and the original owner/mode. The resulting entry is:

```text
LABEL=cloudimg-rootfs / ext4 nodiscard,commit=30,errors=remount-ro 0 1
```

Apply and verify inside that runner guest, without restarting it:

```sh
sudo mount -o remount,nodiscard /
findmnt --target / --output SOURCE,FSTYPE,OPTIONS
findmnt --fstab --target / --output SOURCE,FSTYPE,OPTIONS
stat -c '%U:%G %a' /etc/fstab
systemctl is-enabled fstrim.timer
```

The live options must lack the comma-delimited `discard` token; `findmnt` may
omit `nodiscard` because it is the default. The fstab entry must contain explicit
`nodiscard`, with `commit=30,errors=remount-ro` unchanged. Confirm owner/mode
match the recorded values and the timer is still enabled. To roll back, change
only this entry's `nodiscard` token back to `discard`, then run
`sudo mount -o remount,discard /` and repeat the checks. Preserve later unrelated
fstab changes instead of overwriting the whole file from an older backup.

## Cleanup and verification

Root-owned pre/post-job hooks have a two-minute timeout. They empty the fixed
`/var/lib/mossvale-runner/work/mossvale/mossvale` checkout while preserving its
directory and parents, which GitHub prepares before the hook even for jobs
without checkout. Every workspace parent is checked against symlinks. They remove leftover
Docker containers/volumes/networks, guest runner SSH/Docker credentials, and
all unused images; builder cache pruning uses an 8 GB retention target.
They preserve runner-managed underscore
directories, including the tool cache and current job metadata. The narrow
sudo rule permits only that fixed cleanup script without arguments. **Do not
run any other workloads in these guests:** their Docker resources are cleaned
between jobs. Cleanup is housekeeping, not isolation from malicious jobs.

After registration, verify both runners are online in GitHub, then run an actual
workflow and check its runner name, Docker tests and image build. In each guest:

```sh
sudo -u mossvale-runner docker info
sudo -u mossvale-runner docker buildx version
sudo -u mossvale-runner docker run --rm hello-world
sudo systemctl status 'actions.runner.*' --no-pager
df -h /
```

An installation interrupted partway through must be inspected or the fresh
guest recreated; the script deliberately does not erase an existing setup.
Runner registration persists an authentication key in the guest, even though
job tokens expire. Remove the runner in GitHub when retiring or rebuilding it.

Sources: [Docker Ubuntu installation](https://docs.docker.com/engine/install/ubuntu/),
[runner release and checksums](https://github.com/actions/runner/releases/tag/v2.337.0),
[runner service](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application),
[job hooks](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/run-scripts).
