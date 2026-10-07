"use client";

import { ArrowLeft, Edit, ExternalLink, Github, LogOut, Plus, Settings, Star, Trash2, UserRound, X } from "lucide-react";

import { SiteHeader } from "@/components/clawcrosshub/site-header";
import { StableI18nText } from "@/components/clawcrosshub/stable-i18n-text";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { Locale } from "@/lib/i18n";
import { translateValue, useI18n } from "@/lib/i18n";
import { pickWorkflowTag, pickWorkflowText } from "@/lib/workflow-localization";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { GithubUser, SupportedLocale, Workflow } from "@/lib/types";

type UserWorkflow = {
  id: string;
  title: string;
  description: string;
  icon: string;
  stars: number;
  forks: number;
  category: string;
  tags: string[];
  source: string;
  published_at?: string;
  steps: number;
  localizations?: Workflow["localizations"];
};

type WorkflowFormData = {
  title: string;
  description: string;
  yaml_content: string;
  category: string;
  tags: string;
  icon: string;
};

const EMPTY_FORM: WorkflowFormData = { title: "", description: "", yaml_content: "", category: "Community", tags: "", icon: "📦" };

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  return fallback;
}

export function ProfilePage({ login }: { login: string }) {
  const { locale, setLocale, t } = useI18n();
  const currentLocale = locale as SupportedLocale;
  const [currentUser, setCurrentUser] = useState<GithubUser | null>(null);
  const [workflows, setWorkflows] = useState<UserWorkflow[]>([]);
  const [starredWorkflows, setStarredWorkflows] = useState<UserWorkflow[]>([]);
  const [loading, setLoading] = useState(true);

  // Profile settings state
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Workflow management state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<UserWorkflow | null>(null);
  const [deletingWorkflow, setDeletingWorkflow] = useState<UserWorkflow | null>(null);
  const [formData, setFormData] = useState<WorkflowFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);

  const isOwner = currentUser?.login === login;

  const refreshWorkflows = useCallback(async () => {
    try {
      const workflowResp = await fetch(`/api/user/${encodeURIComponent(login)}/workflows`);
      if (workflowResp.ok) {
        const data = (await workflowResp.json()) as { workflows: UserWorkflow[] };
        setWorkflows(data.workflows);
      }
    } catch {
      // no-op
    }
  }, [login]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const authResp = await fetch("/api/auth/status");
        const authData = (await authResp.json()) as { logged_in: boolean; user?: GithubUser };
        if (authData.logged_in && authData.user) {
          setCurrentUser(authData.user);
          setDisplayName(authData.user.name || authData.user.login);
        }

        await refreshWorkflows();

        if (authData.logged_in && authData.user && authData.user.login === login) {
          const starredResp = await fetch(`/api/user/${encodeURIComponent(login)}/stars`);
          if (starredResp.ok) {
            const starredData = (await starredResp.json()) as { workflows: UserWorkflow[] };
            setStarredWorkflows(starredData.workflows);
          }
        }
      } catch {
        // no-op
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [login, refreshWorkflows]);

  // ── Workflow CRUD handlers ──
  async function handleCreateWorkflow() {
    setFormError("");
    if (!formData.title.trim()) { setFormError(t("crud.titleRequired")); return; }
    if (!formData.yaml_content.trim()) { setFormError(t("crud.yamlRequired")); return; }
    setFormBusy(true);
    try {
      const resp = await fetch("/api/workflows/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim(),
          yaml_content: formData.yaml_content.trim(),
          category: formData.category,
          tags: formData.tags.split(",").map((t) => t.trim()).filter(Boolean),
          icon: formData.icon || "📦",
        }),
      });
      const data = (await resp.json()) as { status?: string; error?: string };
      if (!resp.ok) { setFormError(data.error || t("error.publishFailed")); return; }
      setShowCreateDialog(false);
      setFormData(EMPTY_FORM);
      await refreshWorkflows();
    } catch (err) {
      setFormError(getErrorMessage(err, t("error.publishFailed")));
    } finally {
      setFormBusy(false);
    }
  }

  async function handleEditWorkflow() {
    if (!editingWorkflow) return;
    setFormError("");
    if (!formData.title.trim()) { setFormError(t("crud.titleRequired")); return; }
    setFormBusy(true);
    try {
      const body: Record<string, unknown> = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        tags: formData.tags.split(",").map((t) => t.trim()).filter(Boolean),
        icon: formData.icon || "📦",
      };
      if (formData.yaml_content.trim()) {
        body.yaml_content = formData.yaml_content.trim();
      }
      const resp = await fetch(`/api/workflows/${encodeURIComponent(editingWorkflow.id)}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await resp.json()) as { status?: string; error?: string };
      if (!resp.ok) { setFormError(data.error || t("error.updateFailed")); return; }
      setShowEditDialog(false);
      setEditingWorkflow(null);
      setFormData(EMPTY_FORM);
      await refreshWorkflows();
    } catch (err) {
      setFormError(getErrorMessage(err, t("error.updateFailed")));
    } finally {
      setFormBusy(false);
    }
  }

  async function handleDeleteWorkflow() {
    if (!deletingWorkflow) return;
    setFormBusy(true);
    try {
      const resp = await fetch(`/api/workflows/${encodeURIComponent(deletingWorkflow.id)}/manage`, {
        method: "DELETE",
      });
      const data = (await resp.json()) as { status?: string; error?: string };
      if (!resp.ok) { setFormError(data.error || t("error.deleteFailed")); return; }
      setShowDeleteDialog(false);
      setDeletingWorkflow(null);
      await refreshWorkflows();
    } catch (err) {
      setFormError(getErrorMessage(err, t("error.deleteFailed")));
    } finally {
      setFormBusy(false);
    }
  }

  function openEditDialog(w: UserWorkflow) {
    setEditingWorkflow(w);
    setFormData({
      title: w.title,
      description: w.description,
      yaml_content: "",
      category: w.category,
      tags: w.tags.join(", "),
      icon: w.icon,
    });
    setFormError("");
    setShowEditDialog(true);
  }

  function openDeleteDialog(w: UserWorkflow) {
    setDeletingWorkflow(w);
    setFormError("");
    setShowDeleteDialog(true);
  }

  function handleSaveSettings() {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        `clawcrosshub_profile_${login}`,
        JSON.stringify({ displayName, bio })
      );
    }
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`clawcrosshub_profile_${login}`);
        if (saved) {
          const parsed = JSON.parse(saved) as { displayName?: string; bio?: string };
          if (parsed.displayName) setDisplayName(parsed.displayName);
          if (parsed.bio) setBio(parsed.bio);
        }
      } catch {
        // ignore
      }
    }
  }, [login]);

  if (loading) {
    return <div className="py-24 text-center text-muted-foreground">{t("profile.loading")}</div>;
  }

  return (
    <div className="min-h-screen">
      <SiteHeader activePage="explore">
        {currentUser ? (
          <Button variant="outline" className="h-10 gap-2" disabled>
            {currentUser.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentUser.avatar_url} alt={currentUser.login} className="h-6 w-6 rounded-full" />
            ) : (
              <UserRound className="h-4 w-4" />
            )}
            {currentUser.name || currentUser.login}
          </Button>
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
          {t("profile.backToExplore")}
        </Link>

        {/* Profile Header */}
        <div className="mt-6 flex flex-col items-start gap-6 md:flex-row md:items-center">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-muted">
            {currentUser?.avatar_url && isOwner ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentUser.avatar_url} alt={login} className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-12 w-12 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold">{displayName || login}</h1>
            <p className="text-sm text-muted-foreground">@{login}</p>
            {bio && <p className="max-w-lg text-sm text-muted-foreground">{bio}</p>}
            <div className="flex items-center gap-3 pt-1">
              <Badge variant="outline">
                📦 {workflows.length} {workflows.length !== 1 ? t("profile.workflows") : t("profile.workflow")}
              </Badge>
              <Badge variant="outline">
                ⭐ {workflows.reduce((sum, w) => sum + (w.stars || 0), 0)} {t("profile.totalStars")}
              </Badge>
              {currentUser?.html_url && isOwner && (
                <a
                  href={currentUser.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  <ExternalLink className="h-3 w-3" />
                  {t("profile.viewOnGithub")}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Tabs: Published Works / Settings */}
        <Tabs defaultValue="works" className="mt-8">
          <TabsList>
            <TabsTrigger value="works">
              <Star className="mr-1 h-4 w-4" />
              {t("profile.publishedWorks")}
            </TabsTrigger>
            {isOwner && (
              <TabsTrigger value="starred">
                <Star className="mr-1 h-4 w-4 fill-yellow-400 text-yellow-400" />
                {t("profile.starred")} ({starredWorkflows.length})
              </TabsTrigger>
            )}
            {isOwner && (
              <TabsTrigger value="settings">
                <Settings className="mr-1 h-4 w-4" />
                {t("profile.profileSettings")}
              </TabsTrigger>
            )}
          </TabsList>

          {/* Published Works Tab */}
          <TabsContent value="works" className="mt-4">
            {isOwner && (
              <div className="mb-4 flex justify-end">
                <Button onClick={() => { setFormData(EMPTY_FORM); setFormError(""); setShowCreateDialog(true); }}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t("profile.newWorkflow")}
                </Button>
              </div>
            )}

            {workflows.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">{t("profile.noPublished")}</p>
                  {isOwner && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("profile.noPublishedHint")}
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {workflows.map((w) => (
                  <Card key={w.id} className="group relative h-full transition-colors hover:border-primary/50">
                    {isOwner && w.source === "community" && (
                      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title={t("crud.editTooltip")} onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditDialog(w); }}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title={t("crud.deleteTooltip")} onClick={(e) => { e.preventDefault(); e.stopPropagation(); openDeleteDialog(w); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    <Link href={`/workflow/${w.id}`}>
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{w.icon}</span>
                          <div className="min-w-0 flex-1">
                            <CardTitle className="text-base leading-tight group-hover:text-primary">{pickWorkflowText(w, "title", w.title, currentLocale)}</CardTitle>
                            <CardDescription className="mt-0.5 text-xs">
                              {w.source === "preset" ? t("profile.official") : t("profile.community")} · 📊 {w.steps} {t("profile.stepsCount")}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{pickWorkflowText(w, "description", w.description, currentLocale)}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <Badge variant="outline" className="text-xs">⭐ {w.stars}</Badge>
                          <Badge variant="outline" className="text-xs">🔀 {w.forks}</Badge>
                          <Badge variant="secondary" className="text-xs">{pickWorkflowText(w, "category", translateValue(t, "cat", w.category), currentLocale)}</Badge>
                          {w.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {w.localizations?.tags?.[tag] ? pickWorkflowTag(w, tag, currentLocale) : translateValue(t, "tag", tag)}
                            </Badge>
                          ))}
                        </div>
                        {w.published_at && (
                          <p className="mt-2 text-xs text-muted-foreground/60">
                            {t("profile.published")} {new Date(w.published_at).toLocaleDateString()}
                          </p>
                        )}
                      </CardContent>
                    </Link>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Starred Tab */}
          {isOwner && (
            <TabsContent value="starred" className="mt-4">
              {starredWorkflows.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">{t("profile.noStarred")}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("profile.noStarredHint").split(t("profile.explore"))[0]}
                      <Link href="/" className="text-primary underline">{t("profile.explore")}</Link>
                      {t("profile.noStarredHint").split(t("profile.explore"))[1] || ""}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {starredWorkflows.map((w) => (
                    <Link key={w.id} href={`/workflow/${w.id}`} className="group">
                      <Card className="h-full transition-colors hover:border-primary/50">
                        <CardHeader>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{w.icon}</span>
                            <div className="min-w-0 flex-1">
                              <CardTitle className="text-base leading-tight group-hover:text-primary">{pickWorkflowText(w, "title", w.title, currentLocale)}</CardTitle>
                              <CardDescription className="mt-0.5 text-xs">
                                {w.source === "preset" ? t("profile.official") : t("profile.community")} · 📊 {w.steps} {t("profile.stepsCount")}
                              </CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{pickWorkflowText(w, "description", w.description, currentLocale)}</p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <Badge variant="outline" className="text-xs">⭐ {w.stars}</Badge>
                            <Badge variant="outline" className="text-xs">🔀 {w.forks}</Badge>
                            <Badge variant="secondary" className="text-xs">{pickWorkflowText(w, "category", translateValue(t, "cat", w.category), currentLocale)}</Badge>
                            {w.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {w.localizations?.tags?.[tag] ? pickWorkflowTag(w, tag, currentLocale) : translateValue(t, "tag", tag)}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {/* Profile Settings Tab (only for owner) */}
          {isOwner && (
            <TabsContent value="settings" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("profile.settingsTitle")}</CardTitle>
                  <CardDescription>{t("profile.settingsDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="displayName">{t("profile.displayName")}</Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t("profile.displayNamePlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bio">{t("profile.bio")}</Label>
                    <Textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder={t("profile.bioPlaceholder")}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("profile.githubAccount")}</Label>
                    <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
                      {currentUser?.avatar_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={currentUser.avatar_url} alt={currentUser.login} className="h-8 w-8 rounded-full" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{currentUser?.name || currentUser?.login}</p>
                        <p className="text-xs text-muted-foreground">@{currentUser?.login}</p>
                      </div>
                      {currentUser?.html_url && (
                        <a href={currentUser.html_url} target="_blank" rel="noreferrer" className="ml-auto text-xs text-primary underline">
                          {t("profile.viewOnGithub")}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <Button onClick={handleSaveSettings}>
                      {t("profile.saveSettings")}
                    </Button>
                    {settingsSaved && (
                      <span className="text-sm text-green-500">{t("profile.settingsSaved")}</span>
                    )}
                  </div>
                  <div className="space-y-2 border-t pt-4">
                    <Label>{t("profile.languageSetting")}</Label>
                    <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">{t("settings.english")}</SelectItem>
                        <SelectItem value="zh">{t("settings.chinese")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="border-t pt-4">
                    <a href="/auth/logout" className={buttonVariants({ variant: "destructive", size: "sm" })}>
                      <LogOut className="h-4 w-4" />
                      {t("profile.signOut")}
                    </a>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        {/* Create Workflow Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("crud.publishNew")}</DialogTitle>
              <DialogDescription>{t("crud.publishNewDesc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="create-title">{t("crud.titleLabel")}</Label>
                <Input id="create-title" value={formData.title} onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))} placeholder={t("crud.titlePlaceholder")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-desc">{t("crud.descLabel")}</Label>
                <Input id="create-desc" value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} placeholder={t("crud.descPlaceholder")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-yaml">{t("crud.yamlLabel")}</Label>
<Textarea id="create-yaml" value={formData.yaml_content} onChange={(e) => setFormData((p) => ({ ...p, yaml_content: e.target.value }))} placeholder={"version: 2\nplan:\n- id: on1\n  expert: creative#temp#1"} rows={8} className="font-mono text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="create-category">{t("crud.categoryLabel")}</Label>
                  <Select value={formData.category} onValueChange={(val) => setFormData((p) => ({ ...p, category: val }))}>
                    <SelectTrigger id="create-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Community">{t("cat.Community")}</SelectItem>
                      <SelectItem value="Engineering">{t("cat.Engineering")}</SelectItem>
                      <SelectItem value="Creative">{t("cat.Creative")}</SelectItem>
                      <SelectItem value="Research">{t("cat.Research")}</SelectItem>
                      <SelectItem value="Business">{t("cat.Business")}</SelectItem>
                      <SelectItem value="Education">{t("cat.Education")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="create-icon">{t("crud.iconLabel")}</Label>
                  <Input id="create-icon" value={formData.icon} onChange={(e) => setFormData((p) => ({ ...p, icon: e.target.value }))} placeholder="\ud83d\udce6" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-tags">{t("crud.tagsLabel")}</Label>
                <Input id="create-tags" value={formData.tags} onChange={(e) => setFormData((p) => ({ ...p, tags: e.target.value }))} placeholder={t("crud.tagsPlaceholder")} />
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={formBusy}><X className="mr-1 h-4 w-4" /> {t("crud.cancel")}</Button>
              <Button onClick={handleCreateWorkflow} disabled={formBusy}>{formBusy ? t("crud.publishing") : t("crud.publish")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Workflow Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("crud.editWorkflow")}</DialogTitle>
              <DialogDescription>{t("crud.editWorkflowDesc")} &quot;{editingWorkflow?.title}&quot;.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="edit-title">{t("crud.titleLabel")}</Label>
                <Input id="edit-title" value={formData.title} onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-desc">{t("crud.descLabel")}</Label>
                <Input id="edit-desc" value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-yaml">{t("crud.yamlEditLabel")}</Label>
                <Textarea id="edit-yaml" value={formData.yaml_content} onChange={(e) => setFormData((p) => ({ ...p, yaml_content: e.target.value }))} placeholder={t("crud.yamlEditPlaceholder")} rows={6} className="font-mono text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-category">{t("crud.categoryLabel")}</Label>
                  <Select value={formData.category} onValueChange={(val) => setFormData((p) => ({ ...p, category: val }))}>
                    <SelectTrigger id="edit-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Community">{t("cat.Community")}</SelectItem>
                      <SelectItem value="Engineering">{t("cat.Engineering")}</SelectItem>
                      <SelectItem value="Creative">{t("cat.Creative")}</SelectItem>
                      <SelectItem value="Research">{t("cat.Research")}</SelectItem>
                      <SelectItem value="Business">{t("cat.Business")}</SelectItem>
                      <SelectItem value="Education">{t("cat.Education")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-icon">{t("crud.iconLabel")}</Label>
                  <Input id="edit-icon" value={formData.icon} onChange={(e) => setFormData((p) => ({ ...p, icon: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-tags">{t("crud.tagsLabel")}</Label>
                <Input id="edit-tags" value={formData.tags} onChange={(e) => setFormData((p) => ({ ...p, tags: e.target.value }))} />
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={formBusy}><X className="mr-1 h-4 w-4" /> {t("crud.cancel")}</Button>
              <Button onClick={handleEditWorkflow} disabled={formBusy}>{formBusy ? t("crud.saving") : t("crud.saveChanges")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("crud.deleteWorkflow")}</DialogTitle>
              <DialogDescription>{t("crud.deleteConfirm")} &quot;{deletingWorkflow?.title}&quot;{t("crud.deleteWarning")}</DialogDescription>
            </DialogHeader>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={formBusy}>{t("crud.cancel")}</Button>
              <Button variant="destructive" onClick={handleDeleteWorkflow} disabled={formBusy}>{formBusy ? t("crud.deleting") : t("crud.delete")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
