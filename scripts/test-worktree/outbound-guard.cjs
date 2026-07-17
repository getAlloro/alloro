"use strict";

const dns = require("node:dns");
const dnsPromises = require("node:dns/promises");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const pino = require("pino");

const WORKTREE_TEST_MODE_ENV = "ALLORO_WORKTREE_TEST_MODE";
const GUARD_MARKER = Symbol.for("alloro.worktreeOutboundGuard");
const MAX_REDIRECTS = 20;
const REDACTED_DESTINATION = "[redacted-host]";
const logger = pino(
  {
    name: "alloro-worktree-outbound-guard",
    level: "error",
    base: null,
  },
  pino.destination({ dest: 2, sync: true }),
);

if (process.env[WORKTREE_TEST_MODE_ENV] !== "true") {
  throw new Error(
    `${WORKTREE_TEST_MODE_ENV}=true is required before loading the outbound guard.`,
  );
}

function normalizeHostname(value) {
  if (typeof value !== "string") return "";
  let hostname = value.trim().toLowerCase();
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }
  return hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
}

function hostnameFromHost(value) {
  const host = normalizeHostname(value);
  if (!host) return "";
  if (net.isIP(host)) return host;
  if (host.startsWith("[")) {
    const closingBracket = host.indexOf("]");
    return closingBracket > 0 ? host.slice(1, closingBracket) : "";
  }
  const colonCount = (host.match(/:/g) || []).length;
  return colonCount === 1 ? host.slice(0, host.lastIndexOf(":")) : host;
}

function isLoopbackIpv4(hostname) {
  if (net.isIP(hostname) !== 4) return false;
  return Number(hostname.split(".", 1)[0]) === 127;
}

function isLoopbackIpv6(hostname) {
  if (net.isIP(hostname) !== 6) return false;
  return hostname === "::1" || hostname.startsWith("::ffff:127.");
}

function isAllowedHostname(value) {
  const hostname = normalizeHostname(value);
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || isLoopbackIpv4(hostname)
    || isLoopbackIpv6(hostname);
}

function safeDestination(value) {
  const hostname = normalizeHostname(value);
  if (!hostname || hostname.length > 253 || !/^[a-z0-9._:-]+$/.test(hostname)) {
    return REDACTED_DESTINATION;
  }
  return hostname;
}

function blockedError(operation, protocol, hostname) {
  const destination = safeDestination(hostname);
  logger.error(
    { operation, protocol, destination },
    "Blocked non-local outbound request in worktree test mode.",
  );
  const error = new Error(
    `Worktree outbound guard blocked ${protocol} access to ${destination}.`,
  );
  error.code = "ALLORO_WORKTREE_OUTBOUND_BLOCKED";
  return error;
}

function assertAllowedHostname(hostname, operation, protocol) {
  if (!isAllowedHostname(hostname)) {
    throw blockedError(operation, protocol, hostname);
  }
}

function requestOptionsFromArgs(args) {
  if (args[0] && typeof args[0] === "object" && !(args[0] instanceof URL)) {
    return args[0];
  }
  if (args[1] && typeof args[1] === "object" && !(args[1] instanceof URL)) {
    return args[1];
  }
  return null;
}

function hostnameFromRequestArgs(args, protocol) {
  const options = requestOptionsFromArgs(args);
  if (typeof options?.hostname === "string") {
    return hostnameFromHost(options.hostname);
  }
  if (typeof options?.host === "string") {
    return hostnameFromHost(options.host);
  }

  const input = args[0];
  if (input instanceof URL) return normalizeHostname(input.hostname);
  if (typeof input === "string") {
    try {
      return normalizeHostname(new URL(input).hostname);
    } catch {
      if (!input.includes("://")) return hostnameFromHost(input);
      throw blockedError("request", protocol, "");
    }
  }
  return "localhost";
}

function patchRequestModule(module, protocol) {
  const originalRequest = module.request;
  const originalGet = module.get;

  module.request = function guardedRequest(...args) {
    const hostname = hostnameFromRequestArgs(args, protocol);
    assertAllowedHostname(hostname, "request", protocol);
    return Reflect.apply(originalRequest, this, args);
  };
  module.get = function guardedGet(...args) {
    const hostname = hostnameFromRequestArgs(args, protocol);
    assertAllowedHostname(hostname, "get", protocol);
    return Reflect.apply(originalGet, this, args);
  };
}

