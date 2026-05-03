import { useEffect, useMemo, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNavLinks,
  useReorderNavItems,
  useUpdateNavLink,
  useDeleteNavLink,
  useCreateNavLink,
  getListNavLinksQueryKey,
  type NavLink as NavLinkRecord,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  GripVertical,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  ExternalLink,
  Plus,
  Globe,
  FileText,
  Settings,
} from "lucide-react";

export function NavItemsReorderCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const list = useListNavLinks(
    { includeHidden: "1" },
    { query: { queryKey: getListNavLinksQueryKey({ includeHidden: "1" }) } },
  );
  const links: NavLinkRecord[] = useMemo(
    () => list.data?.links ?? [],
    [list.data?.links],
  );

  const [order, setOrder] = useState<NavLinkRecord[]>(links);
  useEffect(() => {
    setOrder(links);
  }, [links]);

  const reorder = useReorderNavItems({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNavLinksQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getListNavLinksQueryKey({ includeHidden: "1" }),
        });
      },
      onError: () => {
        toast({ title: "Couldn't save the new order", variant: "destructive" });
        queryClient.invalidateQueries({
          queryKey: getListNavLinksQueryKey({ includeHidden: "1" }),
        });
      },
    },
  });

  const persistOrder = (next: NavLinkRecord[]) => {
    const items = next.map((item, i) => ({ id: item.id, sortOrder: (i + 1) * 10 }));
    reorder.mutate({ data: { items } });
  };

  return (
    <Card data-testid="nav-items-reorder-card">
      <CardHeader>
        <CardTitle>Navigation</CardTitle>
        <CardDescription>
          Drag rows to reorder. The first row appears leftmost in the navbar.
          External rows accept any URL; page rows are linked to a CMS page
          (edit the page itself to change its URL); the system row points to
          the built-in <code className="rounded bg-muted px-1 text-xs">/feeds</code> page and can be hidden but not deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CreateExternalLinkForm />
        {order.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            No nav rows yet. Add an external link above, or publish a page with &quot;Show in nav&quot; enabled.
          </p>
        ) : (
          <Reorder.Group
            axis="y"
            values={order}
            onReorder={(next) => {
              setOrder(next);
            }}
            className="space-y-2"
          >
            {order.map((item) => (
              <NavItemRow
                key={item.id}
                item={item}
                onCommitOrder={() => persistOrder(order)}
              />
            ))}
          </Reorder.Group>
        )}
      </CardContent>
    </Card>
  );
}

function CreateExternalLinkForm() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [openInNewTab, setOpenInNewTab] = useState(true);
  const create = useCreateNavLink({
    mutation: {
      onSuccess: () => {
        setLabel("");
        setUrl("");
        setOpenInNewTab(true);
        queryClient.invalidateQueries({ queryKey: getListNavLinksQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getListNavLinksQueryKey({ includeHidden: "1" }),
        });
        toast({ title: "Nav link added" });
      },
      onError: () => toast({ title: "Failed to add nav link", variant: "destructive" }),
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmedLabel = label.trim();
        const trimmedUrl = url.trim();
        if (!trimmedLabel || !trimmedUrl) return;
        create.mutate({
          data: { label: trimmedLabel, url: trimmedUrl, openInNewTab, sortOrder: 0 },
        });
      }}
      className="grid gap-2 rounded-xl border border-dashed border-border p-3 sm:grid-cols-[1fr_2fr_auto_auto]"
      data-testid="nav-create-form"
    >
      <div className="space-y-1">
        <Label htmlFor="new-nav-label" className="text-xs">Label</Label>
        <Input
          id="new-nav-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={64}
          placeholder="About"
          data-testid="new-nav-link-label"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="new-nav-url" className="text-xs">URL</Label>
        <Input
          id="new-nav-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          maxLength={2048}
          placeholder="https://example.com/about"
          data-testid="new-nav-link-url"
        />
      </div>
      <label className="flex items-end gap-2 pb-1.5 text-xs text-muted-foreground">
        <Checkbox
          checked={openInNewTab}
          onCheckedChange={(v) => setOpenInNewTab(Boolean(v))}
        />
        New tab
      </label>
      <Button
        type="submit"
        disabled={create.isPending || !label.trim() || !url.trim()}
        className="self-end"
      >
        <Plus className="mr-1 h-4 w-4" /> Add
      </Button>
    </form>
  );
}

