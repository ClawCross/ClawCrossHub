import { NextRequest, NextResponse } from "next/server";

import { clearGithubUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url));
  clearGithubUser(response);
  return response;
}
