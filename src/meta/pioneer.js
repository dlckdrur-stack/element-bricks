/**
 * 레벨 1 메인 핵심 선택의 재화 보너스: 선택지 중 무작위 1장만 그 판 재화 200% (bonus +100%), 나머지는 100%.
 * 선택지를 새로 뽑을 때(새로고침 포함)마다 다시 정한다. 수치는 balance.json 의 pioneer.
 */
export class Pioneer {
  constructor(cfg) {
    this.cfg = cfg;
    this.featured = null;
  }

  /** 이번 선택지 중 보너스 카드 1장을 정함 */
  feature(options) {
    this.featured = options.length ? options[Math.floor(Math.random() * options.length)].id : null;
  }

  /** 그 카드를 고르면 더해지는 재화 보너스 (1 = +100%) */
  bonusFor(id) {
    return id === this.featured ? this.cfg.bonus : 0;
  }
}
