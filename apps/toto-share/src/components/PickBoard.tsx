import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Avatar,
  Stack,
} from '@mui/material';
import type { Match, Pick, Selection } from '../types';

interface Props {
  matches: Match[];
  picks: Pick[];
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 60%, 45%)`;
}

const selectionLabel: Record<Selection, string> = {
  HOME: '홈승',
  DRAW: '무',
  AWAY: '원정승',
};
const selectionColor: Record<Selection, 'primary' | 'warning' | 'secondary'> = {
  HOME: 'primary',
  DRAW: 'warning',
  AWAY: 'secondary',
};

export default function PickBoard({ matches, picks }: Props) {
  const users = Array.from(
    new Map(picks.map((p) => [p.uid, p.nickname])).entries(),
  ).map(([uid, nickname]) => ({ uid, nickname }));

  if (matches.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">등록된 경기가 없습니다</Typography>
      </Box>
    );
  }

  return (
    <TableContainer
      component={Paper}
      sx={{
        maxHeight: 'calc(100dvh - 160px)',
        '& .MuiTableCell-root': { px: 1, py: 0.8, fontSize: '0.75rem' },
      }}
    >
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ minWidth: 100, fontWeight: 700 }}>경기</TableCell>
            {users.map((u) => (
              <TableCell key={u.uid} align="center" sx={{ minWidth: 60 }}>
                <Stack alignItems="center" spacing={0.3}>
                  <Avatar
                    sx={{
                      width: 24,
                      height: 24,
                      fontSize: '0.65rem',
                      bgcolor: stringToColor(u.nickname),
                    }}
                  >
                    {u.nickname[0]}
                  </Avatar>
                  <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
                    {u.nickname}
                  </Typography>
                </Stack>
              </TableCell>
            ))}
            <TableCell align="center" sx={{ fontWeight: 700, minWidth: 90 }}>
              인기 픽
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {matches.map((match) => {
            const matchPicks = picks.filter((p) => p.matchId === match.id);
            const counts: Record<Selection, number> = { HOME: 0, DRAW: 0, AWAY: 0 };
            matchPicks.forEach((p) => counts[p.selection]++);
            const popular = (Object.entries(counts) as [Selection, number][])
              .sort((a, b) => b[1] - a[1])
              .filter(([, c]) => c > 0);

            return (
              <TableRow key={match.id} hover>
                <TableCell>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, display: 'block', lineHeight: 1.3 }}
                  >
                    {match.homeTeam}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', lineHeight: 1.3 }}
                  >
                    vs {match.awayTeam}
                  </Typography>
                </TableCell>
                {users.map((u) => {
                  const pick = matchPicks.find((p) => p.uid === u.uid);
                  return (
                    <TableCell key={u.uid} align="center">
                      {pick ? (
                        <Chip
                          label={selectionLabel[pick.selection]}
                          size="small"
                          color={selectionColor[pick.selection]}
                          sx={{
                            height: 20,
                            fontSize: '0.6rem',
                            '& .MuiChip-label': { px: 0.5 },
                          }}
                        />
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          —
                        </Typography>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell align="center">
                  {popular.length > 0 ? (
                    <Stack spacing={0.3} alignItems="center">
                      {popular.slice(0, 2).map(([sel, count]) => (
                        <Typography key={sel} variant="caption" sx={{ fontSize: '0.6rem' }}>
                          {selectionLabel[sel]} {count}명
                        </Typography>
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="caption" color="text.disabled">
                      —
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
