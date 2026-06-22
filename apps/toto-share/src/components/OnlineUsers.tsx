import { Avatar, Chip, Stack, Typography } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import CancelIcon from '@mui/icons-material/Cancel';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { UserProfile } from '../types';

interface Props {
  users: UserProfile[];
  currentUid?: string;
  isAdmin?: boolean;
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 45%)`;
}

export default function OnlineUsers({ users, currentUid, isAdmin }: Props) {
  const handleDelete = async (uid: string, nickname: string) => {
    if (!window.confirm(`"${nickname}" 을(를) 접속 해제합니다.`)) return;
    try {
      await updateDoc(doc(db, 'users', uid), { online: false });
    } catch (err) {
      // 권한 거부 등 실패 시 원인을 바로 알 수 있게 표시
      window.alert(
        '접속 해제 실패: 권한이 없습니다.\n' +
          'Firestore 규칙 배포(firebase deploy --only firestore:rules)가 필요하거나,\n' +
          '관리자 닉네임(관리자/admin)으로 접속했는지 확인하세요.',
      );
      console.error('kickUser failed', err);
    }
  };

  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
      <CircleIcon sx={{ fontSize: 8, color: 'success.main' }} />
      <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
        {users.length}명 접속
      </Typography>
      {users.map((u) => (
        <Chip
          key={u.uid}
          avatar={
            <Avatar sx={{ bgcolor: stringToColor(u.nickname), width: 20, height: 20, fontSize: '0.65rem' }}>
              {u.nickname[0]}
            </Avatar>
          }
          label={u.nickname}
          size="small"
          variant={u.uid === currentUid ? 'filled' : 'outlined'}
          color={u.uid === currentUid ? 'primary' : 'default'}
          sx={{ fontSize: '0.7rem', height: 24 }}
          {...(isAdmin && u.uid !== currentUid
            ? {
                deleteIcon: <CancelIcon sx={{ fontSize: 14 }} />,
                onDelete: () => handleDelete(u.uid, u.nickname),
              }
            : {})}
        />
      ))}
    </Stack>
  );
}
