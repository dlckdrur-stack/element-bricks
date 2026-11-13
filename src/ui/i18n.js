import ko from '../data/lang/ko.json';

// 다른 언어는 data/lang/{en,ja,zh-Hant,zh-Hans}.json 추가 후 여기에 등록
const tables = { ko };
let current = tables.ko;

export function setLanguage(code) {
  current = tables[code] ?? tables.ko;
}

/** t('hud.stage', { n: 3 }) → "스테이지 3" */
export function t(key, params) {
  let s = current[key] ?? key;
  if (params) for (const k in params) s = s.split(`{${k}}`).join(String(params[k]));
  return s;
}
