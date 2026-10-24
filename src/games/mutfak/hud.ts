// Mutfak Kaosu DOM overlays: shop (between days), recipe book, end-card table.
import { h, mount } from '../../ui/dom';
import { BALANCE as B, TICK, UPGRADES } from './balance';
import { dayTarget, rentOf, upgradePrice } from './sim';
import type { DaySummary, MutfakState, UpgradeId } from './types';
import './mutfak.css';

const stars = (n: number) =>
  h('span', { class: 'mk-stars' }, ...[0, 1, 2].map((i) => h('span', { class: i < n ? '' : 'off', text: '★' })));

/** Shop overlay; update() every frame (rebuilds only when something visible changed). */
export function mountShop(o: { selfId: string; buy(id: UpgradeId): void; toggleReady(): void }) {
  const card = h('div', { class: 'card' });
  const root = h('div', { class: 'screen mk-modal' }, card);
  let unmount: (() => void) | null = null;
  let key = '';
  let timer: HTMLElement | null = null;
  return {
    update(s: MutfakState | null): void {
      const open = !!s && s.phase === 'shop';
      if (!open || !s) {
        unmount?.();
        unmount = null;
        key = '';
        return;
      }
      if (!unmount) unmount = mount(root);
      const me = s.players.find((p) => p.id === o.selfId);
      const k = JSON.stringify([s.day, s.money, s.up, s.upBy, s.players.map((p) => [p.ready, p.bot]), me?.ready]);
      if (timer) timer.textContent = `${Math.ceil(s.phaseLeft / TICK)} s`;
      if (k === key) return;
      key = k;
      const d: DaySummary = s.history[s.history.length - 1] ?? s.today;
      const humans = s.players.filter((p) => !p.bot);
      const ready = humans.filter((p) => p.ready).length;
      timer = h('b', { text: `${Math.ceil(s.phaseLeft / TICK)} s` });
      // first affordable pick in this order gets an "Öneri" badge on day 1
      const tip = d.day === 1 ? SUGGEST.find((id) => !s.up[id] && s.money >= upgradePrice(s, id)) : undefined;
      const ups = UPGRADES.map((u) => {
        const owned = s.up[u.id];
        const price = upgradePrice(s, u.id);
        const by = s.players.find((p) => p.id === s.upBy[u.id])?.name;
        const short = price - s.money;
        const btn = h('button', { class: `mk-up${owned ? ' owned' : ''}` },
          h('span', { text: u.label + (u.id === tip ? ' · ⭐ Öneri' : '') }),
          h('b', { text: owned ? (by ? `✓ ${by} aldı` : '✓ Alındı') : price ? `${price} ₺` : 'Bedava' }),
          h('small', { text: !owned && short > 0 ? `${u.desc} · ${short} ₺ eksik` : u.desc }));
        btn.disabled = owned || s.money < price;
        btn.onclick = () => o.buy(u.id);
        return btn;
      });
      const readyBtn = h('button', { class: `btn ${me?.ready ? 'ghost' : 'green'} big`, text: me?.ready ? 'Bekleniyor…' : 'Hazırım ✓' });
      readyBtn.onclick = () => o.toggleReady();
      card.replaceChildren(
        h('h2', { class: 'title', text: `${d.day}. gün bitti` }),
        h('div', { class: 'mk-cols' },
          h('div', { class: 'mk-box' },
            h('h3', { text: 'Günün hesabı' }),
            h('div', { class: 'mk-sum' },
              ...[
                ['Ciro', `${d.revenue} ₺`], ['Bahşiş', `${d.tips} ₺`], ['Kira', d.rent ? `−${d.rent} ₺` : 'Yok (açılış günü)'],
                ['Servis', String(d.served)], ['Kaybedilen', String(d.failed)], ['Kasa', `${s.money} ₺`],
              ].flatMap(([a, b]) => [h('span', { text: a }), h('span', { text: b })]),
            ),
            stars(d.stars),
            ...(d.dropped ? [h('div', { class: 'hint', style: 'font-size:13px', text: `Kapanış: ${d.dropped} sipariş iptal oldu` })] : []),
            h('div', { class: 'hint', style: 'font-size:13px', text: `Yarın: hedef ${dayTarget(s, s.day + 1)} ₺ · kira ${rentOf(s.day + 1)} ₺` }),
          ),
          h('div', { class: 'mk-box' }, h('h3', { text: 'Dükkan (ortak kasa)' }), h('div', { class: 'mk-ups' }, ...ups)),
        ),
        h('div', { class: 'mk-foot' }, readyBtn, h('span', { class: 'hint', text: `Hazır ${ready}/${humans.length} · ` }, timer)),
      );
    },
    destroy(): void {
      unmount?.();
      unmount = null;
    },
  };
}

