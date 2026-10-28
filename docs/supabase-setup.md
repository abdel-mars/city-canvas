# Supabase setup runbook

Working checklist for the City Lines Supabase project: database, auth, storage, Vercel, and social
automation.

## Decisions

- **Project:** restore the existing `City Lines` project, `ximqqlrgcdwhmdzhmbfj`, instead of
  creating a new one. Existing auth users and shares are preserved if present.
- **Organization:** `usbwnlopszleyzfvttge` (`abdel-mars`).
- **Region:** `eu-central-1`.
- **Access:** Supabase CLI login. Never paste an access token, database password, or service key
  into chat or commit it.
- **Secrets:** database password and server keys stay outside git. `.env` is ignored and must not
  be deployed; `.vercelignore` excludes it from CLI deployments.

## Current state

Completed:

- Restored the project with the Management API; it reached `ACTIVE_HEALTHY`.
- Reset the database password; it is in the OS keyring under service `City Lines Supabase`, account
  `db-password` (not in the repository).
- Linked the CLI to `ximqqlrgcdwhmdzhmbfj`; `supabase/.temp/` is ignored by git and Vercel.
- Fixed the broken `20240101000000_create_shares.sql` statement.
- Added `20261028000000_create_shares_bucket.sql` for the public `shares` bucket.
- Applied all seven migrations; local and remote migration history match.
- Created the `shares` and `social-media` public buckets.
- Configured Auth: production Site URL, local/production redirect allowlist, email provider.
- Wrote the restored project URL, publishable key, service role key, and social variables to the
  ignored `.env`.
- Updated Vercel Production and Preview with the Supabase server keys, social variables, and
  cron secret; added `.vercelignore` so `.env` and scratch secrets are not uploaded.
- Redeployed Production to `https://citylines-art.vercel.app`.
- Verified locally and in Production: admin magic-link login reaches `/studio/social`; the studio
  loads with no console or network errors; queue/cleanup endpoints return `200`; unauthenticated
  tick returns `401`; a test artwork was queued, stored, and removed cleanly.
- Enabled `pg_cron` and `pg_net`; stored the worker URLs and cron secret in Vault; scheduled the
  five-minute tick and weekly cleanup; a manual `net.http_post` returned `200` from the production
  worker.
- Confirmed the first scheduled `social-tick` run succeeded in `cron.job_run_details`, with a
  `200` response from the production worker.

Remaining:

- Add real Instagram/Pinterest credentials and run a live publish smoke test.
- Review and commit the working tree.

The restored project had no public schema, so no existing shares or buckets needed migration. The
migrations above created the schema fresh.

## Checklist

### 1. Restore and link the project

- [x] Confirm the project exists and is `INACTIVE`.
- [x] Restore `ximqqlrgcdwhmdzhmbfj` with
      `POST /v1/projects/ximqqlrgcdwhmdzhmbfj/restore`.
- [x] Wait for `ACTIVE_HEALTHY` and DNS resolution.
- [x] Reset the database password with
      `PATCH /v1/projects/ximqqlrgcdwhmdzhmbfj/database/password`.
- [x] Link the CLI:

  ```bash
  npx supabase link --project-ref ximqqlrgcdwhmdzhmbfj --password <DB_PASSWORD>
  ```

- [x] Update `project_id` in `supabase/config.toml`.
- [x] Add `supabase/.temp/` to `.gitignore`.

### 2. Repair and apply migrations

- [x] Fix `20240101000000_create_shares.sql`:
      `alter table shares enable row level security;`.
- [x] Add an idempotent migration for the public `shares` bucket.
- [x] Review migration order:
  - `20240101000000_create_shares.sql`
  - `20240101000300_auth_integration.sql`
  - `20240102000000_gallery_phase1.sql`
  - `20240103000000_watermark.sql`
  - `20261027000000_social_studio.sql`
  - `20261027000100_social_admin_actions.sql`
  - `20261028000000_create_shares_bucket.sql`
- [x] Apply the schema:

  ```bash
  npx supabase db push --linked --password <DB_PASSWORD>
  ```

- [x] Confirm these exist:
  - [x] `public.shares`
  - [x] `public.profiles`
  - [x] `public.social_posts`
  - [x] `public.social_clicks`
  - [x] `public.social_credentials`
  - [x] `public.is_admin()`
  - [x] `public.claim_social_posts(integer)`
  - [x] storage buckets `shares` and `social-media`
  - [x] `social_posts` in the `supabase_realtime` publication

