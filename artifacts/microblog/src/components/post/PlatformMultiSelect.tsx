import { Share2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EnabledPlatformConnection } from "@/hooks/use-enabled-platform-connections";

const PLATFORM_LABELS: Record<string, string> = {
  wordpress_com: "WordPress.com",
  wordpress_self: "WordPress",
  medium: "Medium",
  blogger: "Blogger",
  substack: "Substack",
};

type PlatformMultiSelectProps = {
  value: number[];
  onChange: (next: number[]) => void;
  connections: EnabledPlatformConnection[];
};

export function PlatformMultiSelect({ value, onChange, connections }: PlatformMultiSelectProps) {
  const selectedSet = new Set(value);

  function toggle(id: number) {
    if (selectedSet.has(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Share2 className="h-3.5 w-3.5" />
        Share to:
      </span>
      {connections.map((conn) => {
        const isSelected = selectedSet.has(conn.id);
        const label = PLATFORM_LABELS[conn.platform] ?? conn.platform;
        return (
          <button
            key={conn.id}
            type="button"
            onClick={() => toggle(conn.id)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-pressed={isSelected}
            aria-label={isSelected ? `Remove ${label}` : `Add ${label}`}
          >
            <Badge
              variant={isSelected ? "default" : "outline"}
              className="cursor-pointer gap-1 pr-1.5"
            >
              {label}
              {isSelected && <X className="h-3 w-3" aria-hidden />}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
