import { NextRequest } from "next/server";
import { sitePath } from "@/lib/site-url";

export function resolveGithubRedirectUri(request: NextRequest): string {
  const fromEnv = process.env.GITHUB_REDIRECT_URI?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const protocol = forwardedProto || request.nextUrl.protocol.replace(":", "") || "http";

  return `${protocol}://${host}${sitePath("/auth/github/callback")}`;
}
