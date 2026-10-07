import { sitePath, SITE_ORIGIN } from "@/lib/site-url";
import { NextRequest, NextResponse } from "next/server";

import { clearGithubUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL(sitePath("/"), SITE_ORIGIN));
  clearGithubUser(response);
  return response;
}
