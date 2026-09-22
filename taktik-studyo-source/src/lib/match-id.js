export const isMatchId = value => typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
export function requestedMatchId(search = '') {
  const values = new URLSearchParams(search).getAll('id');
  return values.length === 1 && isMatchId(values[0]) ? values[0] : null;
}
