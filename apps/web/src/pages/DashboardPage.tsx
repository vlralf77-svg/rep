import { useState } from 'react';
import {
  Box, Typography, Container, ToggleButtonGroup, ToggleButton,
  CircularProgress, Alert, Button, Divider,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import { useMatches, useSync } from '../api/hooks';
import { useAppStore } from '../store';
import MatchCard from '../components/MatchCard';
import Disclaimer from '../components/Disclaimer';
import { SUPPORTED_LEAGUES } from '@sports/shared';

function groupByDate(matches: any[]): Record<string, any[]> {
  return matches.reduce((acc, m) => {
    const key = new Date(m.utcDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {} as Record<string, any[]>);
}

export default function DashboardPage() {
  const { selectedLeague, setLeague } = useAppStore();
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data: matches, isLoading, error } = useMatches({
    league: selectedLeague,
    status: statusFilter || undefined,
  });

  const syncMutation = useSync();

  const grouped = matches ? groupByDate(matches) : {};

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={700}>
          ⚽ 스포츠 예측
        </Typography>
        <Button
          startIcon={<SyncIcon />}
          size="small"
          variant="outlined"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          color="primary"
        >
          동기화
        </Button>
      </Box>

      <Box sx={{ overflowX: 'auto', mb: 2 }}>
        <ToggleButtonGroup
          value={selectedLeague}
          exclusive
          onChange={(_, v) => v && setLeague(v)}
          size="small"
          sx={{ gap: 0.5 }}
        >
          {SUPPORTED_LEAGUES.map(l => (
            <ToggleButton key={l.id} value={l.id} sx={{ borderRadius: '20px !important', px: 2, fontSize: 12 }}>
              {l.flag} {l.name}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Box mb={2}>
        <ToggleButtonGroup
          value={statusFilter}
          exclusive
          onChange={(_, v) => setStatusFilter(v ?? '')}
          size="small"
        >
          <ToggleButton value="">전체</ToggleButton>
          <ToggleButton value="SCHEDULED">예정</ToggleButton>
          <ToggleButton value="FINISHED">종료</ToggleButton>
          <ToggleButton value="LIVE">LIVE</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {isLoading && <Box textAlign="center" py={6}><CircularProgress color="primary" /></Box>}
      {error && <Alert severity="error">데이터를 불러오지 못했습니다. API 키를 확인하고 동기화를 실행하세요.</Alert>}

      {!isLoading && !error && Object.keys(grouped).length === 0 && (
        <Box textAlign="center" py={6}>
          <Typography color="text.secondary">경기 데이터가 없습니다. 동기화 버튼을 눌러주세요.</Typography>
        </Box>
      )}

      {Object.entries(grouped).map(([date, dayMatches]) => (
        <Box key={date} mb={3}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
            {date}
          </Typography>
          <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.06)' }} />
          {(dayMatches as any[]).map(m => <MatchCard key={m.id} match={m} />)}
        </Box>
      ))}

      <Disclaimer />
    </Container>
  );
}
