import { useState } from 'react';
import {
  Container, Typography, Box, AppBar, Toolbar, ToggleButtonGroup, ToggleButton, Tabs, Tab,
} from '@mui/material';
import BetmanGames from '../components/BetmanGames';
import AccuracyDashboard from '../components/AccuracyDashboard';

const SPORT_FILTERS = [
  { value: '', label: '전체' },
  { value: '축구', label: '⚽ 축구' },
  { value: '야구', label: '⚾ 야구' },
  { value: '배구', label: '🏐 배구' },
  { value: '농구', label: '🏀 농구' },
];

export default function DashboardPage() {
  const [tab, setTab] = useState(0);
  const [sport, setSport] = useState('');

  return (
    <>
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
            {tab === 0 ? '프로토 배당' : '적중률 대시보드'}
          </Typography>
        </Toolbar>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth"
          sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, fontSize: 13, textTransform: 'none' } }}>
          <Tab label="프로토 배당" />
          <Tab label="📊 적중률 대시보드" />
        </Tabs>
        {tab === 0 && (
          <Box sx={{ px: 2, pb: 1.5, pt: 1 }}>
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
        )}
      </AppBar>

      <Container maxWidth="md" sx={{ py: 3 }}>
        {tab === 0
          ? <BetmanGames type="proto" sportFilter={sport} />
          : <AccuracyDashboard />}
      </Container>
    </>
  );
}
