import type { Metadata } from "next";

import { IntroPage } from "@/components/clawcrosshub/intro-page";

export const metadata: Metadata = {
  title: "ClawCross — Local AI Workspace | ClawCross",
  description:
    "Meet ClawCross: a local-first AI workspace with OASIS workflows, OASIS Town, GraphRAG memory, ClawCross Creator, and ClawCross as the flow distribution layer.",
  alternates: {
    canonical: "/intro"
  },
  openGraph: {
    url: "https://clawcross.net/intro",
    title: "ClawCross — Local AI Workspace | ClawCross",
    description:
      "Run AI teams locally, design workflows visually, and share reusable flows through ClawCross."
  }
};

export default function Page() {
  return <IntroPage />;
}
