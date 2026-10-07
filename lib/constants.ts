import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { PRESET_WORKFLOW_LOCALIZATIONS } from "@/lib/preset-localizations";
import type { Agent, CronJob, Expert, SkillInfo, Workflow } from "@/lib/types";

export const CLAWCROSSHUB_PORT = 51211;
const IS_VERCEL = process.env.VERCEL === "1";
const PROJECT_ROOT = process.cwd();
export const WORKSPACE_ROOT = IS_VERCEL ? PROJECT_ROOT : path.resolve(/* turbopackIgnore: true */ PROJECT_ROOT, "..");
const CLAWCROSS_ROOT = path.resolve(/* turbopackIgnore: true */ PROJECT_ROOT, "..", "ClawCross");
const CLAWCROSS_ROOT_ALT = path.resolve(/* turbopackIgnore: true */ PROJECT_ROOT, "..", "clawcross");
const VERCEL_DATA_ROOT = "/tmp/clawcrosshub";
export const HUB_META_PATH = IS_VERCEL ? path.join(VERCEL_DATA_ROOT, "hub_meta.json") : path.join(PROJECT_ROOT, "hub_meta.json");
export const STAR_RECORDS_PATH = IS_VERCEL ? path.join(VERCEL_DATA_ROOT, "star_records.json") : path.join(PROJECT_ROOT, "star_records.json");

function resolveSharedPath(...segments: string[]): string {
  const primary = path.join(WORKSPACE_ROOT, ...segments);
  if (fs.existsSync(primary)) {
    return primary;
  }

  for (const base of [CLAWCROSS_ROOT, CLAWCROSS_ROOT_ALT]) {
    const candidate = path.join(base, ...segments);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return primary;
}

export const USER_FILES_ROOT = resolveSharedPath("data", "user_files");
export const PROMPTS_EXPERTS_PATH = resolveSharedPath("data", "prompts", "oasis_experts.json");

export const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
export const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";
export const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI ?? "";

export const SESSION_SECRET =
  process.env.SESSION_SECRET ??
  process.env.FLASK_SECRET_KEY ??
  crypto.createHash("sha256").update("clawcrosshub-default-secret-key").digest("hex");

export const TAG_EMOJI: Record<string, string> = {
  creative: "🎨",
  critical: "🔍",
  data: "📊",
  synthesis: "🎯",
  economist: "📈",
  lawyer: "⚖️",
  cost_controller: "💰",
  revenue_planner: "📊",
  entrepreneur: "🚀",
  common_person: "🧑",
  manual: "📝",
  custom: "⭐",
  ml: "🤖",
  code: "💻",
  review: "📋",
  brainstorm: "💡",
  pipeline: "🔗",
  debate: "🎙️"
};

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function readYamlFilesMap(snapshotDir: string): Record<string, string> | undefined {
  const yamlDir = path.join(snapshotDir, "oasis", "yaml");
  if (!fs.existsSync(yamlDir) || !fs.statSync(yamlDir).isDirectory()) {
    return undefined;
  }

  const result: Record<string, string> = {};
  fs.readdirSync(yamlDir)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .sort()
    .forEach((name) => {
      try {
        result[name] = fs.readFileSync(path.join(yamlDir, name), "utf-8");
      } catch {
        // ignore malformed file
      }
    });

  return Object.keys(result).length ? result : undefined;
}

function readPythonFilesMap(snapshotDir: string): Record<string, string> | undefined {
  const pythonDir = path.join(snapshotDir, "oasis", "python");
  if (!fs.existsSync(pythonDir) || !fs.statSync(pythonDir).isDirectory()) {
    return undefined;
  }

  const result: Record<string, string> = {};
  fs.readdirSync(pythonDir)
    .filter((name) => name.endsWith(".py"))
    .sort()
    .forEach((name) => {
      try {
        result[name] = fs.readFileSync(path.join(pythonDir, name), "utf-8");
      } catch {
        // ignore malformed file
      }
    });

  return Object.keys(result).length ? result : undefined;
}

function collectFiles(dir: string, prefix = ""): string[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return [];
  }

  return fs.readdirSync(dir).flatMap((name) => {
    const fullPath = path.join(dir, name);
    const relPath = prefix ? `${prefix}/${name}` : name;
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        return collectFiles(fullPath, relPath);
      }
      return [relPath];
    } catch {
      return [];
    }
  });
}

