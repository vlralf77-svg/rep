// 관리자 닉네임 목록.
// 이 닉네임으로 입장하면 "전체 픽 초기화" 등 관리 권한이 부여됩니다.
export const ADMIN_NICKNAMES = ['관리자', 'admin'];

export function isAdmin(nickname?: string): boolean {
  if (!nickname) return false;
  const n = nickname.trim().toLowerCase();
  return ADMIN_NICKNAMES.some((a) => a.toLowerCase() === n);
}
