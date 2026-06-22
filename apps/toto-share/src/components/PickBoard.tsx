import {
  Box,
  Typography,
  Paper,
  Chip,
  Avatar,
  Stack,
  Divider,
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

const selectionColor: Record<Selection, 'primary' | 'warning' | 'secondary'> = {
  HOME: 'primary',
  DRAW: 'warning',
  AWAY: 'secondary',
};

function selLabel(sel: Selection, marketType?: string): string {
  const t = marketType || '승무패';
  if (t.includes('언더오버')) return sel === 'HOME' ? '언더' : '오버';
  if (t === 'SUM') return sel === 'HOME' ? '홀' : '짝';
  if (t.includes('핸디캡') || t === '승패' || t === '승1패') {
    if (sel === 'HOME') return '승';
    if (sel === 'DRAW') return t === '승1패' ? '1' : '무';
    return '패';
  }
  if (sel === 'HOME') return '홈승';
  if (sel === 'DRAW') return '무';
  return '원정승';
}

function marketTag(match: Match): string {
  const t = match.marketType || '승무패';
  const line = match.line;
  if (line === null || line === undefined) return t;
  if (t.includes('핸디캡')) return `${t}(${line > 0 ? '+' + line : line})`;
  if (t.includes('언더오버')) return `${t}(${line})`;
  return `${t}(${line})`;
}

function getOdds(match: Match, sel: Selection): number {
  if (sel === 'HOME') return match.oddsHome;
  if (sel === 'DRAW') return match.oddsDraw;
  return match.oddsAway;
}

// Firestore Timestamp / number / null 을 비교용 밀리초로 변환
function tsMillis(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

export default function PickBoard({ matches, picks }: Props) {
  // 이름(nickname)으로 그룹핑. 익명 로그인은 매번 uid가 바뀌므로
  // 같은 사람이 재접속해도 한 그룹으로 묶이도록 nickname 기준으로 묶는다.
  // 같은 경기를 여러 번(다른 세션) 선택한 경우 최신 픽만 남긴다.
  const userMap = new Map<string, Map<string, Pick>>();
  for (const p of picks) {
    if (!userMap.has(p.nickname)) userMap.set(p.nickname, new Map());
    const byMatch = userMap.get(p.nickname)!;
    const prev = byMatch.get(p.matchId);
    if (!prev || tsMillis(p.updatedAt) >= tsMillis(prev.updatedAt)) {
      byMatch.set(p.matchId, p);
    }
  }
  const users = Array.from(userMap.entries()).map(
    ([nickname, byMatch]) => [nickname, Array.from(byMatch.values())] as const,
  );

  if (picks.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">아직 선택한 사람이 없습니다</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {users.map(([nickname, userPicks]) => {
        // 총 배당 계산
        let totalOdds = 1;
        const pickDetails = userPicks
          .map((p) => {
            const match = matches.find((m) => m.id === p.matchId);
            if (!match) return null;
            const odds = getOdds(match, p.selection);
            totalOdds *= odds;
            return { pick: p, match, odds };
          })
          .filter(Boolean) as { pick: Pick; match: Match; odds: number }[];

        return (
          <Paper key={nickname} sx={{ p: 2, borderRadius: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    fontSize: '0.8rem',
                    bgcolor: stringToColor(nickname),
                  }}
                >
                  {nickname[0]}
                </Avatar>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {nickname}
                </Typography>
                <Chip
                  label={`${pickDetails.length}경기`}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: 22 }}
                />
              </Stack>
              <Chip
                label={`x${totalOdds.toFixed(2)}`}
                size="small"
                color="primary"
                sx={{ fontSize: '0.85rem', fontWeight: 700, height: 28, px: 0.5 }}
              />
            </Stack>

            <Divider sx={{ mb: 1 }} />

            <Stack spacing={0.8}>
              {pickDetails.map(({ pick, match, odds }) => (
                <Stack
                  key={pick.id}
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', lineHeight: 1.3 }}>
                      {match.homeTeam} vs {match.awayTeam}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                      {marketTag(match)}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                    <Chip
                      label={selLabel(pick.selection, match.marketType)}
                      size="small"
                      color={selectionColor[pick.selection]}
                      sx={{ height: 20, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.5 } }}
                    />
                    <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 32, textAlign: 'right' }}>
                      {odds.toFixed(2)}
                    </Typography>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}
