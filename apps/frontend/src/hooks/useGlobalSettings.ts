import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPut } from "../api/client";
import type { GlobalSettings } from "../types/api";

export function useGlobalSettings() {
  return useQuery({
    queryKey: ["global-settings"],
    queryFn: () => apiGet<GlobalSettings>("/admin/global-settings"),
  });
}

export function useUpdateGlobalSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: GlobalSettings) =>
      apiPut<GlobalSettings>("/admin/global-settings", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-settings"] });
    },
  });
}
