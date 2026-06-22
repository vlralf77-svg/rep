import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  IconButton,
  Typography,
  Divider,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import UploadIcon from '@mui/icons-material/Upload';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { todayKey } from '../hooks/useMatches';
import type { MatchStatus } from '../types';

interface MatchInput {
  gameNo: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  oddsHome: string;
  oddsDraw: string;
  oddsAway: string;
}

const empty: MatchInput = {
  gameNo: '',
  league: '',
  homeTeam: '',
  awayTeam: '',
  startTime: '',
  oddsHome: '',
  oddsDraw: '',
  oddsAway: '',
};

function kstDateStr(ts: number): string {
  return new Date(ts + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

const HOME_LABELS = ['승', '언더', '홀'];
const DRAW_LABELS = ['무', '1'];
const AWAY_LABELS = ['패', '오버', '짝'];

export default function AdminMatchForm() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MatchInput>(empty);
  const [loading, setLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importDate, setImportDate] = useState(todayKey());
  const [message, setMessage] = useState('');

  const handleChange = (field: keyof MatchInput) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async () => {
    if (!form.gameNo || !form.homeTeam || !form.awayTeam) return;
    setLoading(true);
    try {
      const day = todayKey();
      const matchId = `match_${form.gameNo}`;
      const startDate = form.startTime
        ? new Date(form.startTime).getTime()
        : Date.now() + 3600000;
      await setDoc(doc(db, 'days', day, 'matches', matchId), {
        gameNo: form.gameNo,
        league: form.league || '미정',
        homeTeam: form.homeTeam,
        awayTeam: form.awayTeam,
        startTime: startDate,
        oddsHome: parseFloat(form.oddsHome) || 1.5,
        oddsDraw: parseFloat(form.oddsDraw) || 3.5,
        oddsAway: parseFloat(form.oddsAway) || 2.5,
        marketType: '승무패',
        gameKey: matchId,
        line: null,
        status: 'OPEN' as MatchStatus,
        result: null,
      });
      setForm(empty);
      setMessage('경기가 등록되었습니다');
      setTimeout(() => setMessage(''), 2000);
    } catch (err) {
      setMessage('등록 실패');
    }
    setLoading(false);
  };

  const handleImportBetman = async () => {
    setImportLoading(true);
    try {
      // 캐시 무력화(?t=) + no-store 로 항상 최신 배당을 받아온다.
      // raw.githubusercontent 은 5분 캐시라 안 붙이면 옛 배당이 올 수 있음.
      const res = await fetch(
        `https://raw.githubusercontent.com/vlralf77-svg/rep/claude/gracious-fermat-c195k9/data/betman.json?t=${Date.now()}`,
        { cache: 'no-store' },
      );
      const data = await res.json();
      // 가져온 경기는 앱의 오늘 화면(공유 보드)에 바로 보이도록 today 컬렉션에 저장
      const day = todayKey();
      const allGames = [...(data.proto || []), ...(data.toto || [])];

      let count = 0;
      let skippedDate = 0;
      for (const game of allGames) {
        if (game.gameDate) {
          const gd = kstDateStr(new Date(game.gameDate).getTime());
          // 선택한 날짜 이전(과거) 경기만 제외하고, 그 이후는 모두 가져온다
          if (gd < importDate) {
            skippedDate++;
            continue;
          }
        }

        const markets = game.markets || [];
        if (markets.length === 0) continue;

        for (const market of markets) {
          const marketType: string = market.type || '기타';
          const sels = market.selections || [];
          if (sels.length === 0) continue;

          const oddsHome = sels.find((s: any) => HOME_LABELS.includes(s.label))?.odds || 1.5;
          const oddsDraw = sels.find((s: any) => DRAW_LABELS.includes(s.label))?.odds || 0;
          const oddsAway = sels.find((s: any) => AWAY_LABELS.includes(s.label))?.odds || 2.5;

          const baseId = game.matchId || `${game.homeTeam}_${game.awayTeam}`;
          const gameKey = `betman_${baseId}`.replace(/[\/\.\#\$\[\]]/g, '_');
          const matchId = `${gameKey}_${marketType}`.replace(/[\/\.\#\$\[\]]/g, '_');

          const matchRef = doc(db, 'days', day, 'matches', matchId);
          const existing = await getDoc(matchRef);
          const prev = existing.exists() ? existing.data() : null;
          await setDoc(matchRef, {
            gameNo: game.matchId?.split('|')[0] || String(count + 1),
            league: game.league || game.sport || '미정',
            homeTeam: game.homeTeam,
            awayTeam: game.awayTeam,
            startTime: game.gameDate ? new Date(game.gameDate).getTime() : Date.now() + 3600000,
            oddsHome,
            oddsDraw,
            oddsAway,
            initialOddsHome: prev?.initialOddsHome ?? prev?.oddsHome ?? oddsHome,
            initialOddsDraw: prev?.initialOddsDraw ?? prev?.oddsDraw ?? oddsDraw,
            initialOddsAway: prev?.initialOddsAway ?? prev?.oddsAway ?? oddsAway,
            marketType,
            gameKey,
            line: typeof market.line === 'number' ? market.line : null,
            status: 'OPEN' as MatchStatus,
            result: null,
          });
          count++;
        }
      }
      if (count === 0) {
        setMessage(
          `가져온 경기 없음 (날짜 불일치 ${skippedDate}개 제외). 날짜를 확인하세요.`,
        );
      } else {
        setMessage(`${count}개 마켓을 가져왔습니다`);
      }
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      setMessage('가져오기 실패');
    }
    setImportLoading(false);
  };

  return (
    <>
      <Button
        startIcon={<AddIcon />}
        variant="outlined"
        size="small"
        onClick={() => setOpen(true)}
        sx={{ fontSize: '0.75rem' }}
      >
        경기 관리
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          경기 등록
          <IconButton onClick={() => setOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          {message && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {message}
            </Alert>
          )}

          <TextField
            label="가져올 날짜"
            type="date"
            size="small"
            fullWidth
            value={importDate}
            onChange={(e) => setImportDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            helperText="이 날짜부터 이후의 모든 경기·마켓을 가져옵니다 (과거 경기 제외)"
            sx={{ mb: 1.5 }}
          />

          <Button
            fullWidth
            variant="outlined"
            color="secondary"
            startIcon={<UploadIcon />}
            onClick={handleImportBetman}
            disabled={importLoading}
            sx={{ mb: 2 }}
          >
            {importLoading ? '가져오는 중...' : '베트맨 데이터 가져오기'}
          </Button>

          <Divider sx={{ my: 2 }}>
            <Typography variant="caption" color="text.secondary">
              수동 입력
            </Typography>
          </Divider>

          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1}>
              <TextField
                label="게임번호"
                size="small"
                value={form.gameNo}
                onChange={handleChange('gameNo')}
                sx={{ flex: 1 }}
              />
              <TextField
                label="리그"
                size="small"
                value={form.league}
                onChange={handleChange('league')}
                sx={{ flex: 1 }}
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                label="홈팀"
                size="small"
                value={form.homeTeam}
                onChange={handleChange('homeTeam')}
                sx={{ flex: 1 }}
              />
              <TextField
                label="원정팀"
                size="small"
                value={form.awayTeam}
                onChange={handleChange('awayTeam')}
                sx={{ flex: 1 }}
              />
            </Stack>
            <TextField
              label="경기시간"
              type="datetime-local"
              size="small"
              value={form.startTime}
              onChange={handleChange('startTime')}
              InputLabelProps={{ shrink: true }}
            />
            <Stack direction="row" spacing={1}>
              <TextField
                label="홈승 배당"
                size="small"
                type="number"
                value={form.oddsHome}
                onChange={handleChange('oddsHome')}
                inputProps={{ step: 0.01 }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="무 배당"
                size="small"
                type="number"
                value={form.oddsDraw}
                onChange={handleChange('oddsDraw')}
                inputProps={{ step: 0.01 }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="원정승 배당"
                size="small"
                type="number"
                value={form.oddsAway}
                onChange={handleChange('oddsAway')}
                inputProps={{ step: 0.01 }}
                sx={{ flex: 1 }}
              />
            </Stack>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)}>닫기</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={loading || !form.gameNo || !form.homeTeam || !form.awayTeam}
          >
            {loading ? '등록 중...' : '등록'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