function readSkillsInfo(snapshotDir: string): Record<string, Record<string, SkillInfo>> | undefined {
  const skillsDir = path.join(snapshotDir, "skills");
  const files = collectFiles(skillsDir).sort();
  if (!files.length) {
    return undefined;
  }

  const result: Record<string, Record<string, SkillInfo>> = {};
  files.forEach((relPath) => {
    const parts = relPath.split("/");
    if (parts.length < 2) {
      return;
    }

    const usesAgentNamespace =
      parts.length >= 3 &&
      !["SKILL.md", "README.md", "PACKAGE.md", "INSTALLATION.md", "UPLOAD_INSTRUCTIONS.md", "openclaw.skill.json", "clawhub.json", "_meta.json"].includes(parts[1]) &&
      !parts[1].startsWith(".");
    const agentName = usesAgentNamespace ? parts[0] : "_team";
    const skillName = usesAgentNamespace ? parts[1] : parts[0];
    const base = path.basename(relPath);

    result[agentName] ??= {};
    result[agentName][skillName] ??= {};
    result[agentName][skillName].files ??= [];
    result[agentName][skillName].files.push(relPath.slice(skillName.length + (usesAgentNamespace ? agentName.length + 2 : 1)));

    if (base === "_meta.json" || base === "origin.json") {
      const parsed = readJsonFile<Record<string, unknown> | null>(path.join(skillsDir, relPath), null);
      if (parsed) {
        if (base === "_meta.json") {
          result[agentName][skillName].meta = parsed as NonNullable<SkillInfo["meta"]>;
        } else {
          result[agentName][skillName].origin = parsed as NonNullable<SkillInfo["origin"]>;
        }
      }
    }
  });

  return Object.keys(result).length ? result : undefined;
}

function readSkillsData(snapshotDir: string): Record<string, string> | undefined {
  const skillsDir = path.join(snapshotDir, "skills");
  const files = collectFiles(skillsDir).sort();
  if (!files.length) {
    return undefined;
  }

  const result: Record<string, string> = {};
  files.forEach((relPath) => {
    try {
      result[`skills/${relPath}`] = fs.readFileSync(path.join(skillsDir, relPath)).toString("base64");
    } catch {
      // ignore unreadable skill file
    }
  });
  return Object.keys(result).length ? result : undefined;
}

function readCronJobs(snapshotDir: string): Record<string, CronJob[]> | undefined {
  const raw = readJsonFile<unknown>(path.join(snapshotDir, "cron_jobs.json"), null);
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  if (Array.isArray(raw)) {
    return raw.length ? { _team: raw.filter((item) => item && typeof item === "object") as CronJob[] } : undefined;
  }

  const result: Record<string, CronJob[]> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      result[key] = value.filter((item) => item && typeof item === "object") as CronJob[];
    } else if (value && typeof value === "object") {
      result[key] = [value as CronJob];
    }
  });
  return Object.keys(result).length ? result : undefined;
}

function buildLocalSnapshotWorkflow(options: {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  icon: string;
  snapshotDirName: string;
  detail: string;
  author?: string;
  primaryYamlFile?: string;
}): Workflow | null {
  const snapshotDir = path.isAbsolute(options.snapshotDirName)
    ? options.snapshotDirName
    : resolveSharedPath(options.snapshotDirName);
  if (!fs.existsSync(snapshotDir) || !fs.statSync(snapshotDir).isDirectory()) {
    return null;
  }

  const yamlFiles = readYamlFilesMap(snapshotDir);
  const yamlEntries = yamlFiles ? Object.entries(yamlFiles) : [];
  const pythonFiles = readPythonFilesMap(snapshotDir);
  const pythonEntries = pythonFiles ? Object.entries(pythonFiles) : [];
  const primaryYaml =
    (options.primaryYamlFile && yamlFiles?.[options.primaryYamlFile]) ||
    yamlEntries.find(([name]) => name === "fullflow.yaml")?.[1] ||
    yamlEntries[0]?.[1] ||
    "";
  const primaryPython = pythonEntries[0]?.[1];

  const internalAgents = readJsonFile<Agent[]>(path.join(snapshotDir, "internal_agents.json"), []);
  const externalAgents = readJsonFile<Agent[]>(path.join(snapshotDir, "external_agents.json"), []);
  const expertsDetail = readJsonFile<Expert[]>(path.join(snapshotDir, "oasis_experts.json"), []);
  const skillsInfo = readSkillsInfo(snapshotDir);
  const skillsData = readSkillsData(snapshotDir);
  const cronJobs = readCronJobs(snapshotDir);

  return {
    id: options.id,
    title: options.title,
    description: options.description,
    author: options.author ?? "ClawCrossHub Team",
    tags: options.tags,
    category: options.category,
    stars: 0,
    forks: 0,
    icon: options.icon,
    yaml_content: primaryYaml,
    detail: options.detail,
    internal_agents: internalAgents,
    oasis_agents: internalAgents,
    external_agents: externalAgents,
    openclaw_agents: externalAgents,
    experts_detail: expertsDetail,
    experts: expertsDetail,
    yaml_files: yamlFiles,
    python_content: primaryPython,
    python_files: pythonFiles,
    skills_info: skillsInfo,
    skills_data: skillsData,
    cron_jobs: cronJobs
  };
}

