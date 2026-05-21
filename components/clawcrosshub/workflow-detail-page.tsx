"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Bot, Brain, Copy, Download, FileText, Github, GitBranch, LogOut, Star, UserCog, UserRound, Wrench } from "lucide-react";
import yaml from "js-yaml";

import { SiteHeader } from "@/components/clawcrosshub/site-header";
import { StableI18nText } from "@/components/clawcrosshub/stable-i18n-text";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildSnapshotFileName } from "@/lib/snapshot-name";
import { translateValue, useI18n } from "@/lib/i18n";
import {
  getExternalAgentPersona,
  pickAgentText,
  pickCronJobText,
  pickWorkflowTag,
  pickWorkflowText
} from "@/lib/workflow-localization";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import type { Agent, CronJob, Expert, GithubUser, SkillInfo, SupportedLocale, Workflow } from "@/lib/types";

const TAG_EMOJI: Record<string, string> = {
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
  custom: "⭐"
};

const detailActionButtonClass = "h-9 rounded-md border-border bg-background/80 text-foreground hover:bg-secondary";
const detailActionButtonActiveClass = "border-yellow-400/50 bg-yellow-400/10 text-yellow-500 hover:bg-yellow-400/15";

type ParsedNodeType = "expert" | "manual" | "all" | "selector" | "external";

type ParsedNode = {
  id: string;
  type: ParsedNodeType;
  displayName: string;
  lookupKeys: string[];
  label?: string;
  tooltipTitle?: string;
  tooltipDescription?: string;
};

type ParsedStep =
  | ParsedNode
  | {
      id: string;
      type: "parallel_group";
      children: Array<{
        id: string;
        type: "expert";
        displayName: string;
        lookupKeys: string[];
        groupId: string;
        tooltipTitle?: string;
        tooltipDescription?: string;
      }>;
    };

type ParsedSelectorEdge = {
  source: string;
  choices: Record<string, string>;
};

type ParsedConditionalEdge = {
  source: string;
  condition: string;
  then: string;
  else?: string;
};

type ParsedFlow = {
  nodes: ParsedStep[];
  dagEdges: Array<[string, string]> | null;
  selectorEdges: ParsedSelectorEdge[];
  conditionalEdges: ParsedConditionalEdge[];
};

type DiagramNodeType = "expert" | "parallel" | "manual" | "all" | "external" | "selector" | "_group";

type DiagramNode = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: DiagramNodeType;
  displayName?: string;
  lookupKeys?: string[];
  label?: string;
  groupLabel?: string;
  tooltipTitle?: string;
  tooltipDescription?: string;
};

type DiagramEdge = {
  sourceId: string;
  targetId: string;
  kind?: "fixed" | "parallel" | "conditional_then" | "conditional_else" | "selector" | "loop";
  label?: string;
};

