import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';
import DashboardPage from './pages/DashboardPage';
import MatchDetailPage from './pages/MatchDetailPage';
import Disclaimer from './components/Disclaimer';

export default function App() {
  return (
    <BrowserRouter>
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/match/:id" element={<MatchDetailPage />} />
          </Routes>
        </Box>
        <Disclaimer />
      </Box>
    </BrowserRouter>
  );
}
