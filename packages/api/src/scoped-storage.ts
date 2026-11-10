/** Une vue d'un stockage : les clés étrangères restent inaccessibles et ne sont jamais effacées. */
export function scopedStorage(storage: Storage, prefix: string): Storage {
  if (!prefix) throw new RangeError("Un préfixe de stockage non vide est requis.")

  function keys(): string[] {
    const owned: string[] = []
    const length = storage.length
    for (let index = 0; index < length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(prefix)) owned.push(key.slice(prefix.length))
    }
    return owned
  }

  return {
    get length() { return keys().length },
    key(index) {
      return Number.isFinite(index) && index >= 0 ? keys()[Math.trunc(index)] ?? null : null
    },
    getItem(key) { return storage.getItem(`${prefix}${key}`) },
    setItem(key, value) { storage.setItem(`${prefix}${key}`, value) },
    removeItem(key) { storage.removeItem(`${prefix}${key}`) },
    clear() {
      // Figer les seules clés de cette vue avant que les suppressions ne changent les indices.
      for (const key of keys()) storage.removeItem(`${prefix}${key}`)
    },
  }
}