type GraphLayout = {
  width: number;
  height: number;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

type EngineNode = {
  id?: string;
  x?: number;
  y?: number;
  name?: string;
  tag?: string;
  type?: string;
  emoji?: string;
  isSelector?: boolean;
};

type EngineEdge = {
  source?: string;
  target?: string;
};

type EngineConditionalEdge = {
  source?: string;
  condition?: string;
  then?: string;
  else?: string;
};

type EngineSelectorEdge = {
  source?: string;
  choices?: Record<string, string>;
};

type EngineGroup = {
  id?: string;
  name?: string;
  type?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
};

type EngineLayout = {
  nodes?: EngineNode[];
  edges?: EngineEdge[];
  conditionalEdges?: EngineConditionalEdge[];
  selectorEdges?: EngineSelectorEdge[];
  groups?: EngineGroup[];
};

type AgentLocalizationScopes = Array<"experts" | "internal_agents" | "external_agents">;
type CodeViewType = "yaml" | "python";

const GENERIC_AGENT_TAGS = new Set(["openclaw", "external", "ext", "custom", "selector", "selector_agent", "agent", "manual", "all_experts"]);

function isGenericAgentTag(value: string): boolean {
  return GENERIC_AGENT_TAGS.has(value.trim().toLowerCase());
}

function isExternalAgentReference(raw: string): boolean {
  const normalized = String(raw || "").trim().toLowerCase();
  const parts = normalized.split("#").map((part) => part.trim()).filter(Boolean);
  return normalized.startsWith("agent:") || normalized.startsWith("openclaw#") || normalized.startsWith("external#") || parts.includes("ext");
}

function parseAgent(rawStr: string): { displayName: string; lookupKeys: string[] } {
  const raw = String(rawStr || "").trim();
  if (!raw) {
    return { displayName: "", lookupKeys: [] };
  }

  if (raw.toLowerCase().startsWith("agent:")) {
    const agentName = raw.slice(6).trim();
    if (agentName) {
      return { displayName: agentName, lookupKeys: [agentName, raw, "openclaw"] };
    }
  }

  const parts = raw.split("#").map((part) => part.trim());
  const head = (parts[0] || "").trim();
  const headLower = head.toLowerCase();
  const marker = (parts[1] || "").trim().toLowerCase();

  if (parts.length >= 3 && ["ext", "external", "openclaw", "oasis", "agent"].includes(marker)) {
    const agentName = parts.slice(2).join("#").trim();
    if (agentName && !isGenericAgentTag(agentName)) {
      return { displayName: agentName, lookupKeys: [agentName, head, raw] };
    }
  }

  if (headLower === "custom" && parts.length >= 3) {
    const agentName = parts.slice(2).join("#").trim();
    return { displayName: agentName || head, lookupKeys: [agentName || head, raw, head] };
  }

  if ((headLower === "openclaw" || headLower === "external" || headLower === "ext" || headLower === "agent") && parts.length >= 2) {
    const agentName = (parts.length >= 3 ? parts.slice(2).join("#") : parts[parts.length - 1] || "").trim();
    if (agentName && !isGenericAgentTag(agentName)) {
      return { displayName: agentName, lookupKeys: [agentName, raw, head] };
    }
  }

  if (parts.some((part) => part.toLowerCase() === "ext") && parts.length >= 3) {
    const agentName = parts.slice(2).join("#").trim();
    return { displayName: agentName || head, lookupKeys: [agentName || head, raw, head] };
  }

  if (headLower === "custom" && parts.length >= 2) {
    const agentName = parts[parts.length - 1]?.trim() || "";
    if (agentName) {
      return { displayName: agentName, lookupKeys: [agentName, raw, head] };
    }
  }

  return { displayName: head || raw, lookupKeys: [head || raw, raw] };
}

function resolveDisplayNameFromEngineNode(node: EngineNode, index: number): { displayName: string; lookupKeys: string[]; label: string } {
  const rawName = String(node.name || "").trim();
  const rawTag = String(node.tag || "").trim();
  const parsedName = rawName ? parseAgent(rawName) : { displayName: "", lookupKeys: [] };
  const parsedTag = rawTag ? parseAgent(rawTag) : { displayName: "", lookupKeys: [] };

  let displayName = parsedName.displayName;
  const tagLooksStructured = rawTag.includes("#") || ["ext", "external", "openclaw", "oasis", "agent"].includes(rawTag.toLowerCase());
  if (tagLooksStructured && parsedTag.displayName && !isGenericAgentTag(parsedTag.displayName)) {
    displayName = parsedTag.displayName;
  }
  if (!displayName || isGenericAgentTag(displayName)) {
    if (parsedTag.displayName && !isGenericAgentTag(parsedTag.displayName)) {
      displayName = parsedTag.displayName;
    }
  }
  if (!displayName) {
    displayName = rawName || rawTag || `node_${index + 1}`;
  }

  const lookupSet = new Set<string>();
  [displayName, rawName, rawTag, ...parsedName.lookupKeys, ...parsedTag.lookupKeys].forEach((item) => {
    const value = String(item || "").trim();
    if (value) {
      lookupSet.add(value);
    }
  });

  const label = rawTag || parsedTag.displayName || displayName;
  return {
    displayName,
    lookupKeys: [...lookupSet],
    label
  };
}

function parseDependsOnIds(raw: string): string[] {
  const start = raw.indexOf("[");
  const end = raw.indexOf("]");
  if (start < 0 || end < 0 || end <= start) {
    return [];
  }

  return raw
    .slice(start + 1, end)
    .split(",")
    .map((value) => value.trim().replace(/^['\"]|['\"]$/g, ""))
    .filter(Boolean);
}

function parseYamlToFlowNodes(
  yamlStr: string,
  labels: { allExperts: string; manual: string; selector: string }
): ParsedFlow {
  try {
    const parsed = yaml.load(yamlStr || "");
    const root = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const plan = Array.isArray(root.plan) ? root.plan : [];

    const nodes: ParsedStep[] = [];
    const rawDagEdges: Array<[string, string]> = [];
    const dagIdMap: Record<string, string> = {};
    let nodeId = 0;

    const asRecord = (value: unknown): Record<string, unknown> | null => {
      return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    };
    const normalizeRef = (value: unknown): string => {
      if (typeof value === "string") return value.trim();
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      return "";
    };
    const parseDependsOnValue = (value: unknown): string[] => {
      if (Array.isArray(value)) {
        return value.map((item) => normalizeRef(item)).filter(Boolean);
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
          return parseDependsOnIds(`depends_on: ${trimmed}`);
        }
        return trimmed ? [trimmed] : [];
      }
      return [];
    };
    const parseChoices = (value: unknown): Record<string, string> => {
      const result: Record<string, string> = {};
      const row = asRecord(value);
      if (!row) return result;
      Object.entries(row).forEach(([choiceKey, target]) => {
        const targetRef = normalizeRef(target);
        if (targetRef) {
          result[String(choiceKey)] = targetRef;
        }
      });
      return result;
    };
    const normalizeTooltipText = (value: unknown): string => normalizeRef(value);

    plan.forEach((stepRaw) => {
      if (typeof stepRaw === "string") {
        const info = parseAgent(stepRaw);
        nodes.push({ id: `n${nodeId++}`, type: "expert", displayName: info.displayName, lookupKeys: info.lookupKeys });
        return;
      }

      const step = asRecord(stepRaw);
      if (!step) {
        return;
      }

      const stepId = normalizeRef(step.id);

      if (Array.isArray(step.parallel)) {
        const groupId = `g${nodeId++}`;
        const children = step.parallel
          .map((item) => {
            if (typeof item === "string") {
              const info = parseAgent(item);
              return {
                displayName: info.displayName,
                lookupKeys: info.lookupKeys,
                tooltipTitle: undefined,
                tooltipDescription: undefined
              };
            }
            const childRow = asRecord(item);
            const childExpert = childRow ? normalizeRef(childRow.expert) : "";
            if (!childExpert) {
              return null;
            }
            const info = parseAgent(childExpert);
            const instruction = normalizeTooltipText(childRow?.instruction);
            return {
              displayName: info.displayName,
              lookupKeys: info.lookupKeys,
              tooltipTitle: info.displayName || undefined,
              tooltipDescription: instruction || undefined
            };
          })
          .filter(Boolean)
          .map((info) => {
            const parsedInfo = info as {
              displayName: string;
              lookupKeys: string[];
              tooltipTitle?: string;
              tooltipDescription?: string;
            };
            return {
              id: `n${nodeId++}`,
              type: "expert" as const,
              displayName: parsedInfo.displayName,
              lookupKeys: parsedInfo.lookupKeys,
              groupId,
              tooltipTitle: parsedInfo.tooltipTitle,
              tooltipDescription: parsedInfo.tooltipDescription
            };
          });
        if (children.length) {
          nodes.push({ id: groupId, type: "parallel_group", children });
          if (stepId) {
            dagIdMap[stepId] = groupId;
          }
        }
        return;
      }

      let type: ParsedNodeType | null = null;
      let displayName = "";
      let lookupKeys: string[] = [];
      let tooltipTitle = "";
      let tooltipDescription = "";

      if (step.all_experts !== undefined) {
        type = "all";
        displayName = labels.allExperts;
      } else if (step.manual !== undefined) {
        type = "manual";
        const manualRecord = asRecord(step.manual);
        const content = normalizeRef(step.content) || normalizeRef(manualRecord?.content);
        const author = normalizeRef(step.author) || normalizeRef(manualRecord?.author);
        const manual = normalizeRef(step.manual);
        displayName = author || content || (manual && manual !== "true" ? manual : labels.manual);
        lookupKeys = author ? [author, "manual"] : ["manual"];
        tooltipTitle = author || displayName || labels.manual;
        tooltipDescription = content;
      } else {
        const expertRaw = normalizeRef(step.expert);
        if (expertRaw) {
          const info = parseAgent(expertRaw);
          type = step.selector === true ? "selector" : isExternalAgentReference(expertRaw) ? "external" : "expert";
          displayName = info.displayName || (type === "selector" ? labels.selector : expertRaw);
          lookupKeys = info.lookupKeys;
          tooltipTitle = displayName;
          tooltipDescription = normalizeTooltipText(step.instruction);
        }
      }

      if (!type) {
        return;
      }

      const nid = `n${nodeId++}`;
      nodes.push({
        id: nid,
        type,
        displayName,
        lookupKeys,
        label: stepId || undefined,
        tooltipTitle: tooltipTitle || undefined,
        tooltipDescription: tooltipDescription || undefined
      });

      if (stepId) {
        dagIdMap[stepId] = nid;
      }

      const dependsOn = parseDependsOnValue(step.depends_on);
      const targetRef = stepId || nid;
      dependsOn.forEach((src) => {
        rawDagEdges.push([src, targetRef]);
      });
    });

    if (Array.isArray(root.edges)) {
      root.edges.forEach((edgeRaw) => {
        if (Array.isArray(edgeRaw) && edgeRaw.length >= 2) {
          const src = normalizeRef(edgeRaw[0]);
          const tgt = normalizeRef(edgeRaw[1]);
          if (src && tgt) {
            rawDagEdges.push([src, tgt]);
          }
          return;
        }
        const edge = asRecord(edgeRaw);
        if (!edge) return;
        const src = normalizeRef(edge.source);
        const tgt = normalizeRef(edge.target);
        if (src && tgt) {
          rawDagEdges.push([src, tgt]);
        }
      });
    }

    let selectorEdges: ParsedSelectorEdge[] = [];
    if (Array.isArray(root.selector_edges)) {
      selectorEdges = root.selector_edges
        .map((entryRaw) => {
          const entry = asRecord(entryRaw);
          if (!entry) return null;
          const source = normalizeRef(entry.source);
          const choices = parseChoices(entry.choices);
          if (!source || !Object.keys(choices).length) return null;
          return { source, choices };
        })
        .filter(Boolean) as ParsedSelectorEdge[];
    }

    let conditionalEdges: ParsedConditionalEdge[] = [];
    if (Array.isArray(root.conditional_edges)) {
      conditionalEdges = root.conditional_edges
        .map((entryRaw) => {
          const entry = asRecord(entryRaw);
          if (!entry) return null;
          const source = normalizeRef(entry.source);
          const then = normalizeRef(entry.then);
          const elseTarget = normalizeRef(entry.else);
          const condition = normalizeRef(entry.condition);
          if (!source || !then) return null;
          return {
            source,
            condition,
            then,
            else: elseTarget || undefined
          };
        })
        .filter(Boolean) as ParsedConditionalEdge[];
    }

    let dagEdges: Array<[string, string]> | null = rawDagEdges
      .map(([src, tgt]) => [dagIdMap[src] || src, dagIdMap[tgt] || tgt] as [string, string])
      .filter(([src, tgt]) => Boolean(src && tgt));
    if (!dagEdges.length) {
      dagEdges = null;
    }

    selectorEdges = selectorEdges.map((se) => ({
      source: dagIdMap[se.source] || se.source,
      choices: Object.fromEntries(
        Object.entries(se.choices)
          .map(([choice, target]) => [choice, dagIdMap[target] || target])
          .filter(([, target]) => Boolean(target))
      )
    }));
    conditionalEdges = conditionalEdges.map((ce) => ({
      source: dagIdMap[ce.source] || ce.source,
      condition: ce.condition,
      then: dagIdMap[ce.then] || ce.then,
      else: ce.else ? dagIdMap[ce.else] || ce.else : undefined
    }));

    return { nodes, dagEdges, selectorEdges, conditionalEdges };
  } catch {
    return { nodes: [], dagEdges: null, selectorEdges: [], conditionalEdges: [] };
  }
}

function buildGraphLayout(parsed: ParsedFlow): GraphLayout {
  const steps = parsed.nodes || [];
  const dagEdges = parsed.dagEdges;

  if (!steps.length) {
    return { width: 920, height: 280, nodes: [], edges: [] };
  }

  const NW = 150;
  const NH = 54;
  const HGAP = 70;
  const VGAP = 26;
  const PAD = 30;

  const layoutNodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];

  // Collect all node IDs (including flattening parallel groups)
  const allNodeIds: string[] = [];
  const nodeMap: Record<string, ParsedStep> = {};
  const nodeOrder = new Map<string, number>();
  steps.forEach((step) => {
    if (step.type === "parallel_group") {
      (step.children || []).forEach((child) => {
        allNodeIds.push(child.id);
        nodeMap[child.id] = {
          id: child.id,
          type: "expert",
          displayName: child.displayName,
          lookupKeys: child.lookupKeys,
          tooltipTitle: child.tooltipTitle,
          tooltipDescription: child.tooltipDescription
        } as ParsedNode;
        nodeOrder.set(child.id, nodeOrder.size);
      });
    } else {
      allNodeIds.push(step.id);
      nodeMap[step.id] = step;
      nodeOrder.set(step.id, nodeOrder.size);
    }
  });

  // Build all edge list (dagEdges + selector + conditional)
  const allEdgePairs: Array<{ src: string; tgt: string }> = [];
  if (dagEdges?.length) {
    dagEdges.forEach(([src, tgt]) => allEdgePairs.push({ src, tgt }));
  }
  (parsed.selectorEdges || []).forEach((se) => {
    Object.values(se.choices).forEach((tgt) => allEdgePairs.push({ src: se.source, tgt }));
  });
  (parsed.conditionalEdges || []).forEach((ce) => {
    allEdgePairs.push({ src: ce.source, tgt: ce.then });
    if (ce.else) allEdgePairs.push({ src: ce.source, tgt: ce.else });
  });

  const hasAdvancedEdges = (parsed.selectorEdges?.length ?? 0) > 0 || (parsed.conditionalEdges?.length ?? 0) > 0;

  // If we have DAG edges or advanced edges, use topological column layout
  if ((dagEdges?.length || hasAdvancedEdges) && allEdgePairs.length > 0) {
    const dagOnlyEdges = dagEdges ?? [];
    const dagAdj = new Map<string, string[]>();
    allNodeIds.forEach((id) => {
      dagAdj.set(id, []);
    });
    dagOnlyEdges.forEach(([src, tgt]) => {
      dagAdj.get(src)?.push(tgt);
    });

    const pathCache = new Map<string, boolean>();
    const hasDagPath = (sourceId: string, targetId: string): boolean => {
      const cacheKey = `${sourceId}->${targetId}`;
      const cached = pathCache.get(cacheKey);
      if (typeof cached === "boolean") {
        return cached;
      }

      const visited = new Set<string>();
      const queue = [sourceId];
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || visited.has(current)) {
          continue;
        }
        if (current === targetId) {
          pathCache.set(cacheKey, true);
          return true;
        }
        visited.add(current);
        (dagAdj.get(current) ?? []).forEach((next) => {
          if (!visited.has(next)) {
            queue.push(next);
          }
        });
      }

      pathCache.set(cacheKey, false);
      return false;
    };

    const layoutEdgePairs: Array<{ src: string; tgt: string }> = [];
    dagOnlyEdges.forEach(([src, tgt]) => {
      layoutEdgePairs.push({ src, tgt });
    });
    (parsed.selectorEdges || []).forEach((se) => {
      Object.values(se.choices).forEach((tgt) => {
        if (!hasDagPath(tgt, se.source)) {
          layoutEdgePairs.push({ src: se.source, tgt });
        }
      });
    });
    (parsed.conditionalEdges || []).forEach((ce) => {
      if (!hasDagPath(ce.then, ce.source)) {
        layoutEdgePairs.push({ src: ce.source, tgt: ce.then });
      }
      if (ce.else && !hasDagPath(ce.else, ce.source)) {
        layoutEdgePairs.push({ src: ce.source, tgt: ce.else });
      }
    });

    const inDeg: Record<string, number> = {};
    const adj: Record<string, string[]> = {};
    const predecessors: Record<string, string[]> = {};
    allNodeIds.forEach((id) => {
      inDeg[id] = 0;
      adj[id] = [];
      predecessors[id] = [];
    });
    layoutEdgePairs.forEach(({ src, tgt }) => {
      if (adj[src] && inDeg[tgt] !== undefined) {
        adj[src].push(tgt);
        predecessors[tgt].push(src);
        inDeg[tgt]++;
      }
    });

    const queue = allNodeIds
      .filter((id) => inDeg[id] === 0)
      .sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
    const topo: string[] = [];
    const columnIndex: Record<string, number> = {};
    while (queue.length > 0) {
      const id = queue.shift()!;
      topo.push(id);
      const preds = predecessors[id] || [];
      columnIndex[id] = preds.length ? Math.max(...preds.map((pred) => columnIndex[pred] + 1)) : 0;

      (adj[id] || []).forEach((tgt) => {
        inDeg[tgt] -= 1;
        if (inDeg[tgt] === 0) {
          queue.push(tgt);
          queue.sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0));
        }
      });
    }

    allNodeIds.forEach((id) => {
      if (typeof columnIndex[id] !== "number") {
        columnIndex[id] = 0;
        topo.push(id);
      }
    });

    const columns = new Map<number, string[]>();
    topo.forEach((id) => {
      const column = columnIndex[id] ?? 0;
      if (!columns.has(column)) {
        columns.set(column, []);
      }
      columns.get(column)!.push(id);
    });

    const positioned = new Map<string, DiagramNode>();
    const sortedColumns = [...columns.entries()].sort((a, b) => a[0] - b[0]);
    sortedColumns.forEach(([column, ids]) => {
      const cx = PAD + column * (NW + HGAP);
      const orderedIds = [...ids].sort((a, b) => {
        const aPreds = predecessors[a] || [];
        const bPreds = predecessors[b] || [];
        const aAvg = aPreds.length
          ? aPreds.reduce((sum, pred) => sum + (positioned.get(pred)?.y ?? PAD), 0) / aPreds.length
          : Number.POSITIVE_INFINITY;
        const bAvg = bPreds.length
          ? bPreds.reduce((sum, pred) => sum + (positioned.get(pred)?.y ?? PAD), 0) / bPreds.length
          : Number.POSITIVE_INFINITY;
        if (aAvg !== bAvg) {
          return aAvg - bAvg;
        }
        return (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0);
      });

      orderedIds.forEach((id, idx) => {
        const step = nodeMap[id];
        if (!step) return;
        const pNode = step as ParsedNode;
        const ny = PAD + idx * (NH + VGAP);
        const layoutNode: DiagramNode = {
          id,
          x: cx,
          y: ny,
          w: NW,
          h: NH,
          type: pNode.type || "expert",
          displayName: pNode.displayName,
          lookupKeys: pNode.lookupKeys,
          label: pNode.label,
          tooltipTitle: pNode.tooltipTitle,
          tooltipDescription: pNode.tooltipDescription
        };
        layoutNodes.push(layoutNode);
        positioned.set(id, layoutNode);
      });
    });

    // Add fixed (DAG) edges
    if (dagEdges?.length) {
      dagEdges.forEach(([sourceId, targetId]) => {
        edges.push({ sourceId, targetId });
      });
    }
  } else {
    // Original linear layout for v1 or simple sequences
    let cx = PAD;
    let cy = PAD;
    let prevIds: string[] = [];

    steps.forEach((step) => {
      if (step.type === "parallel_group") {
        const children = step.children || [];
        const groupH = children.length * NH + Math.max(0, children.length - 1) * VGAP;
        const startY = cy;
        const childIds: string[] = [];

        children.forEach((child, index) => {
          const ny = startY + index * (NH + VGAP);
          layoutNodes.push({
            id: child.id,
            x: cx,
            y: ny,
            w: NW,
            h: NH,
            type: "parallel",
            displayName: child.displayName,
            lookupKeys: child.lookupKeys,
            tooltipTitle: child.tooltipTitle,
            tooltipDescription: child.tooltipDescription
          });
          childIds.push(child.id);
        });

        const groupPad = 12;
        layoutNodes.push({
          id: step.id,
          x: cx - groupPad,
          y: startY - groupPad,
          w: NW + groupPad * 2,
          h: groupH + groupPad * 2,
          type: "_group",
          groupLabel: "⚡ Parallel"
        });

        prevIds.forEach((sourceId) => {
          childIds.forEach((targetId) => {
            edges.push({ sourceId, targetId });
          });
        });

        prevIds = childIds;
        cx += NW + HGAP;
        cy = Math.max(cy, startY + groupH);
        return;
      }

      layoutNodes.push({
        id: step.id,
        x: cx,
        y: PAD,
        w: NW,
        h: NH,
        type: step.type,
        displayName: step.displayName,
        lookupKeys: step.lookupKeys,
        label: step.label,
        tooltipTitle: step.tooltipTitle,
        tooltipDescription: step.tooltipDescription
      });

      prevIds.forEach((sourceId) => {
        edges.push({ sourceId, targetId: step.id });
      });

      prevIds = [step.id];
      cx += NW + HGAP;
    });
  }

  // Add selector edges from v2 YAML
  if (parsed.selectorEdges?.length) {
    parsed.selectorEdges.forEach((se) => {
      Object.entries(se.choices)
        .sort(([a], [b]) => Number(a) - Number(b))
        .forEach(([choice, targetId]) => {
          edges.push({
            sourceId: se.source,
            targetId,
            kind: "selector",
            label: `choice ${choice}`
          });
        });
    });
  }

  // Add conditional edges from v2 YAML
  if (parsed.conditionalEdges?.length) {
    parsed.conditionalEdges.forEach((ce) => {
      const condLabel = ce.condition.length > 25 ? ce.condition.slice(0, 22) + "..." : ce.condition;
      edges.push({
        sourceId: ce.source,
        targetId: ce.then,
        kind: "conditional_then",
        label: condLabel
      });
      if (ce.else) {
        edges.push({
          sourceId: ce.source,
          targetId: ce.else,
          kind: "conditional_else",
          label: condLabel
        });
      }
    });
  }

  // Center single-row nodes vertically when there are multi-row columns
  let maxBottom = 0;
  layoutNodes.forEach((node) => {
    if (node.type !== "_group") {
      maxBottom = Math.max(maxBottom, node.y + node.h);
    }
  });

  // For columns with only 1 node, center vertically
  if (maxBottom > PAD + NH) {
    const columnMap: Record<number, DiagramNode[]> = {};
    layoutNodes.forEach((node) => {
      if (node.type !== "_group") {
        if (!columnMap[node.x]) columnMap[node.x] = [];
        columnMap[node.x].push(node);
      }
    });
    const centerY = (maxBottom + PAD) / 2;
    Object.values(columnMap).forEach((colNodes) => {
      if (colNodes.length === 1) {
        colNodes[0].y = centerY - colNodes[0].h / 2;
      }
    });
  }

  let totalW = PAD;
  let totalH = PAD;
  layoutNodes.forEach((node) => {
    totalW = Math.max(totalW, node.x + node.w + PAD);
    totalH = Math.max(totalH, node.y + node.h + PAD);
  });

  return {
    width: totalW,
    height: totalH,
    nodes: layoutNodes,
    edges
  };
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function toShortLabel(value: string, maxLen = 28): string {
  return value.length > maxLen ? `${value.slice(0, maxLen - 1)}...` : value;
}

