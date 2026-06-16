import { useState } from 'react';
import {
  Container, Typography, Box, Select, MenuItem, FormControl,
  InputLabel, Button, CircularProgress, Alert, AppBar, Toolbar, Tabs, Tab,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import SportsBaseballIcon from '@mui/icons-material/SportsBaseball';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import { useMatches, useSyncMatches } from '../api/hooks';
import { useAppStore } from '../store';
import MatchCard from '../components/MatchCard';

const FOOTBALL_LEAGUES = [
  { code: 'PL', name: '프리미어리그' },
  { code: 'BL1', name: '분데스리가' },
  { code: 'SA', name: '세리에 A' },
  { code: 'PD', name: '라리가' },
  { code: 'FL1', name: '리그 1' },
];

const BASEBALL_LEAGUES = [
  { code: 'KBO', name: 'KBO 리그' },
];

const STATUSES = [
  { code: '', name: '전체' },
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
  const [sport, setSport] = useState<'football' | 'baseball'>('football');
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const leagues = sport === 'football' ? FOOTBALL_LEAGUES : BASEBALL_LEAGUES;
  const currentLeague = sport === 'football' ? selectedLeague : 'KBO';

  const { data, isLoading, error } = useMatches({
    sport,
    league: currentLeague,
    status: selectedStatus || undefined,
    limit: LIMIT,
    offset,
  });

  const syncMutation = useSyncMatches();
  const syncResult = syncMutation.data as { matchesSynced?: number; status?: string; message?: string } | undefined;

  const matches = data?.matches || [];
  const grouped = groupMatchesByDate(matches);

  const handleSportChange = (_: React.SyntheticEvent, newSport: 'football' | 'baseball') => {
    setSport(newSport);
    setOffset(0);
    if (newSport === 'football') setSelectedLeague('PL');
  };

  return (
    <>
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Toolbar>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
            스포츠 예측
          </Typography>
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

        <Tabs
          value={sport}
          onChange={handleSportChange}
          sx={{ px: 2, minHeight: 40 }}
          TabIndicatorProps={{ style: { backgroundColor: '#4fc3f7' } }}
        >
          <Tab
            value="football"
            label="축구"
            icon={<SportsSoccerIcon fontSize="small" />}
            iconPosition="start"
            sx={{ minHeight: 40, fontSize: 13, color: 'text.secondary', '&.Mui-selected': { color: 'primary.main' } }}
          />
          <Tab
            value="baseball"
            label="KBO 야구"
            icon={<SportsBaseballIcon fontSize="small" />}
            iconPosition="start"
            sx={{ minHeight: 40, fontSize: 13, color: 'text.secondary', '&.Mui-selected': { color: 'primary.main' } }}
          />
        </Tabs>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          {sport === 'football' && (
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>리그</InputLabel>
              <Select
                value={selectedLeague}
                label="리그"
                onChange={(e) => { setSelectedLeague(e.target.value); setOffset(0); }}
              >
                {leagues.map((l) => (
                  <MenuItem key={l.code} value={l.code}>{l.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

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

        {syncResult && syncResult.status === 'success' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            동기화 완료: {syncResult.matchesSynced}경기 업데이트됨
            {syncResult.matchesSynced === 0 && ' (오늘 경기 데이터가 아직 없습니다)'}
          </Alert>
        )}
        {syncResult && syncResult.status === 'error' && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            동기화 오류: {syncResult.message || 'API 연결 실패'}
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            데이터를 불러오지 못했습니다. 동기화 버튼을 눌러 데이터를 가져오세요.
          </Alert>
        )}

        {!isLoading && matches.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary" fontSize={40} mb={1}>
              {sport === 'baseball' ? '⚾' : '⚽'}
            </Typography>
            <Typography color="text.secondary">
              {sport === 'baseball' ? 'KBO 경기 데이터가 없습니다.' : '경기 데이터가 없습니다.'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              동기화 버튼을 눌러 데이터를 가져오세요.
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
            <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>이전</Button>
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
              {Math.floor(offset / LIMIT) + 1} / {Math.ceil(data.total / LIMIT)}
            </Typography>
            <Button disabled={offset + LIMIT >= data.total} onClick={() => setOffset(offset + LIMIT)}>다음</Button>
          </Box>
        )}
      </Container>
    </>
  );
}
