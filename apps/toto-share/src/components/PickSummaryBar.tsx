import { Box, Button, Typography, Chip, Paper } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { Match, Selection } from '../types';

interface Props {
  myPicks: Record<string, Selection>;
  matches: Match[];
  confirmed: boolean;
  onConfirm: () => void;
}

export default function PickSummaryBar({
  myPicks,
  matches,
  confirmed,
  onConfirm,
}: Props) {
  const entries = Object.entries(myPicks);
  const count = entries.length;

  if (count === 0) return null;

  const totalOdds = entries.reduce((acc, [matchId, sel]) => {
    const m = matches.find((x) => x.id === matchId);
    if (!m) return acc;
    const odds =
      sel === 'HOME' ? m.oddsHome : sel === 'DRAW' ? m.oddsDraw : m.oddsAway;
    return acc * odds;
  }, 1);

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1200,
        borderRadius: '16px 16px 0 0',
        p: 2,
        background: 'linear-gradient(180deg, #1e1e2e 0%, #161b22 100%)',
        borderTop: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          maxWidth: 600,
          mx: 'auto',
        }}
      >
        <Box>
          <Typography variant="body2" color="text.secondary">
            내 조합
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <Chip
              label={`${count}경기`}
              size="small"
              color="primary"
              variant="outlined"
            />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              x{totalOdds.toFixed(2)}
            </Typography>
          </Box>
        </Box>

        <Button
          variant="contained"
          color={confirmed ? 'success' : 'primary'}
          size="large"
          onClick={onConfirm}
          disabled={confirmed}
          startIcon={confirmed ? <CheckCircleIcon /> : undefined}
          sx={{ px: 3, py: 1.2, fontWeight: 700, minWidth: 120 }}
        >
          {confirmed ? '확정됨' : '확정하기'}
        </Button>
      </Box>
    </Paper>
  );
}
