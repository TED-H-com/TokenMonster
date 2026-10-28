import { bench, describe } from "vitest";
import { createD1PublicTotalsReader, type D1BindValue, type D1DatabaseLike, type D1PreparedStatementLike } from "../../src/index.js";
import { SqliteD1Database } from "../sqlite-d1.js";
import { createD1PublicProjectionRebuilder } from "../../src/index.js";

const VALID_ROW = Object.freeze({
  allTimeTokens: "1234567890",
  todayUtcTokens: "345678",
  contributors: "421",
  generatedAt: "2026-07-15T18:23:00Z",
  dataRevision: "2026-07-15T18:23:00Z/184"
});

class FakeStatement implements D1PreparedStatementLike {
  readonly boundValues: D1BindValue[] = [];
  constructor(private readonly row: unknown) {}
  bind(...values: readonly D1BindValue[]): D1PreparedStatementLike {
    this.boundValues.push(...values);
    return this;
  }
  async first<T = unknown>(): Promise<T | null> {
    return this.row as T | null;
  }
}

class FakeDatabase implements D1DatabaseLike {
  readonly preparedQueries: string[] = [];
  readonly statement: FakeStatement;
  constructor(row: unknown) {
    this.statement = new FakeStatement(row);
  }
  prepare(query: string): D1PreparedStatementLike {
    this.preparedQueries.push(query);
    return this.statement;
  }
}

describe("public_totals_cache benchmarking", () => {
  const db = new FakeDatabase(VALID_ROW);
  const readPublicTotals = createD1PublicTotalsReader(db);

  bench("read verified public total snapshot from cache", async () => {
    await readPublicTotals();
  });

  const rebuilderDb = new SqliteD1Database();
  const NOW = "2026-07-15T18:30:00.000Z";

  // Disable FK constraints for seeding benchmark data efficiently, and to avoid complexity
  rebuilderDb.database.exec("PRAGMA foreign_keys = OFF;");

  for(let i = 0; i < 100; i++) {
    const id = `ins_AAAAAAAAAAAAAAAAAAAA${i.toString().padStart(2, '0')}`;

    rebuilderDb.database
      .prepare(
        `INSERT INTO usage_daily_current (
          installation_id, bucket_start, provider, model_family, tool,
          value_quality, revision, input_tokens, output_tokens,
          cache_read_tokens, cache_write_tokens, reasoning_tokens, other_tokens,
          total_tokens, collector_kind, adapter_version, source_version,
          row_hash, quarantine_status, created_at, updated_at, expires_at
        ) VALUES (?, '2026-07-15T00:00:00.000Z', 'openai', 'gpt-5', 'codex-cli',
          'exact', 1, ?, 0, 0, 0, 0, 0, ?, ?, '0.1.0', ?,
          ?, 'accepted', ?, ?, '2026-08-14T00:00:00.000Z')`
      )
      .run(
        id,
        1500,
        1500,
        "tokscale",
        "4.5.2",
        new Uint8Array(32).fill(9),
        NOW,
        NOW
      );
  }

  rebuilderDb.database.exec("PRAGMA foreign_keys = ON;");

  rebuilderDb.database
    .prepare(
      `INSERT INTO anonymous_rollups (
        period_start, period_end, scope, provider, model_family, tool,
        compaction_version, eligible_cohort_count, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, reasoning_tokens, other_tokens,
        total_tokens, created_at
      ) VALUES ('2026-05-01', '2026-06-01', 'all', 'openai', 'gpt-5',
        'codex-cli', 'v1', 20, ?, 0, 0, 0, 0, 0, ?, ?)`
    )
    .run(500, 500, NOW);

  const rebuilder = createD1PublicProjectionRebuilder(rebuilderDb, {
    now: () => new Date(NOW),
    createRevisionId: () => `revision_bench`
  });

  bench("rebuild cache from scratch", async () => {
    await rebuilder();
  });

});