export const PRESET_WORKFLOW_DEFINITIONS: Array<Workflow | null> = [
  {
    id: "ml_code_test",
    title: "ML Code Testing Pipeline",
    description:
      "Automated machine learning code testing workflow with parallel agents analyzing why this pipeline is optimal for ML testing scenarios.",
author: "ClawCrossHub Team",
    tags: ["ml", "code", "pipeline"],
    category: "Engineering",
    stars: 128,
    forks: 34,
    icon: "🤖",
    yaml_content: `# ML Code Testing Pipeline
version: 2
repeat: false
plan:
- id: on1
  expert: data#temp#1
- id: on2
  expert: critical#temp#1
- id: on3
  expert: creative#temp#1
- id: on4
  expert: synthesis#temp#1
edges:
- - on1
  - on3
- - on2
  - on3
- - on3
  - on4
`,
    detail:
      "This workflow leverages parallel Agent computation to analyze ML code testing. The data analyst and critical expert work simultaneously to evaluate test coverage and identify edge cases, then the creative expert synthesizes a testing strategy, and finally the synthesis advisor produces a comprehensive test report."
  },
  {
    id: "brainstorm_trio",
    title: "Creative Brainstorm Trio",
    description: "Three perspectives brainstorm in parallel, one reviewer filters the ideas, and a synthesis advisor produces a clear recommendation.",
author: "ClawCrossHub Team",
    tags: ["brainstorm", "creative", "ideation"],
    category: "Ideation",
    stars: 96,
    forks: 22,
    icon: "💡",
    yaml_content: `# Creative Brainstorm Trio
version: 2
repeat: true
plan:
- id: on1
  expert: creative#temp#1
- id: on2
  expert: entrepreneur#temp#1
- id: on3
  expert: common_person#temp#1
- id: on4
  expert: critical#temp#0.7
- id: on5
  expert: synthesis#temp#1
edges:
- - on1
  - on4
- - on2
  - on4
- - on3
  - on4
- - on4
  - on5
`,
    detail:
      "A more realistic ideation flow: three different perspectives generate options in parallel, a reviewer trims weak or risky ideas, and the synthesis advisor turns the surviving concepts into one coherent recommendation."
  },
  {
    id: "code_review_pipeline",
    title: "Code Review Pipeline",
    description: "Bug and performance review happen in parallel, then a synthesis advisor combines them into one prioritized code review report.",
author: "ClawCrossHub Team",
    tags: ["code", "review", "pipeline"],
    category: "Engineering",
    stars: 203,
    forks: 67,
    icon: "💻",
    yaml_content: `# Code Review Pipeline
version: 2
repeat: false
plan:
- id: on1
  expert: critical#temp#1
- id: on2
  expert: data#temp#1
- id: on3
  expert: synthesis#temp#1
edges:
- - on1
  - on3
- - on2
  - on3
`,
    detail:
      "A cleaner review topology: bug and security review run alongside performance analysis, then the synthesis advisor merges both signals into a single prioritized assessment. This better matches how engineering teams usually split review work."
  },
  {
    id: "business_debate",
    title: "Business Strategy Debate",
    description: "Economist, lawyer, and entrepreneur debate business strategy from different angles.",
author: "ClawCrossHub Team",
    tags: ["debate", "brainstorm"],
    category: "Business",
    stars: 75,
    forks: 18,
    icon: "🎙️",
    yaml_content: `# Business Strategy Debate
version: 2
repeat: true
plan:
- id: on1
  expert: economist#temp#1
- id: on2
  expert: lawyer#temp#1
- id: on3
  expert: entrepreneur#temp#1
- id: on4
  expert: cost_controller#temp#1
- id: on5
  expert: revenue_planner#temp#1
- id: on6
  manual:
    author: 主持人
    content: Please summarize the key takeaways and action items from this discussion.
edges:
- - on1
  - on4
- - on2
  - on4
- - on3
  - on4
- - on4
  - on5
- - on5
  - on6
`,
    detail:
      "A comprehensive business strategy evaluation: economist, lawyer, and entrepreneur provide parallel perspectives, followed by cost-benefit analysis, revenue planning, and a final moderator summary. Perfect for evaluating new business initiatives."
  },
  {
    id: "dag_research_pipeline",
    title: "Research Analysis DAG",
    description: "DAG-based research pipeline with parallel data collection and sequential analysis.",
author: "ClawCrossHub Team",
    tags: ["pipeline", "data"],
    category: "Research",
    stars: 64,
    forks: 15,
    icon: "📊",
    yaml_content: `# Research Analysis DAG
version: 2
repeat: false
plan:
- id: on1
  expert: data#temp#1
- id: on2
  expert: economist#temp#1
- id: on3
  expert: critical#temp#1
- id: on4
  expert: synthesis#temp#1
- id: on5
  expert: creative#temp#1
edges:
- - on1
  - on3
- - on2
  - on3
- - on3
  - on4
- - on4
  - on5
`,
    detail:
      "A DAG-based research pipeline that maximizes parallelism: two data collection agents work simultaneously, then a critical analyst reviews the combined data, a synthesis advisor draws conclusions, and finally a creative expert produces an engaging research report."
  },
  {
    id: "multi_agent_team",
    title: "Release Readiness Team",
    description: "An end-to-end release workflow that combines internal experts, OpenClaw builders, and connected agents for validation and rollout.",
author: "ClawCrossHub Team",
    tags: ["team", "snapshot", "openclaw", "release", "delivery"],
    category: "Engineering",
    stars: 156,
    forks: 42,
    icon: "🌐",
    yaml_content: `# Release Readiness Team
version: 2
repeat: false
plan:
- id: on1
  expert: data#temp#0.8
- id: on2
  expert: critical#temp#0.6
- id: on3
  expert: openclaw#ext#CodePilot
  instruction: Implement the agreed release candidate based on the research and review findings.
- id: on4
  expert: openclaw#ext#DocWriter
  instruction: Write release notes and operator-facing documentation for the current build.
- id: on5
  expert: external#service#MonitorBot
  instruction: Validate service health and watch for anomalies during release verification.
- id: on6
  expert: synthesis#temp#0.7
- id: on7
  expert: external#service#SlackNotifier
  instruction: Send the release summary to the team after the package is ready.
edges:
- - on1
  - on3
- - on2
  - on3
- - on3
  - on4
- - on3
  - on5
- - on4
  - on6
- - on5
  - on6
- - on6
  - on7
`,
    detail:
      "A more purposeful showcase of mixed agent types: internal experts gather evidence and review risks, OpenClaw agents implement and document the release candidate, a connected monitoring agent validates runtime health, and a notification agent closes the loop with rollout communication.",
    experts_detail: [
      { name: "Data Analyst", tag: "data", persona: "You are a meticulous data analyst who excels at gathering, cleaning, and interpreting complex datasets.", temperature: 0.8 },
      { name: "Critical Reviewer", tag: "critical", persona: "You are a sharp-eyed code reviewer who identifies bugs, security vulnerabilities, and performance bottlenecks.", temperature: 0.6 },
      { name: "Creative Coder", tag: "creative", persona: "You are an innovative software engineer who writes elegant, well-documented code with creative solutions.", temperature: 0.9 },
      { name: "Synthesis Advisor", tag: "synthesis", persona: "You are a strategic advisor who synthesizes multiple perspectives into actionable recommendations.", temperature: 0.7 }
    ],
    internal_agents: [
      { name: "Data Analyst", tag: "data", persona: "You are a meticulous data analyst who excels at gathering, cleaning, and interpreting complex datasets.", temperature: 0.8 },
      { name: "Critical Reviewer", tag: "critical", persona: "You are a sharp-eyed code reviewer who identifies bugs, security vulnerabilities, and performance bottlenecks.", temperature: 0.6 },
      { name: "Creative Coder", tag: "creative", persona: "You are an innovative software engineer who writes elegant, well-documented code with creative solutions.", temperature: 0.9 },
      { name: "Synthesis Advisor", tag: "synthesis", persona: "You are a strategic advisor who synthesizes multiple perspectives into actionable recommendations.", temperature: 0.7 }
    ],
    external_agents: [
      {
        name: "CodePilot",
        tag: "openclaw",
        workspace_files: {
          "IDENTITY.md": "# CodePilot\nAn advanced coding assistant powered by OpenClaw.\nSpecializes in full-stack development, code review, and automated testing.\nCapable of understanding complex codebases and generating production-ready code."
        },
        config: {
          skills: ["code_generation", "test_writing", "refactoring"],
          workspace_files: { "IDENTITY.md": "CodePilot identity" }
        }
      },
      {
        name: "DocWriter",
        tag: "openclaw",
        workspace_files: {
          "IDENTITY.md": "# DocWriter\nA documentation specialist agent.\nCreates comprehensive API docs, user guides, and technical specifications.\nSupports Markdown, OpenAPI, and JSDoc formats."
        },
        config: {
          skills: ["markdown_gen", "api_docs", "changelog"],
          workspace_files: { "IDENTITY.md": "DocWriter identity" }
        }
      },
      {
        name: "MonitorBot",
        tag: "external",
        config: {
          endpoint: "https://api.monitor-service.io/v1",
          auth_type: "bearer_token"
        }
      },
      {
        name: "SlackNotifier",
        tag: "external",
        config: {
          webhook_url: "https://hooks.slack.com/services/EXAMPLE",
          channel: "#team-alerts"
        }
      }
    ],
    skills_info: {
      CodePilot: {
        code_generation: {
          files: ["generate.py", "templates/"],
          meta: { ownerId: "openclaw", slug: "code-generation", version: "2.1.0", publishedAt: 1710000000 },
          origin: { version: 3, registry: "openclaw-hub", slug: "code-generation", installedVersion: "2.1.0", installedAt: 1710500000 }
        },
        test_writing: {
          files: ["test_gen.py"],
          meta: { ownerId: "openclaw", slug: "test-writing", version: "1.3.0", publishedAt: 1709000000 },
          origin: { version: 2, registry: "openclaw-hub", slug: "test-writing", installedVersion: "1.3.0", installedAt: 1710200000 }
        },
        refactoring: {
          files: ["refactor.py", "patterns.json"],
          meta: { ownerId: "openclaw", slug: "refactoring", version: "1.0.5", publishedAt: 1708000000 },
          origin: { version: 1, registry: "openclaw-hub", slug: "refactoring", installedVersion: "1.0.5", installedAt: 1710100000 }
        }
      },
      DocWriter: {
        markdown_gen: {
          files: ["md_writer.py"],
          meta: { ownerId: "openclaw", slug: "markdown-gen", version: "1.2.0", publishedAt: 1709500000 },
          origin: { version: 2, registry: "openclaw-hub", slug: "markdown-gen", installedVersion: "1.2.0", installedAt: 1710300000 }
        },
        api_docs: {
          files: ["openapi_gen.py", "templates/swagger.yaml"],
          meta: { ownerId: "openclaw", slug: "api-docs", version: "3.0.1", publishedAt: 1710100000 },
          origin: { version: 4, registry: "openclaw-hub", slug: "api-docs", installedVersion: "3.0.1", installedAt: 1710600000 }
        },
        changelog: {
          files: ["changelog_gen.py"],
          meta: { ownerId: "openclaw", slug: "changelog", version: "1.0.0", publishedAt: 1708500000 },
          origin: { version: 1, registry: "openclaw-hub", slug: "changelog", installedVersion: "1.0.0", installedAt: 1710000000 }
        }
      }
    },
    cron_jobs: {
      MonitorBot: [
        {
          name: "Health Check",
          enabled: true,
          scheduleKind: "interval",
          every: "5m",
          mode: "silent",
          session: "monitor_health",
          message: "Run health check on all monitored services and report anomalies."
        },
        {
          name: "Daily Report",
          enabled: true,
          scheduleKind: "cron",
          cron: "0 9 * * *",
          mode: "notify",
          session: "monitor_daily",
          message: "Generate daily monitoring summary report with uptime statistics."
        }
      ],
      SlackNotifier: [
        {
          name: "Weekly Digest",
          enabled: true,
          scheduleKind: "cron",
          cron: "0 10 * * 1",
          mode: "broadcast",
          session: "slack_weekly",
          message: "Compile and send weekly team digest to #team-alerts channel."
        },
        {
          name: "Sprint Reminder",
          enabled: false,
          scheduleKind: "cron",
          cron: "0 9 * * 5",
          mode: "notify",
          session: "slack_sprint",
          message: "Remind team about sprint review meeting."
        }
      ]
    }
  } as unknown as Workflow,
  buildLocalSnapshotWorkflow({
    id: "dataloop2_selector_team",
    title: "Dataloop2 Selector Team",
    description: "A multi-agent coding workflow with a selector node that decides whether to continue the debug loop or end the run.",
    category: "Engineering",
    tags: ["team", "snapshot", "openclaw", "pipeline", "code"],
    icon: "🧭",
    snapshotDirName: "team_Dataloop2_snapshot",
    primaryYamlFile: "fullflow.yaml",
    detail:
      "Imported from a local Team snapshot. This workflow demonstrates selector-based orchestration across architecture, frontend, backend, testing, debugging, and explicit end-state manual nodes."
  }),
  buildLocalSnapshotWorkflow({
    id: "werewolf_game_snapshot",
    title: "狼人杀 Game Master Team",
    description: "A Team snapshot for hosting a Werewolf game with a judge and five AI players, each carrying detailed game personas and turn-taking rules.",
    category: "Community",
    tags: ["team", "snapshot", "game", "community"],
    icon: "🐺",
    snapshotDirName: "team_狼人杀Game_snapshot",
    detail:
      "Imported from a local Team snapshot. This pack focuses on agent personas rather than a YAML execution graph: the judge orchestrates the game and the players each follow role-specific speaking, voting, and night-action rules."
  }),
  buildLocalSnapshotWorkflow({
    id: "code_ppt_fusion_team",
    title: "Code PPT Fusion Team",
    description: "A development showcase team combining Oasis agents, external Claude agents, reusable skills, and delivery workflows.",
    category: "Engineering",
    tags: ["team", "snapshot", "engineering", "ppt", "claude", "research"],
    icon: "🧩",
    snapshotDirName: "data/user_files/default/teams/开发展示团队",
    primaryYamlFile: "test.yaml",
    detail:
      "Imported from the local ClawCross team export. The snapshot preserves external agent definitions, team-level skills, YAML orchestration, and metadata needed for round-trip download."
  })
];

export const PRESET_WORKFLOWS: Workflow[] = PRESET_WORKFLOW_DEFINITIONS.filter((workflow): workflow is Workflow => Boolean(workflow)).map((workflow) => ({
  ...workflow,
  localizations: PRESET_WORKFLOW_LOCALIZATIONS[workflow.id] ?? workflow.localizations
}));

let builtinExpertsCache: Record<string, Expert> | null = null;

export function getBuiltinExperts(): Record<string, Expert> {
  if (builtinExpertsCache) {
    return builtinExpertsCache;
  }

  const experts: Record<string, Expert> = {};
  try {
    if (fs.existsSync(PROMPTS_EXPERTS_PATH)) {
      const raw = fs.readFileSync(PROMPTS_EXPERTS_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((expert) => {
          if (expert && typeof expert === "object" && typeof expert.tag === "string") {
            experts[expert.tag] = {
              name: String(expert.name_en ?? expert.name ?? expert.tag),
              tag: String(expert.tag),
              persona: String(expert.persona ?? ""),
              temperature: Number(expert.temperature ?? 0.7)
            };
          }
        });
      }
    }
  } catch {
    // fallback to empty map
  }

  builtinExpertsCache = experts;
  return experts;
}
