// Mises en scène de la saisie d'un achat et d'une vente, à la manière d'une ouverture de booster.
// Achat : un booster de la série tombe à l'écran ; on le déchire d'un glissement (ou d'un toucher) et la carte
// en sort, avec une mise en scène qui grandit avec sa rareté (celebrationTier) :
//   1 commune ou peu commune : lumière blanche, la carte monte et s'illumine, un losange ;
//   2 rare ou holo : rayons bleus, étincelles, reflet holographique, deux losanges ;
//   3 ultra rare (ex, V, illustration rare…) : la carte sort face cachée, pulse, se retourne dans une onde de choc,
//     fond irisé, pluie d'étoiles, trois losanges ;
//   4 secrète ou spéciale : l'écran s'assombrit, rayons dorés, la carte tremble puis se retourne dans un éclair blanc,
//     confettis et paillettes d'or, trois étoiles dorées.
// Vente : la carte arrive, le tampon « VENDUE » s'abat, elle se change en orbe doré qui éclate en pièces ;
// les pièces filent vers la cagnotte, qui se remplit du montant de la vente.
// Un clic ou Échap passe directement à la fin ; « mouvement réduit » : écran final sans animation.
import { esc, eur, sg } from './util.js';
import { spriteBg } from './ui.js';
import { rarityOf, rarityLabel, celebrationTier } from './pullrates.js';
import { loadSets } from './views/catalog.js';

const GEM = '<svg viewBox="0 0 20 24" aria-hidden="true"><path d="M10 1 19 12 10 23 1 12Z"/><path d="M10 1 13 12 10 23 7 12Z" opacity=".35" fill="#fff"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 1.8 3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5L7 14.3l-5.3-5 7.2-.9z"/></svg>';
const BALL = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#fff" stroke="#1b1f3a" stroke-width="2.4"/><path d="M2 16a14 14 0 0 1 28 0z" fill="#e3350d" stroke="#1b1f3a" stroke-width="2.4"/><path d="M2 16h28" stroke="#1b1f3a" stroke-width="2.4"/><circle cx="16" cy="16" r="4.5" fill="#fff" stroke="#1b1f3a" stroke-width="2.4"/></svg>';
const TIER_TITLE = { 1: 'Nouvelle carte', 2: 'Carte rare !', 3: 'Ultra rare !', 4: 'Carte secrète !' };
// Couleur de la lumière et des étincelles selon la rareté
const GLOW = { 1: ['#ffffff', '#dfeaff'], 2: ['#8fd3ff', '#ffffff'], 3: ['#c9a2ff', '#ff9ad5', '#9ad8ff'], 4: ['#ffd75a', '#fff2b0', '#ff9f43'] };

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

/** Illustration de la carte (image ou case de planche) */
function art(c) {
  const src = c?.image_large || c?.image_small, sp = spriteBg(src);
  return sp ? `<span class="cel-img" style="${sp}"></span>` : src ? `<img class="cel-img" src="${esc(src)}" alt="">` : `<span class="cel-img cel-ph">${esc(c?.name || '')}</span>`;
}

