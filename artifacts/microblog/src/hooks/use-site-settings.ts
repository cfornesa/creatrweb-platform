import { useGetSiteSettings, getGetSiteSettingsQueryKey } from "@workspace/api-client-react";

export function useSiteSettings() {
  return useGetSiteSettings({
    query: {
      queryKey: getGetSiteSettingsQueryKey(),
      staleTime: 60_000,
    },
  });
}
