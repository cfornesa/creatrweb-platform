import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ArtPieceGenerationPhase = "generating" | "failed" | "timedOut" | "cancelled";

export type ArtPieceGenerationState = {
  open: boolean;
  phase: ArtPieceGenerationPhase;
  prompt: string;
  engine: string | null;
  vendorLabel: string | null;
  model: string | null;
  attemptCount: number;
  maxAttempts: number;
  message: string | null;
  failureStage?: string | null;
  rawResponsePreview?: string | null;
  startedAt: number;
  approximateAttempts?: boolean;
};

type ArtPieceGenerationDialogProps = {
  state: ArtPieceGenerationState;
  onOpenChange: (open: boolean) => void;
  onStop: () => void;
  onRetry: () => void;
};

export function ArtPieceGenerationDialog({
  state,
  onOpenChange,
  onStop,
  onRetry,
}: ArtPieceGenerationDialogProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!state.open || state.phase !== "generating") {
      setElapsedMs(0);
      return;
    }

    const updateElapsed = () => setElapsedMs(Date.now() - state.startedAt);
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 250);
    return () => window.clearInterval(interval);
  }, [state.open, state.phase, state.startedAt]);

  const elapsedLabel = useMemo(() => {
    const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [elapsedMs]);

  const title = state.phase === "generating"
    ? "Generating interactive piece"
    : state.phase === "timedOut"
      ? "Generation timed out"
      : state.phase === "cancelled"
        ? "Generation stopped"
        : "Generation failed";

  const description = state.phase === "generating"
    ? `The server is generating, compiling, and preflighting this ${state.engine ?? "interactive"} piece before it can be shown as a draft.`
    : state.message ?? "The interactive piece could not be validated yet.";

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] grid-rows-[auto_1fr_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto min-h-0 space-y-4">
          <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
            <p><span className="font-medium text-foreground">Prompt:</span> {state.prompt}</p>
            <p className="mt-1">
              <span className="font-medium text-foreground">Runtime:</span> {state.engine ?? "unknown"}
              {state.vendorLabel ? ` via ${state.vendorLabel}` : ""}
              {state.model ? ` (${state.model})` : ""}
            </p>
            {state.failureStage ? (
              <p className="mt-1"><span className="font-medium text-foreground">Failure stage:</span> {state.failureStage}</p>
            ) : null}
            <p className="mt-1">
              <span className="font-medium text-foreground">Attempts:</span>{" "}
              {state.approximateAttempts ? "at least " : ""}
              {state.attemptCount} / {state.maxAttempts}
            </p>
            {state.phase === "generating" ? (
              <p className="mt-1"><span className="font-medium text-foreground">Elapsed:</span> {elapsedLabel}</p>
            ) : null}
          </div>

          {state.phase !== "generating" && state.message ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{state.message}</p>
              {state.rawResponsePreview ? (
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground">Last raw response preview</p>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {state.rawResponsePreview}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {state.phase === "generating" ? (
            <Button type="button" variant="outline" onClick={onStop}>
              Stop
            </Button>
          ) : (
            <Button type="button" onClick={onRetry}>
              Try again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
