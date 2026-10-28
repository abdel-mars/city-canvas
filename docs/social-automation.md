# Social Studio automation

City Lines can queue one artwork for Instagram and Pinterest, publish it on a fixed weekly
schedule, track Pinterest clicks, and retire old high-resolution originals without deleting the
share or its history.

The only admin account is `elmahmoudiabderrahmane@gmail.com`. The browser UI, the API routes, and
Supabase RLS all enforce that address.

## Schedule

All times are `Africa/Casablanca`. Slots are stored in UTC.

| Platform | Days | Local times | Posts/week |
| --- | --- | --- | --- |
| Instagram | Mon, Wed, Fri | 12:00 | 3 |
| Pinterest | Sun, Mon, Wed, Fri | 09:00, 12:00, 20:00 | 12 |

When an artwork is queued, the next free slot on each platform is chosen automatically. Slots
must be at least 15 minutes in the future. The queue never repeats an artwork automatically and
leaves gaps rather than filling idle slots.

## Admin workflow

1. Generate artwork in the editor.
2. Open **Download & share** and choose **Publish & schedule**.
3. The browser renders a JPEG at 3×, falling back to 2× when the upload would be too large.
4. `/api/social-queue` uploads the master to the `shares` bucket, creates the share, and inserts
   one `social_posts` row per platform.
5. Open `/studio/social` to review the queue, published posts, click totals, and posts that need
   attention. Cancel or retry pending/failed posts from the same screen.

## Architecture

```
Browser ──POST /api/social-queue──► Vercel ──► Supabase shares + social_posts
                                                  │
pg_cron (5 min) ──► /api/social-tick ──► claim_social_posts()
                                          │
                                          ├─ sharp: 1080×1080 / 1080×810 / 1080×1350
                                          ├─ sharp: 1000×1500 Pinterest pin
                                          ├─ Instagram container → poll → publish → permalink
                                          ├─ Pinterest POST /v5/pins
                                          ├─ retry 5 / 15 / 60 / 180 minutes
                                          └─ delete the social variant after success

Pinterest pin ──► /api/social-click?p=<post-id> ──► 302 Fourthwall
Instagram bio ──► /api/social-click?c=instagram-bio ──► 302 Fourthwall

pg_cron (Sunday 03:00 UTC) ──► /api/social-cleanup
                                 ├─ remove leftover social variants
                                 ├─ create 640px share thumbnails after 7 days
                                 └─ delete the original high-resolution file
```

## Implementation phases

| Phase | Commit | What shipped |
| --- | --- | --- |
| 1 | `1e22123` | Social schema, RLS, `is_admin()`, claim RPC, shared schedule/copy primitives, tests |
| 2 | `0199d4e` | Admin-only `/studio/social` shell and route protection |
| 3 | `ef301df` | Admin queue API, JPEG upload, tracked links, click redirect |
| 4 | `605e379` | Queue/published/needs-attention UI, cancel/retry, publish action |
| 5 | `3f2ef83` | Worker claim/retry loop, image variants, credential loading, cron secret check |
| 6 | `9e9d40f` | Instagram publisher: container, polling, publish, permalink, resumable state |
| 7 | `8f0c371` | Pinterest publisher with tracked links and retry-safe pin checkpoints |
| 8 | `4d5e455` | Weekly cleanup: variants, 640px thumbnails, original deletion |
| 9 | docs | This guide plus README operations/configuration notes |

## Environment

Set these on the Vercel project (Production and Preview) and in `.env.local` for local API work.
Never prefix server credentials with `VITE_`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | Project URL used by the API and worker |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only key for queue, worker, and cleanup |
| `APP_ORIGIN` | Yes | Public site origin used for tracked links and CORS |
| `SOCIAL_CRON_SECRET` | Yes | Shared secret for `/api/social-tick` and `/api/social-cleanup` |
| `INSTAGRAM_ACCESS_TOKEN` | Yes | Instagram Login long-lived access token |
| `INSTAGRAM_USER_ID` | Yes | Instagram professional account id |
| `PINTEREST_ACCESS_TOKEN` | Yes | Pinterest API v5 access token |
| `PINTEREST_BOARD_ID` | Yes | Destination board |
| `PINTEREST_BOARD_SECTION_ID` | No | Optional board section |
| `SOCIAL_WORKER_BATCH` | No | Posts claimed per tick, 1–5, default 2 |
| `SOCIAL_SHOP_URL` | No | Override the shop destination |
| `SOCIAL_TRACKING_ENABLED` | No | `false` publishes direct shop links and skips click logging |

Credentials can also be stored in `public.social_credentials`. Environment values win. The worker
reads `account_id` as the Instagram user id, and Pinterest `metadata.board_id` /
`metadata.board_section_id` for the board.

## Supabase setup

1. Apply the migrations:
   - `supabase/migrations/20261027000000_social_studio.sql`
   - `supabase/migrations/20261027000100_social_admin_actions.sql`
