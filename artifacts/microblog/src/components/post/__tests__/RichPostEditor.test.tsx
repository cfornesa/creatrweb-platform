import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";
import { RichPostEditor } from "@/components/post/RichPostEditor";

const editorState = {
  html: "<p>Hello world</p>",
  text: "Hello world",
  isEmpty: false,
};

const setContent = vi.fn((next: string) => {
  editorState.html = next;
});
const processMutateAsync = vi.fn();
const toastSpy = vi.fn();
let processPending = false;

vi.mock("@tiptap/react", () => ({
  useEditor: () => ({
    isEmpty: editorState.isEmpty,
    isActive: () => false,
    getHTML: () => editorState.html,
    getText: () => editorState.text,
    getAttributes: () => ({}),
    can: () => ({
      undo: () => true,
      redo: () => true,
    }),
    chain: () => ({
      focus: () => ({
        toggleBold: () => ({ run: vi.fn() }),
        toggleItalic: () => ({ run: vi.fn() }),
        toggleUnderline: () => ({ run: vi.fn() }),
        toggleHeading: () => ({ run: vi.fn() }),
        toggleBulletList: () => ({ run: vi.fn() }),
        toggleBlockquote: () => ({ run: vi.fn() }),
        setTextAlign: () => ({ run: vi.fn() }),
        extendMarkRange: () => ({ setLink: () => ({ run: vi.fn() }) }),
        unsetLink: () => ({ run: vi.fn() }),
        setImage: () => ({ run: vi.fn() }),
        insertIframe: () => ({ run: vi.fn() }),
        undo: () => ({ run: vi.fn() }),
        redo: () => ({ run: vi.fn() }),
      }),
    }),
    commands: {
      setContent,
    },
  }),
  EditorContent: () => <div data-testid="editor-content" />,
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useProcessAiText: (options?: any) => ({
      isPending: processPending,
      mutateAsync: async (payload: unknown) => {
        try {
          return await processMutateAsync(payload);
        } catch (error) {
          options?.mutation?.onError?.(error);
          throw error;
        }
      },
    }),
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

vi.mock("../iframe-embed", () => ({
  IframeEmbed: {},
}));

vi.mock("../CategoryMultiSelect", () => ({
  CategoryMultiSelect: () => <div data-testid="category-multiselect" />,
}));

vi.mock("@tiptap/starter-kit", () => ({
  default: {
    configure: () => ({}),
  },
}));

vi.mock("@tiptap/extension-image", () => ({
  default: {},
}));

vi.mock("@tiptap/extension-text-align", () => ({
  default: {
    configure: () => ({}),
  },
}));

function renderEditor(aiVendors: Array<{ id: string; label: string }>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RichPostEditor
        aiVendors={aiVendors}
        initialContent={editorState.html}
        submitLabel="Post"
        onUpload={async () => "/api/media/image.jpg"}
        onSubmit={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("RichPostEditor AI action", () => {
  beforeEach(() => {
    editorState.html = "<p>Hello world</p>";
    editorState.text = "Hello world";
    editorState.isEmpty = false;
    setContent.mockClear();
    processMutateAsync.mockReset();
    toastSpy.mockReset();
    processPending = false;
  });

  it("hides the AI button when AI is unavailable", () => {
    renderEditor([]);
    expect(screen.queryByRole("button", { name: /AI/i })).toBeNull();
  });

  it("shows the AI button and replaces editor content on success", async () => {
    const user = userEvent.setup();
    processMutateAsync.mockResolvedValue({ text: "Improved draft text" });
    renderEditor([{ id: "opencode-zen", label: "Opencode Zen" }]);

    await user.click(screen.getByRole("button", { name: /AI/i }));

    expect(processMutateAsync).toHaveBeenCalledWith({
      data: { content: "<p>Hello world</p>", vendor: "opencode-zen" },
    });
    await waitFor(() => {
      expect(setContent).toHaveBeenCalledWith("<p>Improved draft text</p>", { emitUpdate: true });
    });
  });

  it("shows a spinner state while the AI request is pending", () => {
    processPending = true;
    renderEditor([{ id: "opencode-zen", label: "Opencode Zen" }]);

    const button = screen.getByRole("button", { name: /AI/i });
    expect(button).toBeDisabled();
    expect(button.querySelector(".animate-spin")).not.toBeNull();
  });

  it("preserves content and shows an error toast when AI fails", async () => {
    const user = userEvent.setup();
    processMutateAsync.mockRejectedValue(
      new ApiError(
        new Response(JSON.stringify({ error: "Upstream failed" }), {
          status: 502,
          statusText: "Bad Gateway",
          headers: { "content-type": "application/json" },
        }),
        { error: "Upstream failed" },
        { method: "POST", url: "/api/ai/process" },
      ),
    );
    renderEditor([{ id: "opencode-zen", label: "Opencode Zen" }]);

    await user.click(screen.getByRole("button", { name: /AI/i }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "AI request failed",
          variant: "destructive",
        }),
      );
    });
    expect(setContent).not.toHaveBeenCalled();
  });

  it("shows a user-friendly timeout toast when the provider times out", async () => {
    const user = userEvent.setup();
    processMutateAsync.mockRejectedValue(
      new ApiError(
        new Response(JSON.stringify({ error: "The AI provider timed out. Try again." }), {
          status: 502,
          statusText: "Bad Gateway",
          headers: { "content-type": "application/json" },
        }),
        { error: "The AI provider timed out. Try again." },
        { method: "POST", url: "/api/ai/process" },
      ),
    );
    renderEditor([{ id: "opencode-zen", label: "Opencode Zen" }]);

    await user.click(screen.getByRole("button", { name: /AI/i }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "AI request failed",
          description: "The AI provider timed out. Try again.",
          variant: "destructive",
        }),
      );
    });
    expect(setContent).not.toHaveBeenCalled();
  });

  it("lets the owner choose the vendor before sending the request", async () => {
    const user = userEvent.setup();
    processMutateAsync.mockResolvedValue({ text: "Improved draft text" });
    renderEditor([
      { id: "opencode-zen", label: "Opencode Zen" },
      { id: "google", label: "Google" },
    ]);

    await user.selectOptions(screen.getByLabelText("AI Vendor"), "google");
    await user.click(screen.getByRole("button", { name: /AI/i }));

    expect(processMutateAsync).toHaveBeenCalledWith({
      data: { content: "<p>Hello world</p>", vendor: "google" },
    });
  });
});
