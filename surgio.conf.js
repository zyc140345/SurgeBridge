'use strict';

require('dotenv').config();

const {
  categories,
  combineExtendFunctions,
  createExtendFunction,
  defineSurgioConfig,
} = require('surgio');

const DIST_DIR = 'dist';
const DEFAULT_PUBLIC_URL = process.env.SURGIO_PUBLIC_URL || 'http://localhost:3000/get-artifact/';
const DEFAULT_SOCKS_BASE_PORT = Number.parseInt(
  process.env.SINGBOX_SOCKS_BASE_PORT || '41000',
  10,
);
const DEFAULT_DNS_STRATEGY = process.env.SINGBOX_DNS_STRATEGY || undefined;
const DEFAULT_DNS_PRIMARY = process.env.SINGBOX_DNS_PRIMARY || 'dns.alidns.com';
const DEFAULT_DNS_PRIMARY_SERVER_NAME =
  process.env.SINGBOX_DNS_PRIMARY_SERVER_NAME || 'dns.alidns.com';
const DEFAULT_DNS_SECONDARY = process.env.SINGBOX_DNS_SECONDARY || 'doh.pub';
const DEFAULT_DNS_SECONDARY_SERVER_NAME =
  process.env.SINGBOX_DNS_SECONDARY_SERVER_NAME || 'doh.pub';
const DEFAULT_DNS_BOOTSTRAP_PRIMARY =
  process.env.SINGBOX_DNS_BOOTSTRAP_PRIMARY || '223.5.5.5';
const DEFAULT_DNS_BOOTSTRAP_SECONDARY =
  process.env.SINGBOX_DNS_BOOTSTRAP_SECONDARY || '119.29.29.29';
const GATEWAY_AUTH_ENABLED = process.env.SURGIO_GATEWAY_AUTH === 'true';
const GATEWAY_ACCESS_TOKEN = process.env.SURGIO_ACCESS_TOKEN;
const GATEWAY_VIEWER_TOKEN = process.env.SURGIO_VIEWER_TOKEN || undefined;

if (!Number.isInteger(DEFAULT_SOCKS_BASE_PORT) || DEFAULT_SOCKS_BASE_PORT <= 0) {
  throw new Error('SINGBOX_SOCKS_BASE_PORT must be a positive integer.');
}

if (!DEFAULT_DNS_PRIMARY || !DEFAULT_DNS_PRIMARY_SERVER_NAME) {
  throw new Error('SINGBOX_DNS_PRIMARY and SINGBOX_DNS_PRIMARY_SERVER_NAME are required.');
}

if (!DEFAULT_DNS_SECONDARY || !DEFAULT_DNS_SECONDARY_SERVER_NAME) {
  throw new Error('SINGBOX_DNS_SECONDARY and SINGBOX_DNS_SECONDARY_SERVER_NAME are required.');
}

if (!DEFAULT_DNS_BOOTSTRAP_PRIMARY || !DEFAULT_DNS_BOOTSTRAP_SECONDARY) {
  throw new Error(
    'SINGBOX_DNS_BOOTSTRAP_PRIMARY and SINGBOX_DNS_BOOTSTRAP_SECONDARY are required.',
  );
}

if (GATEWAY_AUTH_ENABLED && !GATEWAY_ACCESS_TOKEN) {
  throw new Error('SURGIO_ACCESS_TOKEN is required when SURGIO_GATEWAY_AUTH is enabled.');
}

const extendDns = createExtendFunction('dns');
const extendInbounds = createExtendFunction('inbounds');
const extendOutbounds = createExtendFunction('outbounds');
const extendRoute = createExtendFunction('route');

function normalizeUrlBase(url) {
  return url.endsWith('/') ? url : `${url}/`;
}

function getSocksBasePort(customParams = {}) {
  const value = customParams.singboxSocksBasePort ?? DEFAULT_SOCKS_BASE_PORT;
  const port = Number.parseInt(String(value), 10);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('customParams.singboxSocksBasePort must be a positive integer.');
  }

  return port;
}

function buildSingboxInbounds(nodeList, socksBasePort) {
  return nodeList.map((_, index) => ({
    type: 'socks',
    tag: `surge-socks-in-${index + 1}`,
    listen: '127.0.0.1',
    listen_port: socksBasePort + index,
    users: [],
  }));
}

function buildSingboxRouteRules(nodeNames) {
  return nodeNames.map((nodeName, index) => ({
    inbound: [`surge-socks-in-${index + 1}`],
    action: 'route',
    outbound: nodeName,
    udp_disable_domain_unmapping: true,
  }));
}

