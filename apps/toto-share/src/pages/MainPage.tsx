import { useMemo, useState, useCallback } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Container,
  Stack,
  Chip,
  Button,
  Snackbar,
  Alert,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import RefreshIcon from '@mui/icons-material/Refresh';
import MatchGroup from '../components/MatchGroup';
import PickSummaryBar from '../components/PickSummaryBar';
import OnlineUsers from '../components/OnlineUsers';
import AdminMatchForm from '../components/AdminMatchForm';
import SportFilter, { groupSport } from '../components/SportFilter';
import { useAuth } from '../hooks/useAuth';
import { useMatches, todayKey } from '../hooks/useMatches';
import { usePicks } from '../hooks/usePicks';
import { useOnlineUsers } from '../hooks/useOnlineUsers';
import { useAutoImport } from '../hooks/useAutoImport';
import { useStore } from '../store';
import { isAdmin } from '../config';
import type { Selection, PickSummary } from '../types';

function formatDate(key: string): string {
  const [y, m, d] = key.split('-');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  return `${m}월 ${d}일 (${days[date.getDay()]})`;
}

export default function MainPage() {
  const { user, logout } = useAuth();
  const { matches } = useMatches();
  const { picks, myPicks, submitPick, removePick, confirmCombo, resetPicks } =
    usePicks();
  const { onlineUsers } = useOnlineUsers();
  const { lastUpdated, refreshing, refresh } = useAutoImport();
  const confirmedCombo = useStore((s) => s.confirmedCombo);
  const [sportFilter, setSportFilter] = useState('전체');
  const day = todayKey();
  const admin = isAdmin(user?.nickname);

  const handleReset = async () => {
    const msg = admin
      ? '전원의 픽을 모두 초기화합니다. 계속할까요?'
      : '내가 선택한 픽을 초기화합니다. 계속할까요?';
    if (!window.confirm(msg)) return;
    await resetPicks(admin);
  };

  const pickSummaries = useMemo(() => {
    const map: Record<string, PickSummary> = {};
    for (const m of matches) {
      map[m.id] = { HOME: 0, DRAW: 0, AWAY: 0, users: {} };
    }
    for (const p of picks) {
      if (!map[p.matchId]) continue;
      map[p.matchId][p.selection]++;
      map[p.matchId].users[p.uid] = p.selection;
    }
    return map;
  }, [matches, picks]);

  const [dupeAlert, setDupeAlert] = useState('');

  const groupOf = useCallback(
    (matchId: string) => {
      const m = matches.find((x) => x.id === matchId);
      if (!m) return null;
      return `${m.homeTeam}|${m.awayTeam}|${m.startTime}`;
    },
    [matches],
  );

  const handleSelect = (matchId: string, sel: Selection) => {
    if (myPicks[matchId] === sel) {
      removePick(matchId);
      return;
    }
    const gKey = groupOf(matchId);
    if (gKey) {
      const sameGroupMatch = matches.find(
        (m) =>
          m.id !== matchId &&
          `${m.homeTeam}|${m.awayTeam}|${m.startTime}` === gKey &&
          myPicks[m.id],
      );
      if (sameGroupMatch) {
        const existing = sameGroupMatch.marketType || '승무패';
        setDupeAlert(
          `같은 경기에서 이미 "${existing}" 마켓을 선택했습니다. 기존 선택을 해제한 후 다시 선택하세요.`,
        );
        return;
      }
    }
    submitPick(matchId, sel);
  };

  // 같은 경기끼리 묶기. 팀명+경기시간으로 그룹핑하면 gameKey 유무와
  // 상관없이(예전/새 데이터 혼용해도) 항상 한 그룹으로 모인다.
  const groups = useMemo(() => {
    const map = new Map<string, typeof matches>();
    for (const m of matches) {
      const key = `${m.homeTeam}|${m.awayTeam}|${m.startTime}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    // 그룹별 대표 경기시간 기준 정렬
    return Array.from(map.entries())
      .map(([key, ms]) => ({ key, ms }))
      .sort((a, b) => a.ms[0].startTime - b.ms[0].startTime);
  }, [matches]);

  return (
    <Box sx={{ pb: Object.keys(myPicks).length > 0 ? 28 : 9 }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Toolbar sx={{ justifyContent: 'space-between', minHeight: '56px !important' }}>
          <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
            벳
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {lastUpdated && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                {lastUpdated.toLocaleTimeString('ko-KR')}
              </Typography>
            )}
            <IconButton
              size="small"
              onClick={refresh}
              disabled={refreshing}
              color="inherit"
              sx={refreshing ? { animation: 'spin 1s linear infinite', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } } : {}}
            >
              <RefreshIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <Chip
              label={user?.nickname}
              size="small"
              color="primary"
              variant="outlined"
            />
            <IconButton size="small" onClick={logout} color="inherit">
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="sm" sx={{ py: 2 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 1.5 }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <CalendarTodayIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="subtitle2" color="text.secondary">
              {formatDate(day)}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              startIcon={<RestartAltIcon />}
              variant="outlined"
              size="small"
              color={admin ? 'error' : 'inherit'}
              onClick={handleReset}
              sx={{ fontSize: '0.75rem' }}
            >
              {admin ? '전체 초기화' : '선택 초기화'}
            </Button>
            <AdminMatchForm />
          </Stack>
        </Stack>

        <Box sx={{ mb: 1.5 }}>
          <OnlineUsers users={onlineUsers} currentUid={user?.uid} isAdmin={admin} />
        </Box>

        <Box sx={{ mb: 2 }}>
          <SportFilter groups={groups} selected={sportFilter} onSelect={setSportFilter} />
        </Box>

        {matches.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography color="text.secondary" sx={{ mb: 1 }}>
              등록된 경기가 없습니다
            </Typography>
            <Typography variant="caption" color="text.secondary">
              "경기 관리" 버튼으로 경기를 추가하세요
            </Typography>
          </Box>
        ) : (
          groups
            .filter((g) =>
              sportFilter === '전체' || groupSport(g.ms) === sportFilter,
            )
            .map((g) => (
              <MatchGroup
                key={g.key}
                matches={g.ms}
                myPicks={myPicks}
                pickSummaries={pickSummaries}
                onSelect={handleSelect}
                defaultOpen={groups.length === 1}
              />
            ))
        )}
      </Container>

      <PickSummaryBar
        myPicks={myPicks}
        matches={matches}
        confirmed={confirmedCombo}
        onConfirm={confirmCombo}
      />

      <Snackbar
        open={!!dupeAlert}
        autoHideDuration={3000}
        onClose={() => setDupeAlert('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="warning" onClose={() => setDupeAlert('')} sx={{ width: '100%' }}>
          {dupeAlert}
        </Alert>
      </Snackbar>
    </Box>
  );
}
