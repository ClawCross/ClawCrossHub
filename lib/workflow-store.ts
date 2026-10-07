import fs from "node:fs";
import path from "node:path";

import yaml from "js-yaml";

import { isBlobAvailable, loadJsonFromBlob, saveJsonToBlob } from "@/lib/blob-store";
import { getBuiltinExperts, HUB_META_PATH, PRESET_WORKFLOWS, STAR_RECORDS_PATH, USER_FILES_ROOT } from "@/lib/constants";
import { buildWorkflowLocalizations } from "@/lib/translation";
import type { Agent, Expert, HubMeta, Workflow } from "@/lib/types";
import { appendWorkflowSearchText } from "@/lib/workflow-localization";

// Keys used in Vercel Blob storage
const BLOB_HUB_META_KEY = "clawcrosshub/hub_meta.json";
const BLOB_STAR_RECORDS_KEY = "clawcrosshub/star_records.json";
const IS_VERCEL = process.env.VERCEL === "1";

export class PersistenceError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "PersistenceError";
  }
}

function assertPersistentStorageConfigured(): void {
  if (IS_VERCEL && !isBlobAvailable()) {
    throw new PersistenceError("Persistent storage is not configured on Vercel. Set BLOB_READ_WRITE_TOKEN.");
  }
}

// Whether we have already hydrated local /tmp from Blob on this cold start
let hubMetaHydrated = false;
let starRecordsHydrated = false;

type Summary = {
  steps: number;
  types: string[];
  is_dag: boolean;
  repeat: boolean;
  experts: string[];
};

let presetWorkflows: Workflow[] = PRESET_WORKFLOWS.map((w) => ({ ...w }));

/**
 * Hydrate the local /tmp hub_meta.json from Vercel Blob on the first call
 * after a cold start. This is fire-and-forget — the returned Promise is
 * consumed internally so callers stay synchronous.
 */
async function hydrateHubMetaFromBlob(): Promise<void> {
  if (hubMetaHydrated || !isBlobAvailable()) return;
  hubMetaHydrated = true;

  try {
    // Only hydrate if the local file does not already exist (cold start)
    if (!fs.existsSync(HUB_META_PATH)) {
      const remote = await loadJsonFromBlob<HubMeta>(BLOB_HUB_META_KEY);
      if (remote && Array.isArray(remote.workflows)) {
        fs.mkdirSync(path.dirname(HUB_META_PATH), { recursive: true });
        fs.writeFileSync(HUB_META_PATH, JSON.stringify(remote, null, 2), "utf-8");
      }
    }
  } catch {
    // Non-fatal — will just use local/empty data
  }
}

// Kick off hydration eagerly on module load so it's likely ready before the
// first API request finishes.
const _hubMetaHydrationPromise = hydrateHubMetaFromBlob();

/**
 * Wait for Blob hydration to complete. Call this at the top of any async
 * API route handler that reads hub meta, e.g.:
 *   await ensureHubMetaHydrated();
 */
export async function ensureHubMetaHydrated(): Promise<void> {
  await _hubMetaHydrationPromise;
}

export function loadHubMeta(): HubMeta {
  try {
    if (fs.existsSync(HUB_META_PATH)) {
      const raw = fs.readFileSync(HUB_META_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.workflows)) {
        return {
          workflows: parsed.workflows,
          version: Number(parsed.version ?? 1)
        };
      }
    }
  } catch {
    // ignore and return default
  }

  return { workflows: [], version: 1 };
}

export async function saveHubMeta(meta: HubMeta): Promise<void> {
  fs.mkdirSync(path.dirname(HUB_META_PATH), { recursive: true });
  assertPersistentStorageConfigured();

  if (IS_VERCEL) {
    try {
      // Blob is the source of truth on Vercel; local /tmp acts as cache.
      await saveJsonToBlob(BLOB_HUB_META_KEY, meta);
    } catch (err) {
      throw new PersistenceError("Failed to persist workflow data to Blob storage.", err);
    }
  }

  fs.writeFileSync(HUB_META_PATH, JSON.stringify(meta, null, 2), "utf-8");
}

