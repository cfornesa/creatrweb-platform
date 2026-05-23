import { type ReactNode, useEffect } from "react";
import { ArrowLeft, Box, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ImmersiveMetadataField = {
  label: string;
  value: ReactNode;
  tone?: "default" | "warning";
};

type ImmersiveMetadataCardProps = {
  title: string;
  description: ReactNode;
  fields: ImmersiveMetadataField[];
};

type ImmersiveRouteShellProps = {
  title: string;
  onBack: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  renderScene: (context: { fullscreen: boolean; isMobile: boolean }) => ReactNode;
  metadataCard: ReactNode;
  sceneHeightClassName?: string;
};

function FullscreenToggleButton({
  isFullscreen,
  onToggle,
}: {
  isFullscreen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isFullscreen ? "Return to gallery view" : "Expand immersive view"}
      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
    </button>
  );
}

export function ImmersiveMetadataCard({
  title,
  description,
  fields,
}: ImmersiveMetadataCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5">
        <Box className="h-5 w-5" />
      </div>
      <h1 className="break-words text-xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-white/70">{description}</p>
      <dl className="mt-5 space-y-3 text-sm text-white/75">
        {fields.map((field) => (
          <div key={field.label}>
            <dt
              className={cn(
                "text-xs uppercase tracking-[0.18em]",
                field.tone === "warning" ? "text-amber-300/80" : "text-white/45",
              )}
            >
              {field.label}
            </dt>
            <dd
              className={cn(
                "mt-1 break-words leading-relaxed",
                field.tone === "warning" ? "text-amber-100/80" : undefined,
              )}
            >
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ImmersiveRouteShell({
  title,
  onBack,
  isFullscreen,
  onToggleFullscreen,
  renderScene,
  metadataCard,
  sceneHeightClassName = "h-[40svh] min-h-[16rem]",
}: ImmersiveRouteShellProps) {
  useEffect(() => {
    if (!isFullscreen) {
      return;
    }
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isFullscreen]);

  return (
    <>
      {isFullscreen ? (
        <div className="fixed inset-0 z-[120] bg-[#050b16]">
          <div className="relative h-screen w-screen overflow-hidden">
            {renderScene({ fullscreen: true, isMobile: true })}
            <div className="pointer-events-none absolute inset-0">
              <div className="pointer-events-auto absolute bottom-4 right-4 z-[130]">
                <FullscreenToggleButton isFullscreen onToggle={onToggleFullscreen} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "min-h-screen overflow-x-hidden bg-[#050b16] text-white",
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-xs uppercase tracking-[0.22em] text-white/55">Immersive View</p>
            <p className="break-words text-sm font-medium leading-tight text-white/80 sm:text-base">
              {title}
            </p>
          </div>
        </header>

        <main className="pb-6">
          <section className="relative shrink-0 border-b border-white/10">
            <div className={cn("w-full overflow-hidden", sceneHeightClassName)}>
              {renderScene({ fullscreen: false, isMobile: true })}
            </div>
            <div className="pointer-events-none absolute inset-0">
              <div className="pointer-events-auto absolute bottom-4 right-4 z-20">
                <FullscreenToggleButton isFullscreen={false} onToggle={onToggleFullscreen} />
              </div>
            </div>
          </section>

          <section className="shrink-0 bg-white/[0.03] p-5">{metadataCard}</section>
        </main>
      </div>
    </>
  );
}
