import { Stack, IconButton, Typography, Box } from '@mui/material';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import SportsBaseballIcon from '@mui/icons-material/SportsBaseball';
import SportsBasketballIcon from '@mui/icons-material/SportsBasketball';
import SportsVolleyballIcon from '@mui/icons-material/SportsVolleyball';
import SportsIcon from '@mui/icons-material/Sports';
import AppsIcon from '@mui/icons-material/Apps';
import type { Match } from '../types';
import { detectSport } from '../utils/detectSport';

export interface MatchGroup {
  key: string;
  ms: Match[];
}

interface Props {
  groups: MatchGroup[];
  selected: string;
  onSelect: (sport: string) => void;
}

const SPORTS = [
  { key: '전체', label: '전체', icon: AppsIcon },
  { key: '축구', label: '축구', icon: SportsSoccerIcon },
  { key: '야구', label: '야구', icon: SportsBaseballIcon },
  { key: '농구', label: '농구', icon: SportsBasketballIcon },
  { key: '배구', label: '배구', icon: SportsVolleyballIcon },
  { key: '기타', label: '기타', icon: SportsIcon },
];

export function groupSport(ms: Match[]): string {
  const h = ms[0];
  if (!h) return '기타';
  return detectSport(h.homeTeam, h.awayTeam, h.sport);
}

export default function SportFilter({ groups, selected, onSelect }: Props) {
  const sportCounts = new Map<string, number>();
  for (const g of groups) {
    const s = groupSport(g.ms);
    sportCounts.set(s, (sportCounts.get(s) || 0) + 1);
  }

  const available = SPORTS.filter(
    (s) => s.key === '전체' || sportCounts.has(s.key),
  );

  if (available.length <= 2) return null;

  return (
    <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5 }}>
      {available.map(({ key, label, icon: Icon }) => {
        const active = selected === key;
        const count = key === '전체' ? groups.length : sportCounts.get(key) || 0;
        return (
          <Box
            key={key}
            onClick={() => onSelect(key)}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'pointer',
              minWidth: 52,
            }}
          >
            <IconButton
              size="small"
              sx={{
                bgcolor: active ? 'primary.main' : 'action.hover',
                color: active ? '#fff' : 'text.secondary',
                '&:hover': { bgcolor: active ? 'primary.dark' : 'action.selected' },
                width: 40,
                height: 40,
              }}
            >
              <Icon fontSize="small" />
            </IconButton>
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.6rem',
                fontWeight: active ? 700 : 400,
                color: active ? 'primary.main' : 'text.secondary',
                mt: 0.3,
              }}
            >
              {label} {count}
            </Typography>
          </Box>
        );
      })}
    </Stack>
  );
}