### 3. Configure local env

- [x] Write these values into the ignored `.env`:
  - [x] `VITE_SUPABASE_PROJECT_ID=ximqqlrgcdwhmdzhmbfj`
  - [x] `VITE_SUPABASE_URL=https://ximqqlrgcdwhmdzhmbfj.supabase.co`
  - [x] `VITE_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY>`
  - [x] `SUPABASE_URL=https://ximqqlrgcdwhmdzhmbfj.supabase.co`
  - [x] `SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>`
  - [x] `APP_ORIGIN=http://localhost:3000`
  - [x] `SOCIAL_CRON_SECRET=<RANDOM_SECRET>`
  - [x] `SOCIAL_WORKER_BATCH=2`
  - [x] `SOCIAL_TRACKING_ENABLED=true`
  - [x] `SOCIAL_SHOP_URL=https://citylinesart-shop.fourthwall.com/`
- [x] Confirm `.env` is ignored by git.
- [x] Restart `npm run dev` after changing `.env`.

### 4. Configure Auth

- [x] Enable the Email provider and magic links.
- [x] Set the production Site URL to `https://citylines-art.vercel.app`.
- [x] Add allowed redirect URLs:
  - [x] `http://localhost:3000/auth/callback`
  - [x] `http://127.0.0.1:3000/auth/callback`
  - [x] `http://localhost:8080/auth/callback`
  - [x] `http://127.0.0.1:8080/auth/callback`
  - [x] `https://citylines-art.vercel.app/auth/callback`
- [x] Sign in with `elmahmoudiabderrahmane@gmail.com` via a generated magic link.
- [x] Confirm the admin session reaches `/studio/social`.

### 5. Verify locally

- [x] Open `http://localhost:3000/studio/social` signed out; the admin sign-in gate appears.
- [x] Sign in as admin; the studio loads with empty counters and no console errors.
- [x] Confirm anon REST access to `social_posts` returns no rows.
- [x] Confirm the admin session can read `social_posts`.
- [x] Queue a test JPEG through `/api/social-queue`; both platforms were scheduled.
- [x] Confirm the upload landed in the public `shares` bucket.
- [x] Delete the test share, posts, and storage object.
- [x] Call `/api/social-tick` and `/api/social-cleanup` with the cron secret; both return `200`.
- [x] Confirm `/api/social-tick` without the secret returns `401`.

### 6. Configure Vercel

- [x] Replace `VITE_SUPABASE_PUBLISHABLE_KEY` for Production and Preview.
- [x] Confirm `VITE_SUPABASE_PROJECT_ID` and `VITE_SUPABASE_URL` point at `ximq...`.
- [x] Add `SUPABASE_URL`.
- [x] Add `SUPABASE_SERVICE_ROLE_KEY` as a secret.
- [x] Add `SOCIAL_CRON_SECRET` as a secret.
- [x] Add `SOCIAL_WORKER_BATCH`, `SOCIAL_TRACKING_ENABLED`, and `SOCIAL_SHOP_URL`.
- [x] Confirm `APP_ORIGIN` is `https://citylines-art.vercel.app`.
- [x] Redeploy Production after this change.
- [x] Confirm the deployed `/studio/social` works and `/api/social-tick` is configured.

### 7. Enable scheduled automation

- [x] Enable `pg_cron` and `pg_net`.
- [x] Store `social_tick_url`, `social_cleanup_url`, and `social_cron_secret` in Supabase Vault.
- [x] Schedule the worker every five minutes.
- [x] Schedule cleanup for Sunday at 03:00 UTC.
- [x] Confirm `cron.job_run_details` shows successful runs.

### 8. Add publishing credentials and smoke test

- [ ] Add Instagram access token and user id.
- [ ] Add Pinterest access token, board id, and optional section id.
- [ ] Queue a test artwork.
- [ ] Call `/api/social-tick` manually.
- [ ] Confirm both posts exist and the tracked links redirect to the shop.
- [ ] Call `/api/social-cleanup` manually.

## Done criteria

- [x] `npm run dev` starts with the restored project and no Supabase DNS or auth errors.
- [x] Admin magic-link login reaches `/studio/social`.
- [x] The studio loads without console errors.
- [x] Production Vercel build uses the restored project and server environment.
- [ ] Cron jobs run and the worker can publish with real credentials.
- [ ] Source changes are committed; `.env`, database passwords, and keys are not.