const SUGGEST: UpgradeId[] = ['bicak', 'hali', 'ocak2', 'botKurye', 'makine'];

const RECIPES: [string, string][] = [
  ['🍵 Çay', 'Çay ocağından bardak al (A), masaya götür. Bardaklar bitince demlik 30 s demlenir.'],
  ['🥣 Çorba', 'Mercimek + soğanı doğrama tahtasında doğra (B basılı), ikisini ocağa koy. Pişince boş tabakla al. Fazla bekletme, yanar!'],
  ['🫓 Lahmacun', 'Hamur al, üstüne doğranmış kıyma + doğranmış domates koy, fırına ver. Pişince tabakla al.'],
  ['🌯 Dürüm', 'Boş tabağa lavaş, döner eti (dönerde B basılı) ve doğranmış domates koy.'],
  ['🧾 Garson', `Kasanın önünde dur, B basılı = sipariş al. Siparişi sadece sen görürsün! Panoda B ile fişi as ya da mutfağa söyle.`],
  ['📦 Paket', 'Telefon siparişi panoya düşer. Yemeği paket tezgâhına koy, B = paketle, kapı rafına bırak. Kapıda boş elle A = kuryeye çık.'],
  ['🧽 Bulaşık', `Masadaki kirli tabağı lavaboya götür, B basılı = yıka. Temiz tabak lavabodan alınır (${B.plates} tabak var).`],
  ['🎮 Tuşlar', 'PC: WASD/oklar yürü · J/Boşluk = al/bırak · K/E basılı = kullan. Telefon: joystick, pembe AL/BIRAK, yeşil KULLAN (basılı tut).'],
];

/** 📖 recipe book: a top-bar button + modal card. onToggle lets the scene hide touch controls while open. */
export function mountBook(onToggle: (open: boolean) => void) {
  const close = h('button', { class: 'btn ghost', text: 'Kapat' });
  const panel = h('div', { class: 'screen mk-modal', hidden: true },
    h('div', { class: 'card' },
      h('h2', { class: 'title', text: 'Tarif defteri' }),
      h('div', { class: 'mk-recipes' }, ...RECIPES.map(([t, d]) => h('div', { class: 'mk-box' }, h('h3', { text: t }), h('p', { text: d })))),
      close,
    ),
  );
  const btn = h('button', { class: 'mute mk-book', title: 'Tarifler', 'aria-label': 'Tarifler', text: '📖' });
  const set = (open: boolean) => {
    panel.hidden = !open;
    onToggle(open);
  };
  btn.onclick = () => (set(!!panel.hidden), btn.blur());
  close.onclick = () => set(false);
  panel.addEventListener('pointerdown', (e) => e.target === panel && set(false));
  const offs = [mount(btn), mount(panel)];
  return {
    open: () => set(true),
    isOpen: () => !panel.hidden,
    destroy: () => offs.forEach((f) => f()),
  };
}

/** Day-by-day table for the end card. */
export function endTable(s: MutfakState): HTMLElement {
  const head = ['Gün', 'Ciro', 'Kira', 'Servis', 'Kaybedilen', '★'].map((t) => h('th', { text: t }));
  const rows = s.history.map((d) =>
    h('tr', {},
      ...[String(d.day), `${d.revenue} ₺`, `${d.rent} ₺`, String(d.served), String(d.failed)].map((t) => h('td', { text: t })),
      h('td', {}, stars(d.stars)),
    ),
  );
  return h('table', { class: 'mk-end' }, h('tr', {}, ...head), ...rows);
}
