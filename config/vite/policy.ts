const DEFAULT_PORT = 2222;

export const PREVIEW_ALLOWED_HOSTS = [
  "healthcheck.railway.app",
  "reigh-production.up.railway.app",
  "reigh.art",
  "www.reigh.art",
] as const;

export function resolveVitePort(rawPort: string | undefined): number {
  if (!rawPort) {
    return DEFAULT_PORT;
  }

  const parsedPort = Number.parseInt(rawPort, 10);
  return Number.isFinite(parsedPort) ? parsedPort : DEFAULT_PORT;
}

export function manualVendorChunk(id: string): string | undefined {
  if (!id.includes("node_modules")) {
    return undefined;
  }

  if (
    id.includes("@base-ui-components")
    || id.includes("/react/")
    || id.includes("react-dom")
    || id.includes("react-reconciler")
    || id.includes("scheduler")
  ) {
    return "vendor-react";
  }

  if (id.includes("@tanstack/react-query") || id.includes("@tanstack/query-core")) {
    return "vendor-query";
  }

  if (id.includes("@dnd-kit")) {
    return "vendor-dnd";
  }

  if (id.includes("@supabase")) {
    return "vendor-supabase";
  }

  if (id.includes("date-fns")) {
    return "vendor-date";
  }

  return undefined;
}
