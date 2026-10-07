"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { UI_TRANSLATIONS_GENERATED } from "@/lib/ui-translations.generated";
import { UI_TRANSLATIONS_OVERRIDES } from "@/lib/ui-translations.overrides";

export type Locale = "en" | "zh";

const STORAGE_KEY = "clawcrosshub_locale";

function getInitialLocale(): Locale {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "zh") return saved;
  }
  return "en";
}

type I18nContextType = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key: string) => key,
});

function fallbackLabelFromKey(key: string): string {
  const tail = key.includes(".") ? key.split(".").pop() || key : key;
  return tail
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function translateValue(t: (key: string) => string, prefix: string, value: string): string {
  const key = `${prefix}.${value}`;
  const translated = t(key);
  return translated === key ? value : translated;
}

const translations: Record<string, Record<Locale, string>> = {
  // ── Common ──
  "common.close": { en: "Close", zh: "关闭" },

  // ── Header ──
  "header.magicPrompt": { en: "Magic Prompt", zh: "魔法提示" },
  "header.visitGithub": { en: "Visit our GitHub!", zh: "访问我们的 GitHub!" },
  "header.explore": { en: "Explore", zh: "浏览" },
  "header.intro": { en: "Intro", zh: "介绍" },
  "header.publish": { en: "Publish", zh: "发布" },
  "header.signIn": { en: "Sign in", zh: "登录" },
  "header.signedInAs": { en: "Signed in as", zh: "已登录为" },
  "header.myProfile": { en: "My Profile", zh: "我的主页" },
  "header.githubProfile": { en: "GitHub Profile", zh: "GitHub 主页" },
  "header.logout": { en: "Logout", zh: "退出登录" },
  "header.settings": { en: "Settings", zh: "设置" },
  "header.language": { en: "Language", zh: "语言" },
  "header.clawcross": { en: "Clawcross", zh: "Clawcross" },

  // ── Theme ──
  "theme.switchToLight": { en: "Switch to light mode", zh: "切换到浅色模式" },
  "theme.switchToDark": { en: "Switch to dark mode", zh: "切换到深色模式" },

  // ── Main Page ──
  "main.magicPromptTitle": { en: "Magic Prompt — Copy and paste into any AI assistant to get started", zh: "魔法提示 — 复制粘贴到任意 AI 助手即可开始" },
  "main.copyPrompt": { en: "Copy", zh: "复制" },
  "main.searchPlaceholder": { en: "Search workflows by name, description, or author...", zh: "按名称、描述或作者搜索工作流..." },
  "main.allCategories": { en: "All Categories", zh: "所有分类" },
  "main.workflowsAvailable": { en: "workflows available", zh: "个可用工作流" },
  "main.presetsAndCommunity": { en: "Presets + Community", zh: "预设 + 社区" },
  "main.all": { en: "All", zh: "全部" },
  "main.loading": { en: "Loading workflows...", zh: "加载工作流中..." },
  "main.loadingFailed": { en: "Failed to load workflows.", zh: "加载工作流失败。" },
  "main.noWorkflows": { en: "No workflows found.", zh: "未找到工作流。" },
  "main.by": { en: "by", zh: "作者" },
  "main.official": { en: "Official", zh: "官方" },
  "main.community": { en: "Community", zh: "社区" },
  "main.steps": { en: "steps", zh: "步骤" },
  "main.repeat": { en: "Repeat", zh: "循环" },
  "main.once": { en: "Once", zh: "单次" },

  // ── Publish Dialog ──
  "publish.title": { en: "Publish Workflow", zh: "发布工作流" },
  "publish.description": { en: "Upload Team ZIP or publish YAML directly to the community hub.", zh: "上传团队 ZIP 或直接将 YAML 发布到社区中心。" },
  "publish.uploadZip": { en: "Upload ZIP", zh: "上传 ZIP" },
  "publish.writeYaml": { en: "Write YAML", zh: "编写 YAML" },
  "publish.titleLabel": { en: "Title", zh: "标题" },
  "publish.authorLabel": { en: "Author", zh: "作者" },
  "publish.descriptionLabel": { en: "Description", zh: "描述" },
  "publish.categoryLabel": { en: "Category", zh: "分类" },
  "publish.tagsLabel": { en: "Tags (comma-separated)", zh: "标签（逗号分隔）" },
  "publish.teamSnapshot": { en: "Team Snapshot (.zip)", zh: "团队快照 (.zip)" },
  "publish.customAgents": { en: "Custom Agents (optional)", zh: "自定义代理（可选）" },
  "publish.addAgent": { en: "Add Agent", zh: "添加代理" },
  "publish.agentName": { en: "Agent Name", zh: "代理名称" },
  "publish.selectTag": { en: "Select tag", zh: "选择标签" },
  "publish.remove": { en: "Remove", zh: "移除" },
  "publish.yamlContent": { en: "YAML Content", zh: "YAML 内容" },
  "publish.detailedDescription": { en: "Detailed Description", zh: "详细描述" },
  "publish.detailPlaceholder": { en: "Explain how this workflow works and when to use it...", zh: "解释此工作流的工作方式和使用场景..." },
  "publish.cancel": { en: "Cancel", zh: "取消" },
  "publish.publishBtn": { en: "Publish", zh: "发布" },
  "publish.publishing": { en: "Publishing...", zh: "发布中..." },
  "publish.titleAndYamlRequired": { en: "Title and YAML content are required", zh: "标题和 YAML 内容为必填项" },
  "publish.selectZipFirst": { en: "Please select a .zip file first", zh: "请先选择 .zip 文件" },
  "publish.publishedSuccess": { en: "Workflow published successfully!", zh: "工作流发布成功！" },

  // ── Login Dialog ──
  "login.title": { en: "🔒 Login Required", zh: "🔒 需要登录" },
  "login.description": {
    en: "Publishing and uploading workflows requires GitHub authentication. Browsing and downloading are available without login.",
    zh: "发布和上传工作流需要 GitHub 认证。浏览和下载无需登录。"
  },
  "login.signInGithub": { en: "Sign in with GitHub", zh: "使用 GitHub 登录" },
  "login.continueGuest": { en: "Continue as Guest", zh: "以访客身份继续" },

  // ── Profile Page ──
  "profile.backToExplore": { en: "Back to Explore", zh: "返回浏览" },
  "profile.loading": { en: "Loading profile...", zh: "加载主页中..." },
  "profile.publishedWorks": { en: "Published Works", zh: "已发布作品" },
  "profile.starred": { en: "Starred", zh: "已收藏" },
  "profile.profileSettings": { en: "Profile Settings", zh: "个人设置" },
  "profile.newWorkflow": { en: "New Workflow", zh: "新建工作流" },
  "profile.noPublished": { en: "No published workflows yet.", zh: "暂无已发布的工作流。" },
  "profile.noPublishedHint": { en: 'Click "New Workflow" above to publish your first workflow!', zh: '点击上方"新建工作流"发布您的第一个工作流！' },
  "profile.noStarred": { en: "You haven't starred any workflows yet.", zh: "您还没有收藏任何工作流。" },
  "profile.noStarredHint": { en: "Go to the Explore page to discover and star workflows!", zh: "前往浏览页面发现并收藏工作流！" },
  "profile.explore": { en: "Explore page", zh: "浏览页面" },
  "profile.settingsTitle": { en: "⚙️ Profile Settings", zh: "⚙️ 个人设置" },
"profile.settingsDesc": { en: "Customize your ClawcrossHub profile", zh: "自定义您的 ClawcrossHub 主页" },
  "profile.displayName": { en: "Display Name", zh: "显示名称" },
  "profile.displayNamePlaceholder": { en: "Your display name", zh: "您的显示名称" },
  "profile.bio": { en: "Bio", zh: "简介" },
  "profile.bioPlaceholder": { en: "Tell the community about yourself...", zh: "向社区介绍自己..." },
  "profile.githubAccount": { en: "GitHub Account", zh: "GitHub 账户" },
  "profile.viewOnGithub": { en: "View on GitHub", zh: "在 GitHub 上查看" },
  "profile.saveSettings": { en: "Save Settings", zh: "保存设置" },
  "profile.settingsSaved": { en: "✅ Settings saved!", zh: "✅ 设置已保存！" },
  "profile.signOut": { en: "Sign Out", zh: "退出登录" },
  "profile.languageSetting": { en: "Language", zh: "语言" },
  "profile.totalStars": { en: "Total Stars", zh: "总星数" },
  "profile.workflow": { en: "Workflow", zh: "工作流" },
  "profile.workflows": { en: "Workflows", zh: "工作流" },

  // ── Profile CRUD Dialogs ──
  "crud.publishNew": { en: "Publish New Workflow", zh: "发布新工作流" },
"crud.publishNewDesc": { en: "Fill in the details to publish a new workflow to ClawcrossHub.", zh: "填写详细信息以将新工作流发布到 ClawcrossHub。" },
  "crud.editWorkflow": { en: "Edit Workflow", zh: "编辑工作流" },
  "crud.editWorkflowDesc": { en: "Update the details of", zh: "更新工作流详情" },
  "crud.deleteWorkflow": { en: "Delete Workflow", zh: "删除工作流" },
  "crud.deleteConfirm": { en: "Are you sure you want to delete", zh: "您确定要删除" },
  "crud.deleteWarning": { en: "? This action cannot be undone.", zh: "？此操作无法撤销。" },
  "crud.titleRequired": { en: "Title is required", zh: "标题为必填项" },
  "crud.yamlRequired": { en: "YAML content is required", zh: "YAML 内容为必填项" },
  "crud.yamlKeepCurrent": { en: "YAML Content (leave empty to keep current)", zh: "YAML 内容（留空保持当前内容）" },
  "crud.cancel": { en: "Cancel", zh: "取消" },
  "crud.saving": { en: "Saving...", zh: "保存中..." },
  "crud.saveChanges": { en: "Save Changes", zh: "保存更改" },
  "crud.deleting": { en: "Deleting...", zh: "删除中..." },
  "crud.delete": { en: "Delete", zh: "删除" },

  // ── Settings Dialog ──
  "settings.title": { en: "Settings", zh: "设置" },
"settings.description": { en: "Customize your ClawcrossHub preferences", zh: "自定义您的 ClawcrossHub 偏好设置" },
  "settings.language": { en: "Language", zh: "语言" },
  "settings.english": { en: "English", zh: "English" },
  "settings.chinese": { en: "中文", zh: "中文" },
  "settings.close": { en: "Close", zh: "关闭" },

  // ── Publish / Form placeholders ──
  "publish.titlePlaceholder": { en: "My Awesome Workflow", zh: "我的工作流" },
  "publish.descPlaceholder": { en: "Brief workflow summary", zh: "简要工作流描述" },
  "publish.tagsPlaceholder": { en: "ml, code, pipeline", zh: "机器学习, 代码, 流水线" },
  "publish.agentNamePlaceholder": { en: "Agent Name", zh: "代理名称" },
  "publish.selectTagPlaceholder": { en: "Select tag", zh: "选择标签" },
  "publish.yamlPlaceholder": { en: "Explain how this workflow works and when to use it...", zh: "解释此工作流的工作方式和使用场景..." },

  // ── Profile card labels ──
  "profile.official": { en: "🏷️ Official", zh: "🏷️ 官方" },
  "profile.community": { en: "🌐 Community", zh: "🌐 社区" },
  "profile.stepsCount": { en: "steps", zh: "步骤" },
  "profile.published": { en: "Published", zh: "发布于" },

  // ── Create / Edit / Delete Dialog form labels ──
  "crud.titleLabel": { en: "Title *", zh: "标题 *" },
  "crud.descLabel": { en: "Description", zh: "描述" },
  "crud.yamlLabel": { en: "YAML Content *", zh: "YAML 内容 *" },
  "crud.yamlEditLabel": { en: "YAML Content (leave empty to keep current)", zh: "YAML 内容（留空保持当前内容）" },
  "crud.categoryLabel": { en: "Category", zh: "分类" },
  "crud.iconLabel": { en: "Icon", zh: "图标" },
  "crud.tagsLabel": { en: "Tags (comma separated)", zh: "标签（逗号分隔）" },
  "crud.titlePlaceholder": { en: "My Awesome Workflow", zh: "我的工作流" },
  "crud.descPlaceholder": { en: "A brief description", zh: "简要描述" },
  "crud.yamlEditPlaceholder": { en: "Leave empty to keep current YAML", zh: "留空保持当前 YAML" },
  "crud.tagsPlaceholder": { en: "ai, team, automation", zh: "AI, 团队, 自动化" },
  "crud.publishing": { en: "Publishing...", zh: "发布中..." },
  "crud.publish": { en: "Publish", zh: "发布" },

  // ── Workflow Detail Page ──
  "detail.loading": { en: "Loading workflow...", zh: "加载工作流中..." },
  "detail.notFound": { en: "❌ Workflow not found.", zh: "❌ 未找到工作流。" },
  "detail.backToExplore": { en: "Back to Explore", zh: "返回浏览" },
  "detail.by": { en: "by", zh: "作者" },
  "detail.official": { en: "🏷️ Official", zh: "🏷️ 官方" },
  "detail.community": { en: "🌐 Community", zh: "🌐 社区" },
  "detail.starred": { en: "Starred", zh: "已收藏" },
  "detail.star": { en: "Star", zh: "收藏" },
  "detail.copyYaml": { en: "Copy YAML", zh: "复制 YAML" },
  "detail.downloadZip": { en: "Download ZIP", zh: "下载 ZIP" },
  "detail.importToClawcross": { en: "Import to ClawCross", zh: "导入到 ClawCross" },
  "detail.dagMode": { en: "⚡ DAG Mode", zh: "⚡ DAG 模式" },
  "detail.repeat": { en: "🔁 Repeat", zh: "🔁 循环" },
  "detail.runOnce": { en: "▶️ Run Once", zh: "▶️ 单次执行" },
  "detail.steps": { en: "steps", zh: "步骤" },
  "detail.aboutWorkflow": { en: "📖 About this Workflow", zh: "📖 关于此工作流" },
  "detail.teamSnapshot": { en: "👥 Team Snapshot", zh: "👥 团队快照" },
  "detail.internal": { en: "Internal", zh: "内部" },
  "detail.external": { en: "External", zh: "外部" },
  "detail.teamMembers": { en: "Team Members", zh: "团队成员" },
  "detail.noAgentData": { en: "No agent data available for this workflow", zh: "此工作流没有可用的代理数据" },
  "detail.quickDownload": { en: "📥 Quick Download", zh: "📥 快速下载" },
  "detail.quickDownloadDesc": { en: "Use the curl command below to download this workflow as a ZIP file", zh: "使用下方 curl 命令将此工作流下载为 ZIP 文件" },
  "detail.copyCurl": { en: "Copy Download Command", zh: "复制下载命令" },
  "detail.downloadUrl": { en: "Download URL", zh: "下载链接" },
  "detail.workflowDiagram": { en: "🔀 Workflow Diagram", zh: "🔀 工作流图" },
  "detail.workflowSwitcher": { en: "📂 Workflow Files", zh: "📂 工作流文件" },
  "detail.noDiagram": { en: "No diagram available", zh: "暂无图表" },
  "detail.agents": { en: "🤖 Agents", zh: "🤖 代理" },
  "detail.internalAgents": { en: "internal", zh: "内部" },
  "detail.externalAgents": { en: "external agents", zh: "外部代理" },
  "detail.internalAgentsGroup": { en: "Internal Agents", zh: "内部代理" },
  "detail.openclawAgents": { en: "External — OpenClaw Agents", zh: "外部 — OpenClaw 代理" },
  "detail.connectedAgents": { en: "External — Connected Agents", zh: "外部 — 连接的代理" },
  "detail.customAgents": { en: "External — Custom Agents", zh: "外部 — 自定义代理" },
  "detail.persona": { en: "Persona", zh: "人设" },
  "detail.stages": { en: "📍 Stages", zh: "📍 阶段" },
  "detail.skills": { en: "🛠️ Skills", zh: "🛠️ 技能" },
  "detail.cronJobs": { en: "⏰ Cron Jobs", zh: "⏰ 定时任务" },
  "detail.noAgents": { en: "No agents data available", zh: "没有可用的代理数据" },
  "detail.yamlConfig": { en: "📄 YAML Configuration", zh: "📄 YAML 配置" },
  "detail.hideYaml": { en: "Hide YAML", zh: "隐藏 YAML" },
  "detail.showYaml": { en: "Show YAML", zh: "显示 YAML" },
  "detail.loginRequired": { en: "🔒 Login Required", zh: "🔒 需要登录" },
  "detail.loginDesc": { en: "You need to sign in with GitHub to star workflows. Browsing and downloading are available without login.", zh: "您需要使用 GitHub 登录才能收藏工作流。浏览和下载无需登录。" },
  "detail.yamlCopied": { en: "✅ YAML copied to clipboard!", zh: "✅ YAML 已复制到剪贴板！" },
  "detail.yamlCopyFail": { en: "❌ Failed to copy — please copy manually.", zh: "❌ 复制失败 — 请手动复制。" },
  "detail.curlCopied": { en: "✅ curl command copied to clipboard!", zh: "✅ curl 命令已复制到剪贴板！" },
  "detail.curlCopyFail": { en: "❌ Failed to copy — please copy manually.", zh: "❌ 复制失败 — 请手动复制。" },
  "detail.internalBadge": { en: "INTERNAL", zh: "内部" },
  "detail.externalBadge": { en: "EXTERNAL", zh: "外部" },
  "detail.unnamedJob": { en: "Unnamed Job", zh: "未命名任务" },
  "detail.enabled": { en: "● ENABLED", zh: "● 已启用" },
  "detail.disabled": { en: "○ DISABLED", zh: "○ 已禁用" },
  "detail.zoomOut": { en: "Zoom Out", zh: "缩小" },
  "detail.zoomIn": { en: "Zoom In", zh: "放大" },
  "detail.resetView": { en: "Reset View", zh: "重置视图" },
  "crud.editTooltip": { en: "Edit", zh: "编辑" },
  "crud.deleteTooltip": { en: "Delete", zh: "删除" },

  // ── Category names ──
  "cat.Engineering": { en: "Engineering", zh: "工程" },
  "cat.Ideation": { en: "Ideation", zh: "创意" },
  "cat.Business": { en: "Business", zh: "商业" },
  "cat.Research": { en: "Research", zh: "研究" },
  "cat.Community": { en: "Community", zh: "社区" },
  "cat.Imported": { en: "Imported", zh: "导入" },
  "cat.Creative": { en: "Creative", zh: "创意" },
  "cat.Education": { en: "Education", zh: "教育" },
  "cat.User": { en: "User", zh: "用户" },

  // ── Agent Tag Labels ──
  "tag.creative": { en: "🎨 Creative", zh: "🎨 创意" },
  "tag.critical": { en: "🔍 Critical", zh: "🔍 批判" },
  "tag.data": { en: "📊 Data", zh: "📊 数据" },
  "tag.synthesis": { en: "🎯 Synthesis", zh: "🎯 综合" },
  "tag.economist": { en: "📈 Economist", zh: "📈 经济学家" },
  "tag.lawyer": { en: "⚖️ Lawyer", zh: "⚖️ 律师" },
  "tag.entrepreneur": { en: "🚀 Entrepreneur", zh: "🚀 企业家" },
  "tag.common_person": { en: "🧑 Common Person", zh: "🧑 普通人" },
  "tag.cost_controller": { en: "💰 Cost Controller", zh: "💰 成本控制" },
  "tag.revenue_planner": { en: "📊 Revenue Planner", zh: "📊 收益规划" },
  "tag.ml": { en: "🤖 ML", zh: "🤖 机器学习" },
  "tag.code": { en: "💻 Code", zh: "💻 代码" },
  "tag.review": { en: "📋 Review", zh: "📋 评审" },
  "tag.manual": { en: "📝 Manual", zh: "📝 手动" },
  "tag.brainstorm": { en: "💡 Brainstorm", zh: "💡 头脑风暴" },
  "tag.pipeline": { en: "🔗 Pipeline", zh: "🔗 流水线" },
  "tag.debate": { en: "🎙️ Debate", zh: "🎙️ 辩论" },
  "tag.team": { en: "👥 Team", zh: "👥 团队" },
  "tag.snapshot": { en: "📸 Snapshot", zh: "📸 快照" },
  "tag.external": { en: "🔗 External", zh: "🔗 外部" },
  "tag.openclaw": { en: "🐾 OpenClaw", zh: "🐾 OpenClaw" },
  "tag.custom": { en: "⭐ Custom", zh: "⭐ 自定义" },

  // ── Magic Prompt ──
  "main.magicPromptText": {
    en: "Clone https://github.com/ClawCross/ClawCross.git, read AGENTS.md, and install Clawcross.",
    zh: "Clone https://github.com/ClawCross/ClawCross.git，读取 SKILL.md，然后安装 Clawcross。",
  },
  "main.magicPromptCopied": { en: "✅ Magic Prompt copied", zh: "✅ Magic Prompt 已复制" },
  "main.magicPromptCopyFail": { en: "❌ Copy failed — please copy manually.", zh: "❌ 复制失败 — 请手动复制。" },

  // ── Main Page actions ──
  "main.copyDownloadCommand": { en: "Download", zh: "下载" },
  "main.importToClawcross": { en: "Import to ClawCross", zh: "导入到 ClawCross" },
  "main.commandCopied": { en: "✅ Copied!", zh: "✅ 已复制!" },
  "main.commandCopyFail": { en: "❌ Copy failed — please copy manually.", zh: "❌ 复制失败 — 请手动复制。" },

  // ── Publish status messages ──
  "publish.publishingStatus": { en: "⏳ Publishing...", zh: "⏳ 发布中..." },
  "publish.publishedCount": { en: "Published", zh: "已发布" },
  "publish.workflowCount": { en: "workflow(s)!", zh: "个工作流！" },
  "publish.internal": { en: "internal", zh: "内部" },
  "publish.external": { en: "external", zh: "外部" },
  "publish.experts": { en: "experts", zh: "专家" },

  // ── Error fallbacks ──
  "error.unknown": { en: "Unknown error", zh: "未知错误" },
  "error.publishFailed": { en: "Failed to publish workflow", zh: "发布工作流失败" },
  "error.updateFailed": { en: "Failed to update workflow", zh: "更新工作流失败" },
  "error.deleteFailed": { en: "Failed to delete workflow", zh: "删除工作流失败" },

  // ── Language toggle tooltip ──
  "lang.switchToChinese": { en: "切换到中文", zh: "切换到中文" },
  "lang.switchToEnglish": { en: "Switch to English", zh: "Switch to English" },

  // ── Workflow Detail extra ──
  "detail.engineV2": { en: "Engine v2", zh: "引擎 v2" },
  "detail.parallel": { en: "⚡ Parallel", zh: "⚡ 并行" },
  "detail.allExperts": { en: "All Experts", zh: "全部专家" },
  "detail.manualStep": { en: "Manual", zh: "手动步骤" },
  "detail.selector": { en: "Selector", zh: "选择器" },
  "detail.tagPrefix": { en: "Tag: ", zh: "标签：" },
  "detail.temperaturePrefix": { en: "🌡️ Temperature: ", zh: "🌡️ 温度：" },
  "detail.dag": { en: "DAG", zh: "DAG" },

  // ── Metadata ──
"meta.title": { en: "ClawCrossHub — Workflow Community", zh: "ClawCrossHub — 工作流社区" },
"meta.description": { en: "Community Workflow Marketplace", zh: "社区工作流市场" },
};

export function getTranslation(key: string, locale: Locale): string {
  const entry = UI_TRANSLATIONS_GENERATED[key] ?? UI_TRANSLATIONS_OVERRIDES[key] ?? translations[key];
  if (!entry) return fallbackLabelFromKey(key);
  return entry[locale] ?? entry.en ?? fallbackLabelFromKey(key);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocaleState(getInitialLocale());
    setMounted(true);
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, newLocale);
    }
  }, []);

  const t = useCallback(
    (key: string): string => getTranslation(key, locale),
    [locale]
  );

  // Avoid hydration mismatch by rendering children only after mount
  if (!mounted) {
    return (
      <I18nContext.Provider value={{ locale: "en", setLocale, t: (key) => getTranslation(key, "en") }}>
        {children}
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
