// Turn-based battle rules. Pure — runs in Node for tests. The UI lives in main.js.
import { SPECIES_BY_ID, MOVES, STRONG_AGAINST } from './data.js';
import { stats, currentHp, displayName } from './game.js';
import { clamp } from './util.js';

export const LOSS_CHANCE = 0.35; // chance to lose a buddy after a lost battle

function fighter(mon, side, now) {
  const s = stats(mon);
  return {
    mon, side, name: displayName(mon), element: SPECIES_BY_ID[mon.species].element,
    ...s, hp: side === 'foe' ? s.maxHp : currentHp(mon, now), guard: false, buff: 0, fought: false,
  };
}

export function typeMultiplier(moveEl, targetEl) {
  if (!moveEl) return 1;
  if (STRONG_AGAINST[moveEl]?.includes(targetEl)) return 1.5;
  if (STRONG_AGAINST[targetEl]?.includes(moveEl)) return 0.7;
  return 1;
}

export function createBattle(team, wildMon, now = Date.now()) {
  const you = team.map((m) => fighter(m, 'you', now));
  const active = you.findIndex((f) => f.hp > 0);
  if (active >= 0) you[active].fought = true;
  return { you, active, foe: fighter(wildMon, 'foe', now), over: null, turn: 0 };
}

export const activeFighter = (b) => b.you[b.active];

export function damage(att, def, move, r) {
  const L = att.mon.level;
  const atk = att.atk * (1 + att.buff * 0.3);
  let dmg = (((2 * L) / 5 + 2) * move.power * atk / def.def) / 15 + 2;
  const mult = typeMultiplier(move.element, def.element);
  const stab = move.element && move.element === att.element ? 1.15 : 1;
  dmg *= mult * stab * (0.85 + r() * 0.15);
  if (att.side === 'foe') dmg *= 0.85; // wild monsters hit a little softer: you are the hero
  if (def.guard) dmg *= 0.4;
  return { dmg: Math.max(1, Math.round(dmg)), mult };
}

function useMove(b, att, def, moveId, r, ev) {
  const move = MOVES[moveId];
  att.guard = false;
  if (move.kind === 'guard') {
    att.guard = true;
    ev.push({ who: att.side, kind: 'guard', text: `${att.name} braces itself!` });
    return;
  }
  if (move.kind === 'buff') {
    att.buff = Math.min(2, att.buff + 1);
    ev.push({ who: att.side, kind: 'buff', text: `${att.name} lets out a mighty roar! Its attack rose!` });
    return;
  }
  if (r() > move.acc) {
    ev.push({ who: att.side, kind: 'miss', element: move.element, text: `${att.name} used ${move.name}... but missed!` });
    return;
  }
  const { dmg, mult } = damage(att, def, move, r);
  def.hp = Math.max(0, def.hp - dmg);
  const note = mult > 1 ? ' It is super effective!' : mult < 1 ? ' It is not very effective...' : '';
  ev.push({ who: att.side, kind: 'hit', target: def.side, dmg, mult, element: move.element || att.element, text: `${att.name} used ${move.name}!${note}` });
  def.guard = false;
  if (def.hp === 0) ev.push({ who: def.side, kind: 'faint', text: `${def.name} fainted!` });
}

function foeMove(b, r) {
  const moves = SPECIES_BY_ID[b.foe.mon.species].moves;
  // mostly attack, sometimes guard/roar, prefer the strong move
  const roll = r();
  if (roll < 0.15) return moves[2];
  if (roll < 0.6) return moves[1];
  return moves[0];
}

function afterFaint(b, ev) {
  if (b.foe.hp === 0) {
    b.over = 'win';
    return;
  }
  if (activeFighter(b).hp === 0) {
    const next = b.you.findIndex((f) => f.hp > 0);
    if (next < 0) {
      b.over = 'lose';
      return;
    }
    b.active = next;
    b.you[next].fought = true;
    ev.push({ who: 'you', kind: 'switch', text: `Go, ${b.you[next].name}!` });
  }
}

// action: {type:'move', move} | {type:'item', item:'tonic'} | {type:'switch', index} | {type:'flee'}
export function takeTurn(b, action, r) {
  if (b.over) return [];
  const ev = [];
  b.turn++;
  const me = activeFighter(b);
  const foe = b.foe;
  const fMove = foeMove(b, r);

  if (action.type === 'flee') {
    const chance = clamp(0.5 + (me.spd - foe.spd) * 0.03, 0.25, 0.9);
    if (r() < chance) {
      b.over = 'fled';
      ev.push({ who: 'you', kind: 'flee', text: 'You got away safely!' });
      return ev;
    }
    ev.push({ who: 'you', kind: 'flee-fail', text: 'Could not get away!' });
    useMove(b, foe, me, fMove, r, ev);
  } else if (action.type === 'item') {
    const heal = Math.round(me.maxHp * 0.5);
    me.hp = Math.min(me.maxHp, me.hp + heal);
    ev.push({ who: 'you', kind: 'heal', text: `${me.name} drank a Sparkle Tonic and recovered!` });
    useMove(b, foe, me, fMove, r, ev);
  } else if (action.type === 'switch') {
    b.active = action.index;
    const next = activeFighter(b);
    next.fought = true;
    ev.push({ who: 'you', kind: 'switch', text: `Come back, ${me.name}! Go, ${next.name}!` });
    useMove(b, foe, next, fMove, r, ev);
  } else {
    const myFirst = me.spd > foe.spd || (me.spd === foe.spd && r() < 0.5) || MOVES[action.move].kind === 'guard';
    const order = myFirst ? [[me, foe, action.move], [foe, me, fMove]] : [[foe, me, fMove], [me, foe, action.move]];
    for (const [att, def, mv] of order) {
      if (att.hp === 0 || def.hp === 0) continue;
      useMove(b, att, def, mv, r, ev);
    }
  }
  afterFaint(b, ev);
  return ev;
}

// Which buddy (if any) is lost after a defeat. Never takes your last buddy.
export function rollLoss(b, buddyCount, hasBell, r) {
  if (hasBell || buddyCount <= 1) return null;
  if (r() >= LOSS_CHANCE) return null;
  const candidates = b.you.filter((f) => f.fought);
  return candidates.length ? candidates[Math.floor(r() * candidates.length)].mon : null;
}

export function xpReward(b) {
  return 10 + b.foe.mon.level * 4;
}
