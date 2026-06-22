import { useState } from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Button,
  Chip,
  Stack,
  Collapse,
  IconButton,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { Match, Selection, PickSummary } from '../types';

interface Props {
  matches: Match[];
  myPicks: Record<string, Selection>;
  pickSummaries: Record<string, PickSummary>;
  onSelect: (matchId: string, sel: Selection) => void;
  defaultOpen?: boolean;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getLabels(marketType?: string): { home: string; draw: string; away: string } {
  switch (marketType) {
    case '언더오버':
    case '전반 언더오버':
      return { home: '언더', draw: '', away: '오버' };
    case 'SUM':
      return { home: '홀', draw: '', away: '짝' };
    case '핸디캡':
    case '핸디캡2':
    case '소수핸디캡':
    case '세트핸디캡':
    case '전반 핸디캡':
      return { home: '승', draw: '무', away: '패' };
    case '승패':
      return { home: '승', draw: '', away: '패' };
    case '승1패':
      return { home: '승', draw: '1', away: '패' };
    default:
      return { home: '홈승', draw: '무', away: '원정승' };
  }
}

// 마켓 표시 순서 (정배당 → 핸디캡 → 언더오버 → SUM → 전반)
const MARKET_ORDER = [
  '승무패', '승패', '승1패',
  '핸디캡', '핸디캡2', '소수핸디캡', '세트핸디캡',
  '언더오버', 'SUM',
  '전반 승무패', '전반 핸디캡', '전반 언더오버',
];
function marketRank(t?: string): number {
  const i = MARKET_ORDER.indexOf(t || '');
  return i === -1 ? 999 : i;
}

function SelectionButton({
  label,
  odds,
  count,
  selected,
  disabled,
  color,
  onClick,
}: {
  label: string;
  odds: number;
  count: number;
  selected: boolean;
  disabled: boolean;
  color: 'primary' | 'warning' | 'secondary';
  onClick: () => void;
}) {
  return (
    <Button
      variant={selected ? 'contained' : 'outlined'}
      color={color}
      disabled={disabled}
      onClick={onClick}
      sx={{ flex: 1, flexDirection: 'column', py: 0.75, minWidth: 0, position: 'relative' }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.68rem' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {odds.toFixed(2)}
      </Typography>
      {count > 0 && (
        <Chip
          label={count}
          size="small"
          color={color}
          sx={{
            position: 'absolute',
            top: -8,
            right: -4,
            height: 18,
            fontSize: '0.65rem',
            '& .MuiChip-label': { px: 0.5 },
          }}
        />
      )}
    </Button>
  );
}

// 마켓 타입 + 핸디/기준점을 사람이 읽기 쉬운 라벨로
function marketLabel(match: Match): string {
  const t = match.marketType || '승무패';
  const line = match.line;
  const isHandicap = t.includes('핸디캡');
  const isOU = t.includes('언더오버');
  if (line === null || line === undefined) return t;
  if (isHandicap) {
    // 핸디캡은 홈팀 기준 점수 (예: 홈 -1)
    const sign = line > 0 ? `+${line}` : `${line}`;
    return `${t} (홈 ${sign})`;
  }
  if (isOU) {
    return `${t} (기준 ${line})`;
  }
  return `${t} (${line})`;
}

function MarketRow({
  match,
  mySelection,
  summary,
  onSelect,
}: {
  match: Match;
  mySelection?: Selection;
  summary: PickSummary;
  onSelect: (matchId: string, sel: Selection) => void;
}) {
  const labels = getLabels(match.marketType);
  const disabled = match.status !== 'OPEN' || Date.now() > match.startTime;

  return (
    <Box sx={{ mb: 1 }}>
      <Typography
        variant="caption"
        sx={{ display: 'block', mb: 0.5, color: 'text.secondary', fontWeight: 700 }}
      >
        {marketLabel(match)}
      </Typography>
      <Stack direction="row" spacing={0.5}>
        <SelectionButton
          label={labels.home}
          odds={match.oddsHome}
          count={summary.HOME}
          selected={mySelection === 'HOME'}
          disabled={disabled}
          color="primary"
          onClick={() => onSelect(match.id, 'HOME')}
        />
        {match.oddsDraw > 0 && labels.draw && (
          <SelectionButton
            label={labels.draw}
            odds={match.oddsDraw}
            count={summary.DRAW}
            selected={mySelection === 'DRAW'}
            disabled={disabled}
            color="warning"
            onClick={() => onSelect(match.id, 'DRAW')}
          />
        )}
        <SelectionButton
          label={labels.away}
          odds={match.oddsAway}
          count={summary.AWAY}
          selected={mySelection === 'AWAY'}
          disabled={disabled}
          color="secondary"
          onClick={() => onSelect(match.id, 'AWAY')}
        />
      </Stack>
    </Box>
  );
}

const EMPTY_SUMMARY: PickSummary = { HOME: 0, DRAW: 0, AWAY: 0, users: {} };

export default function MatchGroup({
  matches,
  myPicks,
  pickSummaries,
  onSelect,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  if (matches.length === 0) return null;

  const sorted = [...matches].sort((a, b) => marketRank(a.marketType) - marketRank(b.marketType));
  const head = sorted[0];
  const disabled = head.status !== 'OPEN' || Date.now() > head.startTime;
  // 이 경기에서 내가 선택한 마켓 수
  const myCount = matches.filter((m) => myPicks[m.id]).length;

  return (
    <Card sx={{ mb: 1.5 }}>
      <CardContent
        sx={{ py: 1.5, px: 2, '&:last-child': { pb: open ? 1.5 : 1.5 }, cursor: 'pointer' }}
        onClick={() => setOpen((o) => !o)}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Chip
              label={head.league}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.65rem', height: 20 }}
            />
            <Chip
              label={`${matches.length}마켓`}
              size="small"
              sx={{ fontSize: '0.6rem', height: 18, bgcolor: 'grey.700', color: '#fff' }}
            />
            {myCount > 0 && (
              <Chip
                label={`내 선택 ${myCount}`}
                size="small"
                color="primary"
                sx={{ fontSize: '0.6rem', height: 18 }}
              />
            )}
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {disabled ? (
              <LockIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
            ) : (
              <AccessTimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            )}
            <Typography variant="caption" color={disabled ? 'text.disabled' : 'text.secondary'}>
              {formatTime(head.startTime)}
            </Typography>
            <IconButton size="small" sx={{ p: 0.25 }}>
              <ExpandMoreIcon
                sx={{
                  fontSize: 20,
                  transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: '0.2s',
                }}
              />
            </IconButton>
          </Stack>
        </Stack>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" sx={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>
            {head.homeTeam}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mx: 1.5, flexShrink: 0 }}>
            vs
          </Typography>
          <Typography variant="subtitle2" sx={{ flex: 1, textAlign: 'right', fontWeight: 600 }}>
            {head.awayTeam}
          </Typography>
        </Box>
      </CardContent>

      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 2, pb: 1.5 }}>
          {sorted.map((m) => (
            <MarketRow
              key={m.id}
              match={m}
              mySelection={myPicks[m.id]}
              summary={pickSummaries[m.id] || EMPTY_SUMMARY}
              onSelect={onSelect}
            />
          ))}
        </Box>
      </Collapse>
    </Card>
  );
}
