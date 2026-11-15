/** '#rrggbb' → 0xrrggbb */
export const hex = (s) => parseInt(s.slice(1), 16);

/** 두 색을 t 만큼 섞음 (0 = a, 1 = b) */
export function mix(a, b, t) {
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return ch(16) | ch(8) | ch(0);
}
