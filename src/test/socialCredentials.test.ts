import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCredentials } from "../../server/social/credentials";
import type { SocialEnv } from "../../server/social/env";

const base: SocialEnv = {
  supabaseUrl: "https://example.supabase.co",
  serviceRoleKey: "service-role",
  appOrigin: "",
  shopUrl: "https://shop.example/",
  trackingEnabled: true,
  cronSecret: "",
  batchSize: 2,
  instagramAccessToken: "",
  instagramUserId: "",
  pinterestAccessToken: "",
  pinterestBoardId: "",
  pinterestBoardSectionId: "",
};

function client(stored: unknown): SupabaseClient {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: stored, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("social credentials", () => {
  it("prefers environment tokens", async () => {
    const credentials = await loadCredentials(
      client(null),
      {
        ...base,
        instagramAccessToken: "env-token",
        instagramUserId: "env-user",
      },
      "instagram",
    );
    expect(credentials).toEqual({
      platform: "instagram",
      accessToken: "env-token",
      userId: "env-user",
    });
  });

  it("falls back to the credentials table", async () => {
    const credentials = await loadCredentials(
      client({
        access_token: "db-token",
        account_id: "db-account",
        metadata: { board_id: "db-board" },
      }),
      base,
      "pinterest",
    );
    expect(credentials).toEqual({
      platform: "pinterest",
      accessToken: "db-token",
      boardId: "db-board",
      boardSectionId: null,
    });
  });

  it("returns null when a required value is missing", async () => {
    expect(await loadCredentials(client(null), base, "instagram")).toBeNull();
    expect(await loadCredentials(client(null), base, "pinterest")).toBeNull();
  });
});
