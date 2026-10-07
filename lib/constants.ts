import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { PRESET_WORKFLOW_LOCALIZATIONS } from "@/lib/preset-localizations";
import type { Agent, CronJob, Expert, SkillInfo, Workflow } from "@/lib/types";
import PRESET_PERSONAS from "@/data/preset-personas.json";

export const CLAWCROSSHUB_PORT = 51211;
const IS_VERCEL = process.env.VERCEL === "1";
const PROJECT_ROOT = process.cwd();
export const WORKSPACE_ROOT = IS_VERCEL ? PROJECT_ROOT : path.resolve(/* turbopackIgnore: true */ PROJECT_ROOT, "..");
const VERCEL_DATA_ROOT = "/tmp/clawcrosshub";
const HUB_DATA_ROOT = IS_VERCEL ? VERCEL_DATA_ROOT : path.resolve(process.env.CLAWCROSSHUB_DATA_DIR || path.join(os.homedir(), ".clawcross-hub"));
export const HUB_META_PATH = path.join(HUB_DATA_ROOT, "hub_meta.json");
export const STAR_RECORDS_PATH = path.join(HUB_DATA_ROOT, "star_records.json");

function resolveSharedPath(...segments: string[]): string {
  return path.join(process.env.CLAWCROSSHUB_PRESETS_ROOT || PROJECT_ROOT, ...segments);
}

export const USER_FILES_ROOT = path.resolve(process.env.CLAWCROSSHUB_USER_FILES_ROOT || path.join(HUB_DATA_ROOT, "user_files"));
export const PROMPTS_EXPERTS_PATH = path.resolve(process.env.CLAWCROSSHUB_EXPERTS_PATH || path.join(HUB_DATA_ROOT, "prompts", "oasis_experts.json"));

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
    author: options.author ?? "ClawCross Team",
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

const PRESET_ROLE_NAMES: Record<string,string> = {"data": "Data Analyst", "critical": "Critical Reviewer", "creative": "Creative Coder", "synthesis": "Synthesis Advisor", "entrepreneur": "Entrepreneur", "common_person": "General User", "economist": "Economist", "lawyer": "Legal Advisor", "cost_controller": "Cost Analyst", "revenue_planner": "Revenue Planner"};

function presetAgent(tag: string): Agent {
  const persona = PRESET_PERSONAS.find(row => row.tag === tag);
  if (!persona) throw new Error(`Missing preset persona: ${tag}`);
  return {name:PRESET_ROLE_NAMES[tag] || persona.name,tag,persona:persona.persona,
    tools:[],...(tag === "synthesis" ? {is_primary:true} : {})};
}

