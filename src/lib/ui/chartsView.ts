// /charts top-level tab (個人命盤／雙人合盤), remembered per browser tab in sessionStorage. Shared by
// the list page and the 雙人合盤 result page (its "back" link reopens the 雙人合盤 tab). Read it with
// useSyncExternalStore(subscribeChartsView, readChartsView, () => 'personal') so the server render
// (no sessionStorage) and hydration agree.

export type ChartsViewTab = 'personal' | 'synastry';

const VIEW_KEY = 'hd-charts:view';
const listeners = new Set<() => void>();
let memoryCopy: ChartsViewTab = 'personal';

export function readChartsView(): ChartsViewTab {
  try {
    return sessionStorage.getItem(VIEW_KEY) === 'synastry' ? 'synastry' : 'personal';
  } catch {
    return memoryCopy;
  }
}

export function rememberChartsView(tab: ChartsViewTab): void {
  memoryCopy = tab;
  try {
    sessionStorage.setItem(VIEW_KEY, tab);
  } catch {
    // ignore — memoryCopy is used instead
  }
  listeners.forEach(l => l());
}

export function subscribeChartsView(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
