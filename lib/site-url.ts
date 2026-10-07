/** Deployment paths shared by browser requests and server-generated links. */
export const SITE_BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
export const SITE_ORIGIN = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://clawcross.net").origin;
export const GROUPS_URL = process.env.NEXT_PUBLIC_GROUPS_URL || "https://wecli.net/groups/";

export function sitePath(path: string): string {
  return SITE_BASE_PATH + path;
}

export function siteFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const target = typeof input === "string" && input.startsWith("/") ? sitePath(input) : input;
  return fetch(target, init);
}
