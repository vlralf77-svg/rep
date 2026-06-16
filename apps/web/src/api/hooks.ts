import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export interface MatchListParams {
  sport?: string;
  league?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export function useMatches(params: MatchListParams = {}) {
  return useQuery({
    queryKey: ['matches', params],
    queryFn: async () => {
      const { data } = await api.get('/matches', { params });
      return data;
    },
  });
}

export function useMatchPrediction(matchId: number | null) {
  return useQuery({
    queryKey: ['prediction', matchId],
    queryFn: async () => {
      const { data } = await api.get(`/matches/${matchId}/prediction`);
      return data;
    },
    enabled: matchId !== null,
  });
}

export function useSyncMatches() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params?: { sport?: string }) => {
      const { data } = await api.post('/matches/sync', null, { params });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}
