import { useState } from 'react';
import { Box, Button, Typography, Chip, Paper, TextField, InputAdornment } from '@mui/material';
import type { Match, Selection } from '../types';

interface Props {
  myPicks: Record<string, Selection>;
  matches: Match[];
  onConfirm: (stake: number) => void;
}

export default function PickSummaryBar({
  myPicks,
  matches,
  onConfirm,
}: Props) {
  const [stake, setStake] = useState('10');
  const entries = Object.entries(myPicks);
  const count = entries.length;

  if (count === 0) return null;

  const rawOdds = entries.reduce((acc, [matchId, sel]) => {
    const m = matches.find((x) => x.id === matchId);
    if (!m) return acc;
    const odds =
      sel === 'HOME' ? m.oddsHome : sel === 'DRAW' ? m.oddsDraw : m.oddsAway;
    return acc * odds;
  }, 1);
  const totalOdds = Math.ceil(rawOdds * 100) / 100;

  const stakeNum = parseFloat(stake) || 0;
  const payout = stakeNum * totalOdds;
  const profit = payout - stakeNum;

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: 56, // 하단 네비게이션(56px) 위에 위치
        left: 0,
        right: 0,
        zIndex: 1150,
        borderRadius: '16px 16px 0 0',
        p: 2,
        background: 'linear-gradient(180deg, #1e1e2e 0%, #161b22 100%)',
        borderTop: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <Box sx={{ maxWidth: 600, mx: 'auto' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.8 }}>
              <Chip label={`${count}경기`} size="small" color="primary" variant="outlined" />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                x{totalOdds.toFixed(2)}
              </Typography>
            </Box>
            <TextField
              size="small"
              type="number"
              label="베팅 금액"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              InputProps={{
                endAdornment: <InputAdornment position="end">원</InputAdornment>,
              }}
              inputProps={{ min: 0, step: 10 }}
              sx={{ width: 140 }}
            />
          </Box>

          <Button
            variant="contained"
            color="primary"
            size="large"
            onClick={() => onConfirm(stakeNum)}
            sx={{ px: 3, py: 1.2, fontWeight: 700, minWidth: 110 }}
          >
            확정하기
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            예상 수익 <b style={{ color: '#90caf9' }}>{Math.round(payout).toLocaleString()}원</b>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            순수익 <b style={{ color: '#a5d6a7' }}>+{Math.round(profit).toLocaleString()}원</b>
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}
