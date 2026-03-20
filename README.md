# SurgeBridge

Use Surgio to pull the latest Clash subscription and either:

- a `sing-box` bridge config that exposes one local SOCKS5 inbound per node
- a `Surge` profile that points every proxy policy at the matching local SOCKS5 port
- a hosted API that generates those configs on request via URL

The goal is to bridge protocols that Surge cannot consume directly, including VLESS and other unsupported node types that `sing-box` can terminate locally.

## Files

- `provider/airport.js`: Clash subscription provider
- `template/singbox.json`: base `sing-box` template
- `template/surge-bridge.tpl`: generated `Surge` profile
- `gateway.js`: Surgio gateway HTTP server
- `surgio.conf.js`: artifact definitions and JSON extenders
- `Dockerfile`: container image for hosted API
- `compose.yml`: Docker Compose stack for the gateway service

## Setup

1. Copy `.env.example` to `.env`.
2. Install dependencies:

```bash
npm install
```

3. Generate configs:

```bash
npm run build
```

Generated files:

- `dist/sing-box-bridge.json`
- `dist/surge-bridge.conf`

## Hosted API

Start locally:

```bash
npm start
```

With auth enabled, request artifacts through:

```text
http://localhost:3000/get-artifact/sing-box-bridge.json?access_token=YOUR_TOKEN
http://localhost:3000/get-artifact/surge-bridge.conf?access_token=YOUR_TOKEN
```

You can also pass the token with an HTTP header:

```text
Authorization: Bearer YOUR_TOKEN
```

These URLs are rendered dynamically on every request through Surgio Gateway, not served from the `dist/` directory.
This project keeps Surgio's cache TTLs at `1ms` by default so requests effectively re-fetch and re-render every time.

Useful query overrides:

```text
http://localhost:3000/get-artifact/surge-bridge.conf?access_token=YOUR_TOKEN&singboxSocksBasePort=42000
http://localhost:3000/get-artifact/sing-box-bridge.json?access_token=YOUR_TOKEN&singboxSocksBasePort=42000
```

## Docker Compose

1. Copy `.env.example` to `.env` and change at least:

- `AIRPORT_SUBSCRIPTION_URL`
- `SURGIO_ACCESS_TOKEN`
- `SURGIO_PUBLIC_URL`

2. Build and start:

```bash
docker compose up -d --build
```

3. Request the generated artifacts:

```text
http://localhost:3000/get-artifact/sing-box-bridge.json?access_token=YOUR_TOKEN
http://localhost:3000/get-artifact/surge-bridge.conf?access_token=YOUR_TOKEN
```

This Compose stack is intentionally single-service. Every request is generated in real time by the gateway process itself.

## Notes

- The generated Surge profile is a minimal standalone profile. If you already have a mature Surge setup, you can either use it directly or merge its `[Proxy]` and `[Proxy Group]` sections into your existing profile later.
- Local SOCKS5 ports start from `SINGBOX_SOCKS_BASE_PORT` and increase by 1 for each node in subscription order.
- This project relies on Surgio's native Clash parsing and native `sing-box` node generation.
- The hosted API uses official `@surgio/gateway` and the standard `/get-artifact/<name>` interface.
- No Redis cache is configured. This keeps deployment simple and matches a single-user, real-time generation workflow.
- Surgio itself has an internal memory cache by default for provider fetches. Its native config only supports `cache.type = default | redis`, not `none`, so this project uses `SURGIO_PROVIDER_CACHE_MAXAGE=1` and `SURGIO_REMOTE_SNIPPET_CACHE_MAXAGE=1` to make caching effectively disappear without patching Surgio internals.
- Do not set those max-age values to `0`. Surgio's memory cache is built on `lru-cache`, and `ttl=0` means "do not track TTL", not "expire immediately".
- `sing-box` uses explicit remote DNS instead of `local` system DNS. The default is AliDNS HTTP/3 (`h3://dns.alidns.com/dns-query`) as primary and Tencent DoH (`https://doh.pub/dns-query`) as secondary.
- Bootstrap resolvers default to `223.5.5.5` for AliDNS and `119.29.29.29` for Tencent DNSPod.
- DNS resolution strategy is left to sing-box defaults unless you explicitly set `SINGBOX_DNS_STRATEGY`.
