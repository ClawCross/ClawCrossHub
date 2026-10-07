"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Github } from "lucide-react";

import { LanguageToggle } from "@/components/clawcrosshub/language-toggle";
import { ClawcrossHubLogo } from "@/components/clawcrosshub/logo";
import { StableI18nText } from "@/components/clawcrosshub/stable-i18n-text";
import { ThemeToggle } from "@/components/clawcrosshub/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SiteHeaderProps = {
  activePage?: "explore" | "intro";
  repoLabelKey?: string;
  children?: ReactNode;
};

function navLinkClass(active: boolean) {
  return cn(
    "relative z-10 inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors",
    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
  );
}

export function SiteHeader({ activePage, repoLabelKey = "header.clawcross", children }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="container flex h-16 items-center gap-3">
        <Link href="/" className="text-xl font-bold text-primary">
          <ClawcrossHubLogo />
        </Link>

        <nav className="hidden md:block">
          <div className="relative grid min-w-[200px] grid-cols-2 rounded-full border border-border/80 bg-muted/50 p-1 shadow-sm">
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full border border-primary/15 bg-background shadow-[0_10px_30px_-18px_hsl(var(--foreground)/0.35)] transition-transform duration-200 ease-out",
                activePage === "intro" ? "translate-x-full" : "translate-x-0"
              )}
            />
            <Link href="/" className={navLinkClass(activePage === "explore")}>
              <StableI18nText translationKey="header.explore" />
            </Link>
            <Link href="/intro" className={navLinkClass(activePage === "intro")}>
              <StableI18nText translationKey="header.intro" />
            </Link>
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />

          <a
            href="https://github.com/ClawCross/ClawCross"
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "hidden sm:inline-flex")}
          >
            <Github className="h-4 w-4" />
            <StableI18nText translationKey={repoLabelKey} />
          </a>

          <a
            href="https://github.com/ClawCross/ClawCross"
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "icon" }), "sm:hidden")}
            aria-label="Clawcross GitHub"
            title="Clawcross GitHub"
          >
            <Github className="h-4 w-4" />
          </a>

          {children}
        </div>
      </div>
    </header>
  );
}
