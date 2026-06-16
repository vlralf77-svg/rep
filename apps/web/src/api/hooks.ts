import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { syncSport, getMatches, getPrediction, Sport } from '../lib/api';

export function useMatches(params: { sport: Sport; status?: string }) {
  return useQuery({
    queryKey: ['matches', params],
    queryFn: async () => {
      const matches = getMatches(params.sport, params.status || undefined);
      return { matches, total: matches.length };
    },
  });
}

export function useMatchPrediction(matchId: string | null) {
  return useQuery({
    queryKey: ['prediction', matchId],
    queryFn: async () => {
      if (!matchId) return null;
      return getPrediction(matchId);
    },
    enabled: matchId !== null,
  });
}

export function useSyncMatches() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { sport: Sport }) => {
      const result = await syncSport(params.sport);
      return { matchesSynced: result.count, status: result.error ? 'error' : 'success', message: result.error };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}