/** Calque plein écran commun : Échap ou « Continuer » pour fermer ; un clic pendant l'animation passe à la fin */
function overlay(cls, label) {
  const ov = document.createElement('div');
  ov.className = `cel-ov ${cls}`; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', label); ov.tabIndex = -1;
  document.body.append(ov);
  const prev = document.activeElement;
  let skip = false, done = false, resolve, onTap = null;
  const closed = new Promise(r => { resolve = r; });
  const settle = () => ov.getAnimations({ subtree: true }).forEach(a => { if (a instanceof CSSAnimation || a.effect?.getComputedTiming().iterations === Infinity) return; a.finish(); });
  const close = () => {
    if (!done) { skip = true; settle(); onTap?.(); return; }
    removeEventListener('keydown', key, true);
    ov.classList.add('out');
    setTimeout(() => { ov.remove(); prev?.focus?.(); resolve(); }, 300);
  };
  const key = e => { if (e.key === 'Escape' || (done && e.key === 'Enter')) { e.preventDefault(); e.stopPropagation(); close(); } };
  addEventListener('keydown', key, true);
  ov.addEventListener('click', e => {
    if (onTap) { if (!e.target.closest('.cel-pack')) onTap(); return; } // booster fermé : le toucher sur le booster est géré par waitOpen
    if (!done || e.target.closest('.cel-ok') || !e.target.closest('.cel-card, .cel-wallet, .cel-foot')) close();
  });
  requestAnimationFrame(() => ov.classList.add('on'));
  ov.focus();
  return {
    ov, closed,
    get skip() { return skip; },
    set onTap(f) { onTap = f; },
    /** Anime un élément ; renvoie sa fin (immédiate si l'utilisateur a demandé à passer) */
    play(el, kf, opt) {
      if (!el) return Promise.resolve();
      const a = el.animate(kf, { fill: 'forwards', easing: 'cubic-bezier(.2,.8,.2,1)', ...opt });
      if (skip) a.finish();
      return a.finished.catch(() => {});
    },
    pause: ms => skip ? Promise.resolve() : wait(ms),
    finish() {
      done = true; ov.classList.add('done');
      // Fige l'état final dans le style de chaque élément, puis libère les animations (l'inclinaison au pointeur reprend la main)
      settle();
      ov.getAnimations({ subtree: true }).forEach(a => { if (a instanceof CSSAnimation) return; try { a.commitStyles(); } catch (e) { /* élément retiré */ } a.cancel(); });
      ov.querySelector('.cel-ok')?.focus();
    },
  };
}

/** Bulles de lumière qui flottent dans le fond */
function bokeh(ov, n, colors) {
  const box = ov.querySelector('.cel-bokeh');
  for (let i = 0; i < n; i++) {
    const b = document.createElement('span'), s = rnd(14, 70);
    Object.assign(b.style, { left: rnd(0, 100) + '%', top: rnd(0, 100) + '%', width: s + 'px', height: s + 'px', background: colors[i % colors.length],
      animationDelay: -rnd(0, 9) + 's', animationDuration: rnd(7, 13) + 's', opacity: rnd(.25, .6) });
    box.append(b);
  }
}

/** Éclats projetés depuis un point de la scène (x, y en px dans le calque) : étincelles, étoiles ou confettis */
function burst(host, n, { x, y, colors, kind = 'star', spread = 1, up = 0 }) {
  if (reduced()) return;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span');
    p.className = `cel-p cel-${kind}`;
    p.style.left = x + 'px'; p.style.top = y + 'px'; p.style.background = colors[i % colors.length]; p.style.color = colors[i % colors.length];
    host.append(p);
    const ang = up ? rnd(-Math.PI * .95, -Math.PI * .05) : rnd(0, Math.PI * 2), dist = rnd(70, 260) * spread, dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
    const fall = kind === 'conf' ? rnd(200, 420) : kind === 'spark' ? rnd(40, 120) : 0, rot = rnd(-600, 600), s = rnd(.5, 1.3);
    p.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx * .7}px), calc(-50% + ${dy * .7}px)) rotate(${rot / 2}deg) scale(${s})`, opacity: 1, offset: .45 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + fall}px)) rotate(${rot}deg) scale(${s * .5})`, opacity: 0 }],
    { duration: rnd(900, 1500) * (kind === 'conf' ? 1.7 : 1), easing: 'cubic-bezier(.15,.7,.3,1)' }).finished.then(() => p.remove(), () => p.remove());
  }
}

