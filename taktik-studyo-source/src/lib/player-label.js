// Presentation only. Never infer nationality from spelling or mutate player data.
// The current catalogue has no nationality field: unknown players use surname.
export function shortPlayerLabel(player) {
 const parts=String(player?.name??'').trim().split(/\s+/).filter(Boolean);
 const nationality=String(player?.nationality??'').trim().toLocaleLowerCase('tr');
 const turkish=['tr','tur','türkiye','turkiye','turkey','turkish','türk'].includes(nationality);
 return (turkish?parts[0]:parts.at(-1))??'';
}
