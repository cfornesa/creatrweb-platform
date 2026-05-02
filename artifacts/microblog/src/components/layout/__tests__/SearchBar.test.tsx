import { act } from "react";
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { SearchBar } from "@/components/layout/SearchBar";

function renderAt(url: string) {
  window.history.replaceState(null, "", url);
  return render(
    <Router>
      <SearchBar />
    </Router>,
  );
}

describe("SearchBar URL sync", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("initializes the input from the URL `q` param", () => {
    renderAt("/search?q=hello");
    const desktopInput = screen
      .getByTestId("header-search")
      .querySelector("input[type='search']") as HTMLInputElement;
    expect(desktopInput.value).toBe("hello");
  });

  it("re-syncs the input when the URL `q` changes from outside (chip removal)", async () => {
    renderAt("/search?q=hello");
    const desktopInput = screen
      .getByTestId("header-search")
      .querySelector("input[type='search']") as HTMLInputElement;
    expect(desktopInput.value).toBe("hello");

    // Simulate the search page clearing q via chip removal.
    await act(async () => {
      window.history.pushState(null, "", "/search");
    });
    expect(desktopInput.value).toBe("");
  });

  it("does not clobber typed text while the input is focused, but applies the URL change on blur", async () => {
    const user = userEvent.setup();
    renderAt("/search?q=hello");
    const desktopInput = screen
      .getByTestId("header-search")
      .querySelector("input[type='search']") as HTMLInputElement;

    await user.click(desktopInput);
    await user.clear(desktopInput);
    await user.type(desktopInput, "draft");
    expect(desktopInput.value).toBe("draft");

    // While the user is still typing, the URL changes (e.g. browser
    // back). We should NOT overwrite "draft" mid-keystroke.
    await act(async () => {
      window.history.pushState(null, "", "/search?q=world");
    });
    expect(desktopInput.value).toBe("draft");
    expect(document.activeElement).toBe(desktopInput);

    // On blur the deferred URL value should be applied.
    await act(async () => {
      desktopInput.blur();
    });
    expect(desktopInput.value).toBe("world");
  });

  it("treats an empty submit as a no-op when the URL already has a `q`", async () => {
    const user = userEvent.setup();
    renderAt("/search?q=hello");
    const desktopForm = screen.getByTestId("header-search");
    const desktopInput = desktopForm.querySelector(
      "input[type='search']",
    ) as HTMLInputElement;

    await user.click(desktopInput);
    await user.clear(desktopInput);
    expect(desktopInput.value).toBe("");

    await user.click(screen.getByTestId("header-search-submit"));
    // URL should NOT have been wiped to /search; the active query is
    // preserved.
    expect(window.location.pathname + window.location.search).toBe(
      "/search?q=hello",
    );
    // The input field re-mirrors the active URL query so "URL is the
    // source of truth" stays visibly true after the no-op submit.
    expect(desktopInput.value).toBe("hello");
  });

  it("Esc clears the input without re-populating from the URL on blur", async () => {
    const user = userEvent.setup();
    renderAt("/search?q=hello");
    const desktopInput = screen
      .getByTestId("header-search")
      .querySelector("input[type='search']") as HTMLInputElement;

    await user.click(desktopInput);
    expect(desktopInput.value).toBe("hello");

    // Esc clears + blurs. No URL change happened during focus, so
    // the blur handler should not repopulate from the URL.
    await user.keyboard("{Escape}");
    expect(desktopInput.value).toBe("");
    expect(document.activeElement).not.toBe(desktopInput);
  });
});
