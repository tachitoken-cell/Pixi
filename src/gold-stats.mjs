/** Public aggregates only; neither account identifiers nor individual balances leave this query. */
export async function readGoldStats(pool, at = Date.now()) {
  const db = await pool.connect();
  let failure;
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables = (await db.query("SELECT to_regclass('mossvale_players') IS NOT NULL AND to_regclass('mossvale_gold_events') IS NOT NULL AS ready, to_regclass('mossvale_gold_rounds') IS NOT NULL AS rounds")).rows[0];
    if (!tables.ready) { await db.query('COMMIT'); return { status: 'unavailable' }; }
    const supply = (await db.query(`WITH accounts AS (
      SELECT COALESCE((SELECT SUM((c->>'gold')::numeric) FROM jsonb_array_elements(state->'characters') c),0) AS held,
        COALESCE((SELECT SUM(value::numeric) FROM jsonb_each_text(pending_credits)),0) AS pending,
        COALESCE((SELECT SUM((a->'item'->>'quantity')::numeric) FROM jsonb_array_elements(state->'characters') c,
          jsonb_array_elements(COALESCE(c->'auctions','[]'::jsonb)) a WHERE a->'item'->>'kind'='gold'),0) AS escrow,
        state->>'gmProtected'='true' AS administrative
      FROM mossvale_players)
      SELECT COALESCE(SUM(held),0)::text AS held, COALESCE(SUM(pending),0)::text AS pending,
        COALESCE(SUM(escrow),0)::text AS escrow, COALESCE(SUM(held+pending+escrow),0)::text AS total,
        COALESCE(SUM(held+pending+escrow) FILTER (WHERE administrative),0)::text AS administrative,
        COUNT(*)::integer AS accounts FROM accounts`)).rows[0];
    if (tables.rounds) {
      const merchant = (await db.query(`SELECT COALESCE(SUM((bid.value->>'gold')::numeric),0)::text AS escrow,
        COALESCE(SUM((bid.value->>'gold')::numeric) FILTER (WHERE p.state->>'gmProtected'='true'),0)::text AS administrative
        FROM mossvale_gold_rounds r CROSS JOIN LATERAL jsonb_each(r.state->'bids') bid
        JOIN mossvale_players p ON p.account_key=bid.key WHERE r.state->>'status'='open'`)).rows[0];
      supply.merchantEscrow = merchant.escrow;
      supply.escrow = String(BigInt(supply.escrow) + BigInt(merchant.escrow));
      supply.total = String(BigInt(supply.total) + BigInt(merchant.escrow));
      supply.administrative = String(BigInt(supply.administrative) + BigInt(merchant.administrative));
    }
    const rows = (await db.query(`SELECT w.days, e.reason, COALESCE(SUM(e.created),0)::text AS created,
      COALESCE(SUM(e.burned),0)::text AS burned, COALESCE(SUM(e.transferred),0)::text AS transferred
      FROM (VALUES (1),(7),(30)) AS w(days)
      LEFT JOIN mossvale_gold_events e ON e.at >= $1::bigint-w.days::bigint*86400000 AND e.at <= $1
      GROUP BY w.days,e.reason ORDER BY w.days,e.reason`, [at])).rows;
    const history = (await db.query('SELECT MIN(at)::text AS since FROM mossvale_gold_events')).rows[0];
    await db.query('COMMIT');
    const windows = Object.fromEntries([1, 7, 30].map(days => {
      const reasons = rows.filter(row => row.days === days && row.reason).map(({ days, ...row }) => row);
      const sum = (field, selected) => selected.reduce((total, row) => total + BigInt(row[field]), 0n);
      const ordinary = reasons.filter(row => row.reason !== 'reset' && !row.reason.startsWith('admin:'));
      const created = sum('created', ordinary), burned = sum('burned', ordinary);
      return [String(days), { created: String(created), burned: String(burned), net: String(created - burned),
        sinkRatio: created ? Number(burned * 10000n / created) / 10000 : null,
        administrativeCreated: String(sum('created', reasons.filter(row => row.reason.startsWith('admin:')))),
        resetBurned: String(sum('burned', reasons.filter(row => row.reason === 'reset'))), reasons }];
    }));
    return { status: 'ok', updatedAt: new Date(at).toISOString(), trackingSince: history.since ? new Date(Number(history.since)).toISOString() : null, supply, windows };
  } catch (error) {
    failure = error;
    await db.query('ROLLBACK').catch(() => {});
    return { status: 'unavailable' };
  } finally { db.release(failure); }
}