/** Pluie continue (paillettes d'or, étoiles) pendant ms millisecondes */
function rain(host, ms, colors, kind = 'glit') {
  if (reduced()) return;
  const end = performance.now() + ms, w = host.clientWidth, h = host.clientHeight;
  const t = setInterval(() => {
    if (performance.now() > end || !host.isConnected) { clearInterval(t); return; }
    for (let i = 0; i < 3; i++) {
      const p = document.createElement('span');
      p.className = `cel-p cel-${kind}`; p.style.left = rnd(0, w) + 'px'; p.style.top = '-12px'; p.style.background = colors[(Math.random() * colors.length) | 0];
      host.append(p);
      p.animate([{ transform: `translateY(0) rotate(0) scale(${rnd(.6, 1.2)})`, opacity: 1 }, { transform: `translate(${rnd(-60, 60)}px, ${h + 30}px) rotate(${rnd(-720, 720)}deg) scale(.6)`, opacity: .2 }],
        { duration: rnd(1800, 3200), easing: 'linear' }).finished.then(() => p.remove(), () => p.remove());
    }
  }, 70);
}

const center = (el, host) => { const r = el.getBoundingClientRect(), h = host.getBoundingClientRect(); return { x: r.left - h.left + r.width / 2, y: r.top - h.top + r.height / 2, r }; };

/** Attend le geste d'ouverture : glisser le doigt (ou la souris) le long du haut du booster, ou un simple toucher */
function waitOpen(ui, pack, cut) {
  return new Promise(res => {
    let x0 = null, done = false;
    const finish = () => { if (done) return; done = true; ui.onTap = null; pack.removeEventListener('pointerdown', down); removeEventListener('pointermove', move); removeEventListener('pointerup', up); res(); };
    const down = e => { x0 = e.clientX; pack.setPointerCapture?.(e.pointerId); };
    const move = e => {
      if (x0 == null) return;
      const r = pack.getBoundingClientRect(), k = Math.max(0, Math.min(1, Math.abs(e.clientX - x0) / (r.width * .8)));
      cut.style.transform = `scaleX(${k})`; cut.style.opacity = 1;
      if (k >= 1) { eatClick(); finish(); }
    };
    const up = () => { if (x0 != null) { eatClick(); finish(); } x0 = null; };
    // le clic qui suit le glissé ne doit pas « passer » l'animation qui commence
    const eatClick = () => { const f = e => e.stopPropagation(); addEventListener('click', f, true); setTimeout(() => removeEventListener('click', f, true), 400); };
    pack.addEventListener('pointerdown', down);
    addEventListener('pointermove', move); addEventListener('pointerup', up);
    ui.onTap = finish; // un clic ailleurs, Échap : ouverture directe
  });
}

