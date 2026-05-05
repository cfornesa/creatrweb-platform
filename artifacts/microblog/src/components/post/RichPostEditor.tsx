import { useEffect, useId, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Button } from "@/components/ui/button";
import { Loader2, ImagePlus, Link2, Pilcrow, Redo2, Sparkles, Undo2, Youtube } from "lucide-react";
import { useProcessAiText, type ProcessAiTextBodyVendor } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { IframeEmbed } from "./iframe-embed";
import { CategoryMultiSelect } from "./CategoryMultiSelect";
import { getAiFailureMessage } from "./ai-error";

type RichPostEditorProps = {
  initialContent: string;
  placeholder?: string;
  submitLabel: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  /** Initial selected category ids (empty array == no categories). */
  initialCategoryIds?: number[];
  /**
   * When omitted, the category multiselect is hidden — used by
   * non-owner edit surfaces (none today) and by tests that want a
   * minimal editor.
   */
  showCategories?: boolean;
  aiVendors?: Array<{ id: ProcessAiTextBodyVendor; label: string }>;
  onCancel?: () => void;
  onSubmit: (payload: {
    content: string;
    contentFormat: "html";
    categoryIds: number[];
  }) => void;
  /**
   * Optional live-content listener. Fires on every editor update so a
   * parent can mirror the current HTML and persist it via its own save
   * button (used by the page editor — its Save/Publish buttons aren't
   * the editor's onSubmit).
   */
  onContentChange?: (html: string) => void;
  onUpload: (file: File) => Promise<string>;
};

