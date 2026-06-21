import { useMemo } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Container,
  Stack,
  Chip,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import MatchCard from '../components/MatchCard';
import PickSummaryBar from '../components/PickSummaryBar';
import OnlineUsers from '../components/OnlineUsers';
import AdminMatchForm from '../components/AdminMatchForm';
import { useAuth } from '../hooks/useAuth';
import { useMatches, todayKey } from '../hooks/useMatches';
import { usePicks } from '../hooks/usePicks';
import { useOnlineUsers } from '../hooks/useOnlineUsers';
import { useStore } from '../store';
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
  const { picks, myPicks, submitPick, removePick, confirmCombo } = usePicks();
  const { onlineUsers } = useOnlineUsers();
  const confirmedCombo = useStore((s) => s.confirmedCombo);
  const day = todayKey();

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

  const handleSelect = (matchId: string, sel: Selection) => {
    if (myPicks[matchId] === sel) {
      removePick(matchId);
    } else {
      submitPick(matchId, sel);
    }
  };

  return (
    <Box sx={{ pb: Object.keys(myPicks).length > 0 ? 10 : 2 }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Toolbar sx={{ justifyContent: 'space-between', minHeight: '56px !important' }}>
          <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
            TotoShare
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
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
          <AdminMatchForm />
        </Stack>

        <Box sx={{ mb: 2 }}>
          <OnlineUsers users={onlineUsers} currentUid={user?.uid} />
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
          matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              mySelection={myPicks[match.id]}
              pickSummary={pickSummaries[match.id] || { HOME: 0, DRAW: 0, AWAY: 0, users: {} }}
              onSelect={handleSelect}
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
    </Box>
  );
}