function buildGraphLayoutFromEngine(raw: unknown, labels: { selector: string }): GraphLayout | null {
  const data = raw as EngineLayout;
  if (!data || !Array.isArray(data.nodes) || !data.nodes.length) {
    return null;
  }

  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const groups: DiagramNode[] = [];
  const PAD = 30;
  const NODE_W = 150;
  const NODE_H = 54;

  data.nodes.forEach((node, index) => {
    const id = String(node.id || `n${index}`);
    const rawType = String(node.type || "expert");
    let type: DiagramNodeType = "expert";
    if (rawType === "manual") type = "manual";
    else if (rawType === "external") type = "external";
    else if (node.isSelector) type = "selector";

    const x = asNumber(node.x, PAD + index * 200);
    const y = asNumber(node.y, PAD);
    const resolved = resolveDisplayNameFromEngineNode(node, index);
    nodes.push({
      id,
      x,
      y,
      w: NODE_W,
      h: NODE_H,
      type,
      displayName: resolved.displayName,
      lookupKeys: resolved.lookupKeys,
      label: node.isSelector ? labels.selector : resolved.label
    });
  });

  (data.groups || []).forEach((group, index) => {
    groups.push({
      id: String(group.id || `g${index}`),
      x: asNumber(group.x, PAD),
      y: asNumber(group.y, PAD),
      w: asNumber(group.w, NODE_W + 24),
      h: asNumber(group.h, NODE_H + 24),
      type: "_group",
      groupLabel: String(group.name || group.type || "Group")
    });
  });

  (data.edges || []).forEach((edge) => {
    if (!edge.source || !edge.target) {
      return;
    }
    edges.push({
      sourceId: String(edge.source),
      targetId: String(edge.target),
      kind: "fixed"
    });
  });

  (data.conditionalEdges || []).forEach((edge) => {
    if (!edge.source || !edge.then) {
      return;
    }
    const conditionLabel = edge.condition ? toShortLabel(edge.condition) : "";
    edges.push({
      sourceId: String(edge.source),
      targetId: String(edge.then),
      kind: "conditional_then",
      label: conditionLabel
    });
    if (edge.else) {
      edges.push({
        sourceId: String(edge.source),
        targetId: String(edge.else),
        kind: "conditional_else",
        label: conditionLabel
      });
    }
  });

  (data.selectorEdges || []).forEach((edge) => {
    if (!edge.source || !edge.choices || typeof edge.choices !== "object") {
      return;
    }
    Object.entries(edge.choices)
      .sort(([a], [b]) => Number(a) - Number(b))
      .forEach(([choice, target]) => {
        edges.push({
          sourceId: String(edge.source),
          targetId: String(target),
          kind: "selector",
          label: `choice ${choice}`
        });
      });
  });

  const map = new Map<string, DiagramNode>();
  [...groups, ...nodes].forEach((node) => {
    map.set(node.id, node);
  });

  edges.forEach((edge) => {
    const source = map.get(edge.sourceId);
    const target = map.get(edge.targetId);
    if (!source || !target) {
      return;
    }
    if ((edge.kind === "fixed" || !edge.kind) && target.x < source.x - 8) {
      edge.kind = "loop";
    } else if (!edge.kind && (source.type === "parallel" || target.type === "parallel")) {
      edge.kind = "parallel";
    }
  });

  let totalW = PAD;
  let totalH = PAD;
  [...groups, ...nodes].forEach((node) => {
    totalW = Math.max(totalW, node.x + node.w + PAD);
    totalH = Math.max(totalH, node.y + node.h + PAD);
  });

  return {
    width: totalW,
    height: totalH,
    nodes: [...groups, ...nodes],
    edges
  };
}

function mergeLayoutMetadata(layout: GraphLayout, parsed: ParsedFlow): GraphLayout {
  type ParsedLayoutMetadata = {
    id: string;
    type: DiagramNodeType;
    displayName: string;
    lookupKeys: string[];
    label?: string;
    tooltipTitle?: string;
    tooltipDescription?: string;
  };

  const parsedNodes: ParsedLayoutMetadata[] = parsed.nodes.flatMap((node) => {
    if (node.type === "parallel_group") {
      return node.children.map((child) => ({
        id: child.id,
        type: "parallel" as DiagramNodeType,
        displayName: child.displayName,
        lookupKeys: child.lookupKeys,
        tooltipTitle: child.tooltipTitle,
        tooltipDescription: child.tooltipDescription
      }));
    }

    return [
      {
        id: node.id,
        type: node.type,
        displayName: node.displayName,
        lookupKeys: node.lookupKeys,
        label: node.label,
        tooltipTitle: node.tooltipTitle,
        tooltipDescription: node.tooltipDescription
      }
    ];
  });
  const layoutNodes = layout.nodes.filter((node) => node.type !== "_group");
  if (!parsedNodes.length || parsedNodes.length !== layoutNodes.length) {
    return layout;
  }

  let metadataIndex = 0;
  const nodes = layout.nodes.map((node) => {
    if (node.type === "_group") {
      return node;
    }

    const parsedNode = parsedNodes[metadataIndex];
    metadataIndex += 1;
    if (!parsedNode) {
      return node;
    }

    return {
      ...node,
      type: parsedNode.type || node.type,
      displayName: parsedNode.displayName || node.displayName,
      lookupKeys: parsedNode.lookupKeys.length ? parsedNode.lookupKeys : node.lookupKeys,
      label: parsedNode.label || node.label,
      tooltipTitle: parsedNode.tooltipTitle || node.tooltipTitle,
      tooltipDescription: parsedNode.tooltipDescription || node.tooltipDescription
    };
  });

  return { ...layout, nodes };
}

function buildExpertsMap(workflow: Workflow): Record<string, Expert> {
  const result: Record<string, Expert> = {};
  const details = Array.isArray(workflow.experts_detail) ? workflow.experts_detail : [];
  details.forEach((expert) => {
    if (expert?.tag) {
      result[expert.tag] = expert;
    }
    if (expert?.name) {
      result[expert.name] = expert;
    }
  });

  const internalAgents = Array.isArray(workflow.internal_agents)
    ? workflow.internal_agents
    : Array.isArray(workflow.oasis_agents)
      ? workflow.oasis_agents
      : [];
  internalAgents.forEach((agent) => {
    if (agent.name && !result[agent.name]) {
      result[agent.name] = {
        name: agent.name,
        tag: String(agent.tag ?? ""),
        persona: String(agent.persona ?? ""),
        temperature: Number(agent.temperature ?? 0.7)
      };
    }
  });

  const externalAgents = Array.isArray(workflow.external_agents)
    ? workflow.external_agents
    : Array.isArray(workflow.openclaw_agents)
      ? workflow.openclaw_agents
      : [];
  externalAgents.forEach((agent) => {
    const name = String(agent.name ?? "").trim();
    const tag = String(agent.tag ?? "").trim();
    if (!name) {
      return;
    }
    const expertLike: Expert = {
      name,
      tag,
      persona: getExternalAgentPersona(agent),
      temperature: typeof agent.temperature === "number" ? agent.temperature : 0.7
    };
    [name, tag, `${tag}#ext#${name}`, `${tag}#external#${name}`].forEach((key) => {
      if (key && !result[key]) {
        result[key] = expertLike;
      }
    });
  });

  return result;
}