2. Confirm the `shares` bucket already exists. The migration creates the public `social-media`
   bucket.
3. Confirm the `social_posts` table is in the `supabase_realtime` publication (the migration adds
   it if missing).
4. Optional: insert credentials instead of using environment variables.

```sql
insert into public.social_credentials (platform, access_token, account_id, metadata)
values
  ('instagram', 'IG_TOKEN', 'IG_USER_ID', '{}'::jsonb),
  ('pinterest', 'PINTEREST_TOKEN', null, '{"board_id":"BOARD_ID"}'::jsonb)
on conflict (platform) do update
set access_token = excluded.access_token,
    account_id = excluded.account_id,
    metadata = excluded.metadata,
    updated_at = now();
```

## Instagram setup

- Use an Instagram professional account.
- Create a Meta app with Instagram Login and request
  `instagram_business_basic` and `instagram_business_content_publish`.
- Generate a long-lived token and copy the Instagram user id.
- The publisher uses `graph.instagram.com/v26.0`, JPEG images, and a public image URL.
- Set the profile bio link to:

```text
https://YOUR_APP_ORIGIN/api/social-click?c=instagram-bio
```

Instagram captions cannot contain clickable links, so the bio link is the only Instagram path to
the shop.

## Pinterest setup

- Create a Pinterest app with the `pins:write` and `boards:read` scopes.
- Generate an access token and copy the destination board id.
- The publisher sends `POST https://api.pinterest.com/v5/pins` with
  `media_source.source_type = "image_url"`, the tracked `link`, title, description, and alt text.

## Cron with pg_cron and pg_net

Enable `pg_cron` and `pg_net` in Supabase, then store the URLs and secret in Vault. Run this in the
SQL editor and replace the placeholder values:

```sql
select vault.create_secret('https://YOUR_APP_ORIGIN/api/social-tick', 'social_tick_url');
select vault.create_secret('https://YOUR_APP_ORIGIN/api/social-cleanup', 'social_cleanup_url');
select vault.create_secret('REPLACE_WITH_SOCIAL_CRON_SECRET', 'social_cron_secret');

select cron.schedule(
  'city-lines-social-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'social_tick_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-social-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'social_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'city-lines-social-cleanup',
  '0 3 * * 0',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'social_cleanup_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-social-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'social_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Both endpoints accept `GET` or `POST`, require `x-social-secret` or
`Authorization: Bearer <SOCIAL_CRON_SECRET>`, and fail closed when the secret is missing. They
return JSON summaries:

```json
{ "claimed": 2, "posted": 1, "retried": 1, "failed": 0, "needs_review": 0 }
```

```json
{ "variants_removed": 3, "shares_purged": 1, "skipped": 12, "errors": 0 }
```

Test them manually after deployment:

```bash
curl -X POST https://YOUR_APP_ORIGIN/api/social-tick \
  -H "x-social-secret: $SOCIAL_CRON_SECRET"
curl -X POST https://YOUR_APP_ORIGIN/api/social-cleanup \
  -H "x-social-secret: $SOCIAL_CRON_SECRET"
```

## Retries and recovery

- Each tick claims due posts with `claim_social_posts(p_limit)`, max 5 at a time.
- A claimed post gets `status = posting` and a 10-minute lock.
- Transient failures return to `pending` after 5, 15, 60, then 180 minutes.
- Authentication, permission, and media-validation failures go to `needs_review`.
- After four attempts, a retryable failure becomes `failed`.
- Instagram stores its container id and media id in `provider_state`, so a retry resumes instead of
  publishing a second post.
- Pinterest stores its pin id after a successful create, so a database write failure does not
  create a duplicate on retry.

## Tracking

- Pinterest links are per-post: `/api/social-click?p=<social_post_id>`.
- Instagram uses the bio campaign: `/api/social-click?c=instagram-bio`.
- Clicks store the post/campaign, platform, and timestamp only. No IP address or user agent.
- The redirect always happens, even if click logging fails.
- `SOCIAL_TRACKING_ENABLED=false` sends direct shop links and disables logging.

## Retention

- Social variants are deleted after a successful publish. The weekly cleanup sweeps leftovers.
- Seven days after the last successful post, a share's original is replaced by a 640px JPEG
  thumbnail.
- Cleanup skips shares with `pending`, `posting`, `failed`, or `needs_review` posts.
- Share rows, `social_posts` rows, and click rows are never deleted.

## Deployment notes

- `/api/social-tick` and `/api/social-cleanup` need 60 seconds and 1024 MB for `sharp`.
- Vercel Hobby is for non-commercial use; this project sells prints.
- Supabase free projects can pause after inactivity, which stops scheduled publishing.
- Instagram long-lived tokens and Pinterest tokens expire; rotate them and update the environment
  or `social_credentials`.
- The worker's public image URL is the `social-media` bucket. Do not make that bucket private
  unless you also change the publishers to upload media directly.