function readFirstComment(content: string): string {
  for (const line of content.split(/\r?\n/)) {
    const stripped = line.trim();
    if (stripped.startsWith("#")) {
      return stripped.replace(/^#\s*/, "");
    }
    if (stripped) {
      return "";
    }
  }
  return "";
}

export function scanUserWorkflows(): Array<{
  file: string;
  user: string;
  description: string;
  path: string;
  yaml_content: string;
  modified: number;
}> {
  const results: Array<{
    file: string;
    user: string;
    description: string;
    path: string;
    yaml_content: string;
    modified: number;
  }> = [];

  if (!fs.existsSync(USER_FILES_ROOT) || !fs.statSync(USER_FILES_ROOT).isDirectory()) {
    return results;
  }

  for (const userDir of fs.readdirSync(USER_FILES_ROOT)) {
    const yamlDir = path.join(USER_FILES_ROOT, userDir, "oasis", "yaml");
    if (!fs.existsSync(yamlDir) || !fs.statSync(yamlDir).isDirectory()) {
      continue;
    }

    for (const fileName of fs.readdirSync(yamlDir)) {
      if (!fileName.endsWith(".yaml") && !fileName.endsWith(".yml")) {
        continue;
      }

      const filePath = path.join(yamlDir, fileName);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        results.push({
          file: fileName,
          user: userDir,
          description: readFirstComment(content),
          path: filePath,
          yaml_content: content,
          modified: fs.statSync(filePath).mtimeMs
        });
      } catch {
        // ignore malformed file
      }
    }
  }

  return results;
}

function parseAgentRaw(raw: string): string {
  const parts = raw
    .split("#")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) {
    return raw.trim();
  }
  if (parts[0].toLowerCase() === "custom" && parts.length >= 3) {
    return parts.slice(2).join("#").trim() || parts[parts.length - 1];
  }
  return parts[0];
}

function isSelectorLikeAgent(raw: string): boolean {
  const normalized = parseAgentRaw(raw).toLowerCase();
  return normalized === "selector" || normalized === "selector_agent" || normalized === "selector-agent";
}

function isExternalAgentRef(raw: string): boolean {
  const parts = raw
    .split("#")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const head = parts[0] || "";
  const markers = new Set(["ext", "external", "openclaw", "open_claw", "open-claw", "agent"]);
  if (head.startsWith("agent:")) {
    return true;
  }
  if (parts.some((part) => markers.has(part)) || head.includes("openclaw")) {
    return true;
  }
  return head === "external" || head === "open_claw_agent" || head === "open-claw-agent" || head === "open claw agent";
}

function shouldTrackAsInternalExpert(raw: string, selectorStep = false): boolean {
  if (selectorStep) {
    return false;
  }
  if (!raw.trim()) {
    return false;
  }
  if (isSelectorLikeAgent(raw)) {
    return false;
  }
  if (isExternalAgentRef(raw)) {
    return false;
  }
  return true;
}

export function parseYamlPlanSummary(yamlStr: string): Summary {
  try {
    const data = yaml.load(yamlStr);
    if (!data || typeof data !== "object" || !("plan" in data)) {
      return { steps: 0, types: [], is_dag: false, repeat: false, experts: [] };
    }

    const record = data as Record<string, unknown>;
    const plan = Array.isArray(record.plan) ? record.plan : [];
    const repeat = Boolean(record.repeat);
    const hasEdges = "edges" in record;
    const isDag = hasEdges || plan.some((step) => typeof step === "object" && step !== null && ("id" in (step as Record<string, unknown>) || "depends_on" in (step as Record<string, unknown>)));

    const stepTypes: string[] = [];
    const expertNames: string[] = [];

    plan.forEach((step) => {
      if (!step || typeof step !== "object") {
        return;
      }
      const row = step as Record<string, unknown>;
      if (row.selector) {
        stepTypes.push("selector");
      } else if (typeof row.expert === "string") {
        stepTypes.push("expert");
        if (shouldTrackAsInternalExpert(row.expert)) {
          expertNames.push(parseAgentRaw(row.expert));
        }
      } else if (Array.isArray(row.parallel)) {
        stepTypes.push("parallel");
        row.parallel.forEach((child) => {
          if (typeof child === "string") {
            if (shouldTrackAsInternalExpert(child)) {
              expertNames.push(parseAgentRaw(child));
            }
          } else if (child && typeof child === "object" && typeof (child as Record<string, unknown>).expert === "string") {
            const expertRaw = String((child as Record<string, unknown>).expert);
            if (shouldTrackAsInternalExpert(expertRaw)) {
              expertNames.push(parseAgentRaw(expertRaw));
            }
          }
        });
      } else if (row.all_experts !== undefined) {
        stepTypes.push("all_experts");
      } else if (row.manual !== undefined) {
        stepTypes.push("manual");
      }
    });

    return {
      steps: plan.length,
      types: stepTypes,
      is_dag: isDag,
      repeat,
      experts: [...new Set(expertNames)]
    };
  } catch {
    return { steps: 0, types: [], is_dag: false, repeat: false, experts: [] };
  }
}

