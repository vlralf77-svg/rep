import { useState } from 'react';
import {
  Container, Typography, Box, AppBar, Toolbar, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import BetmanGames from '../components/BetmanGames';

const SPORT_FILTERS = [
  { value: '', label: '전체' },
  { value: '축구', label: '⚽ 축구' },
  { value: '야구', label: '⚾ 야구' },
];

export default function DashboardPage() {
  const [sport, setSport] = useState('');

  return (
    <>
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>프로토 배당</Typography>
        </Toolbar>
        <Box sx={{ px: 2, pb: 1.5 }}>
          <ToggleButtonGroup
            value={sport}
            exclusive
            onChange={(_, v) => { if (v !== null) setSport(v); }}
            size="small"
            sx={{ '& .MuiToggleButton-root': { px: 2, py: 0.5, fontSize: 13, textTransform: 'none' } }}
          >
            {SPORT_FILTERS.map((f) => (
              <ToggleButton key={f.value} value={f.value}>{f.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 3 }}>
        <BetmanGames type="proto" sportFilter={sport} />
      </Container>
    </>
  );
}
