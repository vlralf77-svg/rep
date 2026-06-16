import { useState } from 'react';
import {
  Container, Typography, Box, Select, MenuItem, FormControl,
  InputLabel, Button, CircularProgress, Alert, AppBar, Toolbar, Tabs, Tab,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import SportsBaseballIcon from '@mui/icons-material/SportsBaseball';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import { useMatches, useSyncMatches } from '../api/hooks';
import MatchCard from '../components/MatchCard';
import { FOOTBALL_LEAGUES, Sport, AppMatch } from '../lib/api';

const STATUSES = [
  { code: '', name: '전체' },
  { code: 'SCHEDULED', name: '예정' },
  { code: 'FINISHED', name: '종료' },
];

function groupByDate(matches: AppMatch[]) {
  const g: Record<string, AppMatch[]> = {};
  for (const m of matches) {
    const d = new Date(m.utcDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
    (g[d] = g[d] || []).push(m);
  }
  return g;
}

export default function DashboardPage() {
  const [sport, setSport] = useState<Sport>('football');
  const [league, setLeague] = useState('PL');
  const [status, setStatus] = useState('');

  const { data, isLoading } = useMatches({ sport, status: status || undefined });
  const syncMutation = useSyncMatches();
  const syncResult = syncMutation.data;

  let matches: AppMatch[] = data?.matches || [];
  if (sport === 'football') matches = matches.filter(m => m.league === league);
  const grouped = groupByDate(matches);

  return (
    <>
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Toolbar>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>스포츠 예측</Typography>
          <Button
            startIcon={syncMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
            onClick={() => syncMutation.mutate({ sport })}
            disabled={syncMutation.isPending}
            size="small"
            variant="outlined"
          >
            동기화
          </Button>
        </Toolbar>
        <Tabs value={sport} onChange={(_, v) => setSport(v)} sx={{ px: 2, minHeight: 40 }}>
          <Tab value="football" label="축구" icon={<SportsSoccerIcon fontSize="small" />} iconPosition="start" sx={{ minHeight: 40, fontSize: 13 }} />
          <Tab value="baseball" label="KBO 야구" icon={<SportsBaseballIcon fontSize="small" />} iconPosition="start" sx={{ minHeight: 40, fontSize: 13 }} />
        </Tabs>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          {sport === 'football' && (
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>리그</InputLabel>
              <Select value={league} label="리그" onChange={(e) => setLeague(e.target.value)}>
                {FOOTBALL_LEAGUES.map((l) => <MenuItem key={l.code} value={l.code}>{l.name}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>상태</InputLabel>
            <Select value={status} label="상태" onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <MenuItem key={s.code} value={s.code}>{s.name}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>

        {syncMutation.isPending && (
          <Alert severity="info" sx={{ mb: 2 }}>
            데이터를 가져오는 중입니다... {sport === 'football' && '(축구는 5개 리그 수집에 30초 정도 걸립니다)'}
          </Alert>
        )}
        {syncResult?.status === 'success' && !syncMutation.isPending && (
          <Alert severity="success" sx={{ mb: 2 }}>
            동기화 완료: {syncResult.matchesSynced}경기 수집됨
            {syncResult.matchesSynced === 0 && ' (해당 종목 일정 데이터가 아직 없습니다)'}
          </Alert>
        )}
        {syncResult?.status === 'error' && (
          <Alert severity="warning" sx={{ mb: 2 }}>동기화 오류: {syncResult.message}</Alert>
        )}

        {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}

        {!isLoading && matches.length === 0 && !syncMutation.isPending && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography fontSize={40} mb={1}>{sport === 'baseball' ? '⚾' : '⚽'}</Typography>
            <Typography color="text.secondary">경기 데이터가 없습니다.</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>상단 동기화 버튼을 눌러 데이터를 가져오세요.</Typography>
          </Box>
        )}

        {Object.entries(grouped).map(([date, dayMatches]) => (
          <Box key={date} sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>{date}</Typography>
            {dayMatches.map((m) => <MatchCard key={m.id} match={m} />)}
          </Box>
        ))}
      </Container>
    </>
  );
}
