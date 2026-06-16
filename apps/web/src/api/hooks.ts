import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { PredictionResult } from '@sports/shared';

const api = axios.create({ baseURL: '/api' });

export function useMatches(filters?: { league?: string; status?: string; date?: string }) {
  return useQuery({
    queryKey: ['matches', filters],
    queryFn: async () => {
      const res = await api.get('/matches', { params: filters });
      return res.data;
    },
    staleTime: 60_000,
  });
}

export function usePrediction(matchId: number | null) {
  return useQuery<PredictionResult>({
    queryKey: ['prediction', matchId],
    queryFn: async () => {
      const res = await api.get(`/matches/${matchId}/prediction`);
      return res.data;
    },
    enabled: matchId !== null,
    staleTime: 300_000,
  });
}

export function useSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post('/matches/sync');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}
