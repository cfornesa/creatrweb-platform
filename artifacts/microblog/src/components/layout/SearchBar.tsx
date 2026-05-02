import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Header search field. Lives in the Navbar on every page.
 *
 * Layout:
 *   - On `sm` and up the field is rendered inline in the navbar.
 *   - Below `sm` we render only a magnifier icon button; tapping it
 *     opens a top sheet with the same input. This keeps the navbar
 *     uncluttered on phones while still making search reachable
 *     from every page (the spec requires "header search on every
 *     page").
 *
 * Keyboard:
 *   - `/` from anywhere on the page (except inside another input or a
 *     contenteditable) focuses the inline input on desktop, or opens
 *     the sheet on mobile.
 *   - `Esc` while focused clears the value and blurs the field. The
 *     sheet itself also closes on Esc via Radix.
 *
 * Submit on Enter navigates to `/search?q=…`; the search page is the
 * single source of truth for filter state going forward.
 */
export function SearchBar() {
  const [, setLocation] = useLocation();
  const [value, setValue] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const inlineRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLInputElement>(null);

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
      const isMobile = window.matchMedia("(max-width: 639px)").matches;
      if (isMobile) {
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

  return (
    <>
      {/* Desktop: inline input. Hidden below `sm`. */}
      <form
        onSubmit={onInlineSubmit}
        role="search"
        className="relative hidden sm:block"
        data-testid="header-search"
      >
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
          placeholder="Search posts…"
          aria-label="Search posts"
          // `enterKeyHint=search` flips the mobile keyboard's return key
          // glyph to a magnifier so the action is discoverable.
          enterKeyHint="search"
          className="h-9 w-44 pl-8 md:w-56"
        />
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
          <form onSubmit={onSheetSubmit} role="search" className="relative">
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
              placeholder="Search posts…"
              aria-label="Search posts"
              enterKeyHint="search"
              className="h-11 w-full pl-9"
            />
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
