import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Plus, Link2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  useListNavLinks,
  useCreateNavLink,
  useUpdateNavLink,
  useDeleteNavLink,
  getListNavLinksQueryKey,
  type NavLink,
} from "@workspace/api-client-react";

export function NavLinksManagementCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const list = useListNavLinks({
    query: { queryKey: getListNavLinksQueryKey() },
  });
  const links: NavLink[] = list.data?.links ?? [];

  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newOpenNew, setNewOpenNew] = useState(true);
  const [newSort, setNewSort] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListNavLinksQueryKey() });

  const create = useCreateNavLink({
    mutation: {
      onSuccess: () => {
        setNewLabel("");
        setNewUrl("");
        setNewOpenNew(true);
        setNewSort("");
        invalidate();
        toast({ title: "Nav link added" });
      },
      onError: () => toast({ title: "Failed to add nav link", variant: "destructive" }),
    },
  });

  return (
    <Card className="mb-6" id="nav-links">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" /> Navigation links
        </CardTitle>
        <CardDescription>
          External links shown in the site navbar. Lower sort-order numbers
          appear first; ties fall back to creation order.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const label = newLabel.trim();
            const url = newUrl.trim();
            if (!label || !url) return;
            const parsedSort = Number.parseInt(newSort, 10);
            const maxOrder = links.reduce((m, l) => Math.max(m, l.sortOrder), -1);
            const sortOrder = Number.isFinite(parsedSort) ? parsedSort : maxOrder + 1;
            create.mutate({
              data: {
                label,
                url,
                openInNewTab: newOpenNew,
                sortOrder,
              },
            });
          }}
          className="space-y-2"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-nav-label">Label</Label>
              <Input
                id="new-nav-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="About"
                maxLength={64}
                data-testid="new-nav-link-label"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-nav-url">URL</Label>
              <Input
                id="new-nav-url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com/about"
                maxLength={2048}
                data-testid="new-nav-link-url"
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-nav-sort">Sort order</Label>
              <Input
                id="new-nav-sort"
                type="number"
                value={newSort}
                onChange={(e) => setNewSort(e.target.value)}
                placeholder="auto"
                data-testid="new-nav-link-sort"
              />
            </div>
            <label className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={newOpenNew}
                onCheckedChange={(v) => setNewOpenNew(Boolean(v))}
              />
              Open in a new tab
            </label>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={create.isPending || !newLabel.trim() || !newUrl.trim()}
            >
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        </form>

        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No nav links yet. Add one above to surface it in the site navbar.
          </p>
        ) : (
          <ul className="space-y-2">
            {links.map((link) => (
              <NavLinkRow key={link.id} link={link} onChanged={invalidate} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function NavLinkRow({
  link,
  onChanged,
}: {
  link: NavLink;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(link.label);
  const [draftUrl, setDraftUrl] = useState(link.url);
  const [draftOpenNew, setDraftOpenNew] = useState(link.openInNewTab);
  const [draftSort, setDraftSort] = useState(String(link.sortOrder));

  const update = useUpdateNavLink({
    mutation: {
      onSuccess: () => {
        setIsEditing(false);
        onChanged();
        toast({ title: "Nav link updated" });
      },
      onError: () => toast({ title: "Failed to update nav link", variant: "destructive" }),
    },
  });
  const remove = useDeleteNavLink({
    mutation: {
      onSuccess: () => {
        onChanged();
        toast({ title: "Nav link deleted" });
      },
      onError: () => toast({ title: "Failed to delete nav link", variant: "destructive" }),
    },
  });

  if (isEditing) {
    return (
      <li className="rounded-xl border border-border p-3 space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`label-${link.id}`} className="text-xs">Label</Label>
            <Input
              id={`label-${link.id}`}
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              maxLength={64}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`url-${link.id}`} className="text-xs">URL</Label>
            <Input
              id={`url-${link.id}`}
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              maxLength={2048}
            />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`sort-${link.id}`} className="text-xs">Sort order</Label>
            <Input
              id={`sort-${link.id}`}
              type="number"
              value={draftSort}
              onChange={(e) => setDraftSort(e.target.value)}
            />
          </div>
          <label className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={draftOpenNew}
              onCheckedChange={(v) => setDraftOpenNew(Boolean(v))}
            />
            Open in a new tab
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={update.isPending}
            onClick={() => {
              const sortNum = Number.parseInt(draftSort, 10);
              update.mutate({
                id: link.id,
                data: {
                  label: draftLabel.trim() || undefined,
                  url: draftUrl.trim() || undefined,
                  openInNewTab: draftOpenNew,
                  sortOrder: Number.isFinite(sortNum) ? sortNum : undefined,
                },
              });
            }}
          >
            Save
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
          {link.label}
          {link.openInNewTab ? (
            <ExternalLink
              className="h-3 w-3 text-muted-foreground"
              aria-label="Opens in a new tab"
            />
          ) : null}
        </div>
        <p className="truncate text-xs text-foreground/70 mt-0.5">{link.url}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          sort: {link.sortOrder}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditing(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete &ldquo;{link.label}&rdquo;?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This removes the link from the site navbar. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => remove.mutate({ id: link.id })}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}