export function extractExpertsFromYaml(yamlContent: string): { experts: Expert[]; internalAgents: Agent[] } {
  try {
    const parsed = yaml.load(yamlContent);
    if (!parsed || typeof parsed !== "object") {
      return { experts: [], internalAgents: [] };
    }

    const plan = Array.isArray((parsed as Record<string, unknown>).plan) ? ((parsed as Record<string, unknown>).plan as unknown[]) : [];
    const seen = new Set<string>();
    const experts: Expert[] = [];
    const internalAgents: Agent[] = [];
    const builtinExperts = getBuiltinExperts();

    const processExpert = (raw: unknown) => {
      if (typeof raw !== "string") {
        return;
      }
      if (!shouldTrackAsInternalExpert(raw)) {
        return;
      }
      const tag = parseAgentRaw(raw);
      if (!tag || seen.has(tag)) {
        return;
      }

      seen.add(tag);
      const builtin = builtinExperts[tag];
      if (builtin) {
        experts.push({
          name: builtin.name,
          tag,
          persona: builtin.persona,
          temperature: Number(builtin.temperature ?? 0.7)
        });
        internalAgents.push({
          name: builtin.name,
          tag
        });
      } else {
        experts.push({
          name: tag,
          tag,
          persona: "",
          temperature: 0.7
        });
        internalAgents.push({
          name: tag,
          tag
        });
      }
    };

    plan.forEach((step) => {
      if (!step || typeof step !== "object") {
        return;
      }

      const row = step as Record<string, unknown>;
      if (!row.selector) {
        processExpert(row.expert);
      }
      if (Array.isArray(row.parallel)) {
        row.parallel.forEach((child) => {
          if (typeof child === "string") {
            processExpert(child);
          } else if (child && typeof child === "object") {
            processExpert((child as Record<string, unknown>).expert);
          }
        });
      }
    });

    return { experts, internalAgents };
  } catch {
    return { experts: [], internalAgents: [] };
  }
}

