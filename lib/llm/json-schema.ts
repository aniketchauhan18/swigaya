import { z, type ZodType } from "zod";

type Json = Record<string, unknown>;

// Keywords that Groq's strict constrained decoding does not accept. Zod still
// enforces them when we validate the response, so dropping them here is safe.
const UNSUPPORTED = new Set([
  "$schema",
  "default",
  "format",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "uniqueItems",
  "propertyNames",
]);

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (node && typeof node === "object") {
    const out: Json = {};
    for (const [k, v] of Object.entries(node as Json)) {
      if (UNSUPPORTED.has(k)) continue;
      out[k] = sanitize(v);
    }
    // Strict mode: every property required, no extras.
    if (out.type === "object" && out.properties && typeof out.properties === "object") {
      out.required = Object.keys(out.properties as Json);
      out.additionalProperties = false;
    }
    return out;
  }
  return node;
}

/**
 * Convert a Zod schema to a JSON Schema suitable for Groq `strict: true`.
 * Schemas passed here should avoid `.optional()`; use `.nullable()` instead.
 */
export function toStrictJsonSchema(schema: ZodType): Json {
  const raw = z.toJSONSchema(schema, { target: "draft-7", io: "output", unrepresentable: "any" });
  return sanitize(raw) as Json;
}
