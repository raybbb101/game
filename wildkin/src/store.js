// Save game in localStorage. `S.save` is the live save object; call persist() after changing it.
import { newSave } from './game.js';

const KEY = 'wildkin-save-v1';

export const S = { save: null };

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // fill in fields added in later versions
      S.save = { ...newSave(data.name), ...data, flags: { ...newSave('').flags, ...data.flags }, stats: { ...newSave('').stats, ...data.stats }, settings: { ...newSave('').settings, ...data.settings }, dex: { ...(data.dex || {}) } };
      return true;
    }
  } catch (e) {
    console.warn('Could not read save', e);
  }
  return false;
}

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S.save));
  } catch (e) {
    console.warn('Could not save', e);
  }
}

export function reset() {
  localStorage.removeItem(KEY);
  location.reload();
}

export function addItem(id, qty = 1) {
  S.save.bag[id] = (S.save.bag[id] || 0) + qty;
}

export function useItem(id) {
  if (!S.save.bag[id]) return false;
  S.save.bag[id]--;
  if (S.save.bag[id] <= 0) delete S.save.bag[id];
  return true;
}

export const team = () => S.save.buddies.filter((b) => b.inTeam);
