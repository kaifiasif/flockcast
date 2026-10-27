/** Rehearsals in memory: for tests, demos and short-lived scripts. Lost on restart. */
import type { Store, StoredRehearsal } from '../types.ts';

const ACTIVE = new Set(['queued', 'preparing', 'running', 'reporting']);

export function memoryStore(): Store {
  const rows: StoredRehearsal[] = [];
  const clone = (r: StoredRehearsal): StoredRehearsal => structuredClone(r);
  const newestFirst = (a: StoredRehearsal, b: StoredRehearsal) => b.created_at.localeCompare(a.created_at) || rows.indexOf(b) - rows.indexOf(a);
  return {
    insert(r) {
      rows.push(clone(r));
    },
    update(scope, id, patch) {
      const r = rows.find((x) => x.scope === scope && x.id === id);
      if (r) Object.assign(r, structuredClone(patch));
    },
    get(scope, id) {
      const r = rows.find((x) => x.scope === scope && x.id === id);
      return r && clone(r);
    },
    latest(scope, subject) {
      const r = rows.filter((x) => x.scope === scope && x.subject === subject).sort(newestFirst)[0];
      return r && clone(r);
    },
    list(scope, { subject, group, limit = 50 } = {}) {
      return rows.filter((x) => x.scope === scope && (!subject || x.subject === subject) && (!group || x.group_id === group)).sort(newestFirst).slice(0, limit).map(clone);
    },
    countSince(scope, subject, sinceIso) {
      return rows.filter((x) => x.scope === scope && x.subject === subject && x.created_at > sinceIso).length;
    },
    remove(scope, id) {
      const i = rows.findIndex((x) => x.scope === scope && x.id === id);
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
    failStale(at) {
      let n = 0;
      for (const r of rows) {
        if (!ACTIVE.has(r.status)) continue;
        Object.assign(r, { status: 'failed', error: 'Interrupted by a restart. Run it again.', finished_at: at });
        n++;
      }
      return n;
    },
  };
}
