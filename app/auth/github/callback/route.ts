import { NextRequest, NextResponse } from "next/server";

import { setGithubUser, verifyOauthState } from "@/lib/auth";
import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } from "@/lib/constants";
import { resolveGithubRedirectUri } from "@/lib/oauth";

export async function GET(request: NextRequest) {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return new NextResponse("<h2>GitHub OAuth not configured.</h2><a href='/'>Back to ClawCrossHub</a>", {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }

  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return new NextResponse(`<h2>Authorization failed: ${oauthError}</h2><a href='/'>Back to ClawCrossHub</a>`, {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code) {
    return new NextResponse("<h2>Authorization failed: no code provided.</h2><a href='/'>Back to ClawCrossHub</a>", {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }
  if (!verifyOauthState(state)) {
    return new NextResponse("<h2>Authorization failed: invalid oauth state.</h2><a href='/'>Back to ClawCrossHub</a>", {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }

  const redirectUri = resolveGithubRedirectUri(request);
  const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri
    })
  });
  const tokenData = (await tokenResp.json().catch(() => ({}))) as { access_token?: string; [key: string]: unknown };
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return new NextResponse(`<h2>Failed to get access token.</h2><pre>${JSON.stringify(tokenData, null, 2)}</pre><a href='/'>Back</a>`, {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }

  const userResp = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json"
    }
  });
  if (!userResp.ok) {
    return new NextResponse("<h2>Failed to fetch GitHub user profile.</h2><a href='/'>Back</a>", {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }

  const userData = (await userResp.json()) as {
    login?: string;
    name?: string;
    avatar_url?: string;
    id?: number;
    html_url?: string;
  };
  if (!userData.login) {
    return new NextResponse("<h2>Invalid GitHub user response.</h2><a href='/'>Back</a>", {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  setGithubUser(response, {
    login: userData.login ?? "unknown",
    name: userData.name ?? userData.login ?? "GitHub User",
    avatar_url: userData.avatar_url ?? "",
    id: userData.id,
    html_url: userData.html_url ?? ""
  });

  return response;
}
