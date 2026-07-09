import { XMLParser, XMLBuilder } from "fast-xml-parser";

/**
 * Plesk XML-RPC client, scoped to managing mail accounts on ONE fixed site
 * (rowanhvac.com). Even though the underlying Plesk secret key is issued to a
 * Plesk *customer* account that may own other domains on this server, this
 * module never accepts a site id as a parameter from anywhere — PLESK_MAIL_SITE_ID
 * is the only site id this code will ever send, read once from the server's
 * own environment. There is no code path, anywhere in the admin UI, that lets
 * a site id be supplied by a request. That is the safety boundary: the
 * credential may be broader than one domain, but this client physically
 * cannot be used to touch any other domain.
 *
 * Endpoint/auth per Plesk docs: POST https://HOST:8443/enterprise/control/agent.php
 * with header `KEY: <secret key>` and `Content-Type: text/xml`.
 * https://docs.plesk.com/en-US/obsidian/api-rpc/about-xml-api.28709/
 */

const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export function pleskConfigured(): boolean {
  return !!(
    process.env.PLESK_API_HOST &&
    process.env.PLESK_API_KEY &&
    process.env.PLESK_MAIL_SITE_ID &&
    process.env.PLESK_MAIL_DOMAIN
  );
}

class PleskError extends Error {}

async function sendPacket(packet: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!pleskConfigured()) {
    throw new PleskError("Plesk mail management isn't configured on this server yet.");
  }
  const host = process.env.PLESK_API_HOST as string; // e.g. https://server-ip:8443
  const url = `${host.replace(/\/$/, "")}/enterprise/control/agent.php`;
  // No version attribute: since Plesk 12, omitting it makes Plesk use its own
  // latest supported protocol version, instead of pinning to one that may be
  // too old for newer operations (this caused a hard failure previously).
  const xmlBody = builder.build({ packet });

  // Plesk's panel certificate for the bare host/IP is often not a match for
  // any of the hosted domains' certs. Only this client, and only when
  // explicitly opted into via PLESK_API_INSECURE_TLS=true, skips verification —
  // nothing else in the app relaxes TLS checking.
  const insecure = process.env.PLESK_API_INSECURE_TLS === "true";
  const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        KEY: process.env.PLESK_API_KEY as string,
      },
      body: xmlBody,
    });
  } finally {
    if (insecure) {
      if (originalReject === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
    }
  }

  if (!res.ok) {
    throw new PleskError(`Plesk API HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const text = await res.text();
  const parsed = parser.parse(text);
  if (!parsed?.packet) throw new PleskError(`Unexpected Plesk response: ${text.slice(0, 300)}`);
  return parsed.packet as Record<string, unknown>;
}

function siteId(): string {
  return process.env.PLESK_MAIL_SITE_ID as string;
}

export function mailDomain(): string {
  return process.env.PLESK_MAIL_DOMAIN || "";
}

/** Throws with Plesk's own error text if a result block reports status "error". */
function assertOk(result: unknown, action: string) {
  const r = result as { status?: string; errtext?: string } | undefined;
  if (r?.status && r.status !== "ok") {
    throw new PleskError(`Plesk ${action} failed: ${r.errtext || "unknown error"}`);
  }
}

export type MailAccount = {
  name: string;
  email: string;
  enabled: boolean;
  forwarding: string[];
};

export async function listMailboxes(): Promise<MailAccount[]> {
  const packet = await sendPacket({
    mail: {
      get_info: {
        filter: { "site-id": siteId() },
        dataset: { limits: {}, prefs: {} },
      },
    },
  });
  const result = (packet.mail as Record<string, unknown> | undefined)?.get_info as
    | { result?: unknown }
    | undefined;
  const raw = result?.result;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

  return list
    .map((r) => r as Record<string, unknown>)
    .filter((r) => r.status === "ok")
    .map((r) => {
      const data = (r.data ?? {}) as Record<string, unknown>;
      const mailbox = (data.mailbox ?? {}) as Record<string, unknown>;
      const fwd = (data.forwarding ?? {}) as Record<string, unknown>;
      const addresses = fwd.address
        ? Array.isArray(fwd.address)
          ? (fwd.address as string[])
          : [String(fwd.address)]
        : [];
      const name = String(r.name ?? "");
      return {
        name,
        email: `${name}@${mailDomain()}`,
        enabled: String(mailbox.status ?? "true") !== "false",
        forwarding: addresses,
      };
    });
}

export async function createMailbox(name: string, password: string): Promise<void> {
  const packet = await sendPacket({
    mail: {
      create: {
        filter: {
          "site-id": siteId(),
          mailname: {
            name,
            mailbox: { enabled: "true" },
            password: { value: password },
          },
        },
      },
    },
  });
  const result = (packet.mail as Record<string, unknown> | undefined)?.create as
    | { result?: unknown }
    | undefined;
  assertOk(result?.result, "create mailbox");
}

export async function deleteMailbox(name: string): Promise<void> {
  const packet = await sendPacket({
    mail: {
      remove: {
        filter: { "site-id": siteId(), mailname: { name } },
      },
    },
  });
  const result = (packet.mail as Record<string, unknown> | undefined)?.remove as
    | { result?: unknown }
    | undefined;
  assertOk(result?.result, "delete mailbox");
}

export async function resetMailboxPassword(name: string, newPassword: string): Promise<void> {
  const packet = await sendPacket({
    mail: {
      update: {
        filter: {
          "site-id": siteId(),
          mailname: { name, password: { value: newPassword } },
        },
      },
    },
  });
  const result = (packet.mail as Record<string, unknown> | undefined)?.update as
    | { result?: unknown }
    | undefined;
  assertOk(result?.result, "reset password");
}

/** Pass an empty array to clear forwarding. */
export async function setMailboxForwarding(name: string, targets: string[]): Promise<void> {
  const packet = await sendPacket({
    mail: {
      update: {
        filter: {
          "site-id": siteId(),
          mailname: {
            name,
            forwarding:
              targets.length > 0
                ? { enabled: "true", address: targets }
                : { enabled: "false" },
          },
        },
      },
    },
  });
  const result = (packet.mail as Record<string, unknown> | undefined)?.update as
    | { result?: unknown }
    | undefined;
  assertOk(result?.result, "set forwarding");
}
