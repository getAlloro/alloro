import dns from "dns/promises";
import net from "net";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL is invalid");
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("Only http and https URLs are allowed");
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    throw new Error("URL host is invalid");
  }

  const addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error("URL host did not resolve");
  }

  for (const address of addresses) {
    if (isPrivateAddress(address.address)) {
      throw new Error("URL resolves to a private or reserved address");
    }
  }

  return parsed;
}

export function isPrivateAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}