function getNodeClass(type: DiagramNodeType): string {
  if (type === "parallel") return "fg-node parallel-node";
  if (type === "manual") return "fg-node manual-node";
  if (type === "all") return "fg-node all-node";
  if (type === "external") return "fg-node external-node";
  if (type === "selector") return "fg-node selector-node";
  return "fg-node";
}

function renderNodeIcon(type: DiagramNodeType, tag?: string): ReactNode {
  const iconClass = "h-5 w-5";
  if (type === "external") return <Bot className={iconClass} aria-hidden="true" />;
  if (type === "manual") return <FileText className={iconClass} aria-hidden="true" />;
  if (type === "selector") return <GitBranch className={iconClass} aria-hidden="true" />;
  if (type === "parallel") return <GitBranch className={iconClass} aria-hidden="true" />;
  if (type === "all") return <Brain className={iconClass} aria-hidden="true" />;
  if (tag === "creative") return "🎨";
  if (tag === "critical") return "🔍";
  if (tag === "data") return "📊";
  if (tag === "synthesis") return "🎯";
  return <UserCog className={iconClass} aria-hidden="true" />;
}

function renderAgentIcon(sourceType: "oasis" | "openclaw" | "external" | "custom", tag?: string): ReactNode {
  const iconClass = "h-6 w-6";
  if (sourceType === "external" || sourceType === "openclaw") return <Bot className={iconClass} aria-hidden="true" />;
  if (sourceType === "custom") return <UserRound className={iconClass} aria-hidden="true" />;
  if (tag === "creative" || tag === "synthesis") return <Brain className={iconClass} aria-hidden="true" />;
  return <UserCog className={iconClass} aria-hidden="true" />;
}