export function listWorkflows(params: { search?: string; category?: string; tag?: string }): { workflows: Workflow[]; total: number } {
  const search = (params.search ?? "").toLowerCase();
  const category = params.category ?? "";
  const tag = params.tag ?? "";

  const workflows: Workflow[] = [];

  presetWorkflows.forEach((preset) => {
    const summary = parseYamlPlanSummary(preset.yaml_content);
    workflows.push({
      ...preset,
      source: "preset",
      steps: summary.steps,
      is_dag: summary.is_dag,
      repeat: summary.repeat,
      step_types: summary.types,
      experts: summary.experts
    });
  });

  const meta = loadHubMeta();
  meta.workflows.forEach((community) => {
    const summary = parseYamlPlanSummary(community.yaml_content ?? "");
    workflows.push({
      ...community,
      id: community.id,
      title: community.title ?? "Untitled",
      description: community.description ?? "",
      author: community.author ?? "Community",
      tags: Array.isArray(community.tags) ? community.tags : [],
      category: community.category ?? "Community",
      stars: Number(community.stars ?? 0),
      forks: Number(community.forks ?? 0),
      icon: community.icon ?? "📦",
      source: "community",
      steps: summary.steps,
      is_dag: summary.is_dag,
      repeat: summary.repeat,
      step_types: summary.types,
      experts: summary.experts
    });
  });

  const scanned = scanUserWorkflows();
  const existingIds = new Set(workflows.map((w) => w.id));
  scanned.forEach((item) => {
    const id = `user_${item.user}_${item.file.replace(/\.ya?ml$/, "")}`;
    if (existingIds.has(id)) {
      return;
    }

    const summary = parseYamlPlanSummary(item.yaml_content);
    workflows.push({
      id,
      title: item.file.replace(/\.ya?ml$/, "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
      description: item.description || "User workflow",
      author: item.user,
      tags: [],
      category: "User",
      stars: 0,
      forks: 0,
      icon: "📄",
      yaml_content: item.yaml_content,
      detail: `Workflow created by user '${item.user}'.`,
      source: "user",
      steps: summary.steps,
      is_dag: summary.is_dag,
      repeat: summary.repeat,
      step_types: summary.types,
      experts: summary.experts
    });
  });

  let filtered = workflows;
  if (search) {
    filtered = filtered.filter((workflow) => {
      const tags = Array.isArray(workflow.tags) ? workflow.tags : [];
      const haystackParts = [
        workflow.title.toLowerCase(),
        workflow.description.toLowerCase(),
        workflow.author.toLowerCase(),
        ...tags.map((currentTag) => currentTag.toLowerCase())
      ];
      appendWorkflowSearchText(haystackParts, workflow);
      const haystack = haystackParts.join("\n");
      return (
        haystack.includes(search)
      );
    });
  }
  if (category) {
    filtered = filtered.filter((workflow) => workflow.category.toLowerCase() === category.toLowerCase());
  }
  if (tag) {
    filtered = filtered.filter((workflow) => Array.isArray(workflow.tags) && workflow.tags.includes(tag));
  }

  return { workflows: filtered, total: filtered.length };
}

function buildExpertsDetail(summaryExperts: string[], storedExperts?: Workflow["experts"]): Expert[] {
  if (Array.isArray(storedExperts) && storedExperts.length > 0 && typeof storedExperts[0] === "object") {
    return storedExperts as Expert[];
  }

  const builtin = getBuiltinExperts();
  return summaryExperts.map((tag) => {
    const item = builtin[tag];
    if (item) {
      return item;
    }
    return {
      name: tag,
      tag,
      persona: "",
      temperature: 0.7
    };
  });
}

export function getWorkflowById(workflowId: string): Workflow | null {
  const preset = presetWorkflows.find((workflow) => workflow.id === workflowId);
  if (preset) {
    const summary = parseYamlPlanSummary(preset.yaml_content);
    return {
      ...preset,
      source: "preset",
      steps: summary.steps,
      is_dag: summary.is_dag,
      repeat: summary.repeat,
      step_types: summary.types,
      experts: summary.experts,
      experts_detail: buildExpertsDetail(summary.experts)
    };
  }

  const meta = loadHubMeta();
  const community = meta.workflows.find((workflow) => workflow.id === workflowId);
  if (community) {
    const summary = parseYamlPlanSummary(community.yaml_content ?? "");
    return {
      ...community,
      source: "community",
      steps: summary.steps,
      is_dag: summary.is_dag,
      repeat: summary.repeat,
      step_types: summary.types,
      experts: summary.experts,
      experts_detail: buildExpertsDetail(summary.experts, community.experts)
    };
  }

  if (workflowId.startsWith("user_")) {
    const parts = workflowId.split("_", 3);
    if (parts.length >= 3) {
      const user = parts[1];
      const fileBase = parts[2];
      const yamlDir = path.join(USER_FILES_ROOT, user, "oasis", "yaml");
      const candidates = [path.join(yamlDir, `${fileBase}.yaml`), path.join(yamlDir, `${fileBase}.yml`)];
      for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) {
          continue;
        }

        const content = fs.readFileSync(candidate, "utf-8");
        const summary = parseYamlPlanSummary(content);
        return {
          id: workflowId,
          title: fileBase.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
          description: readFirstComment(content) || "User workflow",
          author: user,
          tags: [],
          category: "User",
          stars: 0,
          forks: 0,
          icon: "📄",
          yaml_content: content,
          detail: `Workflow created by user '${user}'.`,
          source: "user",
          steps: summary.steps,
          is_dag: summary.is_dag,
          repeat: summary.repeat,
          step_types: summary.types,
          experts: summary.experts,
          experts_detail: buildExpertsDetail(summary.experts)
        };
      }
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════
// ── Star records persistence (per-user star tracking) ──
// ═══════════════════════════════════════════════════════

type StarRecords = Record<string, string[]>; // { userLogin: [workflowId, ...] }

async function hydrateStarRecordsFromBlob(): Promise<void> {
  if (starRecordsHydrated || !isBlobAvailable()) return;
  starRecordsHydrated = true;

  try {
    if (!fs.existsSync(STAR_RECORDS_PATH)) {
      const remote = await loadJsonFromBlob<StarRecords>(BLOB_STAR_RECORDS_KEY);
      if (remote && typeof remote === "object") {
        fs.mkdirSync(path.dirname(STAR_RECORDS_PATH), { recursive: true });
        fs.writeFileSync(STAR_RECORDS_PATH, JSON.stringify(remote, null, 2), "utf-8");
      }
    }
  } catch {
    // Non-fatal
  }
}

const _starRecordsHydrationPromise = hydrateStarRecordsFromBlob();

export async function ensureStarRecordsHydrated(): Promise<void> {
  await _starRecordsHydrationPromise;
}

function loadStarRecords(): StarRecords {
  try {
    if (fs.existsSync(STAR_RECORDS_PATH)) {
      const raw = fs.readFileSync(STAR_RECORDS_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed as StarRecords;
      }
    }
  } catch {
    // ignore
  }
  return {};
}

async function saveStarRecords(records: StarRecords): Promise<void> {
  fs.mkdirSync(path.dirname(STAR_RECORDS_PATH), { recursive: true });
  assertPersistentStorageConfigured();

  if (IS_VERCEL) {
    try {
      await saveJsonToBlob(BLOB_STAR_RECORDS_KEY, records);
    } catch (err) {
      throw new PersistenceError("Failed to persist star records to Blob storage.", err);
    }
  }

  fs.writeFileSync(STAR_RECORDS_PATH, JSON.stringify(records, null, 2), "utf-8");
}

export function isWorkflowStarredByUser(workflowId: string, userLogin: string): boolean {
  const records = loadStarRecords();
  return (records[userLogin] ?? []).includes(workflowId);
}

export function getUserStarredWorkflowIds(userLogin: string): string[] {
  const records = loadStarRecords();
  return records[userLogin] ?? [];
}

export async function starWorkflowByUser(
  workflowId: string,
  userLogin: string
): Promise<{ stars: number; starred: boolean } | null> {
  const records = loadStarRecords();
  const userStars = records[userLogin] ?? [];
  const alreadyStarred = userStars.includes(workflowId);

  if (alreadyStarred) {
    // Unstar
    records[userLogin] = userStars.filter((id) => id !== workflowId);
    await saveStarRecords(records);

    // Decrement star count
    const meta = loadHubMeta();
    const community = meta.workflows.find((w) => w.id === workflowId);
    if (community) {
      community.stars = Math.max(0, Number(community.stars ?? 0) - 1);
      await saveHubMeta(meta);
      return { stars: community.stars, starred: false };
    }
    const preset = presetWorkflows.find((w) => w.id === workflowId);
    if (preset) {
      preset.stars = Math.max(0, Number(preset.stars ?? 0) - 1);
      return { stars: preset.stars, starred: false };
    }
    return null;
  } else {
    // Star
    records[userLogin] = [...userStars, workflowId];
    await saveStarRecords(records);

    // Increment star count
    const meta = loadHubMeta();
    const community = meta.workflows.find((w) => w.id === workflowId);
    if (community) {
      community.stars = Number(community.stars ?? 0) + 1;
      await saveHubMeta(meta);
      return { stars: community.stars, starred: true };
    }
    const preset = presetWorkflows.find((w) => w.id === workflowId);
    if (preset) {
      preset.stars = Number(preset.stars ?? 0) + 1;
      return { stars: preset.stars, starred: true };
    }
    return null;
  }
}

/** @deprecated Use starWorkflowByUser instead */
export async function starWorkflow(workflowId: string): Promise<number | null> {
  const meta = loadHubMeta();
  const community = meta.workflows.find((workflow) => workflow.id === workflowId);
  if (community) {
    const current = Number(community.stars ?? 0) + 1;
    community.stars = current;
    await saveHubMeta(meta);
    return current;
  }

  const preset = presetWorkflows.find((workflow) => workflow.id === workflowId);
  if (preset) {
    preset.stars = Number(preset.stars ?? 0) + 1;
    return preset.stars;
  }

  return null;
}

export async function publishWorkflow(input: {
  title: string;
  yaml_content: string;
  description?: string;
  author?: string;
  tags?: string[];
  category?: string;
  icon?: string;
  detail?: string;
  githubUserLogin?: string;
  githubUserName?: string;
}): Promise<{ id: string }> {
  const parsed = yaml.load(input.yaml_content);
  if (!parsed || typeof parsed !== "object" || !((parsed as Record<string, unknown>).plan)) {
    throw new Error("YAML must contain 'plan' key");
  }

  // Auto-extract full expert definitions from YAML + builtin lookup
  const extracted = extractExpertsFromYaml(input.yaml_content);

  const meta = loadHubMeta();
  const id = `community_${cryptoRandom(8)}`;

  const workflow: Workflow = {
    id,
    title: input.title,
    description: input.description ?? "",
    author: input.author ?? "Anonymous",
    tags: input.tags ?? [],
    category: input.category ?? "Community",
    stars: 0,
    forks: 0,
    icon: input.icon ?? "📦",
    yaml_content: input.yaml_content,
    detail: input.detail ?? "",
    published_at: new Date().toISOString(),
    experts_detail: extracted.experts
  };

  if (input.githubUserLogin) {
    workflow.author = input.githubUserName || input.githubUserLogin;
    workflow.github_user = input.githubUserLogin;
  }

  workflow.localizations = await buildWorkflowLocalizations(workflow);
  meta.workflows.push(workflow);
  await saveHubMeta(meta);

  return { id };
}

// ── Delete a community workflow (only by its owner) ──
export async function deleteWorkflow(workflowId: string, userLogin: string): Promise<boolean> {
  const meta = loadHubMeta();
  const idx = meta.workflows.findIndex((w) => w.id === workflowId);
  if (idx === -1) {
    return false;
  }
  const workflow = meta.workflows[idx];
  // Only allow deletion by the owner
  if (workflow.github_user !== userLogin) {
    return false;
  }
  meta.workflows.splice(idx, 1);
  await saveHubMeta(meta);

  // Also remove from star records
  const records = loadStarRecords();
  for (const user of Object.keys(records)) {
    records[user] = records[user].filter((id) => id !== workflowId);
  }
  await saveStarRecords(records);

  return true;
}

// ── Update a community workflow (only by its owner) ──
export async function updateWorkflow(
  workflowId: string,
  userLogin: string,
  updates: {
    title?: string;
    description?: string;
    yaml_content?: string;
    category?: string;
    tags?: string[];
    icon?: string;
    detail?: string;
  }
): Promise<Workflow | null> {
  const meta = loadHubMeta();
  const workflow = meta.workflows.find((w) => w.id === workflowId);
  if (!workflow) {
    return null;
  }
  // Only allow update by the owner
  if (workflow.github_user !== userLogin) {
    return null;
  }

  if (updates.title !== undefined) workflow.title = updates.title;
  if (updates.description !== undefined) workflow.description = updates.description;
  if (updates.category !== undefined) workflow.category = updates.category;
  if (updates.tags !== undefined) workflow.tags = updates.tags;
  if (updates.icon !== undefined) workflow.icon = updates.icon;
  if (updates.detail !== undefined) workflow.detail = updates.detail;

  if (updates.yaml_content !== undefined) {
    const parsed = yaml.load(updates.yaml_content);
    if (!parsed || typeof parsed !== "object" || !((parsed as Record<string, unknown>).plan)) {
      throw new Error("YAML must contain 'plan' key");
    }
    workflow.yaml_content = updates.yaml_content;
    // Re-extract full expert definitions when YAML changes
    const extracted = extractExpertsFromYaml(updates.yaml_content);
    workflow.experts_detail = extracted.experts;
  }

  workflow.localizations = await buildWorkflowLocalizations(workflow);
  await saveHubMeta(meta);
  return workflow;
}

function cryptoRandom(length: number): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function listCategories(): string[] {
  const categories = new Set<string>();
  presetWorkflows.forEach((workflow) => categories.add(workflow.category));
  const meta = loadHubMeta();
  meta.workflows.forEach((workflow) => categories.add(workflow.category || "Community"));
  categories.add("User");
  return [...categories];
}
