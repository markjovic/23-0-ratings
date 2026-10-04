// 23-0 overlay, loaded by the r230 bookmarklet from markjovic.github.io/23-0-ratings/overlay.js
// Shows exact ratings on every card, the best pick per position, the team rating on the results page,
// and a forecast of whether 23-0 is still possible from your picks so far and the current spin.
(async () => {
  if (window.r230) return;
  window.r230 = 1;

  const BASE = 'https://markjovic.github.io/23-0-ratings/';
  const THRESHOLD = 96.65;      // team rating needed for 23-0 to be possible (game shows 96.7); measured 4 Oct 2026
  const SIMS = 1200;            // simulated futures per option
  const SLOTS = ['DEF', 'MID', 'RUC', 'FWD', 'UTL'];
  const DECADES = [1990, 2000, 2010, 2020];
  const CLUB_LINE = /^([A-Z]{2,3}) \u00b7 (\d{4})s$/;
  const SLOT_LINE = /^(DEF|MID|RUC|FWD|UTL)$/;
  const VERSION = 'v10';
  const SIMS_PICK = 500;        // simulated futures per candidate pick

  // ---------- panel ----------
  const P = document.createElement('div');
  P.style.cssText = 'position:fixed;right:6px;bottom:88px;z-index:99999;background:#0b2545;color:#fff;border-radius:8px;padding:7px 9px;font:12px/1.4 system-ui,sans-serif;max-width:300px;max-height:60vh;overflow:auto;box-shadow:0 4px 16px rgba(0,0,0,.35)';
  P.textContent = '23-0 overlay loading';
  const PANEL_CSS = P.style.cssText;
  // full = everything; min = advice banner only; off = nothing on screen except a faint dot to bring it back
  let mode = 'full';
  const BTN = 'display:inline-block;min-width:22px;text-align:center;padding:1px 6px;margin-left:4px;border-radius:5px;background:rgba(255,255,255,.18);color:#fff;font:700 13px/1.4 system-ui,sans-serif;cursor:pointer';
  const controls = () => `<div style="float:right;margin:-2px -3px 2px 6px">${mode === 'full' ? `<span data-r230="min" style="${BTN}" title="Show only the advice">&minus;</span>` : `<span data-r230="full" style="${BTN}" title="Show everything">+</span>`}<span data-r230="off" style="${BTN}" title="Hide everything for a clean screenshot">&times;</span></div>`;
  P.addEventListener('click', e => {
    const m = e.target.closest && e.target.closest('[data-r230]');
    if (m) { mode = m.getAttribute('data-r230'); e.stopPropagation(); e.preventDefault(); if (window.r230rerun) window.r230rerun(); }
    else if (mode === 'off') { mode = 'full'; if (window.r230rerun) window.r230rerun(); }
  });
  document.body.append(P);
  const fail = msg => { P.style.background = '#8b0000'; P.textContent = '23-0 overlay FAILED: ' + msg; };

  try {
    // ---------- data ----------
    let O = {}, src = 'exact ratings';
    try { const x = await fetch(BASE + 'ratings.json', { cache: 'no-cache' }); if (!x.ok) throw Error('HTTP ' + x.status); O = (await x.json()).ratings; }
    catch (e) { src = 'ESTIMATES ONLY - ratings.json failed: ' + e.message; }
    const J = await (await fetch('/data/players/players.json')).json();
    const PL = J.players, BL = J.baselines;
    const C = [22.52, 0.7417, -0.06395, 23.66, 11.17, -0.4812, 66.26, 3.535, 12.85, 4.505, 3.692, 3.548, 0.7186, 5.039, 6.601, 4.219, 6.666, 3.786, 0.03908, 12.28, -3.25, 0.9414, 2.234, -0.2657, 1.595, 5.87, 0.8514, -5.29, 2.261, 2.074, 1.62, 0.7906, -0.9357, 0.3123, 1.234, -0.2981, -0.5293, -2.018, -0.813, 1.894, 1.679];
    const model = (p, s) => {
      const b = BL[p.decade], g = p.games, L = ['DEF', 'MID', 'RUC', 'FWD'];
      const R = [p.avgDisposals / b.avgDisposals, p.avgGoals / b.avgGoals, p.avgMarks / b.avgMarks, p.avgTackles / b.avgTackles, p.avgHitouts / Math.max(b.avgHitouts, 1)].map(v => v || 0);
      const h = L.map(x => +(x === s));
      const x = [1, p.posScores[s], p.fantasyAvg, p.brownlowVotes / g, +p.allAustralian, +p.captain, p.finalsWon / g, Math.log(g), ...R, ...h];
      R.forEach(r => h.forEach(o => x.push(r * o))); h.forEach(o => x.push(p.posScores[s] * o));
      return Math.min(100, x.reduce((a, v, i) => a + v * (C[i] || 0), 0));
    };
    // rating at a position; UTL scores at the primary position. [rating, '' exact | '~' estimate]
    const rate = (p, slot) => {
      const s = slot === 'UTL' ? p.primaryPosition : slot;
      const o = O[`${p.playerId}|${p.teamId}|${p.decade}|${s}`];
      return o != null ? [o, ''] : [Math.round(model(p, s) * 10) / 10, '~'];
    };
    const R1 = (p, s) => rate(p, s)[0];
    const fits = (p, s) => s === 'UTL' || p.eligiblePositions.includes(s);

    const byName = new Map(), byPool = new Map();
    for (const p of PL) {
      const n = `${p.name}|${p.teamAbbr}|${p.decade}`; (byName.get(n) || byName.set(n, []).get(n)).push(p);
      const k = `${p.teamAbbr}|${p.decade}`; (byPool.get(k) || byPool.set(k, []).get(k)).push(p);
    }
    const clubsIn = {}; for (const d of DECADES) clubsIn[d] = [...new Set(PL.filter(p => p.decade === d).map(p => p.teamAbbr))];
    // par = average best rating a random club/era offers at each position; used to judge a pick against its position
    const par = {};
    for (const s of SLOTS) { const v = [...byPool.values()].map(pool => Math.max(0, ...pool.filter(p => fits(p, s)).map(p => R1(p, s)))).filter(x => x > 0); par[s] = v.reduce((a, b) => a + b, 0) / v.length; }

    const fmt = x => x[1] + x[0].toFixed(1);
    // for UTL picks: the positions the player plays, e.g. (FWD) or (MID / FWD)
    const plays = p => `(${p.eligiblePositions.join(' / ')})`;
    const col = v => v >= 97 ? 'green' : v >= 92 ? 'darkorange' : 'firebrick';
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const pct = x => Math.round(x * 100) + '%';

    // ---------- forecasting ----------
    const LOGT = Math.log(THRESHOLD) * 5;
    const rnd = a => a[Math.floor(Math.random() * a.length)];
    // best placement from a club/era pool: highest rating relative to that position's par
    const bestPlace = (pool, open, usedPlayers) => {
      let best = null;
      for (const p of pool) { if (usedPlayers.has(p.playerId)) continue;
        for (const s of open) { if (!fits(p, s)) continue; const r = R1(p, s), sc = Math.log(r) - Math.log(par[s]);
          if (!best || sc > best.sc) best = { p, s, r, sc }; } }
      return best;
    };
    // clubs the game can offer for an era: unused, with someone for an open non-UTL position (any player if only UTL is open)
    const offerable = (dec, open, usedClubs, exclude) => {
      const nonUtl = [...open].filter(s => s !== 'UTL');
      return clubsIn[dec].filter(c => !usedClubs.has(c) && c !== exclude && (byPool.get(`${c}|${dec}`) || []).some(p => nonUtl.length ? nonUtl.some(s => fits(p, s)) : true));
    };
    const nextDecade = (decs, exclude) => { const un = DECADES.filter(d => !decs.includes(d) && d !== exclude); return un.length ? rnd(un) : rnd(DECADES.filter(d => d !== exclude)); };

    // first: {p, s} = take that player at that position now; 'club' / 'era' = use that re-roll now
    function simulate(st, first, sims) {
      let ok = 0;
      for (let n = 0; n < sims; n++) {
        const open = new Set(st.open), clubs = new Set(st.clubs), decs = [...st.decs], players = new Set(st.players); let logsum = st.logsum;
        const take = (p, s, club, dec) => { open.delete(s); clubs.add(club); decs.push(dec); players.add(p.playerId); logsum += Math.log(R1(p, s)); return true; };
        const place = (club, dec) => { const b = bestPlace(byPool.get(`${club}|${dec}`) || [], open, players); return b ? take(b.p, b.s, club, dec) : false; };
        let alive;
        if (first === 'club') { const cs = offerable(st.dec, open, clubs, st.club); alive = cs.length ? place(rnd(cs), st.dec) : false; }
        else if (first === 'era') { const ds = DECADES.filter(d => d !== st.dec && offerable(d, open, clubs).includes(st.club)); const un = ds.filter(d => !decs.includes(d)); alive = ds.length ? place(st.club, rnd(un.length ? un : ds)) : false; }
        else alive = take(first.p, first.s, st.club, st.dec);
        while (alive && open.size) { const d = nextDecade(decs); const cs = offerable(d, open, clubs); if (!cs.length) { alive = false; break; } alive = place(rnd(cs), d); }
        if (alive && new Set(decs).size === 4 && logsum >= LOGT) ok++;
      }
      return ok / sims;
    }
    // re-roll buttons: true = available, false = used up, null = button not found
    const readRerolls = () => {
      const out = {};
      for (const name of ['Club', 'Era']) {
        const b = [...document.body.querySelectorAll('button')].find(x => (x.textContent || '').trim() === name);
        if (!b) { out[name] = null; continue; }
        const op = typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(b).opacity || '1') : 1;
        out[name] = !(b.disabled || b.getAttribute?.('aria-disabled') === 'true' || op < 0.75);
      }
      return out;
    };

    // highest team rating still reachable from st, choosing any unused clubs and eras
    function maxFree(st) {
      const slots = [...st.open]; if (!slots.length) return new Set(st.decs).size === 4 ? Math.exp(st.logsum / 5) : null;
      const cands = {};
      for (const s of slots) cands[s] = PL.filter(p => !st.clubs.has(p.teamAbbr) && !st.players.has(p.playerId) && fits(p, s)).map(p => [R1(p, s), p]).sort((a, b) => b[0] - a[0]).slice(0, 30);
      let best = -Infinity; const usedC = new Set(st.clubs), usedP = new Set(st.players);
      const rec = (i, decs, logsum) => {
        if (i === slots.length) { if (new Set(decs).size === 4 && logsum > best) best = logsum; return; }
        const rem = slots.length - i - 1;
        for (const [r, p] of cands[slots[i]]) {
          if (logsum + Math.log(r) + rem * Math.log(100) <= best) break;
          if (usedC.has(p.teamAbbr) || usedP.has(p.playerId)) continue;
          const nd = [...decs, p.decade]; if (new Set(nd).size + (5 - nd.length) < 4) continue;
          usedC.add(p.teamAbbr); usedP.add(p.playerId); rec(i + 1, nd, logsum + Math.log(r)); usedC.delete(p.teamAbbr); usedP.delete(p.playerId);
        }
      };
      rec(0, [...st.decs], st.logsum);
      return best === -Infinity ? null : Math.exp(best / 5);
    }
    // same, but one of the open positions must be filled from the current club/era
    function maxHere(st, pool) {
      let best = null;
      for (const p of pool) { if (st.players.has(p.playerId)) continue;
        for (const s of st.open) { if (!fits(p, s)) continue;
          const nd = [...st.decs, p.decade]; if (new Set(nd).size + (5 - nd.length) < 4) continue;
          const open = new Set(st.open); open.delete(s);
          const v = maxFree({ open, clubs: new Set([...st.clubs, p.teamAbbr]), decs: nd, players: new Set([...st.players, p.playerId]), logsum: st.logsum + Math.log(R1(p, s)) });
          if (v != null && (best == null || v > best)) best = v; } }
      return best;
    }

    // ---------- the position bar at the bottom of the pick screen ----------
    // Each slot shows two lines: initials + position when filled, position + position when empty.
    const readBar = () => {
      // Works for the phone's bottom bar (filled "PR / DEF", empty "DEF / DEF") and the tablet's field view
      // (filled "PR / DEF", empty just "DEF"). The five positions must sit together in one container.
      const lines = el => (el.innerText || '').split('\n').map(x => x.trim()).filter(Boolean);
      const all = [...document.body.querySelectorAll('*')].filter(el => !el.closest('.r230') && el !== P && !P.contains?.(el));
      const two = all.filter(el => { const t = lines(el); return t.length === 2 && SLOT_LINE.test(t[1]) && /^[A-Z]{2,3}$/.test(t[0]); });
      const twoDeep = two.filter(el => !two.some(o => o !== el && el.contains?.(o)));
      const one = all.filter(el => { const t = lines(el); return t.length === 1 && SLOT_LINE.test(t[0]) && !twoDeep.some(b => b === el || b.contains?.(el)); });
      const oneDeep = one.filter(el => !one.some(o => o !== el && el.contains?.(o)));
      const cands = [...twoDeep, ...oneDeep].map(el => { const t = lines(el); return t.length === 2 ? { top: t[0], slot: t[1], filled: t[0] !== t[1], el } : { top: t[0], slot: t[0], filled: false, el }; });
      // anchor on UTL, which only appears in the position area, and find the smallest container holding all five
      for (const u of cands.filter(c => c.slot === 'UTL')) {
        for (let a = u.el.parentElement; a && a !== document.body; a = a.parentElement) {
          const inside = cands.filter(c => a.contains?.(c.el));
          if (inside.length < 5) continue;
          const slots = new Set(inside.map(c => c.slot));
          if (inside.length === 5 && slots.size === 5) return inside;
          break;   // this container also holds other position labels, so it isn't the position area
        }
      }
      return null;
    };
    // Turn anything that looks like a pick ({playerId, teamId, decade} or {player:{...}}) into a player stint.
    const asPick = o => {
      if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
      const pl = o.player && typeof o.player === 'object' ? o.player : null;
      const id = o.playerId ?? pl?.playerId ?? pl?.id ?? (typeof o.player === 'number' ? o.player : undefined)
        ?? (o.id != null && (o.decade != null || o.teamId != null || o.era != null) && typeof o.name === 'string' ? o.id : undefined);
      const teamId = o.teamId ?? pl?.teamId ?? o.team?.id ?? o.team?.teamId ?? (typeof o.team === 'number' ? o.team : undefined);
      const decade = o.decade ?? pl?.decade ?? o.era ?? (typeof o.era === 'string' ? parseInt(o.era) : undefined);
      let m = [];
      if (id != null) m = PL.filter(p => p.playerId === +id && (teamId == null || p.teamId === +teamId) && (decade == null || p.decade === +decade));
      if (m.length !== 1) {   // fall back to name + club/era if the object carries those
        const name = pl?.name ?? o.name, abbr = o.teamAbbr ?? pl?.teamAbbr ?? o.team?.abbr ?? o.club;
        if (typeof name === 'string' && (abbr || decade)) m = PL.filter(p => p.name === name && (abbr == null || p.teamAbbr === abbr) && (decade == null || p.decade === +decade));
      }
      return m.length === 1 ? m[0] : null;
    };
    // The game is a React app. Starting at a bar position, walk up its components and search their props
    // and state for pick objects; keep the ones whose initials (and position, if given) match that bar slot.
    const reactPick = (el, top, slot) => {
      const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      if (!fk) return { p: null, react: false };
      const found = new Map(), seen = new Set(); let budget = 6000;
      const scan = (v, depth) => {
        if (!v || typeof v !== 'object' || depth > 5 || seen.has(v) || --budget < 0) return;
        seen.add(v);
        if (v.$$typeof || v.nodeType) return;                       // skip React elements and DOM nodes
        const p = asPick(v);
        if (p && initials(p) === top) { const pos = v.position ?? v.slot ?? v.pos; if (pos == null || pos === slot) found.set(p.playerId + '|' + p.teamId + '|' + p.decade, p); }
        for (const w of Array.isArray(v) ? v : Object.values(v)) scan(w, depth + 1);
      };
      let f = el[fk];
      for (let i = 0; i < 40 && f && budget > 0; i++, f = f.return) {
        scan(f.memoizedProps, 0);
        for (let h = f.memoizedState, n = 0; h && typeof h === 'object' && n < 30; h = h.next, n++) scan(h.memoizedState, 0);
        if (found.size === 1) break;
      }
      return { p: found.size === 1 ? [...found.values()][0] : null, react: true, many: found.size > 1 };
    };

    // The game keeps its state in localStorage "undefeated"; look there for the picks made so far.
    const readStoredPicks = () => {
      let state; try { state = JSON.parse(localStorage.getItem('undefeated') || 'null'); } catch (e) { return { picks: [], note: 'storage unreadable' }; }
      const found = [];
      const walk = (v, depth) => { if (!v || depth > 6) return;
        if (Array.isArray(v)) { const items = v.map(x => {
            const o = x && (x.player && typeof x.player === 'object' ? { ...x.player, ...x } : x);
            const id = o?.playerId ?? o?.player?.playerId ?? (typeof o?.player === 'number' ? o.player : undefined);
            const slot = o?.position ?? o?.slot ?? o?.pos;
            return id != null && SLOT_LINE.test(String(slot)) ? { id: +id, teamId: o.teamId ?? o.team?.id, decade: o.decade ?? o.era, slot: String(slot) } : null; });
          if (items.length && items.every(Boolean)) found.push(items);
          v.forEach(x => walk(x, depth + 1)); return; }
        if (typeof v === 'object') Object.values(v).forEach(x => walk(x, depth + 1)); };
      walk(state, 0);
      const best = found.sort((a, b) => b.length - a.length)[0] || [];
      const picks = [];
      for (const q of best) {
        const m = PL.filter(p => p.playerId === q.id && (q.teamId == null || p.teamId === +q.teamId) && (q.decade == null || p.decade === +q.decade));
        if (m.length !== 1) return { picks: [], note: `stored pick ${q.id} matched ${m.length} players` };
        picks.push({ p: m[0], slot: q.slot });
      }
      return { picks, note: best.length ? 'storage' : 'no picks in storage' };
    };
    const initials = p => (p.name.split(' ')[0][0] + p.name.split(' ').slice(-1)[0][0]).toUpperCase();

    // ---------- page reading ----------
    const leafs = e => [...e.querySelectorAll('*')].filter(n => !n.children.length && CLUB_LINE.test(n.textContent.trim()) && !n.closest('.r230'));
    let T = 0, lastSig = '', lastForecast = '', lastBanner = '', lastRec = null;
    // picks the overlay saw being made: position -> player (matched by initials against the pool on offer at the time)
    const memo = {}; let prevPool = [], prevFilled = null;   // prevFilled: positions filled when the bar was last read

    const run = () => {
      const cards = [], unmatched = []; const seen = {};
      for (const l of leafs(document.body)) {
        let d = l; while (d.parentElement && d.parentElement !== document.body && leafs(d.parentElement).length === 1) d = d.parentElement;
        const [, ab, dc] = l.textContent.trim().match(CLUB_LINE), lines = d.innerText.split('\n').map(s => s.trim()).filter(Boolean);
        const nm = lines.find(s => byName.has(`${s}|${ab}|${dc}`)) || lines[0], h = byName.get(`${nm}|${ab}|${dc}`) || [];
        if (h.length !== 1) { unmatched.push(nm); continue; }
        const k = `${ab}|${dc}`; seen[k] = (seen[k] || 0) + 1;
        cards.push({ d, l, p: h[0], k, slot: lines.find(s => SLOT_LINE.test(s)) || null });
      }
      const top = Object.entries(seen).sort((a, b) => b[1] - a[1])[0], cur = top && top[1] > 1 ? top[0] : null;
      const resultPage = /PROJECTED RECORD/i.test(document.body.innerText);
      // picks already placed: from the game's stored state, checked against the position bar;
      // otherwise cards with a position label from another club (results-style cards)
      const bar = resultPage ? null : readBar();
      const stored = readStoredPicks();
      let placed = [], pickSource = '';
      const pid = new Set();
      const barFilled = bar ? bar.filter(x => x.filled) : null;
      // 1) the game's own data behind each filled position in the bar
      let reactSeen = false;
      if (barFilled && barFilled.length) {
        const got = barFilled.map(b => { const r = reactPick(b.el, b.top, b.slot); reactSeen = reactSeen || r.react; return r.p ? { p: r.p, slot: b.slot } : null; });
        if (got.every(Boolean)) { placed = got; pickSource = `picks read from the game page (${placed.length})`; }
        else got.forEach((g, i) => { if (g && !memo[barFilled[i].slot]) memo[barFilled[i].slot] = g.p; });   // partial: keep what was found
      }
      if (placed.length) { /* done */ }
      else if (stored.picks.length && (!barFilled || (stored.picks.length === barFilled.length && barFilled.every(b => stored.picks.some(q => q.slot === b.slot && initials(q.p) === b.top))))) {
        placed = stored.picks.map(q => ({ p: q.p, slot: q.slot })); pickSource = `picks from game storage (${placed.length})`;
      } else {
        for (const c of cards) if (c.slot && c.k !== cur && !pid.has(c.p.playerId)) { pid.add(c.p.playerId); placed.push(c); }
        pickSource = placed.length ? `picks from page (${placed.length})` : '';
      }
      if (barFilled) {
        for (const s of Object.keys(memo)) if (!barFilled.some(b => b.slot === s && b.top === initials(memo[s]))) delete memo[s];
        // only name a pick the overlay actually saw happen: the position was empty last time and filled now,
        // matched by initials against the club/era that was on offer at that moment (never the current one)
        for (const b of barFilled) if (!memo[b.slot] && prevFilled && !prevFilled.has(b.slot)) {
          const m = prevPool.filter(p => initials(p) === b.top && fits(p, b.slot) && p.teamAbbr !== cur?.split('|')[0]);
          if (m.length === 1) memo[b.slot] = m[0];
        }
        prevFilled = new Set(barFilled.map(b => b.slot));
        if (!placed.length && barFilled.length && barFilled.every(b => memo[b.slot])) {
          placed = barFilled.map(b => ({ p: memo[b.slot], slot: b.slot })); pickSource = `picks seen by the overlay (${placed.length})`;
        }
      }
      placed.forEach(c => pid.add(c.p.playerId));
      const unknownPicks = barFilled && barFilled.length > placed.length;
      if (unknownPicks) pickSource = `PICKS NOT IDENTIFIED (${reactSeen ? 'game data found but no pick in it' : 'no game data on the bar'}): bar shows ${barFilled.length} filled (${barFilled.map(b => b.top + ' ' + b.slot).join(', ')}), found ${placed.length}${stored.note ? '; ' + stored.note : ''}`;
      const open = bar ? bar.filter(x => !x.filled).map(x => x.slot) : SLOTS.filter(s => !placed.some(c => c.slot === s));
      const round = +(document.body.innerText.match(/Round (\d)\/5/) || [])[1] || null;
      if (round && SLOTS.length - open.length !== round - 1) pickSource += ` / CHECK: round ${round} but ${SLOTS.length - open.length} positions filled`;
      const pool = cur ? byPool.get(cur) || [] : [];
      if (pool.length) prevPool = pool;
      const st = { open, clubs: new Set(placed.map(c => c.p.teamAbbr)), decs: placed.map(c => c.p.decade), players: pid,
        logsum: placed.reduce((a, c) => a + Math.log(R1(c.p, c.slot)), 0), club: cur?.split('|')[0], dec: cur ? +cur.split('|')[1] : null };

      // best pick per open position in the current pool
      const best = {};
      if (cur) for (const s of open) { const e = pool.filter(p => fits(p, s) && !pid.has(p.playerId)).map(p => [p, rate(p, s)]).sort((a, b) => b[1][0] - a[1][0]); if (e[0]) best[s] = e; }
      const rr = cur ? readRerolls() : {};

      // forecast: re-run only when picks, spin or re-roll availability change
      let rec = null, forecast = '', banner = '';
      const HR = '<hr style="border:0;border-top:1px solid #456;margin:5px 0">';
      // the advice banner at the top of the panel: one colour per kind of advice
      const BAN = (bg, fg, head, sub) => `<div style="background:${bg};color:${fg};border-radius:6px;padding:7px 9px;margin:-2px -3px 6px;font:800 15px/1.2 system-ui,sans-serif;letter-spacing:.01em">${head}${sub ? `<div style="font:600 12px/1.3 system-ui,sans-serif;margin-top:3px">${sub}</div>` : ''}</div>`;
      const GREEN = '#15803d', CLUBC = '#f59e0b', ERAC = '#7c3aed', RED = '#c62828', GREY = '#546e7a';
      if (cur && !resultPage) {
        const sig = placed.map(c => c.p.playerId + c.slot).sort().join() + '|' + cur + '|' + open.join() + '|' + rr.Club + rr.Era;
        if (!bar) banner = BAN(GREY, '#fff', 'NO ADVICE', "The position bar wasn't found, so open positions are unknown.");
        else if (unknownPicks) banner = BAN(GREY, '#fff', 'NO ADVICE', "Earlier picks couldn't be identified, so the team so far is unknown.");
        else if (sig === lastSig) { forecast = lastForecast; banner = lastBanner; rec = lastRec; }
        else {
          const mxAll = maxFree(st), mxHere = maxHere(st, pool);
          // candidate picks: the top two players for each open position on this spin
          const cands = []; for (const s of open) for (const [p] of (best[s] || []).slice(0, 2)) cands.push({ p, s });
          const scored = cands.map(c => ({ ...c, r: R1(c.p, c.s), pr: simulate(st, c, SIMS_PICK) })).sort((a, b) => b.pr - a.pr || b.r - a.r);
          rec = scored[0] || null;
          const opts = [];
          for (const [name, key] of [['Club', 'club'], ['Era', 'era']]) {
            if (rr[name] === false) continue;                       // used up: never suggest it
            opts.push({ name, pr: simulate(st, key, SIMS), known: rr[name] === true });
          }
          const top = [...opts].sort((a, b) => b.pr - a.pr)[0], pickP = rec ? rec.pr : 0;
          const takeLine = rec ? `${esc(rec.p.name)} ${rec.s === 'UTL' ? plays(rec.p) + ' ' : ''}at ${rec.s} (${rec.r.toFixed(1)})` : 'nothing';
          let f = HR;
          if (mxAll === null || mxAll < THRESHOLD) {
            banner = BAN(RED, '#fff', '23-0 NOT POSSIBLE', `Best team still reachable rates ${mxAll ? mxAll.toFixed(2) : '-'}; 23-0 needs ${THRESHOLD} (shows 96.7).${rec ? ` Highest-rated pick: ${takeLine}.` : ''}`);
          } else {
            if (top && top.pr - pickP >= 0.03) {
              const era = top.name === 'Era';
              banner = BAN(era ? ERAC : CLUBC, era ? '#fff' : '#1a1a1a', `RE-ROLL ${top.name.toUpperCase()}`,
                `Chance of 23-0: ${pct(pickP)} if you pick now, ${pct(top.pr)} after the ${top.name.toLowerCase()} re-roll.${top.known ? '' : ' (Couldn\'t confirm this re-roll is still available.)'}`);
            } else if (rec && (!mxHere || mxHere < THRESHOLD)) {
              banner = BAN(RED, '#fff', 'DEAD SPIN', `Nothing here can lead to 23-0${opts.length ? ' and a re-roll doesn\'t help enough' : ' and no re-rolls are left'}. Best pick: ${takeLine}.`);
            } else if (rec) {
              banner = BAN(GREEN, '#fff', `TAKE ${esc(rec.p.name.toUpperCase())} ${rec.s === 'UTL' ? plays(rec.p) + ' ' : ''}AT ${rec.s}`, `Rating ${rec.r.toFixed(1)}. Chance of 23-0 from here: ${pct(pickP)}.`);
            } else banner = BAN(GREY, '#fff', 'NOTHING TO PICK', 'No player here fits an open position.');
            f += `Best reachable: ${mxAll.toFixed(2)}; taking from this spin: ${mxHere ? mxHere.toFixed(2) : '-'}`;
            f += `<br>Chance of 23-0 with each choice:`;
            for (const c of scored.slice(0, 4)) f += `<br>&nbsp; ${c === rec ? '\u2605\u2605 ' : ''}${esc(c.p.name)} ${c.s === 'UTL' ? plays(c.p) + ' ' : ''}at ${c.s} (${c.r.toFixed(1)}): <b>${pct(c.pr)}</b>`;
            for (const o of opts) f += `<br>&nbsp; <span style="color:${o.name === 'Era' ? '#c4b5fd' : '#fcd34d'}">${o.name} re-roll</span>${o.known ? '' : ' (availability unknown)'}: <b>${pct(o.pr)}</b>`;
            if (!opts.length) f += `<br><small>Both re-rolls used.</small>`;
          }
          f += `<br><small>Chance of 23-0 = chance of finishing at ${THRESHOLD}+ (game shows 96.7+), assuming the best pick on each later spin and no further re-rolls.</small>`;
          lastSig = sig; lastForecast = forecast = f; lastBanner = banner; lastRec = rec;
        }
      }

      // chips and outlines
      if (mode === 'off') {
        for (const g of document.body.querySelectorAll('.r230')) g.remove?.();
        for (const c of cards) if (c.d.style.outline) c.d.style.outline = '';
      }
      else for (const c of cards) {
        const stars = c.k === cur ? SLOTS.filter(s => best[s]?.[0]?.[0] === c.p) : [];
        const isRec = rec && c.k === cur && rec.p === c.p;
        const ol = isRec ? '3px solid gold' : stars.length ? '3px solid limegreen' : '';
        if (c.d.style.outline !== ol) { c.d.style.outline = ol; c.d.style.outlineOffset = '-3px'; }
        let g = c.d.querySelector('.r230'); if (!g) { g = document.createElement('div'); g.className = 'r230'; g.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;margin-top:3px;font:600 11px sans-serif'; c.l.after(g); }
        const w = [...c.p.eligiblePositions, 'UTL'].map(s => { const x = rate(c.p, s), b = stars.includes(s), r = isRec && rec.s === s;
          return `<span style="background:${col(x[0])};color:#fff;border-radius:8px;padding:0 5px${r ? ';box-shadow:0 0 0 2px gold' : b ? ';box-shadow:0 0 0 2px limegreen' : ''}">${r ? '\u2605\u2605' : b ? '\u2605' : ''}${s} ${fmt(x)}</span>`; }).join('');
        if (g.innerHTML !== w) g.innerHTML = w;
      }

      // panel
      let z = '';
      if (resultPage) {
        const t = cards.filter(c => c.slot), sl = new Set(t.map(c => c.slot));
        if (t.length === 5 && sl.size === 5) { const ovr = Math.exp(t.reduce((a, c) => a + Math.log(R1(c.p, c.slot)), 0) / 5);
          z = `<b>Team rating ${ovr.toFixed(2)}</b> (game shows ${ovr.toFixed(1)})<br>${ovr >= THRESHOLD ? '23-0 was possible with this team.' : `23-0 was not possible: needs ${THRESHOLD} (shows 96.7).`}<br><small>${t.map(c => c.slot + ' ' + fmt(rate(c.p, c.slot))).join(', ')}</small>`; }
        else z = `Team rating: found ${t.length} of 5 picks with a position.`;
      } else if (cur) {
        const [ab, dc] = cur.split('|');
        z = banner + `<b>${esc(ab)} ${dc}s</b> &middot; open: ${open.join(', ') || 'none'}${placed.length ? ` &middot; picked ${placed.length}` : ''}`;
        for (const s of open) { const e = best[s]; z += `<br>${s}: ${e ? `<b>${esc(e[0][0].name)}</b> ${fmt(e[0][1])}${s === 'UTL' ? ` ${plays(e[0][0])}` : ''}${e[1] ? ` (next ${esc(e[1][0].name)} ${fmt(e[1][1])})` : ''}` : 'none'}`; }
        z += forecast;

      } else z = 'No pick list yet - spin';
      if (pickSource) z += `<br><small>${esc(pickSource)}</small>`;
      z += `<br><small>overlay ${VERSION} / ${esc(src)} / cards ${cards.length} / unmatched ${unmatched.length}${unmatched.length ? ': ' + esc(unmatched.slice(0, 3).join(', ')) : ''}</small>`;
      if (mode === 'off') { z = ''; P.style.cssText = 'position:fixed;right:2px;bottom:50%;z-index:99999;width:12px;height:12px;border-radius:50%;background:#0b2545;opacity:.3;cursor:pointer'; P.title = 'Show 23-0 overlay'; }
      else {
        P.style.cssText = PANEL_CSS;
        if (mode === 'min') z = controls() + (banner || (resultPage ? z.split('<br>')[0] : '<b>23-0 overlay</b>'));
        else z = controls() + z;
      }
      if (P.innerHTML !== z) P.innerHTML = z;
      ob.takeRecords();
    };
    window.r230rerun = () => { lastSig = ''; try { run(); } catch (e) { fail(e.message); } };
    const ob = new MutationObserver(() => { clearTimeout(T); T = setTimeout(() => { try { run(); } catch (e) { fail(e.message); } }, 150); });
    ob.observe(document.body, { childList: true, subtree: true, characterData: true });
    run();
  } catch (e) { fail(e.message); }
})();
