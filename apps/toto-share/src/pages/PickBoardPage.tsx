import { useState, useEffect } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Stack,
  Chip,
} from '@mui/material';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import PickBoard from '../components/PickBoard';
import type { Match, Pick } from '../types';

function dayKey(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatLabel(key: string): string {
  const [, m, d] = key.split('-');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const date = new Date(parseInt(key.split('-')[0]), parseInt(m) - 1, parseInt(d));
  const today = dayKey(0);
  const yesterday = dayKey(-1);
  let prefix = '';
  if (key === today) prefix = '오늘';
  else if (key === yesterday) prefix = '어제';
  return `${prefix ? prefix + ' ' : ''}${m}/${d}(${days[date.getDay()]})`;
}

const DATE_OPTIONS = [0, -1, -2].map((offset) => dayKey(offset));

export default function PickBoardPage() {
  const [selectedDay, setSelectedDay] = useState(DATE_OPTIONS[0]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'days', selectedDay, 'matches'),
      orderBy('startTime', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setMatches(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Match, 'id'>) })),
      );
    });
    return unsub;
  }, [selectedDay]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'days', selectedDay, 'picks'),
      (snap) => {
        setPicks(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Pick, 'id'>) })),
        );
      },
    );
    return unsub;
  }, [selectedDay]);

  return (
    <Box>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Toolbar sx={{ minHeight: '56px !important', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
            픽 현황판
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <CalendarTodayIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            {DATE_OPTIONS.map((day) => (
              <Chip
                key={day}
                label={formatLabel(day)}
                size="small"
                color={selectedDay === day ? 'primary' : 'default'}
                variant={selectedDay === day ? 'filled' : 'outlined'}
                onClick={() => setSelectedDay(day)}
                sx={{ fontSize: '0.65rem', height: 24 }}
              />
            ))}
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 2, pb: 10 }}>
        <PickBoard matches={matches} picks={picks} />
      </Container>
    </Box>
  );
}
