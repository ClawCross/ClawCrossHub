import { NextRequest, NextResponse } from "next/server";

import { ensureHubMetaHydrated, listWorkflows } from "@/lib/workflow-store";

/**
 * CLI-friendly workflow listing API.
 *
 * Usage (from external machine):
 *   # JSON output (default):
 *   curl https://<host>/api/cli/workflows
 *
 *   # Plain text table (terminal-friendly):
 *   curl -H 'Accept: text/plain' https://<host>/api/cli/workflows
 *
 *   # Search / filter:
 *   curl 'https://<host>/api/cli/workflows?search=creative'
 *   curl 'https://<host>/api/cli/workflows?category=Engineering'
 *
 *   # Download a workflow ZIP:
 *   curl -L -o workflow.zip https://<host>/api/workflows/<id>/download
 */
export async function GET(request: NextRequest) {
  await ensureHubMetaHydrated();

  const search = request.nextUrl.searchParams.get("search") ?? "";
  const category = request.nextUrl.searchParams.get("category") ?? "";
  const tag = request.nextUrl.searchParams.get("tag") ?? "";

  const { workflows } = listWorkflows({ search, category, tag });

  // Build compact summaries (omit yaml_content and other large fields)
  const items = workflows.map((w) => ({
    id: w.id,
    title: w.title,
    description: w.description,
    author: w.author,
    icon: w.icon,
    category: w.category,
    tags: w.tags,
    stars: w.stars,
    forks: w.forks,
    source: w.source ?? "unknown",
    steps: w.steps ?? 0,
    published_at: w.published_at ?? null,
    download_url: `/api/workflows/${w.id}/download`,
  }));

  const accept = request.headers.get("accept") ?? "";

  // ── Plain text mode (for terminal / curl) ──
  if (accept.includes("text/plain")) {
    const origin = request.nextUrl.origin;
    const lines: string[] = [];

    lines.push("=".repeat(80));
    lines.push("  ClawCrossHub — Workflow Catalog");
    lines.push("=".repeat(80));
    lines.push("");
    lines.push(`  Total: ${items.length} workflow(s)`);
    if (search) lines.push(`  Search: "${search}"`);
    if (category) lines.push(`  Category: ${category}`);
    if (tag) lines.push(`  Tag: ${tag}`);
    lines.push("");
    lines.push("-".repeat(80));

    items.forEach((w, i) => {
      lines.push(`  ${i + 1}. ${w.icon} ${w.title}`);
      lines.push(`     ID:       ${w.id}`);
      lines.push(`     Author:   ${w.author}`);
      lines.push(`     Category: ${w.category}  |  Source: ${w.source}  |  Steps: ${w.steps}`);
      lines.push(`     Stars: ${w.stars}  |  Forks: ${w.forks}`);
      if (w.tags.length > 0) {
        lines.push(`     Tags: ${w.tags.join(", ")}`);
      }
      if (w.description) {
        lines.push(`     Desc: ${w.description.slice(0, 120)}`);
      }
      lines.push(`     Download: curl -L -o ${w.id}.zip '${origin}/api/workflows/${w.id}/download'`);
      lines.push("-".repeat(80));
    });

    lines.push("");
    lines.push("Quick download example:");
    lines.push(`  curl -L -o workflow.zip '${origin}/api/workflows/<WORKFLOW_ID>/download'`);
    lines.push("");

    return new NextResponse(lines.join("\n"), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  }

  // ── JSON mode (default) ──
  return NextResponse.json({
    total: items.length,
    workflows: items,
    _help: {
      download: "GET /api/workflows/{id}/download  →  ZIP file",
      detail: "GET /api/workflows/{id}  →  full workflow JSON",
      plain_text: "Add header 'Accept: text/plain' for terminal-friendly output",
      search: "?search=keyword  |  ?category=Engineering  |  ?tag=ai",
    },
  });
}
