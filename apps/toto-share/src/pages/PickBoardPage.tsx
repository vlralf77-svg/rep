import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Container,
} from '@mui/material';
import PickBoard from '../components/PickBoard';
import { useMatches } from '../hooks/useMatches';
import { usePicks } from '../hooks/usePicks';

export default function PickBoardPage() {
  const { matches } = useMatches();
  const { picks } = usePicks();

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
        <Toolbar sx={{ minHeight: '56px !important' }}>
          <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
            픽 현황판
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 2 }}>
        <PickBoard matches={matches} picks={picks} />
      </Container>
    </Box>
  );
}
