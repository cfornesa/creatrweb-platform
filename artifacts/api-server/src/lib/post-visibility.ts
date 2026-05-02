// Public reads expose only published posts; pending is owner-only.
// Used by GET /posts/:id and GET /og/posts/:id to keep the rule in one place.
export function isPostVisibleToReader(
  postStatus: string | null | undefined,
  user: { role?: string | null } | null,
): boolean {
  if (postStatus !== "pending") return true;
  return user?.role === "owner";
}
