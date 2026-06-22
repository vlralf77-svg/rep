import { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  Avatar,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import { useAuth } from '../hooks/useAuth';
import { MEMBERS, ADMIN_NICKNAMES } from '../config';

export default function EntryPage() {
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [iconClicks, setIconClicks] = useState(0);
  const { login } = useAuth();

  // 축구 아이콘 5번 클릭 시 관리자 항목 노출
  const handleIconClick = () => {
    setIconClicks((c) => {
      const next = c + 1;
      if (next >= 5) setAdminUnlocked(true);
      return next;
    });
  };

  const handleEnter = async () => {
    if (!selected) {
      setError('이름을 선택하세요');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(selected);
    } catch (err: any) {
      setError('입장에 실패했습니다. 다시 시도해주세요.');
      setLoading(false);
    }
  };

  // 멤버 목록. 관리자는 축구 아이콘 5번 클릭으로 잠금 해제됐을 때만 노출.
  const options = adminUnlocked ? [...MEMBERS, ADMIN_NICKNAMES[0]] : MEMBERS;

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        background: 'linear-gradient(135deg, #0d1117 0%, #1a237e 100%)',
      }}
    >
      <Paper
        elevation={8}
        sx={{
          p: 4,
          width: '100%',
          maxWidth: 400,
          textAlign: 'center',
          borderRadius: 3,
        }}
      >
        <Avatar
          onClick={handleIconClick}
          sx={{
            width: 64,
            height: 64,
            mx: 'auto',
            mb: 2,
            bgcolor: 'primary.main',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <SportsSoccerIcon sx={{ fontSize: 36 }} />
        </Avatar>

        <Typography variant="h5" gutterBottom>
          벳
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          이름을 선택하고 입장하세요
        </Typography>

        <ToggleButtonGroup
          orientation="vertical"
          exclusive
          fullWidth
          value={selected}
          onChange={(_, v) => {
            if (v !== null) {
              setSelected(v);
              setError('');
            }
          }}
          sx={{ mb: 2, gap: 1 }}
        >
          {options.map((name) => (
            <ToggleButton
              key={name}
              value={name}
              sx={{
                border: '1px solid rgba(255,255,255,0.15) !important',
                borderRadius: '8px !important',
                py: 1.2,
                fontSize: '1rem',
                fontWeight: 600,
              }}
            >
              {name}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {error && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
            {error}
          </Typography>
        )}

        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={handleEnter}
          disabled={loading || !selected}
          sx={{ py: 1.5 }}
        >
          {loading ? <CircularProgress size={24} /> : '입장하기'}
        </Button>
      </Paper>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mt: 3, opacity: 0.6 }}
      >
        소규모 비공개 그룹 픽 공유 서비스
      </Typography>
    </Box>
  );
}
