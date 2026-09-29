type Pose = { x: number; y: number; z: number; rotation: number; terrainGrounded?: boolean };
type Sample = Pose & { time: number };
export type RemoteMotionPose = Pose & { instanceId?: string | null; mode?: string };

const DELAY_MS = 150;
const MAX_GAP_MS = 1000;
const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function createRemoteMotion() {
  const samples: Sample[] = [];
  const gaps: number[] = [];
  const result = { x: 0, y: 0, z: 0, rotation: 0, moving: false, terrainGrounded: false };
  let offset = 0, receivedAt = 0, instanceId: string | null = null, mode: string | undefined;
  let playback: number | undefined, sampledAt = 0, starved = false, delay = DELAY_MS;
  return {
    push(pose: RemoteMotionPose, time: number, received: number) {
      if (![pose.x, pose.y, pose.z, pose.rotation, time, received].every(Number.isFinite)) return;
      const previous = samples.at(-1);
      if (previous && time <= previous.time) return;
      const nextInstance = pose.instanceId ?? null;
      const reset = !previous || nextInstance !== instanceId || pose.mode !== mode
        || time - previous.time > MAX_GAP_MS || received - receivedAt > MAX_GAP_MS
        || Math.hypot(pose.x - previous.x, pose.y - previous.y, pose.z - previous.z) > 8;
      if (reset) {
        samples.length = 0;
        gaps.length = 0; delay = DELAY_MS;
        offset = time - received;
        playback = undefined; starved = false;
      } else if (starved) {
        // Rebuild the buffer after a late connection runs it dry. Moving the
        // target backwards holds playback briefly; it never rewinds the actor.
        offset = time - received;
        starved = false;
      } else {
        // A faster delivery can reduce accumulated latency. Late packets alone
        // must not keep moving the interpolation clock backwards.
        offset = Math.max(offset, time - received);
      }
      if (!reset) {
        gaps.push(Math.max(time - previous!.time + 50, received - receivedAt + 25));
        if (gaps.length > 12) gaps.shift();
        // Cover slower snapshots and burst delivery without accumulating an
        // unbounded render delay. Healthy 100ms snapshots retain the 150ms buffer.
        delay = Math.max(DELAY_MS, Math.min(350, Math.max(...gaps)));
      }
      samples.push({ x: pose.x, y: pose.y, z: pose.z, rotation: pose.rotation, terrainGrounded: pose.terrainGrounded, time });
      if (samples.length > 12) samples.shift();
      receivedAt = received; instanceId = nextInstance; mode = pose.mode;
    },
    sample(now: number) {
      if (!samples.length) return result;
      const target = now + offset - delay;
      // Keep normal playback at 1x; recover accumulated delay at at most 1.1x.
      // The newest authoritative sample is a hard limit, including during stalls.
      playback = playback === undefined ? target : Math.max(playback,
        Math.min(target, playback + Math.max(0, now - sampledAt) * 1.1));
      starved ||= playback > samples.at(-1)!.time;
      playback = Math.min(playback, samples.at(-1)!.time);
      sampledAt = now;
      const time = playback;
      let left = samples[0], right = left;
      for (let i = 1; i < samples.length; i++) {
        right = samples[i];
        if (right.time > time) break;
        left = right;
      }
      const span = right.time - left.time;
      // Hold the last authoritative pose on a stalled connection; never predict
      // a remote player through walls or keep them running after updates stop.
      const mix = span > 0 ? Math.max(0, Math.min(1, (time - left.time) / span)) : 0;
      result.x = left.x + (right.x - left.x) * mix;
      result.y = left.y + (right.y - left.y) * mix;
      result.z = left.z + (right.z - left.z) * mix;
      result.terrainGrounded = left.terrainGrounded === true && right.terrainGrounded === true;
      result.rotation = left.rotation + angleDelta(left.rotation, right.rotation) * mix;
      result.moving = target >= time && time >= left.time && time < right.time
        && Math.hypot(right.x - left.x, right.z - left.z) > span * .0001;
      return result;
    },
  };
}
