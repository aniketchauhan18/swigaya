import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { withRetry } from "../retry";
import { SwiggyUnavailableError } from "./types";
import { SWIGGY_BASE, SwiggyAuthError } from "./oauth";

export type SwiggyServer = "food" | "im";

/**
 * Hard allowlist of MCP tools this app may call. Anything that pays, checks
 * out, or places an order (checkout, confirm_order, place_food_order, ...) is
 * deliberately absent, so no code path can place an order even by mistake.
 */
export const ALLOWED_TOOLS: Record<SwiggyServer, ReadonlySet<string>> = {
  food: new Set(["get_addresses", "search_restaurants", "search_menu", "get_restaurant_menu", "update_food_cart", "get_food_cart", "flush_food_cart"]),
  im: new Set(["get_addresses", "search_products", "update_cart", "get_cart", "clear_cart"]),
};

export interface ToolEnvelope {
  success: boolean;
  data?: unknown;
  message?: string;
  error?: { message?: string };
}

export interface McpToolCaller {
  callTool(server: SwiggyServer, name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

function failureDetail(e: unknown): { message: string; status?: number } {
  const err = e as { message?: string; code?: number };
  const status = typeof err.code === "number" ? err.code : undefined;
  const message = `${err.message ?? "unknown error"}${status ? ` (HTTP ${status})` : ""}`;
  return { message, status };
}

/** Thin wrapper over the MCP SDK (Streamable HTTP + bearer token). */
export class SwiggyMcpClient implements McpToolCaller {
  private clients = new Map<SwiggyServer, Client>();
  private connecting = new Map<SwiggyServer, Promise<Client>>();
  private inflight = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly accessToken: string) {}

  /** Swiggy returns 429 when a plan fires every search at once. Keep two in flight. */
  private async acquire(): Promise<void> {
    while (this.inflight >= 2) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.inflight++;
  }

  private release(): void {
    this.inflight--;
    this.waiters.shift()?.();
  }

  private async connect(server: SwiggyServer): Promise<Client> {
    const existing = this.clients.get(server);
    if (existing) return existing;
    const pending = this.connecting.get(server);
    if (pending) return pending;
    const opening = this.open(server);
    this.connecting.set(server, opening);
    try {
      return await opening;
    } finally {
      this.connecting.delete(server);
    }
  }

  private async open(server: SwiggyServer): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(new URL(`${SWIGGY_BASE}/${server}`), {
      requestInit: { headers: { Authorization: `Bearer ${this.accessToken}` } },
    });
    const client = new Client({ name: "swigaya", version: "0.1.0" });
    try {
      await client.connect(transport);
    } catch (e) {
      throw this.wrap(server, "connect", e);
    }
    this.clients.set(server, client);
    return client;
  }

  private wrap(server: SwiggyServer, action: string, e: unknown): Error {
    const { message, status } = failureDetail(e);
    if (status === 401 || /401|unauthori[sz]ed|invalid_token/i.test(message)) {
      return new SwiggyAuthError("Swiggy session expired. Reconnect your account.");
    }
    const where = action === "connect" ? `Could not reach Swiggy ${server} MCP` : `Swiggy tool ${action} failed`;
    return new SwiggyUnavailableError(`${where}: ${message}`, e);
  }

  async callTool(server: SwiggyServer, name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!ALLOWED_TOOLS[server].has(name)) {
      throw new Error(`Tool "${name}" on "${server}" is not permitted by this app`);
    }
    await this.acquire();
    try {
      return await withRetry(
        async () => {
          const client = await this.connect(server);
          let result;
          try {
            result = await client.callTool({ name, arguments: args });
          } catch (e) {
            throw this.wrap(server, name, e);
          }
          const envelope = parseEnvelope(result);
          if (!envelope.success) {
            throw new SwiggyUnavailableError(envelope.error?.message ?? envelope.message ?? `Swiggy tool ${name} returned an error`);
          }
          return envelope.data;
        },
        {
          attempts: 3,
          baseDelayMs: 800,
          maxDelayMs: 4000,
          shouldRetry: (e) => failureDetail(e).status === 429 || (e instanceof SwiggyUnavailableError && /HTTP 429/.test(e.message)),
        },
      );
    } finally {
      this.release();
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled([...this.clients.values()].map((c) => c.close()));
    this.clients.clear();
  }
}

export function parseEnvelope(result: unknown): ToolEnvelope {
  const r = result as { structuredContent?: unknown; content?: Array<{ type: string; text?: string }>; isError?: boolean };
  if (r.structuredContent && typeof r.structuredContent === "object") {
    return normalizeEnvelope(r.structuredContent);
  }
  const text = r.content?.find((c) => c.type === "text")?.text;
  if (text) {
    try {
      return normalizeEnvelope(JSON.parse(text));
    } catch {
      return { success: !r.isError, data: text, message: r.isError ? text : undefined };
    }
  }
  return { success: !r.isError };
}

function normalizeEnvelope(obj: unknown): ToolEnvelope {
  const o = obj as Record<string, unknown>;
  if (typeof o.success === "boolean") return o as unknown as ToolEnvelope;
  return { success: true, data: obj };
}
