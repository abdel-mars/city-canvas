# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private reporting instead — it sends the details only to the maintainers:

> **https://github.com/abdel-mars/city-canvas/security/advisories/new**

You will get an acknowledgement within a few days. If the platform's private reporting is
unavailable to you, open a regular issue that says only *"security report available on request"*
with no technical detail, and a maintainer will arrange a private channel.

## What to include

- What the issue is and what an attacker could achieve
- Steps to reproduce, or a proof of concept
- The affected endpoint, file or route
- Any suggested remediation

## What to expect

- An acknowledgement that the report has been received
- An assessment of severity and whether a fix is warranted
- A fix or mitigation before public disclosure, where practical
- Credit in the fix, if you would like it

## Scope

This project is a small, self-hostable front end. It is **not a hosted service** — if you run
your own instance, you are responsible for its security configuration.

Worth knowing when reporting:

- **Server-side secrets stay server-side.** The Printify API token and Redis credentials are read
  only inside the Vercel functions in `api/`. Nothing prefixed `VITE_` is secret, because Vite
  inlines those into the browser bundle.
- **The geo proxy rate-limits per IP** and reads the address from the *rightmost*
  `X-Forwarded-For` entry, because the leftmost entries are attacker-controlled.
- **Never set `GEOCONTACT` to anything identifying a third party**, and never commit a
  `.env` file. `.env*` is gitignored for this reason.

## Out of scope

- Vulnerabilities in OpenStreetMap, Overpass, Nominatim, Vercel, Upstash or Printify — please
  report those to the relevant project
- Findings that require you to already control the server or hold valid credentials
- Rate-limit bypasses and self-inflicted denial of service
- Missing hardening headers where there is no demonstrated impact
