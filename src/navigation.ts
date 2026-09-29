import { canTraverse, WORLD_BOUNDS, type RealmPoint, type RealmCollider, type RealmBounds } from './realm.ts';

const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
interface Node extends RealmPoint { cost: number; score: number; key: string; parent?: Node }

/** Click-time A* spans the connected realm; every returned segment uses server collision. */
export function findPath(start: RealmPoint, goal: RealmPoint, colliders: readonly RealmCollider[], bounds: RealmBounds = WORLD_BOUNDS,
  traverse?: (from: RealmPoint, to: RealmPoint) => boolean, step = 1.5): RealmPoint[] {
  if (!Number.isFinite(step) || step <= 0) return [];
  const clear = traverse ?? ((a: RealmPoint, b: RealmPoint) => canTraverse(a, b, colliders, bounds));
  if (!clear(start, start) || !Number.isFinite(goal.x) || !Number.isFinite(goal.z)) return [];
  if (clear(start, goal)) return [{ x: goal.x, z: goal.z }];
  const goalFree = clear(goal, goal);
  const key = (x: number, z: number) => `${Math.round(x / step)},${Math.round(z / step)}`;
  const first = { x: Math.round(start.x / step) * step, z: Math.round(start.z / step) * step };
  const candidates = [first, ...directions.map(([dx, dz]) => ({ x: first.x + dx * step, z: first.z + dz * step }))]
    .filter(p => clear(start, p)).sort((a, b) => Math.hypot(a.x - start.x, a.z - start.z) - Math.hypot(b.x - start.x, b.z - start.z));
  if (!candidates.length) return [];
  const queue: Node[] = [], best = new Map<string, number>();
  function push(node: Node) {
    queue.push(node); let i = queue.length - 1;
    while (i > 0) { const parent = (i - 1) >> 1; if (queue[parent].score <= node.score) break; queue[i] = queue[parent]; i = parent; }
    queue[i] = node;
  }
  function pop(): Node {
    const result = queue[0], last = queue.pop()!;
    if (queue.length) {
      let i = 0;
      while (i * 2 + 1 < queue.length) {
        let child = i * 2 + 1;
        if (child + 1 < queue.length && queue[child + 1].score < queue[child].score) child++;
        if (last.score <= queue[child].score) break;
        queue[i] = queue[child]; i = child;
      }
      queue[i] = last;
    }
    return result;
  }
  const seed = candidates[0], seedKey = key(seed.x, seed.z);
  push({ ...seed, key: seedKey, cost: 0, score: Math.hypot(seed.x - goal.x, seed.z - goal.z) }); best.set(seedKey, 0);
  let found: Node | undefined;
  for (let visited = 0; queue.length && visited < 100000; visited++) {
    const node = pop();
    if (node.cost > best.get(node.key)!) continue;
    const distance = Math.hypot(node.x - goal.x, node.z - goal.z);
    if (distance < 2.3 && (clear(node, goal) || !goalFree)) { found = node; break; }
    for (const [dx, dz] of directions) {
      const x = node.x + dx * step, z = node.z + dz * step, nextKey = key(x, z), cost = node.cost + Math.hypot(dx, dz) * step;
      if (cost >= (best.get(nextKey) ?? Infinity)) continue;
      const next = { x, z };
      if (!clear(node, next)) continue;
      best.set(nextKey, cost); push({ ...next, key: nextKey, cost, score: cost + Math.hypot(x - goal.x, z - goal.z), parent: node });
    }
  }
  if (!found) return [];
  const path: RealmPoint[] = [];
  for (let node: Node | undefined = found; node; node = node.parent) path.unshift({ x: node.x, z: node.z });
  if (clear(found, goal)) path.push({ x: goal.x, z: goal.z });
  // Remove grid zigzags while retaining the same continuous collision guarantee.
  const smooth: RealmPoint[] = [path[0]]; let from = path[0];
  for (let i = 1; i < path.length;) {
    let next = i;
    while (next + 1 < path.length && clear(from, path[next + 1])) next++;
    smooth.push(path[next]); from = path[next]; i = next + 1;
  }
  return smooth;
}
