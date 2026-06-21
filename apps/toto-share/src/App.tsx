import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Box, BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import { useState } from 'react';
import EntryPage from './pages/EntryPage';
import MainPage from './pages/MainPage';
import PickBoardPage from './pages/PickBoardPage';
import { useStore } from './store';

function AuthenticatedApp() {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1 }}>
        {tab === 0 && <MainPage />}
        {tab === 1 && <PickBoardPage />}
      </Box>

      <Paper
        elevation={3}
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1100,
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <BottomNavigation
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            bgcolor: 'background.paper',
            '& .Mui-selected': { color: 'primary.light' },
          }}
        >
          <BottomNavigationAction
            label="경기"
            icon={<SportsSoccerIcon />}
            sx={{ minWidth: 0 }}
          />
          <BottomNavigationAction
            label="현황판"
            icon={<LeaderboardIcon />}
            sx={{ minWidth: 0 }}
          />
        </BottomNavigation>
      </Paper>
    </Box>
  );
}

export default function App() {
  const user = useStore((s) => s.user);

  return user ? <AuthenticatedApp /> : <EntryPage />;
}