function buildSingboxDns(customParams = {}) {
  const strategy = customParams.singboxDnsStrategy ?? DEFAULT_DNS_STRATEGY;
  const primaryServer = customParams.singboxDnsPrimary ?? DEFAULT_DNS_PRIMARY;
  const primaryServerName =
    customParams.singboxDnsPrimaryServerName ?? DEFAULT_DNS_PRIMARY_SERVER_NAME;
  const secondaryServer = customParams.singboxDnsSecondary ?? DEFAULT_DNS_SECONDARY;
  const secondaryServerName =
    customParams.singboxDnsSecondaryServerName ?? DEFAULT_DNS_SECONDARY_SERVER_NAME;
  const bootstrapPrimary =
    customParams.singboxDnsBootstrapPrimary ?? DEFAULT_DNS_BOOTSTRAP_PRIMARY;
  const bootstrapSecondary =
    customParams.singboxDnsBootstrapSecondary ?? DEFAULT_DNS_BOOTSTRAP_SECONDARY;

  const primaryDomainResolver = {
    server: 'dns-bootstrap-primary',
  };

  const secondaryDomainResolver = {
    server: 'dns-bootstrap-secondary',
  };

  if (strategy) {
    primaryDomainResolver.strategy = strategy;
    secondaryDomainResolver.strategy = strategy;
  }

  const dnsConfig = {
    servers: [
      {
        type: 'udp',
        tag: 'dns-bootstrap-primary',
        server: bootstrapPrimary,
        server_port: 53,
      },
      {
        type: 'udp',
        tag: 'dns-bootstrap-secondary',
        server: bootstrapSecondary,
        server_port: 53,
      },
      {
        type: 'h3',
        tag: 'dns-remote-primary',
        server: primaryServer,
        server_port: 443,
        path: '/dns-query',
        domain_resolver: primaryDomainResolver,
        tls: {
          enabled: true,
          server_name: primaryServerName,
        },
      },
      {
        type: 'https',
        tag: 'dns-remote-secondary',
        server: secondaryServer,
        server_port: 443,
        path: '/dns-query',
        domain_resolver: secondaryDomainResolver,
        tls: {
          enabled: true,
          server_name: secondaryServerName,
        },
      },
    ],
    final: 'dns-remote-primary',
    independent_cache: true,
    cache_capacity: 4096,
  };

  if (strategy) {
    dnsConfig.strategy = strategy;
  }

  return dnsConfig;
}

function buildDefaultDomainResolver(customParams = {}) {
  const strategy = customParams.singboxDnsStrategy ?? DEFAULT_DNS_STRATEGY;
  const resolver = {
    server: 'dns-remote-primary',
  };

  if (strategy) {
    resolver.strategy = strategy;
  }

  return resolver;
}

const singboxBridgeExtend = combineExtendFunctions(
  extendDns(({ customParams }) => buildSingboxDns(customParams)),
  extendOutbounds(({ getSingboxNodes, nodeList }) => getSingboxNodes(nodeList)),
  extendInbounds(({ customParams, nodeList }) =>
    buildSingboxInbounds(nodeList, getSocksBasePort(customParams)),
  ),
  extendRoute(({ customParams, getSingboxNodeNames, nodeList }) => ({
    auto_detect_interface: true,
    final: 'direct',
    default_domain_resolver: buildDefaultDomainResolver(customParams),
    rules: buildSingboxRouteRules(getSingboxNodeNames(nodeList)),
  })),
);

module.exports = defineSurgioConfig({
  urlBase: normalizeUrlBase(DEFAULT_PUBLIC_URL),
  proxyTestUrl: 'http://cp.cloudflare.com/generate_204',
  proxyTestInterval: 600,
  gateway: {
    auth: GATEWAY_AUTH_ENABLED,
    accessToken: GATEWAY_ACCESS_TOKEN,
    useCacheOnError: false,
    ...(GATEWAY_VIEWER_TOKEN ? { viewerToken: GATEWAY_VIEWER_TOKEN } : {}),
  },
  artifacts: [
    {
      name: 'sing-box-bridge.json',
      template: 'singbox',
      templateType: 'json',
      extendTemplate: singboxBridgeExtend,
      provider: 'airport',
      destDir: DIST_DIR,
      categories: ['sing-box'],
      customParams: {
        singboxSocksBasePort: DEFAULT_SOCKS_BASE_PORT,
        singboxDnsStrategy: DEFAULT_DNS_STRATEGY,
        singboxDnsPrimary: DEFAULT_DNS_PRIMARY,
        singboxDnsPrimaryServerName: DEFAULT_DNS_PRIMARY_SERVER_NAME,
        singboxDnsSecondary: DEFAULT_DNS_SECONDARY,
        singboxDnsSecondaryServerName: DEFAULT_DNS_SECONDARY_SERVER_NAME,
        singboxDnsBootstrapPrimary: DEFAULT_DNS_BOOTSTRAP_PRIMARY,
        singboxDnsBootstrapSecondary: DEFAULT_DNS_BOOTSTRAP_SECONDARY,
      },
    },
    {
      name: 'surge-bridge.conf',
      template: 'surge-bridge',
      provider: 'airport',
      destDir: DIST_DIR,
      categories: [categories.SURGE],
      customParams: {
        singboxSocksBasePort: DEFAULT_SOCKS_BASE_PORT,
      },
    },
  ],
});
