import {
  useListPlatformConnections,
  getListPlatformConnectionsQueryKey,
  type PlatformConnection,
} from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export type EnabledPlatformConnection = PlatformConnection;

export function useEnabledPlatformConnections() {
  const { isOwner } = useCurrentUser();

  const query = useListPlatformConnections({
    query: { enabled: isOwner, queryKey: getListPlatformConnectionsQueryKey() },
  });

  const connections = (query.data?.connections ?? []).filter(
    (c) => c.configured && c.enabled,
  );

  return { connections, isLoading: query.isLoading };
}
