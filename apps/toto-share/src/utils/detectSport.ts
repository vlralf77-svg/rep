const BASEBALL_KEYWORDS = [
  'LG', 'KT', '삼성', '두산', 'SSG', 'NC', 'KIA', '롯데', '한화', '키움',
  '트윈스', '위즈', '라이온즈', '베어스', '랜더스', '다이노스', '타이거즈', '자이언츠', '이글스', '히어로즈',
  '라쿠텐', '소프트뱅크', '요미우리', '한신', '오릭스', '지바롯데', '닛폰햄', '세이부',
  '양키스', '다저스', '레드삭스', '메츠', '파드리스', '브레이브스', '필리스',
  '에인절스', '애스트로스', '레이스', '로키스', '말린스', '블루제이스',
  '내셔널스', '레즈', '카디널스', '화이트삭스', '타이거즈', '트윈스',
  '오리올스', '가디언스', '로열스', '마리너스', '레인저스', '애슬레틱스',
  '브루어스', '컵스', '파이어리츠', '자이언츠', '다이아몬드백스',
];

const BASKETBALL_KEYWORDS = [
  '레이커스', '셀틱스', '워리어스', 'NBA', '넷츠', '너겟츠', '썬더',
  'KBL', '전자랜드', '모비스', '소닉스', '오리온스', '프로미',
  'DB', 'KCC', 'SK', '안양',
];

const VOLLEYBALL_KEYWORDS = [
  'V리그', '현대건설', '흥국생명', 'GS', '한국도로공사', '페퍼저축은행',
  '대한항공', '우리카드', 'OK금융', '삼성화재', 'KB손해보험',
];

export function detectSport(homeTeam: string, awayTeam: string, sport?: string): string {
  if (sport && sport !== '기타') return sport;

  const combined = `${homeTeam} ${awayTeam}`;

  if (BASEBALL_KEYWORDS.some((k) => combined.includes(k))) return '야구';
  if (BASKETBALL_KEYWORDS.some((k) => combined.includes(k))) return '농구';
  if (VOLLEYBALL_KEYWORDS.some((k) => combined.includes(k))) return '배구';

  return sport || '축구';
}
