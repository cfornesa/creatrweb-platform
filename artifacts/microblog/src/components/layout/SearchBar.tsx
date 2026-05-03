import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Header search field. Lives in the Navbar on every page.
 *
 * Layout:
 *   - Default (desktop, no flag): inline form rendered with a
 *     responsive `hidden sm:flex` so the navbar can drop it in
 *     directly. The mobile-icon trigger + bottom sheet are kept
 *     for any caller that still wants the standalone responsive
 *     widget, but the Navbar now owns the mobile placement and
 *     uses `compact` instead.
 *   - `compact` (used by the Navbar's centered mobile slot): just
 *     the input + submit button, always visible, no separate
 *     trigger or sheet of its own. The Navbar wraps it in a
 *     centered flex container between the logo and the hamburger.
 *   - `embed` (used inside the hamburger sheet): the same form
 *     stretched to fill its container.
 *
 * Keyboard:
 *   - `/` from anywhere on the page (except inside another input or a
 *     contenteditable) focuses the inline input. In the default
 *     standalone widget on a narrow viewport, it instead opens the
 *     bottom sheet.
 *   - `Esc` while focused clears the value and blurs the field. The
 *     sheet itself also closes on Esc via Radix.
 *
 * Submit on Enter navigates to `/search?q=…`; the search page is the
 * single source of truth for filter state going forward.
 */
export function SearchBar({
  embed = false,
  compact = false,
}: { embed?: boolean; compact?: boolean } = {}) {
  const [, setLocation] = useLocation();
  // Subscribe to the URL's query string so the input mirrors the
  // active query (e.g. landing on `/search?q=hello` shows "hello",
  // and removing the `q` chip empties the input).
  const search = useSearch();
  const urlQ = new URLSearchParams(search).get("q") ?? "";
  const [value, setValue] = useState(urlQ);
  const [sheetOpen, setSheetOpen] = useState(false);
  const inlineRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLInputElement>(null);
  // When the URL changes while the user is focused in one of our
  // inputs we don't want to clobber their in-flight text. Stash the
  // pending URL value and apply it on blur — so e.g. browser
  // back/forward while typing is still respected once focus leaves.
  const pendingUrlQRef = useRef<string | null>(null);

  // Re-sync local input state whenever the URL `q` changes from the
  // outside (chip removal, back/forward, in-page search submit).
  useEffect(() => {
    const focused = document.activeElement;
    if (focused === inlineRef.current || focused === sheetRef.current) {
      // Defer the sync until the user blurs so we don't overwrite
      // what they're typing mid-keystroke.
      pendingUrlQRef.current = urlQ;
      return;
    }
    pendingUrlQRef.current = null;
    setValue(urlQ);
  }, [urlQ]);

  // On blur, adopt any URL change that arrived while focused. If
  // nothing changed (or the user just pressed Esc to clear), this is
  // a no-op and we keep whatever the user left in the field.
  function applyPendingUrlSync() {
    if (pendingUrlQRef.current !== null) {
      setValue(pendingUrlQRef.current);
      pendingUrlQRef.current = null;
    }
  }

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (target.isContentEditable) return true;
      return false;
    }

    function handler(e: KeyboardEvent) {
      if (e.key !== "/") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Pressing `/` while already typing in another field would be
      // surprising — don't steal the keystroke from real form work.
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      // Tailwind's `sm` breakpoint is 640px. We mirror it here so the
      // shortcut targets whichever surface is currently visible.
      // In `compact` and `embed` modes the inline input is always in
      // the DOM (the Navbar owns placement) so we focus it directly
      // without consulting the viewport.
      const isMobile = window.matchMedia("(max-width: 639px)").matches;
      if (isMobile && !embed && !compact) {
        setSheetOpen(true);
      } else {
        inlineRef.current?.focus();
        inlineRef.current?.select();
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Autofocus the sheet input once the overlay is open. Radix mounts
  // the content asynchronously, so a microtask is enough to land on
  // the input after it appears in the DOM.
  useEffect(() => {
    if (!sheetOpen) return;
    const id = window.setTimeout(() => {
      sheetRef.current?.focus();
      sheetRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [sheetOpen]);

  function submit() {
    const trimmed = value.trim();
    // Submitting with an empty input while the URL already carries a
    // `q` would silently wipe the active query — almost never what
    // the user meant. Treat it as a no-op (just close/blur). Users
    // who genuinely want to clear should use the input's clear
    // control or press Esc.
    if (!trimmed && urlQ) {
      // Re-mirror the active query into the field so "URL is the
      // source of truth" stays visibly true after a blank submit.
      setValue(urlQ);
      pendingUrlQRef.current = null;
      setSheetOpen(false);
      inlineRef.current?.blur();
      sheetRef.current?.blur();
      return;
    }
    // Navigating to `/search` with no `q` is intentional — the
    // results page also serves as the filter-only entry point.
    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
    const qs = params.toString();
    setLocation(qs ? `/search?${qs}` : `/search`);
    setSheetOpen(false);
    inlineRef.current?.blur();
    sheetRef.current?.blur();
  }

  function onInlineSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit();
  }

  function onSheetSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit();
  }

  function onInlineKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setValue("");
      inlineRef.current?.blur();
    }
  }

  // Sheet input mirrors the desktop Esc behavior so the keyboard
  // affordance is consistent across surfaces. Radix's Sheet also
  // closes on Esc; clearing first means a re-open starts empty.
  function onSheetKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setValue("");
      sheetRef.current?.blur();
    }
  }

  if (embed || compact) {
    return (
      <form
        onSubmit={onInlineSubmit}
        role="search"
        className="relative flex items-center gap-1.5"
        data-testid={compact ? "header-search-compact" : "header-search-embed"}
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={inlineRef}
            type="search"
            name="q"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onInlineKeyDown}
            onBlur={applyPendingUrlSync}
            placeholder="Search posts…"
            aria-label="Search posts"
            enterKeyHint="search"
            className="h-9 w-full pl-8"
          />
        </div>
        <Button type="submit" size="sm" variant="secondary" className="h-9">
          Search
        </Button>
      </form>
    );
  }

  return (
    <>
      <form
        onSubmit={onInlineSubmit}
        role="search"
        className="relative hidden sm:flex items-center gap-1.5"
        data-testid="header-search"
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={inlineRef}
            type="search"
            name="q"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onInlineKeyDown}
            onBlur={applyPendingUrlSync}
            placeholder="Search posts…"
            aria-label="Search posts"
            // `enterKeyHint=search` flips the mobile keyboard's return key
            // glyph to a magnifier so the action is discoverable.
            enterKeyHint="search"
            className="h-9 w-44 pl-8 md:w-56"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          className="h-9"
          data-testid="header-search-submit"
        >
          Search
        </Button>
      </form>

      {/* Mobile: icon button that opens a top sheet with the same field. */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="sm:hidden"
        aria-label="Open search"
        data-testid="header-search-mobile-trigger"
        onClick={() => setSheetOpen(true)}
      >
        <Search className="h-5 w-5" />
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="top"
          className="pt-6"
          data-testid="header-search-sheet"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Search posts</SheetTitle>
          </SheetHeader>
          <form onSubmit={onSheetSubmit} role="search" className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                ref={sheetRef}
                type="search"
                name="q"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={onSheetKeyDown}
                onBlur={applyPendingUrlSync}
                placeholder="Search posts…"
                aria-label="Search posts"
                enterKeyHint="search"
                className="h-11 w-full pl-9"
              />
            </div>
            <Button
              type="submit"
              className="h-11"
              data-testid="header-search-sheet-submit"
            >
              Search
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
