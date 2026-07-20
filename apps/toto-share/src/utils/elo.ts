const DEFAULT_RATING = 1500;
const K_FACTOR = 32;

export { DEFAULT_RATING, K_FACTOR };

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function updateRatings(
  homeRating: number,
  awayRating: number,
  result: 'HOME' | 'DRAW' | 'AWAY',
  k: number = K_FACTOR,
): { home: number; away: number } {
  const eHome = expectedScore(homeRating, awayRating);
  const eAway = 1 - eHome;

  let sHome: number;
  let sAway: number;
  if (result === 'HOME') {
    sHome = 1;
    sAway = 0;
  } else if (result === 'AWAY') {
    sHome = 0;
    sAway = 1;
  } else {
    sHome = 0.5;
    sAway = 0.5;
  }

  return {
    home: Math.round(homeRating + k * (sHome - eHome)),
    away: Math.round(awayRating + k * (sAway - eAway)),
  };
}

export function winProbFromElo(ratingA: number, ratingB: number): {
  home: number;
  draw: number;
  away: number;
} {
  const diff = ratingA - ratingB;
  const pHome = 1 / (1 + Math.pow(10, -diff / 400));
  const pAway = 1 - pHome;
  const drawFactor = Math.max(0, 0.28 - Math.abs(diff) / 2000);
  return {
    home: Math.max(0, pHome - drawFactor / 2),
    draw: drawFactor,
    away: Math.max(0, pAway - drawFactor / 2),
  };
}