function getEditorTextLength(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

function ensureParagraphHtml(html: string) {
  const trimmed = html.trim();
  if (trimmed === "") {
    return "<p></p>";
  }
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed;
  }
  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function parseIframeEmbed(embedCode: string) {
  const document = new DOMParser().parseFromString(embedCode, "text/html");
  const iframe = document.querySelector("iframe");
  if (!iframe?.getAttribute("src")) {
    return null;
  }

  return {
    src: iframe.getAttribute("src") ?? "",
    width: iframe.getAttribute("width") ?? "100%",
    height: iframe.getAttribute("height") ?? "420",
    title: iframe.getAttribute("title") ?? "Embedded content",
    allow: iframe.getAttribute("allow") ?? undefined,
    loading: iframe.getAttribute("loading") ?? "lazy",
    referrerpolicy: iframe.getAttribute("referrerpolicy") ?? undefined,
    sandbox: iframe.getAttribute("sandbox") ?? undefined,
    frameborder: iframe.getAttribute("frameborder") ?? "0",
    allowfullscreen: iframe.hasAttribute("allowfullscreen") ? "true" : undefined,
  };
}

export function RichPostEditor({
  initialContent,
  placeholder = "Write something worth lingering on...",
  submitLabel,
  cancelLabel = "Cancel",
  isSubmitting = false,
  initialCategoryIds = [],
  showCategories = true,
  aiVendors = [],
  onCancel,
  onSubmit,
  onContentChange,
  onUpload,
}: RichPostEditorProps) {
  const { toast } = useToast();
  const fileInputId = useId();
  const [textLength, setTextLength] = useState(getEditorTextLength(initialContent));
  const [categoryIds, setCategoryIds] = useState<number[]>(initialCategoryIds);
  const [selectedAiVendor, setSelectedAiVendor] = useState<ProcessAiTextBodyVendor | "">(aiVendors[0]?.id ?? "");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const processAiText = useProcessAiText({
    mutation: {
      onError: (error: any) => {
        const message = getAiFailureMessage(error);
        toast({ title: "AI request failed", description: message, variant: "destructive" });
      },
    },
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
        },
      }),
      Image,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      IframeEmbed,
    ],
    content: ensureParagraphHtml(initialContent),
    editorProps: {
      attributes: {
        class:
          "min-h-[220px] rounded-b-2xl border border-t-0 border-border bg-background px-4 py-4 pb-16 text-base leading-relaxed focus:outline-none prose prose-neutral max-w-none prose-p:my-3 prose-h2:mt-6 prose-h2:mb-3 prose-h3:mt-5 prose-h3:mb-2 prose-img:rounded-xl prose-img:border prose-img:border-border prose-iframe:w-full prose-iframe:rounded-xl prose-iframe:border prose-iframe:border-border",
      },
    },
    onUpdate({ editor: nextEditor }) {
      setTextLength(nextEditor.getText().trim().length);
      onContentChange?.(nextEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextContent = ensureParagraphHtml(initialContent);
    if (editor.getHTML() !== nextContent) {
      editor.commands.setContent(nextContent, { emitUpdate: true });
    }
  }, [editor, initialContent]);

  useEffect(() => {
    if (aiVendors.length === 0) {
      if (selectedAiVendor !== "") {
        setSelectedAiVendor("");
      }
      return;
    }

    if (!aiVendors.some((vendor) => vendor.id === selectedAiVendor)) {
      setSelectedAiVendor(aiVendors[0]!.id);
    }
  }, [aiVendors, selectedAiVendor]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !editor) {
      return;
    }

    const url = await onUpload(file);
    editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    event.target.value = "";
  }

  function handleInsertLink() {
    if (!editor) {
      return;
    }

    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Enter the link URL", previousUrl ?? "https://");
    if (url === null) {
      return;
    }
    if (url.trim() === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function handleInsertEmbed() {
    if (!editor) {
      return;
    }

    const embedCode = window.prompt("Paste the iframe embed code");
    if (!embedCode) {
      return;
    }

    const iframe = parseIframeEmbed(embedCode);
    if (!iframe) {
      window.alert("That embed code does not contain a valid iframe.");
      return;
    }

    editor.chain().focus().insertIframe(iframe).run();
  }

  function handleSubmit() {
    if (!editor) {
      return;
    }

    const html = editor.getHTML();
    const meaningfulHtml = html
      .replace(/<p><\/p>/g, "")
      .replace(/<p>\s*<\/p>/g, "")
      .trim();

    if (meaningfulHtml === "") {
      return;
    }

    onSubmit({
      content: html,
      contentFormat: "html",
      categoryIds,
    });
  }

  async function handleImproveWithAi() {
    if (!editor) {
      return;
    }

    if (!selectedAiVendor) {
      return;
    }

    const currentHtml = editor.getHTML();
    const meaningfulHtml = currentHtml
      .replace(/<p><\/p>/g, "")
      .replace(/<p>\s*<\/p>/g, "")
      .trim();

    if (meaningfulHtml === "") {
      return;
    }

    try {
      const response = await processAiText.mutateAsync({
        data: { content: currentHtml, vendor: selectedAiVendor },
      });

      editor.commands.setContent(ensureParagraphHtml(response.text), { emitUpdate: true });
      toast({
        title: "Draft improved",
        description: "The editor content has been replaced with the AI-assisted rewrite.",
      });
    } catch {
      // onError already surfaces the failure to the user; keep the current
      // editor content unchanged and avoid bubbling an unhandled rejection.
    }
  }

  if (!editor) {
    return null;
  }

  const toolbarButtonClass = "h-9 rounded-full px-3 text-xs font-medium";
  const aiButtonClass =
    "rounded-none border-2 border-yellow-400 bg-zinc-100/95 text-zinc-950 shadow-[3px_3px_0_0_rgba(234,179,8,1)] hover:bg-yellow-200 dark:bg-zinc-950/95 dark:text-yellow-200 dark:hover:bg-zinc-900";
  const aiSelectClass =
    "pointer-events-auto h-9 min-w-[11rem] rounded-none border-2 border-yellow-400 bg-zinc-100/95 px-3 text-sm text-zinc-950 shadow-[3px_3px_0_0_rgba(234,179,8,1)] focus:outline-none focus:ring-0 dark:bg-zinc-950/95 dark:text-yellow-200";

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/30 px-3 py-3">
          <Button type="button" variant={editor.isActive("bold") ? "default" : "outline"} size="sm" className={toolbarButtonClass} onClick={() => editor.chain().focus().toggleBold().run()}>
            Bold
          </Button>
          <Button type="button" variant={editor.isActive("italic") ? "default" : "outline"} size="sm" className={toolbarButtonClass} onClick={() => editor.chain().focus().toggleItalic().run()}>
            Italic
          </Button>
          <Button type="button" variant={editor.isActive("underline") ? "default" : "outline"} size="sm" className={toolbarButtonClass} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            Underline
          </Button>
          <Button type="button" variant={editor.isActive("heading", { level: 2 }) ? "default" : "outline"} size="sm" className={toolbarButtonClass} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            H2
          </Button>
          <Button type="button" variant={editor.isActive("heading", { level: 3 }) ? "default" : "outline"} size="sm" className={toolbarButtonClass} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            H3
          </Button>
          <Button type="button" variant={editor.isActive("bulletList") ? "default" : "outline"} size="sm" className={toolbarButtonClass} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            List
          </Button>
          <Button type="button" variant={editor.isActive("blockquote") ? "default" : "outline"} size="sm" className={toolbarButtonClass} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            Quote
          </Button>
          <Button type="button" variant="outline" size="sm" className={toolbarButtonClass} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
            Left
          </Button>
          <Button type="button" variant="outline" size="sm" className={toolbarButtonClass} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
            Center
          </Button>
          <Button type="button" variant="outline" size="sm" className={toolbarButtonClass} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
            Right
          </Button>
          <Button type="button" variant="outline" size="sm" className={toolbarButtonClass} onClick={handleInsertLink}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            Link
          </Button>
          <Button type="button" variant="outline" size="sm" className={toolbarButtonClass} onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
            Image
          </Button>
          <Button type="button" variant="outline" size="sm" className={toolbarButtonClass} onClick={handleInsertEmbed}>
            <Youtube className="mr-1.5 h-3.5 w-3.5" />
            Embed
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative">
          {editor.isEmpty ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-5 py-4 text-muted-foreground/60">
              <div className="flex items-center gap-2 text-base">
                <Pilcrow className="h-4 w-4" />
                <span>{placeholder}</span>
              </div>
            </div>
          ) : null}

          <EditorContent editor={editor} />

          {aiVendors.length > 0 ? (
            <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex items-center gap-2">
              <select
                aria-label="AI Vendor"
                className={aiSelectClass}
                value={selectedAiVendor}
                onChange={(event) => setSelectedAiVendor(event.target.value as ProcessAiTextBodyVendor)}
              >
                {aiVendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                className={`pointer-events-auto min-h-9 px-3 ${aiButtonClass}`}
                disabled={isSubmitting || processAiText.isPending || textLength === 0 || !selectedAiVendor}
                onClick={() => void handleImproveWithAi()}
              >
                {processAiText.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                AI
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {showCategories ? (
        <CategoryMultiSelect value={categoryIds} onChange={setCategoryIds} />
      ) : null}

      <input
        id={fileInputId}
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          HTML is sanitized on save. Rich posts support images and approved iframe embeds.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{textLength} chars</span>
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              {cancelLabel}
            </Button>
          ) : null}
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
