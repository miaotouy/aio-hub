/**
 * LLM Inspector — 轻量级 LRU 缓存与去重集合
 *
 * 解决问题：tool 内多处自实现 Map/Set + 容量清理逻辑（去重 LRU、token 缓存、
 * 格式化缓存），每处都用「超过上限就 slice 掉前 1/4 / 前 1 个」的简易策略。
 *
 * 这里抽出两个最常用的容器：
 * - {@link LruCache}：Key-Value 缓存，超容时按插入顺序淘汰最旧条目；
 * - {@link LruSet}：去重集合（仅 has/add），超容时按插入顺序淘汰最旧条目。
 *
 * 都依赖 ES Map / Set 的「插入顺序遍历」特性，无需额外双向链表。命中时若需要
 * 真正的 LRU 行为（命中提升优先级），可调用 {@link LruCache.touch}。
 */

/** LRU 缓存（Key-Value） */
export class LruCache<K, V> {
  private readonly store = new Map<K, V>();

  /**
   * @param capacity 容量上限。超过后按插入顺序淘汰最旧的条目。
   * @param pruneRatio 一次淘汰多少比例（0~1），默认 0.25 即一次删 1/4，
   *                   减少频繁淘汰带来的抖动。
   */
  constructor(
    private readonly capacity: number,
    private readonly pruneRatio: number = 0.25
  ) {
    if (capacity <= 0) {
      throw new Error(`LruCache capacity must be > 0, got ${capacity}`);
    }
    if (pruneRatio <= 0 || pruneRatio > 1) {
      throw new Error(
        `LruCache pruneRatio must be in (0, 1], got ${pruneRatio}`
      );
    }
  }

  get size(): number {
    return this.store.size;
  }

  has(key: K): boolean {
    return this.store.has(key);
  }

  get(key: K): V | undefined {
    return this.store.get(key);
  }

  /**
   * 命中时刷新插入顺序（真·LRU 行为），用于 token 缓存等命中后希望延后淘汰的场景。
   * 不调用就是 FIFO 行为，已经足够大多数去重 / 弱缓存场景。
   */
  touch(key: K): V | undefined {
    const value = this.store.get(key);
    if (value === undefined && !this.store.has(key)) return undefined;
    // delete + set 重新插入到末尾
    this.store.delete(key);
    this.store.set(key, value as V);
    return value;
  }

  set(key: K, value: V): void {
    // 已存在则更新并保持位置（先 delete 再 set 会刷新到末尾）
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, value);
    this.prune();
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  keys(): IterableIterator<K> {
    return this.store.keys();
  }

  values(): IterableIterator<V> {
    return this.store.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.store.entries();
  }

  private prune(): void {
    if (this.store.size <= this.capacity) return;
    const removeCount = Math.max(
      1,
      Math.floor(this.capacity * this.pruneRatio)
    );
    const iterator = this.store.keys();
    for (let i = 0; i < removeCount; i++) {
      const next = iterator.next();
      if (next.done) break;
      this.store.delete(next.value);
    }
  }
}

/** LRU 去重集合（仅 has/add） */
export class LruSet<T> {
  private readonly store = new Set<T>();

  constructor(
    private readonly capacity: number,
    private readonly pruneRatio: number = 0.25
  ) {
    if (capacity <= 0) {
      throw new Error(`LruSet capacity must be > 0, got ${capacity}`);
    }
    if (pruneRatio <= 0 || pruneRatio > 1) {
      throw new Error(`LruSet pruneRatio must be in (0, 1], got ${pruneRatio}`);
    }
  }

  get size(): number {
    return this.store.size;
  }

  has(value: T): boolean {
    return this.store.has(value);
  }

  /**
   * 添加值。如果已存在返回 false（表示重复），否则返回 true。
   * 常用于「首次到达才处理」的去重场景：
   * ```ts
   * if (!seen.add(key)) return; // 已处理过，跳过
   * ```
   */
  add(value: T): boolean {
    if (this.store.has(value)) return false;
    this.store.add(value);
    this.prune();
    return true;
  }

  delete(value: T): boolean {
    return this.store.delete(value);
  }

  clear(): void {
    this.store.clear();
  }

  values(): IterableIterator<T> {
    return this.store.values();
  }

  private prune(): void {
    if (this.store.size <= this.capacity) return;
    const removeCount = Math.max(
      1,
      Math.floor(this.capacity * this.pruneRatio)
    );
    const iterator = this.store.values();
    for (let i = 0; i < removeCount; i++) {
      const next = iterator.next();
      if (next.done) break;
      this.store.delete(next.value);
    }
  }
}
