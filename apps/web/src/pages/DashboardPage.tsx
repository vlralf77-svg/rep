import { useState } from 'react';
import {
  Container, Typography, Box, Select, MenuItem, FormControl,
  InputLabel, Button, CircularProgress, Alert, AppBar, Toolbar,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import { useMatches, useSyncMatches } from '../api/hooks';
import { useAppStore } from '../store';
import MatchCard from '../components/MatchCard';

const LEAGUES = [
  { code: 'PL', name: '프리미어리그' },
  { code: 'BL1', name: '분데스리가' },
  { code: 'SA', name: '세리에 A' },
  { code: 'PD', name: '라리가' },
  { code: 'FL1', name: '리그 1' },
];

const STATUSES = [
  { code: 'SCHEDULED', name: '예정' },
  { code: 'FINISHED', name: '종료' },
  { code: 'LIVE', name: '진행중' },
];

function groupMatchesByDate(matches: Array<{ utcDate: string; [key: string]: unknown }>) {
  const groups: Record<string, typeof matches> = {};
  for (const match of matches) {
    const date = new Date(match.utcDate).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    });
    if (!groups[date]) groups[date] = [];
    groups[date].push(match);
  }
  return groups;
}

export default function DashboardPage() {
  const { selectedLeague, selectedStatus, setSelectedLeague, setSelectedStatus } = useAppStore();
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const { data, isLoading, error } = useMatches({
    league: selectedLeague,
    status: selectedStatus,
    limit: LIMIT,
    offset,
  });

  const syncMutation = useSyncMatches();

  const matches = data?.matches || [];
  const grouped = groupMatchesByDate(matches);

  return (
    <>
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Toolbar>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
            스포츠 예측
          </Typography>
          <Button
            startIcon={syncMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            size="small"
            variant="outlined"
            sx={{ mr: 1 }}
          >
            동기화
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>리그</InputLabel>
            <Select
              value={selectedLeague}
              label="리그"
              onChange={(e) => { setSelectedLeague(e.target.value); setOffset(0); }}
            >
              {LEAGUES.map((l) => (
                <MenuItem key={l.code} value={l.code}>{l.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>상태</InputLabel>
            <Select
              value={selectedStatus}
              label="상태"
              onChange={(e) => { setSelectedStatus(e.target.value); setOffset(0); }}
            >
              {STATUSES.map((s) => (
                <MenuItem key={s.code} value={s.code}>{s.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            경기 데이터를 불러오는데 실패했습니다. 동기화 버튼을 눌러 데이터를 가져오세요.
          </Alert>
        )}

        {!isLoading && matches.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary">경기 데이터가 없습니다.</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              동기화 버튼을 눌러 football-data.org에서 데이터를 가져오세요.
            </Typography>
          </Box>
        )}

        {Object.entries(grouped).map(([date, dayMatches]) => (
          <Box key={date} sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
              {date}
            </Typography>
            {dayMatches.map((match) => (
              <MatchCard key={match.id as number} match={match as Parameters<typeof MatchCard>[0]['match']} />
            ))}
          </Box>
        ))}

        {data && data.total > LIMIT && (
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 2 }}>
            <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
              이전
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
              {Math.floor(offset / LIMIT) + 1} / {Math.ceil(data.total / LIMIT)}
            </Typography>
            <Button
              disabled={offset + LIMIT >= data.total}
              onClick={() => setOffset(offset + LIMIT)}
            >
              다음
            </Button>
          </Box>
        )}
      </Container>
    </>
  );
}
