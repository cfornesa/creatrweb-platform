import { useMemo, useState, type KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X, Tag, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useListCategories,
  useCreateCategory,
  getListCategoriesQueryKey,
  type Category,
} from "@workspace/api-client-react";

type CategoryMultiSelectProps = {
  value: number[];
  onChange: (next: number[]) => void;
  /** Hide the "create new" affordance for non-owners. */
  allowCreate?: boolean;
};

/**
 * Owner-facing multi-select for the post categories.
 *
 * Every existing category surfaces as a clickable chip; the input
 * filters them by name. Pressing Enter on an unmatched query creates
 * a new category through `POST /api/categories` and selects it. We
 * deliberately do not auto-create on every keystroke — the explicit
 * "Create" affordance keeps single-character typos out of the catalog.
 */
export function CategoryMultiSelect({
  value,
  onChange,
  allowCreate = true,
}: CategoryMultiSelectProps) {
  const queryClient = useQueryClient();
  const list = useListCategories({
    query: { queryKey: getListCategoriesQueryKey() },
  });
  const categories: Category[] = list.data?.categories ?? [];
  const [input, setInput] = useState("");

  const selectedIds = useMemo(() => new Set(value), [value]);
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  const matches = useMemo(() => {
    if (!trimmed) return categories.filter((c) => !selectedIds.has(c.id)).slice(0, 8);
    return categories
      .filter((c) => !selectedIds.has(c.id) && c.name.toLowerCase().includes(lower))
      .slice(0, 8);
  }, [categories, selectedIds, trimmed, lower]);

  const exactMatch = useMemo(
    () => categories.find((c) => c.name.toLowerCase() === lower),
    [categories, lower],
  );

  const createCategory = useCreateCategory({
    mutation: {
      onSuccess: (created) => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        onChange(Array.from(new Set([...value, created.id])));
        setInput("");
      },
    },
  });

  const selectedCategories = value
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => Boolean(c));

  function toggle(id: number) {
    if (selectedIds.has(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  function remove(id: number) {
    onChange(value.filter((v) => v !== id));
  }

  function handleCreate() {
    if (!allowCreate || !trimmed || createCategory.isPending) return;
    if (exactMatch) {
      if (!selectedIds.has(exactMatch.id)) toggle(exactMatch.id);
      setInput("");
      return;
    }
    createCategory.mutate({ data: { name: trimmed } });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    } else if (e.key === "Backspace" && input.length === 0 && value.length > 0) {
      remove(value[value.length - 1]);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-background px-3 py-2">
        <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
        {selectedCategories.map((c) => (
          <Badge
            key={c.id}
            variant="secondary"
            className="gap-1 cursor-pointer"
            onClick={() => remove(c.id)}
          >
            {c.name}
            <X className="h-3 w-3" />
          </Badge>
        ))}
        <Input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            value.length === 0
              ? "Add categories — type to filter, Enter to create"
              : "Add another…"
          }
          className="flex-1 min-w-[12rem] border-0 shadow-none focus-visible:ring-0 px-0"
          data-testid="category-multiselect-input"
        />
        {allowCreate && trimmed && !exactMatch ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleCreate}
            disabled={createCategory.isPending}
            className="gap-1 rounded-full"
          >
            <Plus className="h-3 w-3" /> Create “{trimmed}”
          </Button>
        ) : null}
      </div>
      {matches.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {matches.map((c) => (
            <Badge
              key={c.id}
              variant="outline"
              className="cursor-pointer hover:bg-accent"
              onClick={() => toggle(c.id)}
            >
              <Tag className="h-3 w-3 mr-1" />
              {c.name}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
