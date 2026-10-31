import { describe, expect, it, vi } from "vitest";

import {
  createTokenTrackerAdapter,
  type TokenTrackerFetch,
  type TokenTrackerFetchResponse
} from "../src/index.js";

function jsonResponse(body: unknown): TokenTrackerFetchResponse {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  }) as unknown as TokenTrackerFetchResponse;
}

function tokenFields(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    total_tokens: 180,
    billable_total_tokens: 180,
    input_tokens: 100,
    output_tokens: 50,
    cached_input_tokens: 20,
    cache_creation_input_tokens: 10,
    reasoning_output_tokens: 0,
    conversation_count: 3,
    ...overrides
  };
}

describe("E2E tests for token tracker adapter workflows", () => {
  it("processes tokenization usage tracking and daily footprint", async () => {
    const fetchImpl = vi.fn<TokenTrackerFetch>(async (endpoint) => {
      const url = new URL(endpoint);
      if (url.pathname.includes("daily")) {
        return jsonResponse({
          from: "2026-06-20",
          to: "2026-07-17",
          scope: "personal",
          excluded_sources: [
            {
              source: "cursor",
              source_scope: "account",
              reason: "account_level_source"
            }
          ],
          data: [
            {
              day: "2026-07-01",
              ...tokenFields(),
              total_cost_usd: 1.23,
              models: { "claude-3-5-sonnet": 180 }
            }
          ]
        });
      }
      if (url.pathname.includes("breakdown")) {
         return jsonResponse({
           from: "2026-07-01",
           to: "2026-07-01",
           days: 0,
           scope: "personal",
           excluded_sources: [
            {
              source: "cursor",
              source_scope: "account",
              reason: "account_level_source"
            }
           ],
           pricing: {
              model: "per-model",
              pricing_mode: "per_token_type",
              source: "litellm",
              effective_from: "2026-07-01"
           },
           sources: [
             {
               source: "claude",
               source_scope: "local",
               totals: { ...tokenFields(), conversation_count: undefined, total_cost_usd: "0.000000" },
               models: [
                 {
                   model: "claude-3-5-sonnet",
                   model_id: "claude-3-5-sonnet",
                   totals: { ...tokenFields(), conversation_count: undefined, total_cost_usd: "0.000000" }
                 }
               ]
             }
           ]
         });
      }
      return jsonResponse({});
    });

    const adapter = createTokenTrackerAdapter({ fetch: fetchImpl });
    const footprint = await adapter.getDailyContentBlindFootprint({
      fromUtcDate: "2026-06-20",
      toUtcDate: "2026-07-17",
      characterId: "claude"
    });

    expect(footprint).toBeDefined();
    expect(footprint.days.length).toBeGreaterThan(0);
    const validDay = footprint.days.find(d => d.localDate === "2026-07-01");
    expect(validDay).toBeDefined();
    expect(validDay?.coverage).toBe("observed");
    expect(validDay?.aggregates.length).toBeGreaterThan(0);
    expect(validDay?.aggregates[0]?.tokens.total).toBe("180");
  });

  it("handles model aggregations for token vocabulary", async () => {
     const fetchImpl = vi.fn<TokenTrackerFetch>(async (endpoint) => {
       return jsonResponse({
           from: "2026-07-01",
           to: "2026-07-02",
           days: 0,
           scope: "all",
           excluded_sources: [],
           pricing: {
              model: "per-model",
              pricing_mode: "per_token_type",
              source: "litellm",
              effective_from: "2026-07-01"
           },
           sources: [
             {
               source: "codex",
               source_scope: "local",
               totals: { ...tokenFields(), conversation_count: undefined, total_cost_usd: "0.000000" },
               models: [
                 {
                   model: "gpt-4o",
                   model_id: "gpt-4o",
                   totals: { ...tokenFields(), conversation_count: undefined, total_cost_usd: "0.000000" }
                 }
               ]
             }
           ]
       });
     });

    const adapter = createTokenTrackerAdapter({ fetch: fetchImpl });
    const usage = await adapter.getModelUsage({
      fromUtcDate: "2026-07-01",
      toUtcDate: "2026-07-02",
      limit: 10
    });

    expect(usage).toBeDefined();
    expect(usage.models).toHaveLength(1);
    expect(usage.models[0]!.model).toBe("gpt-4o");
    expect(usage.models[0]!.totalTokens).toBe(180);
    expect(usage.models[0]!.inputTokens).toBe(100);
    expect(usage.models[0]!.outputTokens).toBe(50);
  });
});
