import { useState, useCallback } from 'react';
import {
  Container, Typography, Box, AppBar, Toolbar, ToggleButtonGroup, ToggleButton, Tabs, Tab,
  IconButton, CircularProgress, Snackbar, Alert, Dialog, DialogTitle, DialogContent, TextField, Button,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncIcon from '@mui/icons-material/Sync';
import BetmanGames from '../components/BetmanGames';
import AccuracyDashboard from '../components/AccuracyDashboard';

const SPORT_FILTERS = [
  { value: '', label: '전체' },
  { value: '축구', label: '⚽' },
  { value: '야구', label: '⚾' },
  { value: '배구', label: '🏐' },
  { value: '농구', label: '🏀' },
];

const GH_TOKEN_KEY = 'gh_pat_v1';
const REPO = 'vlralf77-svg/rep';

async function triggerWorkflow(workflowFile: string): Promise<void> {
  const token = localStorage.getItem(GH_TOKEN_KEY);
  if (!token) throw new Error('NO_TOKEN');
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({ ref: 'claude/gracious-fermat-c195k9' }),
    },
  );
  if (res.status === 401 || res.status === 403) throw new Error('BAD_TOKEN');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export default function DashboardPage() {
  const [tab, setTab] = useState(0);
  const [sport, setSport] = useState('');
  const [loading, setLoading] = useState<'scores' | 'betman' | null>(null);
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);
  const [tokenDialog, setTokenDialog] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const runWorkflow = useCallback(async (file: string, label: string) => {
    setLoading(file === 'scrape-scores.yml' ? 'scores' : 'betman');
    try {
      await triggerWorkflow(file);
      setSnack({ msg: `${label} 스크래핑 요청 완료`, severity: 'success' });
    } catch (e: any) {
      if (e.message === 'NO_TOKEN' || e.message === 'BAD_TOKEN') {
        setPendingAction(file);
        setTokenDialog(true);
        if (e.message === 'BAD_TOKEN') {
          localStorage.removeItem(GH_TOKEN_KEY);
          setSnack({ msg: '토큰이 유효하지 않습니다. 다시 입력해주세요.', severity: 'error' });
        }
      } else {
        setSnack({ msg: `실패: ${e.message}`, severity: 'error' });
      }
    } finally {
      setLoading(null);
    }
  }, []);

  const handleTokenSave = useCallback(async () => {
    if (!tokenInput.trim()) return;
    localStorage.setItem(GH_TOKEN_KEY, tokenInput.trim());
    setTokenDialog(false);
    setTokenInput('');
    if (pendingAction) {
      const label = pendingAction === 'scrape-scores.yml' ? '실시간 점수' : '베트맨';
      await runWorkflow(pendingAction, label);
      setPendingAction(null);
    }
  }, [tokenInput, pendingAction, runWorkflow]);

  return (
    <>
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Toolbar sx={{ gap: 1 }}>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
            {tab === 0 ? '프로토 배당' : '적중률 대시보드'}
          </Typography>
          {tab === 0 && (
            <>
              <IconButton
                size="small"
                disabled={loading !== null}
                onClick={() => runWorkflow('scrape-scores.yml', '실시간 점수')}
                sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                title="실시간 점수 스크래핑"
              >
                {loading === 'scores' ? <CircularProgress size={18} /> : <SyncIcon fontSize="small" />}
              </IconButton>
              <IconButton
                size="small"
                disabled={loading !== null}
                onClick={() => runWorkflow('scrape.yml', '베트맨')}
                sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                title="베트맨 배당 스크래핑"
              >
                {loading === 'betman' ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </>
          )}
        </Toolbar>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth"
          sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, fontSize: 13, textTransform: 'none' } }}>
          <Tab label="프로토 배당" />
          <Tab label="📊 적중률 대시보드" />
        </Tabs>
        {tab === 0 && (
          <Box sx={{ px: 2, pb: 1.5, pt: 1 }}>
            <ToggleButtonGroup
              value={sport}
              exclusive
              onChange={(_, v) => { if (v !== null) setSport(v); }}
              size="small"
              sx={{ '& .MuiToggleButton-root': { px: 2, py: 0.5, fontSize: 18, textTransform: 'none' } }}
            >
              {SPORT_FILTERS.map((f) => (
                <ToggleButton key={f.value} value={f.value}>{f.label}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        )}
      </AppBar>

      <Container maxWidth="md" sx={{ py: 3 }}>
        {tab === 0
          ? <BetmanGames type="proto" sportFilter={sport} />
          : <AccuracyDashboard />}
      </Container>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack?.severity} variant="filled" sx={{ width: '100%' }}>
          {snack?.msg}
        </Alert>
      </Snackbar>

      <Dialog open={tokenDialog} onClose={() => { setTokenDialog(false); setPendingAction(null); }}>
        <DialogTitle>GitHub 토큰 입력</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Typography variant="body2" color="text.secondary" mb={2}>
            워크플로우를 실행하려면 GitHub Personal Access Token이 필요합니다.
            (repo, workflow 권한 필요)
          </Typography>
          <TextField
            fullWidth size="small" label="Personal Access Token"
            value={tokenInput} onChange={(e) => setTokenInput(e.target.value)}
            type="password" placeholder="ghp_... 또는 github_pat_..."
          />
          <Button fullWidth variant="contained" sx={{ mt: 2 }} onClick={handleTokenSave}
            disabled={!tokenInput.trim()}>
            저장 후 실행
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
