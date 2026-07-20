import {
  Box,
  Typography,
  Paper,
  Chip,
  Avatar,
  Stack,
  Divider,
  LinearProgress,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
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

function impliedProb(match: Match, sel: Selection): number {
  const rawH = 1 / match.oddsHome;
  const rawD = match.oddsDraw > 0 ? 1 / match.oddsDraw : 0;
  const rawA = 1 / match.oddsAway;
  const total = rawH + rawD + rawA;
  if (sel === 'HOME') return rawH / total;
  if (sel === 'DRAW') return rawD / total;
  return rawA / total;
}

function probColor(p: number): string {
  if (p >= 0.5) return '#66bb6a';
  if (p >= 0.35) return '#ffa726';
  return '#ef5350';
}

function comboProbs(probs: number[]): number[] {
  const n = probs.length;
  // dp[k] = P(exactly k correct) via DP
  let dp = new Array(n + 1).fill(0);
  dp[0] = 1;
  for (const p of probs) {
    const next = new Array(n + 1).fill(0);
    for (let k = 0; k <= n; k++) {
      if (dp[k] === 0) continue;
      next[k] += dp[k] * (1 - p);
      if (k + 1 <= n) next[k + 1] += dp[k] * p;
    }
    dp = next;
  }
  return dp;
}

// Firestore Timestamp / number / null 을 비교용 밀리초로 변환
function tsMillis(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

function formatConfirmedTime(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm} 확정`;
}

export default function PickBoard({ matches, picks }: Props) {
  // comboId 기준으로 그룹핑. comboId가 없는 옛 데이터는 nickname으로 묶음
  const comboMap = new Map<string, Pick[]>();
  for (const p of picks) {
    const key = p.comboId || `legacy_${p.nickname}`;
    if (!comboMap.has(key)) comboMap.set(key, []);
    comboMap.get(key)!.push(p);
  }
  // 옛 데이터(comboId 없음)는 같은 matchId 중복 제거 (최신만)
  const combos = Array.from(comboMap.entries()).map(([key, groupPicks]) => {
    const nickname = groupPicks[0].nickname;
    let cleaned: Pick[];
    if (key.startsWith('legacy_')) {
      const byMatch = new Map<string, Pick>();
      for (const p of groupPicks) {
        const prev = byMatch.get(p.matchId);
        if (!prev || tsMillis(p.updatedAt) >= tsMillis(prev.updatedAt)) {
          byMatch.set(p.matchId, p);
        }
      }
      cleaned = Array.from(byMatch.values());
    } else {
      cleaned = groupPicks;
    }
    return { key, nickname, picks: cleaned };
  });
  // 확정 시간 기준 정렬 (최신 위로)
  combos.sort((a, b) => {
    const ta = Math.max(...a.picks.map((p) => tsMillis(p.updatedAt)));
    const tb = Math.max(...b.picks.map((p) => tsMillis(p.updatedAt)));
    return tb - ta;
  });

  if (picks.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">아직 선택한 사람이 없습니다</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {combos.map(({ key, nickname, picks: comboPicks }) => {
        let rawOdds = 1;
        const pickDetails = comboPicks
          .map((p) => {
            const match = matches.find((m) => m.id === p.matchId);
            if (!match) return null;
            const odds = getOdds(match, p.selection);
            rawOdds *= odds;
            return { pick: p, match, odds };
          })
          .filter(Boolean) as { pick: Pick; match: Match; odds: number }[];
        const totalOdds = Math.ceil(rawOdds * 100) / 100;

        const stake = comboPicks.find((p) => typeof p.stake === 'number')?.stake ?? 10;
        const payout = stake * totalOdds;
        const profit = payout - stake;
        const latestTs = Math.max(...comboPicks.map((p) => tsMillis(p.updatedAt)));
        const comboLabel = key.startsWith('legacy_') ? '' : ` #${combos.filter((c) => c.nickname === nickname).indexOf(combos.find((c) => c.key === key)!) + 1}`;

        return (
          <Paper key={key} sx={{ p: 2, borderRadius: 2 }}>
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
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                    {nickname}{comboLabel}
                  </Typography>
                  {latestTs > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                      {formatConfirmedTime(latestTs)}
                    </Typography>
                  )}
                </Box>
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

            <Stack spacing={1}>
              {pickDetails.map(({ pick, match, odds }) => {
                const prob = impliedProb(match, pick.selection);
                const pct = Math.round(prob * 100);
                return (
                  <Box key={pick.id}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
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
                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.3 }}>
                      <SmartToyIcon sx={{ fontSize: 10, color: probColor(prob) }} />
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          flex: 1,
                          height: 4,
                          borderRadius: 2,
                          bgcolor: 'rgba(255,255,255,0.06)',
                          '& .MuiLinearProgress-bar': { bgcolor: probColor(prob), borderRadius: 2 },
                        }}
                      />
                      <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 700, color: probColor(prob), minWidth: 28 }}>
                        {pct}%
                      </Typography>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>

            <Divider sx={{ my: 1 }} />

            {pickDetails.length > 1 && (() => {
              const probs = pickDetails.map(({ pick, match }) => impliedProb(match, pick.selection));
              const dp = comboProbs(probs);
              const n = probs.length;
              let cumulative = 0;
              const rows: { label: string; pct: string; color: string }[] = [];
              for (let k = n; k >= Math.max(1, n - 2); k--) {
                cumulative += dp[k];
                const label = k === n ? `${n}/${n} 전적중` : `${k}/${n} 이상`;
                rows.push({
                  label,
                  pct: (cumulative * 100).toFixed(1),
                  color: k === n ? '#ab47bc' : k === n - 1 ? '#ffa726' : '#66bb6a',
                });
              }
              return (
                <Box sx={{ mb: 1, px: 0.5 }}>
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                    <SmartToyIcon sx={{ fontSize: 12, color: '#ab47bc' }} />
                    <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary', fontWeight: 700 }}>
                      AI 조합 적중 예측
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.8}>
                    {rows.map((r) => (
                      <Box key={r.label} sx={{ textAlign: 'center', flex: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.55rem', display: 'block' }}>
                          {r.label}
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.75rem', color: r.color }}>
                          {r.pct}%
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              );
            })()}

            <Stack direction="row" justifyContent="space-between" sx={{ px: 0.5 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6rem' }}>
                  베팅금액
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {stake.toLocaleString()}원
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6rem' }}>
                  예상수익
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.light' }}>
                  {(Math.floor(payout / 10) * 10).toLocaleString()}원
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6rem' }}>
                  순수익
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.light' }}>
                  +{(Math.floor(profit / 10) * 10).toLocaleString()}원
                </Typography>
              </Box>
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}
