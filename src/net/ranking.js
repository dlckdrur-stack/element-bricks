import { readKey, writeKey } from '../meta/save.js';

/**
 * 랭킹 (오프라인 우선). 판이 끝날 때 기록을 대기열에 쌓아 두고, 온라인이고 서버가 설정돼 있을 때만 올린다.
 * 서버(Firebase 등) 주소는 코드에 넣지 않고 빌드 환경 변수 VITE_RANK_URL 로만 받는다 (없으면 올리지 않음).
 * 네트워크는 판 종료와 랭킹 화면에서만 쓴다.
 */
const QUEUE_KEY = 'elementBricks.rankQueue';
const MAX_QUEUE = 50;

function queue() { return readKey(QUEUE_KEY)?.list ?? []; }

/** 판 끝: 기록 대기열에 추가 (비행기 모드여도 저장됨) */
export function submit(entry) {
  const list = [...queue(), { ...entry, at: Date.now() }].slice(-MAX_QUEUE);
  writeKey(QUEUE_KEY, { list });
  flush();
}

export const pendingCount = () => queue().length;
export const isOnlineReady = () => !!import.meta.env.VITE_RANK_URL;

/** 온라인이면 대기열 업로드 (서버 미설정이면 아무것도 안 함) */
export async function flush() {
  const url = import.meta.env.VITE_RANK_URL;
  const list = queue();
  if (!url || !list.length || !navigator.onLine) return false;
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ list }) });
    if (!res.ok) return false;
    writeKey(QUEUE_KEY, { list: [] });
    return true;
  } catch {
    return false; // 오프라인 등 → 다음에 다시
  }
}