function hostnameFromFetchInput(input) {
  if (input instanceof URL) return normalizeHostname(input.hostname);
  if (typeof Request !== "undefined" && input instanceof Request) {
    return normalizeHostname(new URL(input.url).hostname);
  }
  if (typeof input === "string") {
    try {
      return normalizeHostname(new URL(input).hostname);
    } catch {
      throw blockedError("fetch", "fetch", "");
    }
  }
  throw blockedError("fetch", "fetch", "");
}

function urlFromFetchInput(input) {
  if (input instanceof URL) return input;
  if (typeof Request !== "undefined" && input instanceof Request) {
    return new URL(input.url);
  }
  if (typeof input === "string") return new URL(input);
  throw blockedError("fetch", "fetch", "");
}

function redirectMethod(status, method) {
  if (status === 303 && method !== "HEAD") return "GET";
  if ((status === 301 || status === 302) && method === "POST") return "GET";
  return method;
}

function isRedirectStatus(status) {
  return status === 301
    || status === 302
    || status === 303
    || status === 307
    || status === 308;
}

function patchFetch() {
  if (typeof globalThis.fetch !== "function") return;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async function guardedFetch(input, init) {
    const redirectMode = init?.redirect
      ?? (typeof Request !== "undefined" && input instanceof Request
        ? input.redirect
        : "follow");
    let currentInput = input;
    let currentInit = { ...init, redirect: redirectMode === "follow" ? "manual" : redirectMode };
    let currentMethod = String(
      currentInit.method
      ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET"),
    ).toUpperCase();

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const hostname = hostnameFromFetchInput(currentInput);
      assertAllowedHostname(hostname, "fetch", "fetch");
      const response = await Reflect.apply(originalFetch, this, [currentInput, currentInit]);
      if (redirectMode !== "follow" || !isRedirectStatus(response.status)) {
        return response;
      }

      const location = response.headers.get("location");
      if (!location) return response;
      if (redirectCount === MAX_REDIRECTS) {
        throw new Error(`Worktree fetch exceeded ${MAX_REDIRECTS} redirects.`);
      }

      const nextUrl = new URL(location, urlFromFetchInput(currentInput));
      assertAllowedHostname(nextUrl.hostname, "fetch-redirect", "fetch");
      const nextMethod = redirectMethod(response.status, currentMethod);
      if (
        nextMethod === currentMethod
        && currentMethod !== "GET"
        && currentMethod !== "HEAD"
      ) {
        throw new Error("Worktree fetch does not replay request bodies across redirects.");
      }
      currentMethod = nextMethod;
      currentInput = nextUrl;
      currentInit = {
        ...currentInit,
        method: currentMethod,
        body: currentMethod === "GET" || currentMethod === "HEAD" ? undefined : currentInit.body,
        redirect: "manual",
      };
    }

    throw new Error(`Worktree fetch exceeded ${MAX_REDIRECTS} redirects.`);
  };
}

const DNS_METHODS = [
  "lookup",
  "resolve",
  "resolve4",
  "resolve6",
  "resolveAny",
  "resolveCaa",
  "resolveCname",
  "resolveMx",
  "resolveNaptr",
  "resolveNs",
  "resolvePtr",
  "resolveSoa",
  "resolveSrv",
  "resolveTxt",
  "reverse",
  "lookupService",
];

function patchDnsTarget(target, isPromiseApi) {
  for (const methodName of DNS_METHODS) {
    const original = target[methodName];
    if (typeof original !== "function") continue;
    target[methodName] = function guardedDnsCall(...args) {
      try {
        assertAllowedHostname(String(args[0] ?? ""), methodName, "dns");
        return Reflect.apply(original, this, args);
      } catch (error) {
        if (isPromiseApi) return Promise.reject(error);
        throw error;
      }
    };
  }
}

function installGuard() {
  if (globalThis[GUARD_MARKER]) return;
  patchRequestModule(http, "http");
  patchRequestModule(https, "https");
  patchFetch();
  patchDnsTarget(dns, false);
  patchDnsTarget(dnsPromises, true);
  if (dns.Resolver?.prototype) patchDnsTarget(dns.Resolver.prototype, false);
  if (dnsPromises.Resolver?.prototype) {
    patchDnsTarget(dnsPromises.Resolver.prototype, true);
  }
  globalThis[GUARD_MARKER] = true;
}

installGuard();

module.exports = {
  isAllowedHostname,
};
