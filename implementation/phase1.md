# Phase 1: Creator Gallery MVP — Implementation Plan

## Overview
Transform the existing single-map `/share/:id` view into a **full branded creator gallery** at `/gallery/:username`. Creators get their own public portfolio page where visitors can browse all their published maps and click a custom "Order Print" link configured by the creator. This validates the business model with zero payment infrastructure required.

## What We're Building

### 1. Public Creator Gallery Page — `/gallery/:username`
A stunning, museum-quality portfolio page showing all of a creator's maps in a masonry-style grid. Includes:
- Creator identity header (username, bio, avatar initial)
- Map artwork grid with hover interactions
- **"Order a Print" CTA button** linking to the creator's custom external URL
- Viral **"Create your own on City Lines"** footer badge

### 2. Database Changes
- Add `print_link` (text, nullable) to the `profiles` table — the creator's custom external print URL (Etsy, Redbubble, etc.)
- Add `is_published` (boolean, default `false`) to the `shares` table — so creators control which maps appear on their public gallery
- Add `user_id` (uuid, FK) to `shares` if not already present

### 3. Creator Studio Enhancements (PersonalGallery.tsx)
- Toggle button per artwork: **"Publish / Unpublish"** to gallery
- Profile settings panel: configure their custom **"Print Link"** URL and a short **bio** text
- "View My Public Gallery" link button pointing to their `/gallery/:username`

### 4. Share Flow Update (DownloadShare.tsx / ShareModal.tsx)
- After sharing a map, offer to **"Publish to Gallery"** — one click to make it visible on `/gallery/:username`

---

## Proposed Changes

### DB Migration

#### [NEW] `supabase/migrations/20240102000000_gallery_phase1.sql`
```sql
-- Add print_link and bio to profiles
alter table profiles add column if not exists print_link text;
alter table profiles add column if not exists bio text;

-- Add is_published and user_id to shares
alter table shares add column if not exists is_published boolean not null default false;
alter table shares add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table shares add column if not exists creator_name text;

-- Allow authenticated users to update their own shares
create policy "Owner update shares"
  on shares for update
  using (auth.uid() = user_id);

-- Allow authenticated users to delete their own shares  
create policy "Owner delete shares"
  on shares for delete
  using (auth.uid() = user_id);
```

---

### New Pages

#### [NEW] `src/pages/CreatorGallery.tsx`
Public gallery page at `/gallery/:username`. Fetches the profile by username, then fetches all `is_published = true` shares for that user. Renders:
- Full-width hero with creator name and bio
- Masonry artwork grid with ambient color glow per card
- **"Order a Print"** button (links to `profile.print_link` in new tab) — shown when creator has a print link set
- **"Create your own"** viral badge footer

---

### Modified Files

#### [MODIFY] `src/App.tsx`
Add the new route: `<Route path="/gallery/:username" element={<CreatorGallery />} />`

#### [MODIFY] `src/pages/PersonalGallery.tsx`
- Add **"Publish / Unpublish"** toggle per artwork card (updates `is_published` in Supabase)
- Add **"My Public Gallery"** link button in the header (links to `/gallery/:username`)
- Add a collapsible **Profile Settings** panel to set `print_link` and `bio`

#### [MODIFY] `src/hooks/useAuth.ts`
- Extend `Profile` type to include `print_link` and `bio`

#### [MODIFY] `src/integrations/supabase/types.ts`
- Update generated types to include new DB columns

---

## Verification Plan

### Manual
1. Create a map → Share it → Toggle "Publish to Gallery" in the Studio
2. Set a print link in Profile Settings
3. Navigate to `/gallery/:username` — confirm artwork appears
4. Click "Order a Print" — confirm it opens creator's external link in new tab
5. Click "Create Your Own" footer badge — confirm it goes to home page
6. Confirm unpublished artworks do NOT appear on the public gallery
