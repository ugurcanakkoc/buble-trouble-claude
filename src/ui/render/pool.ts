/** Keeps one display object per entity id: creates new ones, updates all, destroys vanished. */
export class Pool<K, E, T extends { destroy(): void }> {
  private items = new Map<K, T>();
  constructor(private create: (e: E) => T) {}

  sync(entities: E[], id: (e: E) => K, update: (obj: T, e: E) => void): void {
    const seen = new Set<K>();
    for (const e of entities) {
      const k = id(e);
      seen.add(k);
      let obj = this.items.get(k);
      if (!obj) this.items.set(k, (obj = this.create(e)));
      update(obj, e);
    }
    for (const [k, obj] of this.items) {
      if (!seen.has(k)) {
        obj.destroy();
        this.items.delete(k);
      }
    }
  }
}