export function WorkflowDetailPage({ workflowId }: { workflowId: string }) {
  const { locale, t } = useI18n();
  const currentLocale = locale as SupportedLocale;
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [pythonOpen, setPythonOpen] = useState(false);
  const graphRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [engineLayoutRaw, setEngineLayoutRaw] = useState<unknown | null>(null);
  // Track the cleanup function for the canvas engine so we can re-init
  const canvasCleanupRef = useRef<(() => void) | null>(null);
  const [siteOrigin, setSiteOrigin] = useState("");
  const [clawcrossReturnUrl, setClawcrossReturnUrl] = useState("");
  const [clawcrossReturnOrigin, setClawcrossReturnOrigin] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [expandedPersonas, setExpandedPersonas] = useState<Record<string, boolean>>({});
  const [expandedSkills, setExpandedSkills] = useState<Record<string, boolean>>({});
  const [user, setUser] = useState<GithubUser | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [starred, setStarred] = useState(false);
  const [selectedYamlFile, setSelectedYamlFile] = useState<string | null>(null);
  const [selectedPythonFile, setSelectedPythonFile] = useState<string | null>(null);
  const [selectedCodeType, setSelectedCodeType] = useState<CodeViewType>("yaml");


  useEffect(() => {
    fetchWorkflow().catch(() => {
      // no-op
    });
    checkAuth();
    checkStarStatus();
  }, [workflowId]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSiteOrigin(window.location.origin);
      const params = new URLSearchParams(window.location.search);
      setClawcrossReturnUrl((params.get("return_url") || "").trim());
      setClawcrossReturnOrigin((params.get("return_origin") || "").trim());
    }
  }, []);

  async function checkAuth() {
    try {
      const response = await fetch("/api/auth/status");
      const data = (await response.json()) as { logged_in: boolean; user?: GithubUser };
      if (data.logged_in && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }

  async function fetchWorkflow() {
    setLoading(true);
    try {
      const workflowResp = await fetch(`/api/workflows/${workflowId}`);
      if (!workflowResp.ok) {
        setWorkflow(null);
        setEngineLayoutRaw(null);
        return;
      }

      const data = (await workflowResp.json()) as Workflow;
      setWorkflow(data);

      try {
        const layoutResp = await fetch(`/api/workflows/${workflowId}/layout`);
        if (layoutResp.ok) {
          const layoutData = await layoutResp.json();
          setEngineLayoutRaw(layoutData);
        } else {
          setEngineLayoutRaw(null);
        }
      } catch {
        setEngineLayoutRaw(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function checkStarStatus() {
    try {
      const resp = await fetch(`/api/workflows/${workflowId}/star`);
      if (resp.ok) {
        const data = (await resp.json()) as { starred: boolean };
        setStarred(data.starred);
      }
    } catch {
      // no-op
    }
  }

  async function star() {
    if (!user) {
      setLoginOpen(true);
      return;
    }
    try {
      const resp = await fetch(`/api/workflows/${workflowId}/star`, {
        method: "POST"
      });
      if (resp.status === 401) {
        setLoginOpen(true);
        return;
      }
      if (resp.ok) {
        const data = (await resp.json()) as { stars: number; starred: boolean };
        setStarred(data.starred);
        await fetchWorkflow();
      }
    } catch {
      // no-op
    }
  }

  async function copyToClipboard(text: string): Promise<boolean> {
    // Try modern Clipboard API first
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fall through to legacy approach
      }
    }
    // Legacy fallback using a hidden textarea + execCommand
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  async function copyCodeBlock() {
    const ok = await copyToClipboard(activeCodeContent);
    if (ok) {
      window.alert(selectedCodeType === "python" ? "Python copied." : t("detail.yamlCopied"));
    } else {
      window.alert(selectedCodeType === "python" ? "Failed to copy Python." : t("detail.yamlCopyFail"));
    }
  }

  function downloadZip() {
    window.location.href = `/api/workflows/${workflowId}/download`;
  }

  function importToClawcross() {
    if (!clawcrossReturnUrl) return;
    const payload = {
      type: "clawcross_hub_import",
      hub_download_url: curlDownloadUrl,
      team_name: workflowId
    };
    if (typeof window !== "undefined" && window.opener && clawcrossReturnOrigin) {
      try {
        window.opener.postMessage(payload, clawcrossReturnOrigin);
        window.close();
        return;
      } catch {
        // fall through to URL redirect
      }
    }
    const target = new URL(clawcrossReturnUrl);
    target.searchParams.set("hub_download_url", curlDownloadUrl);
    target.searchParams.set("team_name", workflowId);
    window.location.assign(target.toString());
  }

  async function copyCurlUrl() {
    const ok = await copyToClipboard(curlDownloadCommand);
    if (ok) {
      window.alert(t("detail.curlCopied"));
    } else {
      window.alert(t("detail.curlCopyFail"));
    }
  }

  // Flow canvas pan/zoom engine (matches Flask initFlowCanvas)
  // Uses a ref-callback so the engine initializes the instant React
  // mounts the .flow-graph container with no timing / stale-ref issues.
  // All pan/zoom state lives in a plain JS object (like Flask's fgState)
  // and we manipulate the DOM directly with zero React re-renders.
  const initFlowCanvas = useCallback((container: HTMLDivElement | null) => {
    // Cleanup previous engine if any
    if (canvasCleanupRef.current) {
      canvasCleanupRef.current();
      canvasCleanupRef.current = null;
    }

    // Store the container in graphRef for other code that reads it
    (graphRef as React.MutableRefObject<HTMLDivElement | null>).current = container;
    if (!container) return;

    // Shared mutable state (never triggers React re-render)
    const fgState = { zoom: 1, panX: 0, panY: 0, panning: null as null | { startX: number; startY: number; origPanX: number; origPanY: number } };

    // Apply current transform to DOM directly
    function fgApplyTransform() {
      const inner = container!.querySelector(".flow-graph-inner") as HTMLElement | null;
      if (inner) {
        inner.style.transform = `translate(${fgState.panX}px, ${fgState.panY}px) scale(${fgState.zoom})`;
      }
      const label = container!.querySelector(".fg-zoom-label") as HTMLElement | null;
      if (label) label.textContent = Math.round(fgState.zoom * 100) + "%";
    }

    // Auto-fit: scale graph to fit container
    function autoFit() {
      const inner = container!.querySelector(".flow-graph-inner") as HTMLElement | null;
      if (!inner) return;
      const cw = container!.offsetWidth || 600;
      const ch = container!.offsetHeight || 280;
      const iw = parseInt(inner.style.width) || cw;
      const ih = parseInt(inner.style.height) || ch;
      const fitZoom = Math.min(cw / iw, ch / ih, 1);
      if (fitZoom < 1) {
        fgState.zoom = fitZoom * 0.9;
        fgState.panX = (cw - iw * fgState.zoom) / 2;
        fgState.panY = (ch - ih * fgState.zoom) / 2;
      } else {
        fgState.zoom = 1;
        fgState.panX = (cw - iw) / 2;
        fgState.panY = (ch - ih) / 2;
      }
      fgApplyTransform();
    }

    // Initial auto-fit (double-rAF so the inner element has its final size)
    requestAnimationFrame(() => requestAnimationFrame(autoFit));

    // Mouse wheel to zoom, centered on cursor
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement)?.closest?.(".fg-panel")) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const oldZoom = fgState.zoom;
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      fgState.zoom = Math.min(3, Math.max(0.15, oldZoom + delta));
      fgState.panX = mx - (mx - fgState.panX) * (fgState.zoom / oldZoom);
      fgState.panY = my - (my - fgState.panY) * (fgState.zoom / oldZoom);
      fgApplyTransform();
    };
    container.addEventListener("wheel", onWheel, { passive: false });

    // Mouse drag to pan canvas
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      const tgt = e.target as HTMLElement;
      const isBlank = tgt === container || tgt.classList.contains("flow-graph-inner") || tgt.tagName === "svg";
      if (e.button === 0 && !isBlank) return;
      e.preventDefault();
      fgState.panning = { startX: e.clientX, startY: e.clientY, origPanX: fgState.panX, origPanY: fgState.panY };
      container.classList.add("fg-grabbing");
    };
    container.addEventListener("mousedown", onMouseDown);

    const onMouseMove = (e: MouseEvent) => {
      if (!fgState.panning) return;
      const p = fgState.panning;
      fgState.panX = p.origPanX + (e.clientX - p.startX);
      fgState.panY = p.origPanY + (e.clientY - p.startY);
      fgApplyTransform();
    };
    document.addEventListener("mousemove", onMouseMove);

    const onMouseUp = () => {
      if (fgState.panning) {
        fgState.panning = null;
        container.classList.remove("fg-grabbing");
      }
    };
    document.addEventListener("mouseup", onMouseUp);

    // Touch support (mobile)
    let touchState: { mode: string; initDist?: number; initZoom?: number; initPanX?: number; initPanY?: number; mx?: number; my?: number } | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t0 = e.touches[0], t1 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        touchState = { mode: "zoom", initDist: dist, initZoom: fgState.zoom, initPanX: fgState.panX, initPanY: fgState.panY,
          mx: (t0.clientX + t1.clientX) / 2, my: (t0.clientY + t1.clientY) / 2 };
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        const target = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
        const isBlank = target === container || (target && target.classList.contains("flow-graph-inner"));
        if (isBlank) {
          e.preventDefault();
          fgState.panning = { startX: t.clientX, startY: t.clientY, origPanX: fgState.panX, origPanY: fgState.panY };
          touchState = { mode: "pan" };
        }
      }
    };
    container.addEventListener("touchstart", onTouchStart, { passive: false });

    const onTouchMove = (e: TouchEvent) => {
      if (!touchState) return;
      e.preventDefault();
      if (touchState.mode === "zoom" && e.touches.length >= 2) {
        const t0 = e.touches[0], t1 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        const scale = dist / (touchState.initDist || 1);
        const newZoom = Math.min(3, Math.max(0.15, (touchState.initZoom || 1) * scale));
        const rect = container.getBoundingClientRect();
        const mx = (touchState.mx || 0) - rect.left;
        const my = (touchState.my || 0) - rect.top;
        fgState.zoom = newZoom;
        fgState.panX = mx - (mx - (touchState.initPanX || 0)) * (newZoom / (touchState.initZoom || 1));
        fgState.panY = my - (my - (touchState.initPanY || 0)) * (newZoom / (touchState.initZoom || 1));
        fgApplyTransform();
      } else if (touchState.mode === "pan" && fgState.panning) {
        const t = e.touches[0];
        const p = fgState.panning;
        fgState.panX = p.origPanX + (t.clientX - p.startX);
        fgState.panY = p.origPanY + (t.clientY - p.startY);
        fgApplyTransform();
      }
    };
    container.addEventListener("touchmove", onTouchMove, { passive: false });

    const onTouchEnd = () => {
      fgState.panning = null;
      touchState = null;
    };
    container.addEventListener("touchend", onTouchEnd, { passive: false });

    // Navigation buttons (wired via data-attributes)
    function fgZoom(delta: number) {
      const rect = container!.getBoundingClientRect();
      const mx = rect.width / 2, my = rect.height / 2;
      const oldZoom = fgState.zoom;
      fgState.zoom = Math.min(3, Math.max(0.15, oldZoom + delta));
      fgState.panX = mx - (mx - fgState.panX) * (fgState.zoom / oldZoom);
      fgState.panY = my - (my - fgState.panY) * (fgState.zoom / oldZoom);
      fgApplyTransform();
    }
    const onZoomIn = () => fgZoom(0.15);
    const onZoomOut = () => fgZoom(-0.15);

    const navZoomIn = container.querySelector("[data-fg-action='zoom-in']");
    const navZoomOut = container.querySelector("[data-fg-action='zoom-out']");
    const navReset = container.querySelector("[data-fg-action='reset']");
    navZoomIn?.addEventListener("click", onZoomIn);
    navZoomOut?.addEventListener("click", onZoomOut);
    navReset?.addEventListener("click", autoFit);

    // Store cleanup function
    canvasCleanupRef.current = () => {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      navZoomIn?.removeEventListener("click", onZoomIn);
      navZoomOut?.removeEventListener("click", onZoomOut);
      navReset?.removeEventListener("click", autoFit);
    };
  }, []);

  // Cleanup engine on unmount
  useEffect(() => {
    return () => { canvasCleanupRef.current?.(); };
  }, []);

  function toggleAgentGroup(groupId: string) {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }

  function togglePersona(agentId: string) {
    setExpandedPersonas((prev) => ({ ...prev, [agentId]: !prev[agentId] }));
  }

  function toggleSkill(skillId: string) {
    setExpandedSkills((prev) => ({ ...prev, [skillId]: !prev[skillId] }));
  }

  // Active YAML content (supports multi-YAML switching)
  const yamlFileEntries = useMemo(() => {
    if (!workflow?.yaml_files || typeof workflow.yaml_files !== "object") return null;
    const entries = Object.entries(workflow.yaml_files);
    return entries.length > 1 ? entries : null;
  }, [workflow?.yaml_files]);

  const activeYamlContent = useMemo(() => {
    if (yamlFileEntries && selectedYamlFile) {
      const found = yamlFileEntries.find(([name]) => name === selectedYamlFile);
      if (found) return found[1];
    }
    return workflow?.yaml_content || "";
  }, [workflow?.yaml_content, yamlFileEntries, selectedYamlFile]);

  const pythonFileEntries = useMemo(() => {
    if (!workflow?.python_files || typeof workflow.python_files !== "object") return null;
    const entries = Object.entries(workflow.python_files);
    return entries.length > 0 ? entries : null;
  }, [workflow?.python_files]);

  const activePythonContent = useMemo(() => {
    if (pythonFileEntries && selectedPythonFile) {
      const found = pythonFileEntries.find(([name]) => name === selectedPythonFile);
      if (found) return found[1];
    }
    return workflow?.python_content || "";
  }, [workflow?.python_content, pythonFileEntries, selectedPythonFile]);

  const hasYamlContent = activeYamlContent.trim().length > 0;
  const hasPythonContent = activePythonContent.trim().length > 0;

  const activeCodeContent = selectedCodeType === "python" ? activePythonContent : activeYamlContent;

  // Auto-select first YAML file when workflow loads
  useEffect(() => {
    if (yamlFileEntries && !selectedYamlFile) {
      setSelectedYamlFile(yamlFileEntries[0][0]);
    }
  }, [yamlFileEntries, selectedYamlFile]);

  useEffect(() => {
    if (pythonFileEntries && !selectedPythonFile) {
      setSelectedPythonFile(pythonFileEntries[0][0]);
    }
  }, [pythonFileEntries, selectedPythonFile]);

  useEffect(() => {
    if (hasYamlContent) {
      setSelectedCodeType((prev) => (prev === "python" && hasPythonContent ? prev : "yaml"));
      return;
    }
    if (hasPythonContent) {
      setSelectedCodeType("python");
    }
  }, [hasPythonContent, hasYamlContent, workflow?.id]);

  const expertsMap = useMemo(() => (workflow ? buildExpertsMap(workflow) : {}), [workflow]);
  const detailNodeLabels = useMemo(
    () => ({
      allExperts: t("detail.allExperts"),
      manual: t("detail.manualStep"),
      selector: t("detail.selector")
    }),
    [t]
  );
  const parsedFlow = useMemo(() => parseYamlToFlowNodes(activeYamlContent, detailNodeLabels), [activeYamlContent, detailNodeLabels]);
  const engineLayout = useMemo(() => buildGraphLayoutFromEngine(engineLayoutRaw, detailNodeLabels), [detailNodeLabels, engineLayoutRaw]);
  const preferClientLayout = parsedFlow.selectorEdges.length > 0 || parsedFlow.conditionalEdges.length > 0;
  const layout = useMemo(() => {
    const baseLayout = !preferClientLayout && engineLayout ? engineLayout : buildGraphLayout(parsedFlow);
    return mergeLayoutMetadata(baseLayout, parsedFlow);
  }, [engineLayout, parsedFlow, preferClientLayout]);

  const internalAgents = useMemo(
    () => (workflow && Array.isArray(workflow.internal_agents) ? workflow.internal_agents : Array.isArray(workflow?.oasis_agents) ? workflow.oasis_agents : []),
    [workflow]
  );
  const externalAgents = useMemo(
    () =>
      workflow && Array.isArray(workflow.external_agents)
        ? workflow.external_agents
        : Array.isArray(workflow?.openclaw_agents)
          ? workflow.openclaw_agents
          : [],
    [workflow]
  );
  // Skills and cron helpers
  const skillsInfo = useMemo(() => (workflow?.skills_info as Record<string, Record<string, SkillInfo>> | undefined) ?? {}, [workflow]);
  const cronJobs = useMemo(() => (workflow?.cron_jobs as Record<string, CronJob[]> | undefined) ?? {}, [workflow]);
  const teamSkills = useMemo(() => skillsInfo._team || null, [skillsInfo]);
  const globalSkills = useMemo(() => skillsInfo._global || null, [skillsInfo]);
  const teamCronJobs = useMemo(() => {
    if (Array.isArray(cronJobs._team) && cronJobs._team.length > 0) return cronJobs._team;
    if (Array.isArray(cronJobs._global) && cronJobs._global.length > 0) return cronJobs._global;
    const merged = Object.entries(cronJobs)
      .filter(([key, jobs]) => !key.startsWith("_") && Array.isArray(jobs) && jobs.length > 0)
      .flatMap(([, jobs]) => jobs);
    return merged;
  }, [cronJobs]);

  function getAgentSkills(agentName: string): Record<string, SkillInfo> | null {
    if (skillsInfo[agentName]) return skillsInfo[agentName];
    const lower = agentName.toLowerCase();
    for (const key of Object.keys(skillsInfo)) {
      if (key.toLowerCase() === lower) return skillsInfo[key];
    }
    return null;
  }

  function getAgentCronJobs(agentName: string): CronJob[] {
    if (cronJobs[agentName]) return cronJobs[agentName];
    const lower = agentName.toLowerCase();
    for (const key of Object.keys(cronJobs)) {
      if (key.toLowerCase() === lower) return cronJobs[key];
    }
    return [];
  }

  function renderSkillMeta(skillData: SkillInfo) {
    return (
      <div className="agent-skill-meta">
        {skillData.meta?.version && <span>📦 v{skillData.meta.version}</span>}
        {skillData.meta?.slug && <span>🏷️ {String(skillData.meta.slug)}</span>}
        {skillData.origin?.registry && <span style={{ opacity: 0.7 }}>🌐 {String(skillData.origin.registry)}</span>}
        {skillData.origin?.installedVersion && <span>📥 v{String(skillData.origin.installedVersion)}</span>}
        {skillData.files?.length ? <span>📄 {skillData.files.length}</span> : null}
      </div>
    );
  }

  function getSkillDataEntries(scope: string, skillName: string): Array<{ path: string; content: string }> {
    const rawData = workflow?.skills_data;
    if (!rawData || typeof rawData !== "object") {
      return [];
    }

    const prefixes =
      scope === "_team"
        ? [`skills/${skillName}/`, `clawcross_team_skills/${skillName}/`]
        : scope === "_global"
          ? [`clawcross_user_skills/${skillName}/`, `skills/${skillName}/`]
          : [`skills/${scope}/${skillName}/`, `skills/${skillName}/`];
    return Object.entries(rawData)
      .flatMap(([relPath, content]) => {
        if (typeof content !== "string") {
          return [];
        }
        const prefix = prefixes.find((candidate) => relPath.startsWith(candidate));
        return prefix ? [{ path: relPath.slice(prefix.length), content }] : [];
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  function decodeSkillText(content: string): string | null {
    try {
      const binary = atob(content);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (/[\x00-\x08\x0E-\x1F]/.test(decoded)) {
        return null;
      }
      return decoded;
    } catch {
      return null;
    }
  }

  function normalizeCronJob(job: CronJob, fallbackName: string): CronJob {
    const row = (job ?? {}) as Record<string, unknown>;
    const fallbackSchedule = typeof row.schedule === "string" ? row.schedule : undefined;
    const atValue =
      typeof row.at === "string" || typeof row.at === "number"
        ? row.at
        : typeof row.run_at === "string" || typeof row.run_at === "number"
          ? row.run_at
          : undefined;
    return {
      ...job,
      name: String(row.name ?? row.task_id ?? fallbackName),
      enabled: typeof row.enabled === "boolean" ? row.enabled : true,
      scheduleKind: String(row.scheduleKind ?? row.schedule_type ?? ""),
      cron: String(row.cron ?? fallbackSchedule ?? ""),
      at: atValue,
      every: typeof row.every === "string" ? row.every : undefined,
      mode: String(row.mode ?? row.target_type ?? ""),
      session: typeof row.session === "string" ? row.session : undefined,
      message: String(row.message ?? row.text ?? ""),
    };
  }

  function renderSkillItem(scope: string, skillName: string, skillData: SkillInfo) {
    const skillId = `${scope}:${skillName}`;
    const isExpanded = expandedSkills[skillId] ?? false;
    const entries = getSkillDataEntries(scope, skillName);
    const skillMdEntry = entries.find((entry) => entry.path === "SKILL.md");
    const primaryEntry =
      skillMdEntry ||
      entries.find((entry) => entry.path.endsWith(".md")) ||
      entries.find((entry) => entry.path.endsWith(".json")) ||
      entries.find((entry) => entry.path.endsWith(".py"));
    const skillMdText = skillMdEntry ? decodeSkillText(skillMdEntry.content) : null;
    const decoded = (isExpanded ? primaryEntry : skillMdEntry) ? decodeSkillText((isExpanded ? primaryEntry : skillMdEntry)!.content) : null;
    const previewText = skillMdText
      ? skillMdText
          .replace(/^---[\s\S]*?---\s*/, "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 4)
          .join("\n")
          .slice(0, 420)
      : "";

    return (
      <div key={skillId} className="agent-skill-item">
        <button type="button" className="agent-persona-toggle w-full justify-between text-left" onClick={() => toggleSkill(skillId)}>
          <span className="inline-flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="agent-skill-name">{skillName}</span>
          </span>
          <span>{isExpanded ? "-" : "+"}</span>
        </button>
        {renderSkillMeta(skillData)}
        {!isExpanded && previewText ? (
          <pre className="mt-2 max-h-28 overflow-hidden whitespace-pre-wrap rounded-md border bg-muted p-3 text-xs leading-5 text-muted-foreground">{previewText}</pre>
        ) : null}
        {isExpanded ? (
          <div className="mt-2 space-y-2">
            {entries.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {entries.map((entry) => (
                  <span key={entry.path} className="agent-node-chip">{entry.path}</span>
                ))}
              </div>
            ) : null}
            {decoded ? (
              <pre className="max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs leading-5 text-foreground">{decoded}</pre>
            ) : primaryEntry ? (
              <div className="text-xs text-muted-foreground">{primaryEntry.path}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  // Classify agents into 4 groups (matching Flask version)
  type ClassifiedAgent = {
    name: string;
    tag: string;
    emoji: string;
    persona: string;
    temperature?: number;
    skills?: string;
    stages: string[];
    sourceType: "oasis" | "openclaw" | "external" | "custom";
    localizationScopes: AgentLocalizationScopes;
    agentSkills: Record<string, SkillInfo> | null;
    agentCronJobs: CronJob[];
    config?: Record<string, unknown>;
  };

  const classifiedAgents = useMemo(() => {
    if (!workflow) return { oasis: [] as ClassifiedAgent[], openclaw: [] as ClassifiedAgent[], external: [] as ClassifiedAgent[], custom: [] as ClassifiedAgent[] };

    const TAG_CAT: Record<string, string> = { creative: "🎨", critical: "🔍", data: "📊", synthesis: "🎯", economist: "📈", entrepreneur: "🚀", lawyer: "⚖️", cost_controller: "💰", revenue_planner: "📊", common_person: "🧑" };

    const expertsList = Array.isArray(workflow.experts_detail) ? workflow.experts_detail : [];
    const intAgents = internalAgents;
    let ocList: Agent[] = [];
    if (Array.isArray(externalAgents)) {
      ocList = externalAgents;
    } else if (externalAgents && typeof externalAgents === "object") {
      ocList = Object.entries(externalAgents as Record<string, Record<string, unknown>>).map(([k, v]) => ({ name: k, ...v } as Agent));
    }

    const oasisAgents: ClassifiedAgent[] = [];
    const openclawAgents: ClassifiedAgent[] = [];
    const externalAgentsList: ClassifiedAgent[] = [];
    const customAgentsList: ClassifiedAgent[] = [];
    const oasisTags = new Set<string>();

    // 1) Experts to Oasis
    expertsList.forEach((e) => {
      const tag = e.tag || "unknown";
      oasisTags.add(tag);
      oasisAgents.push({
        name: e.name || tag, tag, emoji: TAG_CAT[tag] || TAG_EMOJI[tag] || "*",
        persona: e.persona || "", temperature: e.temperature, stages: [],
        sourceType: "oasis", localizationScopes: ["experts", "internal_agents"], agentSkills: getAgentSkills(e.name || tag), agentCronJobs: getAgentCronJobs(e.name || tag)
      });
    });

    // 2) ocList to OpenClaw vs External
    ocList.forEach((entry) => {
      const isOC = entry.tag === "openclaw" || Boolean(entry.workspace_files) || Boolean((entry.config as Record<string, unknown>)?.workspace_files);
      const aName = String(entry.name || "?");
      const identity = getExternalAgentPersona(entry);
      const skills = ((entry.config as Record<string, unknown>)?.skills as string[])?.join(", ") || "";
      const agent: ClassifiedAgent = {
        name: aName, tag: String(entry.tag || (isOC ? "openclaw" : "external")),
        emoji: isOC ? "🐾" : "🔗", persona: identity, skills, stages: [],
        config: entry.config as Record<string, unknown>, sourceType: isOC ? "openclaw" : "external",
        localizationScopes: ["external_agents"],
        agentSkills: getAgentSkills(aName), agentCronJobs: getAgentCronJobs(aName)
      };
      if (isOC) openclawAgents.push(agent); else externalAgentsList.push(agent);
    });

    // 3) Internal agents not in oasis to Custom
    intAgents.forEach((a) => {
      if (oasisTags.has(String(a.tag))) return;
      if (String(a.session || "").startsWith("oc_")) return;
      customAgentsList.push({
        name: String(a.name || a.tag || "?"), tag: String(a.tag || "custom"),
        emoji: TAG_EMOJI[String(a.tag || "")] || "*", persona: String(a.persona || ""),
        temperature: a.temperature ? Number(a.temperature) : undefined, stages: [],
        sourceType: "custom", localizationScopes: ["internal_agents", "experts"], agentSkills: getAgentSkills(String(a.name || a.tag || "")), agentCronJobs: getAgentCronJobs(String(a.name || a.tag || ""))
      });
    });

    return { oasis: oasisAgents, openclaw: openclawAgents, external: externalAgentsList, custom: customAgentsList };
  }, [workflow, internalAgents, externalAgents]);
  const curlDownloadUrl = `${siteOrigin || "https://clawcross.net"}/api/workflows/${workflowId}/download`;
  const curlDownloadCommand = `curl -L -o "${buildSnapshotFileName(workflow?.title || "workflow")}" "${curlDownloadUrl}"`;
  const localizeWorkflowText = useCallback(
    (field: "title" | "description" | "detail" | "category", fallback: string): string => {
      return workflow ? pickWorkflowText(workflow, field, fallback, currentLocale) : fallback;
    },
    [currentLocale, workflow]
  );
  const localizeAgentName = useCallback(
    (name: string, tag: string | undefined, scopes: AgentLocalizationScopes): string => {
      return pickAgentText(workflow?.localizations, scopes, name, tag, "name", name, currentLocale);
    },
    [currentLocale, workflow?.localizations]
  );
  const localizeAgentPersona = useCallback(
    (name: string, tag: string | undefined, scopes: AgentLocalizationScopes, fallback: string): string => {
      return pickAgentText(workflow?.localizations, scopes, name, tag, "persona", fallback, currentLocale);
    },
    [currentLocale, workflow?.localizations]
  );
  const localizeTag = useCallback(
    (tag: string | undefined): string => {
      if (!tag) {
        return "";
      }
      return translateValue(t, "tag", tag);
    },
    [t]
  );
  const localizeWorkflowTag = useCallback(
    (tag: string): string => {
      const translated = translateValue(t, "tag", tag);
      if (translated !== tag) {
        return translated;
      }
      return workflow ? pickWorkflowTag(workflow, tag, currentLocale) : tag;
    },
    [currentLocale, t, workflow]
  );

  if (loading) {
    return <div className="py-24 text-center text-muted-foreground">{t("detail.loading")}</div>;
  }

  if (!workflow) {
    return (
      <div className="container py-12">
        <p className="text-center text-muted-foreground">{t("detail.notFound")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader activePage="explore">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 gap-2">
                {user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar_url} alt={user.login} className="h-6 w-6 rounded-full" />
                ) : (
                  <UserRound className="h-4 w-4" />
                )}
                {user.name || user.login}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("header.signedInAs")} {user.login}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/profile/${user.login}`}>
                  <UserRound className="mr-2 h-4 w-4" />
                  {t("header.myProfile")}
                </Link>
              </DropdownMenuItem>
              {user.html_url ? (
                <DropdownMenuItem asChild>
                  <a href={user.html_url} target="_blank" rel="noreferrer">
                    <Github className="mr-2 h-4 w-4" />
                    {t("header.githubProfile")}
                  </a>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href="/auth/logout">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("header.logout")}
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <a href="/auth/github" className={buttonVariants({ variant: "outline" })}>
            <Github className="h-4 w-4" />
            <StableI18nText translationKey="header.signIn" />
          </a>
        )}
      </SiteHeader>

      <main className="container py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {t("detail.backToExplore")}
        </Link>

        <section className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="text-5xl">{workflow.icon || "📦"}</div>
            <h1 className="text-3xl font-bold">{localizeWorkflowText("title", workflow.title)}</h1>
            <p className="text-sm text-muted-foreground">
              {t("detail.by")} {workflow.author} · {workflow.source === "preset" ? t("detail.official") : t("detail.community")} · ⭐ {workflow.stars || 0} · 🔀 {workflow.forks || 0}
            </p>
            <p className="max-w-3xl text-sm text-muted-foreground">{localizeWorkflowText("description", workflow.description)}</p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                className={starred ? `${detailActionButtonClass} ${detailActionButtonActiveClass}` : detailActionButtonClass}
                onClick={star}
              >
                <Star className={`h-4 w-4 ${starred ? "fill-yellow-400 text-yellow-400" : ""}`} />
                {starred ? t("detail.starred") : t("detail.star")}
              </Button>
              <Button variant="outline" className={detailActionButtonClass} onClick={copyCodeBlock}>
                <Copy className="h-4 w-4" />
                {selectedCodeType === "python" ? "Copy Python" : t("detail.copyYaml")}
              </Button>
              <Button
                variant="outline"
                className={detailActionButtonClass}
                onClick={copyCurlUrl}
                title={t("detail.copyCurl")}
                aria-label={t("detail.copyCurl")}
              >
                <Copy className="h-4 w-4" />
                {t("detail.copyCurl")}
              </Button>
              {clawcrossReturnUrl ? (
                <Button variant="outline" className={detailActionButtonClass} onClick={importToClawcross}>
                  <Download className="h-4 w-4" />
                  {t("detail.importToClawcross")}
                </Button>
              ) : null}
              <Button variant="outline" className={detailActionButtonClass} onClick={downloadZip}>
                <Download className="h-4 w-4" />
                {t("detail.downloadZip")}
              </Button>
            </div>
          </div>
        </section>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="secondary">{workflow.repeat ? t("detail.repeat") : t("detail.runOnce")}</Badge>
          <Badge variant="outline">📊 {workflow.steps || 0} {t("detail.steps")}</Badge>
          {(workflow.tags || []).map((tag) => (
            <Badge key={tag} variant="outline">
              {localizeWorkflowTag(tag)}
            </Badge>
          ))}
        </div>

        {workflow.detail ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t("detail.aboutWorkflow")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{localizeWorkflowText("detail", workflow.detail)}</p>
            </CardContent>
          </Card>
        ) : null}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("detail.teamSnapshot")}</CardTitle>
            <CardDescription>
              {(() => {
                const intCount = internalAgents.length || classifiedAgents.oasis.length;
                const extCount = externalAgents.length || (classifiedAgents.openclaw.length + classifiedAgents.external.length + classifiedAgents.custom.length);
                return `${t("detail.internal")} ${intCount} · ${t("detail.external")} ${extCount}`;
              })()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">{t("detail.teamMembers")}</p>
              <div className="flex flex-wrap gap-2">
                {/* Internal agents (from internal_agents or experts_detail fallback) */}
                {internalAgents.length > 0
                  ? internalAgents.map((agent) => (
                      <Badge key={`team-int-${agent.name}-${agent.tag}`} variant="outline" className="border-emerald-500/50 text-emerald-400">
                        {t("detail.internalBadge")} · {TAG_EMOJI[String(agent.tag || "")] || "⭐"} {localizeAgentName(String(agent.name || ""), agent.tag ? String(agent.tag) : undefined, ["internal_agents", "experts"])}
                      </Badge>
                    ))
                  : classifiedAgents.oasis.map((agent, idx) => (
                      <Badge key={`team-oasis-${agent.name}-${idx}`} variant="outline" className="border-emerald-500/50 text-emerald-400">
                        {t("detail.internalBadge")} · {agent.emoji} {localizeAgentName(agent.name, agent.tag, agent.localizationScopes)}
                      </Badge>
                    ))}
                {/* External agents */}
                {externalAgents.length > 0
                  ? externalAgents.map((agent) => (
                      <Badge key={`team-ext-${agent.name}-${String(agent.tag)}`} variant="outline" className="border-blue-500/50 text-blue-300">
                        {t("detail.externalBadge")} · <Bot className="h-3.5 w-3.5" aria-hidden="true" /> {localizeAgentName(String(agent.name || ""), agent.tag ? String(agent.tag) : undefined, ["external_agents"])}
                      </Badge>
                    ))
                  : [...classifiedAgents.openclaw, ...classifiedAgents.external, ...classifiedAgents.custom].map((agent, idx) => (
                      <Badge key={`team-clf-${agent.name}-${idx}`} variant="outline" className="border-blue-500/50 text-blue-300">
                        {t("detail.externalBadge")} · {agent.emoji} {localizeAgentName(agent.name, agent.tag, agent.localizationScopes)}
                      </Badge>
                    ))}
                {/* Fallback if truly no agents at all */}
                {internalAgents.length === 0 && externalAgents.length === 0 && classifiedAgents.oasis.length === 0 && classifiedAgents.openclaw.length === 0 && classifiedAgents.external.length === 0 && classifiedAgents.custom.length === 0 && (
                  <span className="text-xs text-muted-foreground">{t("detail.noAgentData")}</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {teamSkills && Object.keys(teamSkills).length > 0 ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t("detail.skills")}</CardTitle>
              <CardDescription>{Object.keys(teamSkills).length} {t("detail.skills")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="agent-skills-section mt-0">
                {Object.entries(teamSkills).map(([skillName, skillData]) => renderSkillItem("_team", skillName, skillData))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {globalSkills && Object.keys(globalSkills).length > 0 ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t("detail.skills")} (Global)</CardTitle>
              <CardDescription>{Object.keys(globalSkills).length} {t("detail.skills")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="agent-skills-section mt-0">
                {Object.entries(globalSkills).map(([skillName, skillData]) => renderSkillItem("_global", skillName, skillData))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {teamCronJobs.length > 0 ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t("detail.cronJobs")}</CardTitle>
              <CardDescription>{teamCronJobs.length} {t("detail.cronJobs")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="agent-cron-section mt-0">
                {teamCronJobs.map((rawJob, jIdx) => {
                  const job = normalizeCronJob(rawJob, t("detail.unnamedJob"));
                  return (
                  <div key={`team-cron-${jIdx}`} className="agent-cron-item">
                    <div className="flex items-center gap-1.5">
                      <span className="agent-cron-name">{pickCronJobText(workflow?.localizations, "_team", jIdx, "name", String(job.name || t("detail.unnamedJob")), currentLocale)}</span>
                      <span className={job.enabled ? "agent-cron-badge-enabled" : "agent-cron-badge-disabled"}>
                        {job.enabled ? t("detail.enabled") : t("detail.disabled")}
                      </span>
                    </div>
                    <div className="agent-cron-detail">
                      {job.scheduleKind && <span>📋 {String(job.scheduleKind)}</span>}
                      {job.cron && <span>🕐 {String(job.cron)}</span>}
                      {job.at && <span>📅 {new Date(job.at).toLocaleString()}</span>}
                      {job.every && <span>🔄 every {String(job.every)}</span>}
                      {job.mode && <span>📢 {String(job.mode)}</span>}
                      {job.session && <span>🔗 {String(job.session)}</span>}
                    </div>
                    {job.message ? (
                      <div className="agent-cron-msg">💬 {pickCronJobText(workflow?.localizations, "_team", jIdx, "message", String(job.message), currentLocale).slice(0, 120)}</div>
                    ) : null}
                  </div>
                )})}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* ── Workflow YAML file switcher (for teams with multiple YAML files) ── */}
        {yamlFileEntries && yamlFileEntries.length > 1 && (
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("detail.workflowSwitcher")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {yamlFileEntries.map(([fileName]) => (
                  <Button
                    key={fileName}
                    variant={selectedYamlFile === fileName ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedYamlFile(fileName)}
                    className="text-xs"
                  >
                    File {fileName.replace(/\.ya?ml$/i, "")}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {pythonFileEntries && pythonFileEntries.length > 1 && (
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Python Files</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {pythonFileEntries.map(([fileName]) => (
                  <Button
                    key={fileName}
                    variant={selectedPythonFile === fileName ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedPythonFile(fileName)}
                    className="text-xs"
                  >
                    {"<>"} {fileName.replace(/\.py$/i, "")}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CardTitle>{t("detail.workflowDiagram")}</CardTitle>
              {engineLayout && !preferClientLayout ? (
                <Badge variant="outline" className="border-violet-500/60 text-violet-300">
                  {t("detail.engineV2")}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {layout.nodes.length ? (
              <div className="rounded-md border bg-muted p-4">
                <div className="flow-graph" ref={initFlowCanvas} style={{ minHeight: "400px" }}>
                  <div
                    ref={innerRef}
                    className="flow-graph-inner"
                    style={{
                      width: `${Math.max(860, layout.width)}px`,
                      height: `${Math.max(260, layout.height)}px`,
                    }}
                  >
                    <svg className="flow-edges" width={Math.max(860, layout.width)} height={Math.max(260, layout.height)}>
                      <defs>
                        <marker id="fg-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                          <path d="M0,0 L8,3 L0,6" fill="#58a6ff" />
                        </marker>
                        <marker id="fg-arrow-green" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                          <path d="M0,0 L8,3 L0,6" fill="#3fb950" />
                        </marker>
                        <marker id="fg-arrow-orange" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                          <path d="M0,0 L8,3 L0,6" fill="#f59e0b" />
                        </marker>
                        <marker id="fg-arrow-purple" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                          <path d="M0,0 L8,3 L0,6" fill="#a855f7" />
                        </marker>
                      </defs>

                      {layout.edges.map((edge, index) => {
                        const source = layout.nodes.find((node) => node.id === edge.sourceId);
                        const target = layout.nodes.find((node) => node.id === edge.targetId);
                        if (!source || !target || source.type === "_group" || target.type === "_group") {
                          return null;
                        }

                        const x1 = source.x + source.w;
                        const y1 = source.y + source.h / 2;
                        const x2 = target.x;
                        const y2 = target.y + target.h / 2;
                        const cpx = (x1 + x2) / 2;
                        const isParallel = source.type === "parallel" || target.type === "parallel" || edge.kind === "parallel";
                        const isLoop = edge.kind === "loop" || x2 < x1 - 8;
                        const color =
                          edge.kind === "conditional_then"
                            ? "#3fb950"
                            : edge.kind === "conditional_else"
                              ? "#f59e0b"
                              : edge.kind === "selector"
                                ? "#a855f7"
                                : isParallel
                                  ? "#3fb950"
                                  : isLoop
                                    ? "#38bdf8"
                                    : "#58a6ff";
                        const marker =
                          edge.kind === "conditional_then"
                            ? "url(#fg-arrow-green)"
                            : edge.kind === "conditional_else"
                              ? "url(#fg-arrow-orange)"
                              : edge.kind === "selector"
                                ? "url(#fg-arrow-purple)"
                                : isParallel
                                  ? "url(#fg-arrow-green)"
                                  : "url(#fg-arrow)";
                        const dash = edge.kind === "conditional_else" || edge.kind === "loop" ? "6 4" : undefined;
                        const path = isLoop
                          ? `M${x1},${y1} C${x1 + 60},${y1 - 70} ${x2 - 60},${y2 - 70} ${x2},${y2}`
                          : `M${x1},${y1} C${cpx},${y1} ${cpx},${y2} ${x2},${y2}`;
                        const labelX = isLoop ? (x1 + x2) / 2 : cpx;
                        const labelY = isLoop ? Math.min(y1, y2) - 42 : (y1 + y2) / 2 - 10;

                        return (
                          <g key={`${edge.sourceId}_${edge.targetId}_${index}`}>
                            <path d={path} stroke={color} strokeWidth="2" fill="none" markerEnd={marker} opacity="0.8" strokeDasharray={dash} />
                            {edge.label ? (
                              <text x={labelX} y={labelY} fill={color} fontSize="10" textAnchor="middle" fontWeight="600">
                                {edge.label}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                    </svg>

                    {layout.nodes
                      .filter((node) => node.type === "_group")
                      .map((group) => (
                        <div
                          key={group.id}
                          className="fg-group"
                          style={{ left: `${group.x}px`, top: `${group.y}px`, width: `${group.w}px`, height: `${group.h}px` }}
                        >
                          <span className="fg-group-label">{group.groupLabel || t("detail.parallel")}</span>
                        </div>
                      ))}

                    {layout.nodes
                      .filter((node) => node.type !== "_group")
                      .map((node) => {
                        const keys = node.lookupKeys || (node.displayName ? [node.displayName] : []);
                        const firstKey = keys[0] || node.displayName || "";
                        const info = keys.map((key) => expertsMap[key]).find(Boolean) || (node.displayName ? expertsMap[node.displayName] : undefined);
                        const tagLabel = keys.find((key) => key && key !== node.displayName && !key.includes("#")) || "";
                        const nodeIcon = renderNodeIcon(node.type, info?.tag || tagLabel || firstKey);
                        const nodeLocalizationScopes: AgentLocalizationScopes = node.type === "external" ? ["external_agents"] : ["experts", "internal_agents"];
                        const localizedInfoName = info
                          ? localizeAgentName(info.name || node.displayName || "", info.tag, nodeLocalizationScopes)
                          : node.displayName || "";
                        const localizedInfoPersona = info
                          ? localizeAgentPersona(info.name || node.displayName || "", info.tag, nodeLocalizationScopes, info.persona || "")
                          : "";
                        const fallbackTooltipTitle = node.tooltipTitle || localizedInfoName || node.displayName || "";
                        const fallbackTooltipDescription = node.tooltipDescription || "";
                        const shouldShowTooltip = Boolean(info || fallbackTooltipTitle || fallbackTooltipDescription);

                        return (
                          <div
                            key={node.id}
                            className={getNodeClass(node.type)}
                            style={{ left: `${node.x}px`, top: `${node.y}px`, width: `${node.w}px`, height: `${node.h}px` }}
                          >
                            <div className="fg-port port-in" />
                            <span className="fg-emoji">{nodeIcon}</span>
                            <div className="fg-info">
                              <div className="fg-name">{localizedInfoName || node.displayName}</div>
                              {tagLabel ? <div className="fg-tag">{localizeTag(tagLabel)}</div> : null}
                            </div>
                            <div className="fg-port port-out" />
                            {shouldShowTooltip ? (
                              <div className="agent-tooltip">
                                <div className="tt-name">
                                  {info ? (TAG_EMOJI[info.tag] || nodeIcon) : nodeIcon} {info ? (localizedInfoName || info.name || node.displayName) : fallbackTooltipTitle}
                                </div>
                                {info ? <div className="tt-tag">{t("detail.tagPrefix")}{localizeTag(info.tag || firstKey)}</div> : null}
                                {localizedInfoPersona || fallbackTooltipDescription ? <div className="tt-persona">{localizedInfoPersona || fallbackTooltipDescription}</div> : null}
                                {info && typeof info.temperature !== "undefined" ? <div className="tt-temp">{t("detail.temperaturePrefix")}{info.temperature}</div> : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                  {/* Navigation controls wired by the canvas engine via data-fg-action */}
                  <div className="fg-nav">
                    <button data-fg-action="zoom-out" title={t("detail.zoomOut")}>-</button>
                    <span className="fg-zoom-label">100%</span>
                    <button data-fg-action="zoom-in" title={t("detail.zoomIn")}>+</button>
                    <button data-fg-action="reset" title={t("detail.resetView")}>reset</button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("detail.noDiagram")}</p>
            )}
          </CardContent>
        </Card>

        {/* Agents Section (matching Flask classification) */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("detail.agents")}</CardTitle>
            <CardDescription>
              {classifiedAgents.oasis.length} {t("detail.internalAgents")} · {classifiedAgents.openclaw.length + classifiedAgents.external.length + classifiedAgents.custom.length} {t("detail.externalAgents")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {[
              { key: "oasis", title: t("detail.internalAgentsGroup"), emoji: "🌀", badge: "badge-oasis", agents: classifiedAgents.oasis },
              { key: "openclaw", title: t("detail.openclawAgents"), emoji: "🐾", badge: "badge-openclaw", agents: classifiedAgents.openclaw },
              { key: "external", title: t("detail.connectedAgents"), emoji: "🔗", badge: "badge-external", agents: classifiedAgents.external },
              { key: "custom", title: t("detail.customAgents"), emoji: "✨", badge: "badge-custom", agents: classifiedAgents.custom }
            ]
              .filter((group) => group.agents.length > 0)
              .map((group) => {
                const isCollapsed = collapsedGroups[group.key] ?? false;
                return (
                  <div key={group.key} className="agent-type-group">
                    <div
                      className={`agent-type-header ${isCollapsed ? "collapsed" : ""}`}
                      onClick={() => toggleAgentGroup(group.key)}
                    >
                      <span className="type-arrow">{isCollapsed ? "+" : "-"}</span>
                      <span className="type-emoji">{group.emoji}</span>
                      <span className="type-title">{group.title}</span>
                      <span className={`agent-type-badge ${group.badge}`}>{group.agents.length}</span>
                    </div>
                    <div
                      className={`agent-type-body ${isCollapsed ? "collapsed" : ""}`}
                      style={isCollapsed ? { maxHeight: 0 } : { maxHeight: `${group.agents.length * 400 + 100}px` }}
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        {group.agents.map((agent, idx) => {
                          const agentId = `${group.key}_${agent.name}_${idx}`;
                          const isExpanded = expandedPersonas[agentId] ?? false;
                          const localizedAgentName = localizeAgentName(agent.name, agent.tag, agent.localizationScopes);
                          const localizedAgentPersona = localizeAgentPersona(agent.name, agent.tag, agent.localizationScopes, agent.persona);
                          return (
                            <div key={agentId} className="agent-card">
                                <div className="agent-card-top">
                                  <div className="agent-card-icon">{renderAgentIcon(agent.sourceType, agent.tag)}</div>
                                  <div className="min-w-0 flex-1">
                                    <div className="agent-card-name">{localizedAgentName}</div>
                                  <div className="agent-card-tag">{localizeTag(agent.tag)}</div>
                                  </div>
                                </div>

                              {/* Config badges */}
                              <div className="flex flex-wrap gap-2 mb-2">
                                {typeof agent.temperature !== "undefined" && (
                                  <span className="agent-config-badge">🌡️ <span className="cfg-val">{agent.temperature}</span></span>
                                )}
                                {agent.sourceType && (
                                  <span className="agent-config-badge">📦 <span className="cfg-val">{agent.sourceType}</span></span>
                                )}
                                {agent.skills && (
                                  <span className="agent-config-badge">🛠️ <span className="cfg-val">{agent.skills}</span></span>
                                )}
                              </div>

                              {/* Persona (collapsible) */}
                              {agent.persona && (
                                <>
                                <div className="agent-persona-toggle" onClick={() => togglePersona(agentId)}>
                                    <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>{isExpanded ? "-" : "+"}</span>
                                    <span>{t("detail.persona")}</span>
                                  </div>
                                  {isExpanded && <div className="agent-card-persona">{localizedAgentPersona}</div>}
                                </>
                              )}

                              {/* Stages */}
                              {agent.stages && agent.stages.length > 0 && (
                                <div className="mt-2">
                                <div className="text-xs text-muted-foreground mb-1">{t("detail.stages")}</div>
                                  <div className="flex flex-wrap gap-1">
                                    {agent.stages.map((s) => (
                                      <span key={s} className="agent-node-chip">{s}</span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Skills */}
                              {agent.agentSkills && Object.keys(agent.agentSkills).length > 0 && (
                                <div className="agent-skills-section">
                                  <div className="agent-skills-title">{t("detail.skills")} ({Object.keys(agent.agentSkills).length})</div>
                                  {Object.entries(agent.agentSkills).map(([skillName, skillData]) => (
                                    renderSkillItem(agent.name, skillName, skillData)
                                  ))}
                                </div>
                              )}

                              {/* Cron Jobs */}
                              {agent.agentCronJobs && agent.agentCronJobs.length > 0 && (
                                <div className="agent-cron-section">
                                  <div className="agent-cron-title">{t("detail.cronJobs")} ({agent.agentCronJobs.length})</div>
                                  {agent.agentCronJobs.map((rawJob, jIdx) => {
                                    const job = normalizeCronJob(rawJob, t("detail.unnamedJob"));
                                    return (
                                    <div key={`cron_${jIdx}`} className="agent-cron-item">
                                      <div className="flex items-center gap-1.5">
                                        <span className="agent-cron-name">{pickCronJobText(workflow?.localizations, agent.name, jIdx, "name", String(job.name || t("detail.unnamedJob")), currentLocale)}</span>
                                        <span className={job.enabled ? "agent-cron-badge-enabled" : "agent-cron-badge-disabled"}>
                                          {job.enabled ? t("detail.enabled") : t("detail.disabled")}
                                        </span>
                                      </div>
                                      <div className="agent-cron-detail">
                                        {job.scheduleKind && <span>📋 {String(job.scheduleKind)}</span>}
                                        {job.cron && <span>🕐 {String(job.cron)}</span>}
                                        {job.at && <span>📅 {new Date(job.at).toLocaleString()}</span>}
                                        {job.every && <span>🔄 every {String(job.every)}</span>}
                                        {job.mode && <span>📢 {String(job.mode)}</span>}
                                        {job.session && <span>🔗 {String(job.session)}</span>}
                                      </div>
                                      {job.message && (
                                        <div className="agent-cron-msg">💬 {pickCronJobText(workflow?.localizations, agent.name, jIdx, "message", String(job.message), currentLocale).slice(0, 120)}</div>
                                      )}
                                    </div>
                                  )})}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

            {classifiedAgents.oasis.length + classifiedAgents.openclaw.length + classifiedAgents.external.length + classifiedAgents.custom.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("detail.noAgents")}</p>
            )}
          </CardContent>
        </Card>

        {hasYamlContent ? (
          <Card className="mt-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <CardTitle>{t("detail.yamlConfig")}</CardTitle>
                {selectedYamlFile ? (
                  <Badge variant="outline" className="text-xs">
                    File {selectedYamlFile}
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedCodeType("yaml")}>
                  YAML
                </Button>
                <Button variant="outline" size="sm" onClick={() => setYamlOpen((prev) => !prev)}>
                  {yamlOpen ? t("detail.hideYaml") : t("detail.showYaml")}
                </Button>
              </div>
            </CardHeader>
            {yamlOpen ? (
              <CardContent className="space-y-3">
                {yamlFileEntries && yamlFileEntries.length > 1 ? (
                  <div className="flex flex-wrap gap-2">
                    {yamlFileEntries.map(([fileName]) => (
                      <Button
                        key={fileName}
                        variant={selectedYamlFile === fileName ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedYamlFile(fileName)}
                        className="text-xs"
                      >
                        File {fileName.replace(/\.ya?ml$/i, "")}
                      </Button>
                    ))}
                  </div>
                ) : null}
                <pre className="max-h-[520px] overflow-auto rounded-md border bg-muted p-4 text-xs leading-6 text-foreground">{activeYamlContent}</pre>
              </CardContent>
            ) : null}
          </Card>
        ) : null}

        {hasPythonContent ? (
          <Card className="mt-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <CardTitle>Python Workflow</CardTitle>
                {selectedPythonFile ? (
                  <Badge variant="outline" className="text-xs">
                    {"<>"} {selectedPythonFile}
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedCodeType("python")}>
                  Python
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPythonOpen((prev) => !prev)}>
                  {pythonOpen ? "Hide Python" : "Show Python"}
                </Button>
              </div>
            </CardHeader>
            {pythonOpen ? (
              <CardContent className="space-y-3">
                {pythonFileEntries && pythonFileEntries.length > 1 ? (
                  <div className="flex flex-wrap gap-2">
                    {pythonFileEntries.map(([fileName]) => (
                      <Button
                        key={fileName}
                        variant={selectedPythonFile === fileName ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedPythonFile(fileName)}
                        className="text-xs"
                      >
                        {"<>"} {fileName.replace(/\.py$/i, "")}
                      </Button>
                    ))}
                  </div>
                ) : null}
                <pre className="max-h-[520px] overflow-auto rounded-md border bg-muted p-4 text-xs leading-6 text-foreground">{activePythonContent}</pre>
              </CardContent>
            ) : null}
          </Card>
        ) : null}
      </main>

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("detail.loginRequired")}</DialogTitle>
            <DialogDescription>
              {t("detail.loginDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <a href="/auth/github" className={buttonVariants({ variant: "default" })}>
              <Github className="h-4 w-4" />
              {t("login.signInGithub")}
            </a>
            <Button variant="outline" onClick={() => setLoginOpen(false)}>
              {t("login.continueGuest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
