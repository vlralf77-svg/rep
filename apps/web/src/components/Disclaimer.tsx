import { Box, Typography } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

export default function Disclaimer() {
  return (
    <Box
      sx={{
        mt: 4,
        p: 2,
        borderRadius: 2,
        border: '1px solid rgba(255,107,53,0.3)',
        backgroundColor: 'rgba(255,107,53,0.05)',
        display: 'flex',
        gap: 1,
        alignItems: 'flex-start',
      }}
    >
      <WarningAmberIcon sx={{ color: 'secondary.main', mt: 0.3, flexShrink: 0 }} fontSize="small" />
      <Typography variant="caption" color="text.secondary" lineHeight={1.6}>
        <strong style={{ color: '#FF6B35' }}>면책 고지:</strong> 이 예측은 통계적 분석(Poisson 모델 + Elo 레이팅) 기반의 참고 정보입니다.
        예측 결과는 실제 경기 결과를 보장하지 않으며, 스포츠토토 베팅 손익에 대한 모든 책임은 이용자 본인에게 있습니다.
        미성년자의 베팅은 법으로 금지되어 있습니다.
      </Typography>
    </Box>
  );
}