/** Achat : la carte rejoint le Pokédex. opts = { qty, price } ; renvoie une promesse résolue à la fermeture. */
export async function celebrateBuy(c, { qty = 1, price = null } = {}) {
  const tier = celebrationTier(c), r = rarityOf(c);
  const set = (await loadSets().catch(() => [])).find(s => s.id === c.set_id);
  const ui = overlay(`cel-buy t${tier}`, `${TIER_TITLE[tier]} ${c.name} ajoutée à votre Pokédex`);
  const { ov } = ui;
  const marks = tier === 4 ? Array.from({ length: 3 }, () => `<span class="cel-gem star">${STAR}</span>`) : Array.from({ length: tier }, () => `<span class="cel-gem">${GEM}</span>`);
  ov.innerHTML = `<div class="cel-bg"></div><div class="cel-bokeh" aria-hidden="true"></div><div class="cel-rays" aria-hidden="true"></div><div class="cel-flash"></div>
    <div class="cel-stage">
      <div class="cel-glow" aria-hidden="true"></div><div class="cel-beam" aria-hidden="true"></div><div class="cel-ring" aria-hidden="true"></div>
      <div class="cel-pack" aria-label="Booster : glissez le long du haut pour l'ouvrir"><div class="cel-pack-in">
        <div class="cel-pack-top"></div>
        <div class="cel-pack-body"><span class="cel-pack-burst"></span>
          ${set?.logo ? `<img class="cel-pack-logo" src="${esc(set.logo)}" alt="">` : `<span class="cel-pack-ball">${BALL}</span>`}
          <span class="cel-pack-name">${esc(set?.name || c.set_name || 'Booster')}</span><span class="cel-pack-kind">Booster</span><span class="cel-pack-sheen"></span></div>
        <div class="cel-pack-bot"></div>
        <div class="cel-guide"></div><div class="cel-cut"></div>
      </div></div>
      <div class="cel-card"><div class="cel-float"><div class="cel-flip"><div class="cel-face cel-front">${art(c)}<span class="cel-holo"></span><span class="cel-glare"></span></div><div class="cel-face cel-back" aria-hidden="true"><span class="cb-swirl"></span><span class="cb-logo">POKéMON</span><span class="cb-ball">${BALL}</span><span class="cb-tcg">TRADING CARD GAME</span></div></div></div>${qty > 1 ? `<span class="cel-qty">× ${qty}</span>` : ''}</div>
    </div>
    <p class="cel-hint" aria-live="polite"><span class="cel-hand" aria-hidden="true"></span>Glissez le long du haut du booster pour l'ouvrir</p>
    <div class="cel-fx" aria-hidden="true"></div>
    <div class="cel-foot">
      <div class="cel-gems" aria-label="Rareté ${tier} sur 4">${marks.join('')}</div>
      <p class="cel-title">${esc(TIER_TITLE[tier])}</p>
      <p class="cel-name"><b>${esc(c.name)}</b>${r ? `<span class="cel-rar">${esc(rarityLabel(r))}</span>` : ''}</p>
      <p class="cel-sub">Ajoutée à votre Pokédex${price != null ? ` · ${qty > 1 ? qty + ' × ' : ''}${eur(price)}` : ''}</p>
      <button class="btn primary cel-ok" type="button">Continuer</button>
    </div>`;
  const $o = s => ov.querySelector(s);
  const card = $o('.cel-card'), flipper = $o('.cel-flip'), pack = $o('.cel-pack'), fx = $o('.cel-fx'), flash = $o('.cel-flash'), hint = $o('.cel-hint');
  const colors = GLOW[tier];
  bokeh(ov, tier >= 3 ? 16 : 10, tier === 4 ? ['#ffd75a', '#ff9f43', '#fff2b0'] : tier === 3 ? ['#ffffff', '#ffc2ec', '#c3d8ff'] : ['#ffffff', '#cfe6ff']);
  if (reduced()) { pack.remove(); hint.remove(); card.classList.add('flipped'); ui.finish(); return ui.closed; }

  const faceDown = true; // toujours face cachée : la carte ne se découvre qu'une fois sortie du booster
  if (faceDown) card.classList.add('down');
  card.classList.add('inpack');
  // 1. le booster tombe, rebondit, puis flotte en attendant d'être ouvert
  await ui.play(pack, [{ transform: 'translateY(-110vh) rotate(-12deg)' }, { transform: 'translateY(4%) rotate(2deg) scale(1.02,.97)', offset: .7 }, { transform: 'translateY(-2%) rotate(-1deg)', offset: .85 }, { transform: 'none' }], { duration: 850 });
  pack.classList.add('idle');
  if (!ui.skip) {
    ov.classList.add('await');
    await waitOpen(ui, pack, $o('.cel-cut'));
    ov.classList.remove('await');
  }
  pack.classList.remove('idle');
  hint.remove();
  // 2. la ligne de découpe s'illumine, le haut s'arrache dans une gerbe d'étincelles
  const cut = $o('.cel-cut');
  await ui.play(cut, [{ transform: getComputedStyle(cut).transform === 'none' ? 'scaleX(0)' : getComputedStyle(cut).transform, opacity: 1 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 260, easing: 'ease-out' });
  const top = $o('.cel-pack-top'), { x: px, r: pr } = center(pack, ov), ty = pr.top - ov.getBoundingClientRect().top + pr.height * .12;
  burst(fx, 18 + tier * 6, { x: px, y: ty, colors, kind: 'spark', spread: .8, up: 1 });
  ui.play(cut, [{ opacity: 1 }, { opacity: 0 }], { duration: 260 });
  ui.play(top, [{ transform: 'none' }, { transform: 'translate(46vw, -55vh) rotate(48deg)' }], { duration: 700, easing: 'cubic-bezier(.4,0,.8,.6)' });
  ui.play(pack, [{ transform: 'none' }, { transform: 'rotate(-2deg) scale(1.02)' }, { transform: 'rotate(2deg)' }, { transform: 'none' }], { duration: 300 + tier * 80, easing: 'linear' });
  // 3. la lumière jaillit de l'ouverture
  ov.classList.add('lit');
  await ui.play($o('.cel-beam'), [{ transform: 'translateX(-50%) scaleY(0)', opacity: 0 }, { transform: 'translateX(-50%) scaleY(1)', opacity: 1 }], { duration: 480 });
  if (tier === 4) { ov.classList.add('dim'); await ui.pause(350); }
  // 4. la carte sort du booster, qui retombe
  await ui.play(card, [{ transform: 'translateY(40%) scale(.84)', opacity: 1 }, { transform: 'translateY(-30%) scale(.88)', opacity: 1 }], { duration: tier >= 3 ? 900 : 650, easing: 'cubic-bezier(.3,.7,.3,1)' });
  ui.play($o('.cel-beam'), [{ opacity: 1 }, { opacity: 0 }], { duration: 600 });
  // le booster retombe AVANT que la carte passe au premier plan : jamais de carte posée par-dessus le paquet
  await ui.play(pack, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(85vh) rotate(8deg)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.5,0,.9,.5)' });
  pack.style.visibility = 'hidden';
  card.classList.remove('inpack');
  await ui.play(card, [{ transform: 'translateY(-30%) scale(.88)' }, { transform: 'translateY(0) scale(1.08)', offset: .7 }, { transform: 'none' }], { duration: 600 });
  const mid = () => center(card, ov);
  if (tier >= 3) {
    // 5. face cachée : la carte se charge de lumière, pulse, tremble… et se retourne dans une onde de choc
    card.classList.add('charge');
    const pulses = tier === 4 ? 3 : 2;
    for (let i = 0; i < pulses && !ui.skip; i++) {
      await ui.play(card, [{ transform: 'none' }, { transform: `scale(${1.03 + i * .02}) rotate(${i % 2 ? 1.5 : -1.5}deg)` }, { transform: 'none' }], { duration: 420 - i * 60, easing: 'ease-in-out' });
      burst(fx, 6 + i * 4, { ...mid(), colors, kind: 'star', spread: .5 + i * .2 });
    }
    if (tier === 4) await ui.play(card, [{ transform: 'none' }, { transform: 'translateX(-4px) rotate(-1.5deg)' }, { transform: 'translateX(4px) rotate(1.5deg)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], { duration: 260, iterations: 3, easing: 'linear' });
    ui.play(flash, [{ opacity: 0 }, { opacity: tier === 4 ? 1 : .8, offset: .3 }, { opacity: 0 }], { duration: tier === 4 ? 900 : 650, easing: 'ease-out' });
    ui.play($o('.cel-ring'), [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(3.2)', opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.1,.7,.3,1)' });
    if (tier === 4) ui.play(ov, [{ transform: 'none' }, { transform: 'translate(-6px,3px)' }, { transform: 'translate(5px,-4px)' }, { transform: 'translate(-3px,2px)' }, { transform: 'none' }], { duration: 380, easing: 'linear', fill: 'none' });
    await ui.play(flipper, [{ transform: 'rotateY(180deg) scale(1)' }, { transform: 'rotateY(270deg) scale(1.14)', offset: .45 }, { transform: 'rotateY(360deg) scale(1)' }], { duration: 650, easing: 'cubic-bezier(.5,0,.3,1)' });
    flipper.getAnimations().forEach(a => a.cancel());
    card.classList.remove('down', 'charge');
    ov.classList.add('iri'); ov.classList.remove('dim');
    burst(fx, tier === 4 ? 80 : 40, { ...mid(), colors: tier === 4 ? ['#ffcb05', '#ff5a8a', '#5ad1ff', '#8f7bff', '#3ddc97', '#ffffff'] : colors, kind: tier === 4 ? 'conf' : 'star', spread: tier === 4 ? 1.6 : 1.2 });
    if (tier === 4) { setTimeout(() => burst(fx, 50, { ...mid(), colors: ['#ffcb05', '#fff2b0', '#ff9f43', '#ffffff'], kind: 'conf', spread: 2 }), 420); rain(fx, 4200, ['#ffd75a', '#fff2b0', '#ffb703']); }
    else rain(fx, 2200, ['#ffffff', '#ffc2ec', '#c3d8ff'], 'twk');
  } else {
    // commune et rare : un petit élan, puis la carte se retourne
    await ui.play(card, [{ transform: 'none' }, { transform: 'scale(1.05) rotate(-1deg)' }, { transform: 'none' }], { duration: 320, easing: 'ease-in-out' });
    await ui.play(flipper, [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(270deg) scale(1.08)', offset: .5 }, { transform: 'rotateY(360deg)' }], { duration: 520, easing: 'cubic-bezier(.5,0,.3,1)' });
    flipper.getAnimations().forEach(a => a.cancel());
    card.classList.remove('down');
    ov.classList.add('iri');
    burst(fx, tier === 2 ? 30 : 16, { ...mid(), colors, kind: 'star', spread: tier === 2 ? 1.1 : .8 });
  }
  card.classList.add('flipped');
  ui.play($o('.cel-glare'), [{ backgroundPosition: '160% 0' }, { backgroundPosition: '-60% 0' }], { duration: 800, easing: 'ease-in-out' });
  // 6. les marques de rareté, une par une, puis le texte
  for (const g of ov.querySelectorAll('.cel-gem')) {
    ui.play(g, [{ transform: 'scale(0) rotate(-120deg)', opacity: 0 }, { transform: 'scale(1.6) rotate(0)', opacity: 1, offset: .6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 460 });
    if (!ui.skip) { const p = center(g, ov); burst(fx, 8, { ...p, colors: tier === 4 ? ['#ffcb05', '#fff2b0'] : ['#ffffff', ...colors], kind: 'spark', spread: .25 }); }
    await ui.pause(tier >= 3 ? 260 : 180);
  }
  await ui.play($o('.cel-foot'), [{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420 });
  ui.finish();
  tiltOn(ov, card);
  return ui.closed;
}

/** Vente : la carte apparaît, « VENDUE », elle se change en pièces qui rejoignent la cagnotte, le montant s'ajoute.
 *  opts = { qty, net (encaissé net de la vente), pnl (résultat réalisé, ou null), before (total déjà encaissé) } */
export async function celebrateSell(c, { qty = 1, net = 0, pnl = null, before = 0 } = {}) {
  const ui = overlay('cel-sell', `Vente de ${c.name} : ${eur(net)} encaissés`);
  const { ov } = ui;
  ov.innerHTML = `<div class="cel-bg"></div><div class="cel-bokeh" aria-hidden="true"></div><div class="cel-rays" aria-hidden="true"></div><div class="cel-flash"></div>
    <div class="cel-wallet" role="status"><span class="cel-coin-ic" aria-hidden="true">€</span><span><span class="l">Ventes encaissées</span><b class="cel-total">${eur(before)}</b></span><span class="cel-plus" aria-hidden="true">+ ${eur(net)}</span></div>
    <div class="cel-stage"><div class="cel-glow" aria-hidden="true"></div><div class="cel-ring" aria-hidden="true"></div><div class="cel-orb" aria-hidden="true"></div>
      <div class="cel-card"><div class="cel-float"><div class="cel-flip"><div class="cel-face cel-front">${art(c)}<span class="cel-glare"></span></div></div></div>${qty > 1 ? `<span class="cel-qty">× ${qty}</span>` : ''}
        <span class="cel-stamp" aria-hidden="true">Vendue</span></div>
      <div class="cel-tag">${eur(net)}</div></div>
    <div class="cel-fx" aria-hidden="true"></div>
    <div class="cel-foot">
      <p class="cel-title">+ ${eur(net)}</p>
      <p class="cel-name"><b>${esc(c.name)}</b>${qty > 1 ? `<span class="cel-rar">${qty} exemplaires</span>` : ''}</p>
      ${pnl == null ? '' : `<p class="cel-sub ${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? 'Plus-value' : 'Moins-value'} réalisée : <b>${sg(pnl)}</b></p>`}
      <button class="btn primary cel-ok" type="button">Continuer</button>
    </div>`;
  const $o = s => ov.querySelector(s);
  const card = $o('.cel-card'), tag = $o('.cel-tag'), wallet = $o('.cel-wallet'), total = $o('.cel-total'), fx = $o('.cel-fx'), orb = $o('.cel-orb');
  const after = before + net, gold = ['#ffcb05', '#fff2b0', '#ffb703', '#ffffff'];
  bokeh(ov, 12, ['#fff6c8', '#ffd75a', '#ffffff']);
  if (reduced()) { total.textContent = eur(after); card.remove(); ui.finish(); return ui.closed; }

  // 1. la carte arrive en tournoyant, un reflet, son prix
  card.classList.add('flipped');
  await ui.play(card, [{ transform: 'translateY(30vh) scale(.3) rotateY(-260deg)', opacity: 0 }, { transform: 'scale(1.06) rotateY(12deg)', opacity: 1, offset: .75 }, { transform: 'none', opacity: 1 }], { duration: 800 });
  ui.play($o('.cel-glare'), [{ backgroundPosition: '160% 0' }, { backgroundPosition: '-60% 0' }], { duration: 650, easing: 'ease-in-out' });
  await ui.play(tag, [{ transform: 'translate(-50%, 14px) scale(.7)', opacity: 0 }, { transform: 'translate(-50%, 0) scale(1.1)', opacity: 1, offset: .7 }, { transform: 'translate(-50%, 0)', opacity: 1 }], { duration: 420 });
  await ui.pause(350);
  // 2. le tampon « VENDUE » s'abat
  await ui.play($o('.cel-stamp'), [{ transform: 'translate(-50%,-50%) rotate(-14deg) scale(3.2)', opacity: 0 }, { transform: 'translate(-50%,-50%) rotate(-14deg) scale(.92)', opacity: 1, offset: .75 }, { transform: 'translate(-50%,-50%) rotate(-14deg) scale(1)', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.5,0,.8,.4)' });
  ui.play(ov, [{ transform: 'none' }, { transform: 'translate(-4px,3px)' }, { transform: 'translate(3px,-2px)' }, { transform: 'none' }], { duration: 220, easing: 'linear', fill: 'none' });
  burst(fx, 12, { ...center(card, ov), colors: ['#ffffff', '#e8fff4'], kind: 'spark', spread: .5 });
  await ui.pause(600);
  // 3. elle se charge d'or et se contracte en orbe, qui éclate
  ui.play(tag, [{ opacity: 1 }, { opacity: 0 }], { duration: 250 });
  await ui.play(card, [{ transform: 'none', filter: 'brightness(1)', opacity: 1 }, { transform: 'scale(1.06) rotateY(20deg)', filter: 'brightness(1.6) sepia(.7) saturate(3)', opacity: 1, offset: .35 },
    { transform: 'scale(.08) rotateY(720deg)', filter: 'brightness(3) sepia(1) saturate(5)', opacity: 0 }], { duration: 800, easing: 'cubic-bezier(.6,0,.4,1)' });
  await ui.play(orb, [{ transform: 'translate(-50%,-50%) scale(0)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1, offset: .5 }, { transform: 'translate(-50%,-50%) scale(.9)', opacity: 1 }], { duration: 320 });
  ui.play(orb, [{ transform: 'translate(-50%,-50%) scale(.9)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 }], { duration: 380, easing: 'ease-out' });
  ui.play($o('.cel-ring'), [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 }], { duration: 700 });
  ui.play($o('.cel-flash'), [{ opacity: 0 }, { opacity: .6, offset: .3 }, { opacity: 0 }], { duration: 500 });
  burst(fx, 20, { ...center(orb, ov), colors: gold, kind: 'spark', spread: .9 });
  // 4. les pièces jaillissent puis filent vers la cagnotte, qui se remplit
  const n = ui.skip ? 0 : Math.max(10, Math.min(30, Math.round(8 + Math.log2(1 + net) * 2.6)));
  const o = center(orb, ov), to = wallet.getBoundingClientRect(), hr = ov.getBoundingClientRect();
  const tx = to.left - hr.left + 30, ty = to.top - hr.top + to.height / 2;
  let landed = 0;
  const tick = () => {
    landed++;
    total.textContent = eur(before + net * Math.min(1, landed / n));
    wallet.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.09)' }, { transform: 'scale(1)' }], { duration: 170 });
    burst(fx, 3, { x: tx, y: ty, colors: gold, kind: 'spark', spread: .2 });
  };
  const flights = Array.from({ length: n }, (_, i) => new Promise(res => {
    const coin = document.createElement('span');
    coin.className = 'cel-coin'; coin.innerHTML = '<i>€</i>';
    fx.append(coin);
    const ang = rnd(0, Math.PI * 2), d = rnd(60, 170), sx = o.x + Math.cos(ang) * d, sy = o.y + Math.sin(ang) * d * .8;
    const mx = (sx + tx) / 2 + rnd(-140, 140), my = Math.min(sy, ty) - rnd(30, 140);
    coin.animate([{ transform: `translate(${o.x}px, ${o.y}px) scale(.2)`, opacity: 0 },
      { transform: `translate(${sx}px, ${sy}px) scale(1.2)`, opacity: 1, offset: .28 },
      { transform: `translate(${sx}px, ${sy + 6}px) scale(1.1)`, opacity: 1, offset: .38 },
      { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: .7 },
      { transform: `translate(${tx}px, ${ty}px) scale(.5)`, opacity: .9 }],
    { duration: rnd(1100, 1400), delay: i * 45, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'forwards' })
      .finished.then(() => { coin.remove(); tick(); res(); }, () => { coin.remove(); res(); });
  }));
  await Promise.race([Promise.all(flights), new Promise(r => { const t = setInterval(() => { if (ui.skip) { clearInterval(t); r(); } }, 50); })]);
  fx.querySelectorAll('.cel-coin').forEach(x => x.remove());
  total.textContent = eur(after);
  wallet.classList.add('full');
  ui.play($o('.cel-plus'), [{ transform: 'translate(-50%, 0) scale(.6)', opacity: 0 }, { transform: 'translate(-50%, 26px) scale(1.1)', opacity: 1, offset: .4 }, { transform: 'translate(-50%, 40px) scale(1)', opacity: 0 }], { duration: 1500, easing: 'ease-out' });
  burst(fx, 26, { x: tx, y: ty, colors: gold, kind: 'star', spread: .7 });
  rain(fx, 1800, gold);
  await ui.play($o('.cel-foot'), [{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420 });
  ui.finish();
  return ui.closed;
}

/** Fin de l'achat : la carte s'incline sous le pointeur, avec son reflet holographique */
function tiltOn(ov, card) {
  if (reduced()) return;
  ov.addEventListener('pointermove', e => {
    const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    if (Math.abs(x) > 1.5 || Math.abs(y) > 1.5) { card.style.transform = ''; return; }
    card.style.transform = `rotateY(${(x * 20).toFixed(1)}deg) rotateX(${(-y * 20).toFixed(1)}deg)`;
    card.style.setProperty('--gx', `${(x + 0.5) * 100}%`); card.style.setProperty('--gy', `${(y + 0.5) * 100}%`);
  });
}