function NavItemRow({
  item,
  onCommitOrder,
}: {
  item: NavLinkRecord;
  onCommitOrder: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const controls = useDragControls();
  const [isEditing, setIsEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(item.label);
  const [draftUrl, setDraftUrl] = useState(item.url);
  const [draftOpenNew, setDraftOpenNew] = useState(item.openInNewTab);
  useEffect(() => {
    setDraftLabel(item.label);
    setDraftUrl(item.url);
    setDraftOpenNew(item.openInNewTab);
  }, [item.label, item.url, item.openInNewTab]);

  const update = useUpdateNavLink({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNavLinksQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getListNavLinksQueryKey({ includeHidden: "1" }),
        });
      },
      onError: () => toast({ title: "Couldn't update nav row", variant: "destructive" }),
    },
  });
  const remove = useDeleteNavLink({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNavLinksQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getListNavLinksQueryKey({ includeHidden: "1" }),
        });
        toast({ title: "Nav link deleted" });
      },
      onError: () => toast({ title: "Couldn't delete nav row", variant: "destructive" }),
    },
  });

  const kindIcon =
    item.kind === "page" ? FileText : item.kind === "system" ? Settings : Globe;
  const KindIcon = kindIcon;
  const isUrlEditable = item.kind === "external";

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      onDragEnd={() => onCommitOrder()}
      className="rounded-xl border border-border bg-card"
      data-testid={`nav-row-${item.id}`}
    >
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          aria-label="Drag to reorder"
          onPointerDown={(e) => controls.start(e)}
          className="mt-1 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          data-testid={`nav-drag-handle-${item.id}`}
        >
          <GripVertical className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          {isEditing && isUrlEditable ? (
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    maxLength={64}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">URL</Label>
                  <Input
                    value={draftUrl}
                    onChange={(e) => setDraftUrl(e.target.value)}
                    maxLength={2048}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={draftOpenNew}
                  onCheckedChange={(v) => setDraftOpenNew(Boolean(v))}
                />
                Open in a new tab
              </label>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate(
                      {
                        id: item.id,
                        data: {
                          label: draftLabel.trim() || undefined,
                          url: draftUrl.trim() || undefined,
                          openInNewTab: draftOpenNew,
                        },
                      },
                      {
                        onSuccess: () => {
                          setIsEditing(false);
                          toast({ title: "Saved" });
                        },
                      },
                    )
                  }
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm font-medium">
                <KindIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {item.label}
                {item.openInNewTab ? (
                  <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden />
                ) : null}
                <KindBadge kind={item.kind} />
              </div>
              <p className="truncate text-xs text-foreground/70">
                {item.kind === "page" && item.pageSlug
                  ? `/p/${item.pageSlug}`
                  : item.url || (item.kind === "page" ? "(unpublished)" : "")}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              update.mutate({
                id: item.id,
                data: { visible: !item.visible },
              })
            }
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={item.visible ? "Hide from navbar" : "Show in navbar"}
            title={item.visible ? "Hide from navbar" : "Show in navbar"}
            data-testid={`nav-visibility-${item.id}`}
          >
            {item.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          {isUrlEditable && !isEditing ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsEditing(true)}
              aria-label="Edit"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : null}
          {item.kind === "page" && item.pageId != null ? (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Edit page"
              title="Edit page"
            >
              <a
                href={`/admin/pages/${item.pageId}/edit`}
                data-testid={`nav-edit-page-${item.id}`}
              >
                <Pencil className="h-4 w-4" />
              </a>
            </Button>
          ) : null}
          {item.kind === "external" ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete &ldquo;{item.label}&rdquo;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Removes this link from the navbar. Cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => remove.mutate({ id: item.id })}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>
    </Reorder.Item>
  );
}

function KindBadge({ kind }: { kind: "external" | "page" | "system" }) {
  const styles =
    kind === "page"
      ? "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200"
      : kind === "system"
      ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles}`}>
      {kind}
    </span>
  );
}