export const PRESET_WORKFLOW_DEFINITIONS: Array<Workflow | null> = [
  {
    id: "ml_code_test",
    title: "ML Code Testing Pipeline",
    description:
      "Automated machine learning code testing workflow with parallel agents analyzing why this pipeline is optimal for ML testing scenarios.",
author: "ClawCross Team",
    tags: ["ml", "code", "pipeline"],
    category: "Engineering",
    stars: 128,
    forks: 34,
    icon: "🤖",
    internal_agents: [presetAgent("data"), presetAgent("critical"), presetAgent("creative"), presetAgent("synthesis")],
    yaml_content: `# ML Code Testing Pipeline
version: 2
repeat: false
plan:
- id: on1
  agent: Data Analyst
- id: on2
  agent: Critical Reviewer
- id: on3
  agent: Creative Coder
- id: on4
  agent: Synthesis Advisor
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
author: "ClawCross Team",
    tags: ["brainstorm", "creative", "ideation"],
    category: "Ideation",
    stars: 96,
    forks: 22,
    icon: "💡",
    internal_agents: [presetAgent("creative"), presetAgent("entrepreneur"), presetAgent("common_person"), presetAgent("critical"), presetAgent("synthesis")],
    yaml_content: `# Creative Brainstorm Trio
version: 2
repeat: true
plan:
- id: on1
  agent: Creative Coder
- id: on2
  agent: Entrepreneur
- id: on3
  agent: General User
- id: on4
  agent: Critical Reviewer
- id: on5
  agent: Synthesis Advisor
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
author: "ClawCross Team",
    tags: ["code", "review", "pipeline"],
    category: "Engineering",
    stars: 203,
    forks: 67,
    icon: "💻",
    internal_agents: [presetAgent("critical"), presetAgent("data"), presetAgent("synthesis")],
    yaml_content: `# Code Review Pipeline
version: 2
repeat: false
plan:
- id: on1
  agent: Critical Reviewer
- id: on2
  agent: Data Analyst
- id: on3
  agent: Synthesis Advisor
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
author: "ClawCross Team",
    tags: ["debate", "brainstorm"],
    category: "Business",
    stars: 75,
    forks: 18,
    icon: "🎙️",
    internal_agents: [presetAgent("economist"), presetAgent("lawyer"), presetAgent("entrepreneur"), presetAgent("cost_controller"), presetAgent("revenue_planner")],
    yaml_content: `# Business Strategy Debate
version: 2
repeat: true
plan:
- id: on1
  agent: Economist
- id: on2
  agent: Legal Advisor
- id: on3
  agent: Entrepreneur
- id: on4
  agent: Cost Analyst
- id: on5
  agent: Revenue Planner
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
author: "ClawCross Team",
    tags: ["pipeline", "data"],
    category: "Research",
    stars: 64,
    forks: 15,
    icon: "📊",
    internal_agents: [presetAgent("data"), presetAgent("economist"), presetAgent("critical"), presetAgent("synthesis"), presetAgent("creative")],
    yaml_content: `# Research Analysis DAG
version: 2
repeat: false
plan:
- id: on1
  agent: Data Analyst
- id: on2
  agent: Economist
- id: on3
  agent: Critical Reviewer
- id: on4
  agent: Synthesis Advisor
- id: on5
  agent: Creative Coder
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
    description: "A release Team with WeBot reviewers, a Codex implementer, and a Claude documentation agent.",
    author: "ClawCross Team",
    tags: ["team", "snapshot", "codex", "claude", "release"],
    category: "Engineering", stars: 156, forks: 42, icon: "🌐",
    yaml_content: `version: 2
repeat: false
plan:
- id: research
  agent: Data Analyst
  instruction: Analyze the supplied release context and evidence.
- id: review
  agent: Critical Reviewer
  instruction: Identify concrete defects and release risks in the supplied context.
- id: implement
  agent: CodePilot
  instruction: Implement the agreed candidate in the configured workspace; report
    what changed.
- id: document
  agent: DocWriter
  instruction: Prepare release notes and operator documentation from the implementation
    report.
- id: verify
  agent: Health Reviewer
  instruction: Review supplied test and service-health results. State missing evidence
    explicitly.
- id: summarize
  agent: Synthesis Advisor
  instruction: Combine implementation, documentation and validation into a release
    decision.
- id: handoff
  agent: Release Coordinator
  instruction: Produce the final handoff and checklist. Do not claim external notifications
    were sent.
edges:
- - research
  - implement
- - review
  - implement
- - implement
  - document
- - implement
  - verify
- - document
  - summarize
- - verify
  - summarize
- - summarize
  - handoff
- - handoff
  - __end__
`,
    detail: "Import creates the Team and its members. WeBot members use your configured model. Running CodePilot and DocWriter requires an explicitly installed acpx plus working Codex and Claude connections on your device. This sample contains no placeholder HTTP services, Slack webhooks, fabricated skill files or automatic alarms.",
    internal_agents: [presetAgent("data"), presetAgent("critical"), presetAgent("synthesis"),
      {name:"Health Reviewer",tag:"health_review",persona:"Review supplied test results and operational evidence. Distinguish verified facts from missing evidence. Do not invent external monitoring connections.",tools:[]},
      {name:"Release Coordinator",tag:"release_coordinator",persona:"Prepare a concrete release handoff from the Team results. Identify remaining work and never claim that notifications were delivered without evidence.",tools:[]}],
    external_agents: [
      {name:"CodePilot",platform:"codex",persona:"Implement the approved release work and verify the changes in your configured workspace.",meta:{acp:{clawcross_tools:true}}},
      {name:"DocWriter",platform:"claude",persona:"Prepare clear release notes, operating instructions and limitations from the supplied Team results.",meta:{acp:{clawcross_tools:true}}}
    ]
  },
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
  localizations: workflow.id === "multi_agent_team" ? {
    title:{en:workflow.title,zh:"发布就绪团队"},
    description:{en:workflow.description,zh:"由 WeBot 审核成员、Codex 开发成员和 Claude 文档成员协作的发布团队。"},
    detail:{en:workflow.detail,zh:"导入后创建团队及全部成员。WeBot 使用本机已配置的模型；运行 Codex 和 Claude 成员需要用户明确安装 acpx 并配置相应连接。本案例不包含虚构 HTTP 服务、Slack webhook、缺失的技能文件或自动闹钟。"}
  } : PRESET_WORKFLOW_LOCALIZATIONS[workflow.id] ?? workflow.localizations
}));

let builtinExpertsCache: Record<string, Expert> | null = null;

export function getBuiltinExperts(): Record<string, Expert> {
  if (builtinExpertsCache) {
    return builtinExpertsCache;
  }

  const experts: Record<string, Expert> = Object.fromEntries(PRESET_PERSONAS.map(row => [row.tag,{name:PRESET_ROLE_NAMES[row.tag] || row.name,tag:row.tag,persona:row.persona,temperature:row.temperature ?? 0.7}]));
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
