#!/usr/bin/env bash
#
# Local dev server with real credentials.
#
# This is the default `npm run dev` on purpose. The `api/` directory holds Vercel serverless
# functions, which the plain Vite server cannot execute — running it alone leaves /api/geo
# unrouted, and city search silently returns nothing. `vercel dev` runs the functions alongside the
# app, so this script is what makes search and road loading work.
#
# `npm run dev:ui` starts Vite alone for pure UI work where the API is not needed.
#
# The Vercel project keeps PRINTIFY_API_KEY and UPSTASH_REDIS_REST_TOKEN on Production only, so
# `vercel dev` (which targets the development environment) starts with neither and every Printify
# call fails closed. This reads them from the local secret files instead.
#
# Values are read at runtime and exported into this process only. Nothing is written to disk, and
# nothing here is a secret.
#
#   npm run dev                 # default port
#   npm run dev -- --listen 3111
#
set -euo pipefail
cd "$(dirname "$0")/.."

# Checked here rather than left to fail inside the function. Overpass permanently bans clients
# that do not identify themselves, so the proxy fails closed by design; without this check the
# visitor just sees an empty dropdown and a 503.
if [ -z "$(printenv GEOCONTACT || true)" ] \
   && ! grep -qs '^GEOCONTACT=..' .env .env.local 2>/dev/null; then
  cat >&2 <<'MSG'
dev-env: GEOCONTACT is not set.

  It is sent as the User-Agent to OpenStreetMap's Nominatim and Overpass, which permanently ban
  clients that do not identify themselves. There is no safe default, so the proxy refuses to
  call them until you provide your own email or URL.

  Add this line to .env (gitignored):

      GEOCONTACT=mailto:you@example.com

MSG
  exit 1
fi

missing=0
for f in redis.txt fourthwall.txt; do
  if [ ! -f "$f" ]; then
    echo "dev-env: missing $f (expected in the project root, and gitignored)" >&2
    missing=1
  fi
done
[ "$missing" -eq 0 ] || exit 1

# redis.txt stores each value wrapped in double quotes, and the URL carries no scheme. Left
# as-is, the quotes and the missing scheme make every request fail to connect.
strip() { sed 's/^["'"'"']//; s/["'"'"']$//'; }
read_secret() { grep -m1 "^$1=" "$2" | cut -d= -f2- | tr -d '\r' | strip; }

redis_url=$(read_secret UPSTASH_REDIS_REST_URL redis.txt)
redis_tok=$(read_secret UPSTASH_REDIS_REST_TOKEN redis.txt)
case "$redis_url" in
  https://*) ;;
  *) redis_url="https://$redis_url" ;;
esac

# Verified against shops.json: this is the "storefront" shop, not shops[0] — the same account also
# has a Shopify-connected shop. Override by exporting PRINTIFY_SHOP_ID before calling this.
export PRINTIFY_SHOP_ID="${PRINTIFY_SHOP_ID:-26401971}"

fw_user=$(read_secret FOURTHWALL_API_USERNAME fourthwall.txt)
fw_pass=$(read_secret FOURTHWALL_API_PASSWORD fourthwall.txt)
fw_domain=$(read_secret FOURTHWALL_SHOP_DOMAIN fourthwall.txt)
export FOURTHWALL_API_USERNAME="$fw_user"
export FOURTHWALL_API_PASSWORD="$fw_pass"
export FOURTHWALL_SHOP_DOMAIN="$fw_domain"

export UPSTASH_REDIS_REST_URL="$redis_url"
export UPSTASH_REDIS_REST_TOKEN="$redis_tok"
export PRINTIFY_API_KEY="$(tr -d '\r\n' < token-printify.txt)"
export PRINTIFY_STORE_DOMAIN="${PRINTIFY_STORE_DOMAIN:-citylines-art}"
export PRINTIFY_CURRENCY="${PRINTIFY_CURRENCY:-USD}"

echo "dev-env: Fourthwall + Upstash loaded (shop ${FOURTHWALL_SHOP_DOMAIN}), starting vercel dev"
exec npx vercel dev "$@"
