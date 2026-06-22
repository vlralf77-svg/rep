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
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import type { Match, Selection, PickSummary, MatchResult } from '../types';
import MatchPrediction from './MatchPrediction';

interface Props {
  matches: Match[];
  myPicks: Record<string, Selection>;
  pickSummaries: Record<string, PickSummary>;
  onSelect: (matchId: string, sel: Selection) => void;
  defaultOpen?: boolean;
  isAdmin?: boolean;
  onRecordResult?: (homeTeam: string, awayTeam: string, result: MatchResult, matchId: string) => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  // 여러 날짜의 경기가 섞이므로 날짜도 함께 표시 (오늘이 아니면)
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
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

function OddsArrow({ current, previous }: { current: number; previous?: number }) {
  if (previous == null || previous === current) return null;
  if (current > previous) return <ArrowDropUpIcon sx={{ fontSize: 16, color: '#f44336', ml: -0.3 }} />;
  return <ArrowDropDownIcon sx={{ fontSize: 16, color: '#2196f3', ml: -0.3 }} />;
}

function SelectionButton({
  label,
  odds,
  prevOdds,
  count,
  selected,
  disabled,
  color,
  onClick,
}: {
  label: string;
  odds: number;
  prevOdds?: number;
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
      <Stack direction="row" alignItems="center" justifyContent="center">
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {odds.toFixed(2)}
        </Typography>
        <OddsArrow current={odds} previous={prevOdds} />
      </Stack>
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
  const t = match.marketType || '승무패';
  const hasLine = match.line !== null && match.line !== undefined;
  // 핸디캡: 홈 기준 점수 / 언더오버: 기준점
  const lineText = hasLine
    ? t.includes('핸디캡')
      ? `기준 ${match.line! > 0 ? '+' + match.line : match.line}`
      : t.includes('언더오버')
        ? `기준 ${match.line}`
        : `${match.line}`
    : '';

  return (
    <Box sx={{ mb: 1 }}>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
          {t}
        </Typography>
        {hasLine && (
          <Chip
            label={lineText}
            size="small"
            color="info"
            sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, '& .MuiChip-label': { px: 0.7 } }}
          />
        )}
      </Stack>
      <Stack direction="row" spacing={0.5}>
        <SelectionButton
          label={labels.home}
          odds={match.oddsHome}
          prevOdds={match.initialOddsHome}
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
            prevOdds={match.initialOddsDraw}
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
          prevOdds={match.initialOddsAway}
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

function ResultRecorder({
  homeTeam,
  awayTeam,
  matchId,
  currentResult,
  onRecord,
}: {
  homeTeam: string;
  awayTeam: string;
  matchId: string;
  currentResult: MatchResult;
  onRecord: (homeTeam: string, awayTeam: string, result: MatchResult, matchId: string) => void;
}) {
  const options: { label: string; value: 'HOME' | 'DRAW' | 'AWAY' }[] = [
    { label: '홈승', value: 'HOME' },
    { label: '무', value: 'DRAW' },
    { label: '원정승', value: 'AWAY' },
  ];
  return (
    <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(255,193,7,0.05)', borderRadius: 1, border: '1px dashed rgba(255,193,7,0.3)' }}>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
        <EmojiEventsIcon sx={{ fontSize: 14, color: '#ffc107' }} />
        <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.6rem', color: '#ffc107' }}>
          경기 결과 입력 (엘로 반영)
        </Typography>
        {currentResult && (
          <Chip
            label={`결과: ${currentResult === 'HOME' ? '홈승' : currentResult === 'DRAW' ? '무' : '원정승'}`}
            size="small"
            color="success"
            sx={{ height: 16, fontSize: '0.5rem' }}
          />
        )}
      </Stack>
      <Stack direction="row" spacing={0.5}>
        {options.map((opt) => (
          <Button
            key={opt.value}
            size="small"
            variant={currentResult === opt.value ? 'contained' : 'outlined'}
            color="warning"
            disabled={currentResult !== null}
            onClick={() => {
              if (window.confirm(`${homeTeam} vs ${awayTeam} 결과를 "${opt.label}"로 확정합니다. 엘로 레이팅에 반영됩니다.`)) {
                onRecord(homeTeam, awayTeam, opt.value, matchId);
              }
            }}
            sx={{ flex: 1, fontSize: '0.65rem', py: 0.3, minHeight: 0 }}
          >
            {opt.label}
          </Button>
        ))}
      </Stack>
    </Box>
  );
}

export default function MatchGroup({
  matches,
  myPicks,
  pickSummaries,
  onSelect,
  defaultOpen = false,
  isAdmin = false,
  onRecordResult,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  if (matches.length === 0) return null;

  // marketType 있는 문서를 우선하여 정렬한 뒤, 같은 마켓은 하나만 남김.
  // (옛 데이터의 marketType 없는 중복 문서 제거 → 승무패가 두 번 나오는 문제 해결)
  const seen = new Set<string>();
  const sorted = [...matches]
    .sort((a, b) => {
      const ra = a.marketType ? marketRank(a.marketType) : 1000;
      const rb = b.marketType ? marketRank(b.marketType) : 1000;
      return ra - rb;
    })
    .filter((m) => {
      const key = m.marketType || '승무패';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
              label={`${sorted.length}마켓`}
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
          <MatchPrediction matches={sorted} />
          {isAdmin && onRecordResult && (
            <ResultRecorder
              homeTeam={head.homeTeam}
              awayTeam={head.awayTeam}
              matchId={head.gameKey || head.id}
              currentResult={head.result}
              onRecord={onRecordResult}
            />
          )}
        </Box>
      </Collapse>
    </Card>
  );
}
