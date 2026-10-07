import { cn } from "@/lib/utils";
import { ClawcrossMark } from "@/components/clawcrosshub/clawcross-mark";

export function ClawcrossHubLogo({
  className,
  iconClassName,
  showText = true,
  textClassName
}: {
  className?: string;
  iconClassName?: string;
  showText?: boolean;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-2xl font-bold", className)}>
      <ClawcrossMark className={cn("h-9 w-9", iconClassName)} />
      {showText ? (
        <span
          className={cn(
            "clawcrosshub-logo-text",
            textClassName
          )}
        >
          ClawCrossHub
        </span>
      ) : null}
    </span>
  );
}
