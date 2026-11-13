/** 범용 오브젝트 풀. 공·파티클·블록 표시 객체를 재사용한다. */
export class Pool {
  constructor(factory, onRelease) {
    this.factory = factory;
    this.onRelease = onRelease;
    this.free = [];
    this.inUse = 0;
  }

  get() {
    this.inUse++;
    return this.free.length ? this.free.pop() : this.factory();
  }

  release(obj) {
    this.inUse--;
    if (this.onRelease) this.onRelease(obj);
    this.free.push(obj);
  }
}
