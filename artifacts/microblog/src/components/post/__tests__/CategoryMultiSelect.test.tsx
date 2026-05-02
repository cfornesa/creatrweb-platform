import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CategoryMultiSelect } from "@/components/post/CategoryMultiSelect";

/**
 * Behaviour coverage for the composer's category multi-select:
 * - existing categories surface as filter-able suggestions
 * - clicking a suggestion selects it (chip appears)
 * - typing + Enter on an unmatched query calls `createCategory` and,
 *   on success, the parent's onChange receives the new id
 */

type Category = { id: number; name: string; slug: string };

const existing: Category[] = [
  { id: 1, name: "Photography", slug: "photography" },
  { id: 2, name: "Travel", slug: "travel" },
];

const createMutate = vi.fn();
let mutationOptions: {
  onSuccess?: (
    cat: Category,
    vars: unknown,
    ctx: unknown,
  ) => void;
} = {};

vi.mock("@workspace/api-client-react", () => ({
  useListCategories: () => ({
    data: { categories: existing },
    isLoading: false,
    isError: false,
  }),
  useCreateCategory: (opts: {
    mutation?: {
      onSuccess?: (cat: Category, vars: unknown, ctx: unknown) => void;
    };
  }) => {
    mutationOptions = opts?.mutation ?? {};
    return {
      mutate: createMutate,
      isPending: false,
    };
  },
  getListCategoriesQueryKey: () => ["categories"],
}));

function renderHarness(initial: number[] = []) {
  let current = initial;
  const onChange = vi.fn((next: number[]) => {
    current = next;
  });
  const utils = render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CategoryMultiSelect value={current} onChange={onChange} />
    </QueryClientProvider>,
  );
  return { ...utils, onChange, getCurrent: () => current };
}

describe("CategoryMultiSelect", () => {
  it("filters suggestions by typed query", () => {
    renderHarness();
    expect(screen.getByText("Photography")).toBeInTheDocument();
    expect(screen.getByText("Travel")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("category-multiselect-input"), {
      target: { value: "trav" },
    });
    // Only the Travel suggestion remains after filtering.
    expect(screen.queryByText("Photography")).toBeNull();
    expect(screen.getByText("Travel")).toBeInTheDocument();
  });

  it("selects an existing suggestion when clicked", () => {
    const { onChange } = renderHarness();
    fireEvent.click(screen.getByText("Photography"));
    expect(onChange).toHaveBeenCalledWith([1]);
  });

  it("creates a new category on Enter and selects it on success", () => {
    createMutate.mockReset();
    const { onChange } = renderHarness();
    const input = screen.getByTestId("category-multiselect-input");
    fireEvent.change(input, { target: { value: "Cooking" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(createMutate).toHaveBeenCalledWith({ data: { name: "Cooking" } });

    // Simulate the optimistic onSuccess wired up by the component.
    mutationOptions.onSuccess?.(
      { id: 99, name: "Cooking", slug: "cooking" },
      { data: { name: "Cooking" } },
      undefined,
    );
    expect(onChange).toHaveBeenCalledWith([99]);
  });
});
