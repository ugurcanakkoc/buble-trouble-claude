// Paramedik DOM panels: the Saha Protokol Kitapçığı (PU screen, rendered from s.rules), intro/result cards.
// Everything here is HTML over the canvas (phone: vertical scroll, 16px gutter).
import { cssColor, h, mount } from '../../ui/dom';
import { BALANCE as B, TICK } from './balance';
import { tplById } from './cases';
import { manualOf } from './content/solver';
import {
  COLORS, DISCLAIMER, LABELS, TABS, TOOLS,
  type AmpulColor, type HistoryTopic, type PmPlayer, type PmState, type PoseId, type TabId, type ToolId, type TriageColor,
} from './types';
import './paramedik.css';

export const AMPUL_CSS: Record<AmpulColor, string> = {
  kirmizi: '#ff5a5a', mavi: '#4aa8ff', sari: '#ffd23f', yesil: '#4be37a', mor: '#b07aff',
};
export const TRIAGE_CSS: Record<TriageColor, string> = { yesil: '#4be37a', sari: '#ffd23f', kirmizi: '#ff5a5a' };

/** Human label for an action key / log key ("ilac:mavi:2" → "Mavi ampul 2 tık"). */
export function actLabel(key: string): string {
  const [k, a, b] = key.split(':');
  switch (k) {
    case 'olc': return LABELS.tool[a as ToolId] ?? key;
    case 'sor': return `Soru: ${LABELS.topic[a as HistoryTopic]}`;
    case 'triyaj': return a ? `Triyaj ${LABELS.triage[a as TriageColor]}` : 'Triyaj';
    case 'ilac': return `${LABELS.color[a as AmpulColor]} ampul ${b} tık`;
    case 'o2': return `O₂ maske ayar ${a}`;
    case 'poz': return LABELS.pose[a as PoseId];
    case 'basinc': return 'Kanama basısı';
    case 'cpr': return 'CPR';
    case 'teslim': return 'Teslim';
    case 'status': return `Durum: ${LABELS.status[a as keyof typeof LABELS.status]}`;
    default: return key;
  }
}
export const RESULT_TEXT = { dogru: '✓ Doğru', zararli: '✗ Zararlı', gereksiz: '• Gereksiz', tekrar: '↺ Zaten yapıldı', yanlis: '✗ Yanlış', info: '' };
/** Short "why" for the case report. */
export const RESULT_WHY: Record<string, string> = {
  zararli: 'hastaya zarar verdi (yanlış ampul, alerji, yasak ya da çift doz)',
  gereksiz: 'bu vakada kitapçık bunu istemiyordu',
  yanlis: 'adım doğru ama renk/doz/ayar ya da ritim tutmadı',
};
export const STATUS_CSS = { stabil: '#4be37a', kritik: '#ffd23f', arrest: '#ff5a5a', kayip: '#8a8db0' } as const;
/** Every required step done and the patient is stabil → the team may hand over. */
export const canHandOver = (s: PmState) => s.phase === 'case' && !!s.cur && !s.cur.required.length && s.cur.status === 'stabil';

/** CPR rhythm quality 0..1 from tap times (ms): 1 − 2 × mean relative interval error vs the manual's rate. */
export function cprQuality(taps: number[], ratePerMin: number): number {
  if (taps.length < 2) return 0;
  const target = 60000 / ratePerMin;
  let err = 0;
  for (let i = 1; i < taps.length; i++) err += Math.abs(taps[i] - taps[i - 1] - target) / target;
  return Math.round(Math.max(0, Math.min(1, 1 - (2 * err) / (taps.length - 1))) * 100) / 100;
}

export const clock = (ticks: number) => {
  const sec = Math.max(0, Math.ceil(ticks / TICK));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

const swatch = (c: AmpulColor) => h('span', { class: 'pm-sw', style: `background:${AMPUL_CSS[c]}` });
const p = (text: string, cls = 'pm-row') => h('p', { class: cls, text });

/** One tab of the manual. Text comes from content/manual.ts (the same rules the sim checks and the solver follows). */
function tabContent(s: PmState, tab: TabId): HTMLElement[] {
  return manualOf(s.rules).sections[tab].map((sec) =>
    h('section', { class: 'pm-sec' }, h('h3', { text: sec.title }),
      ...sec.lines.map((l, i) => h('p', { class: 'pm-row' },
        ...(sec.id === 'ampul' ? [swatch(COLORS[i]), ' '] : []),
        l.text + (l.ref ? ` (bkz. ${l.ref})` : '')))));
}

/** Every key a PU can approve, by category (two taps: category chip → action chip). */
const ONAY_CATS: [string, string[]][] = [
  ['Triyaj', (['yesil', 'sari', 'kirmizi'] as const).map((c) => `triyaj:${c}`)],
  ['İlaç', COLORS.flatMap((c) => [1, 2, 3].map((n) => `ilac:${c}:${n}`))],
  ['O₂ maske', [1, 2, 3, 4].map((n) => `o2:${n}`)],
  ['Pozisyon', ['bacak', 'otur', 'yan'].map((x) => `poz:${x}`)],
  ['Ölçüm', TOOLS.map((t) => `olc:${t}`)],
  ['Bası / CPR', ['basinc', 'cpr']],
];
const FEED_MS = 6000;

/** Full-screen manual. PU: always open; SP (solo/antrenman): toggled, with a "Sahaya dön" button. */
export class Manual {
  readonly el: HTMLElement;
  private body = h('div', { class: 'pm-body' });
  private tabsEl = h('div', { class: 'pm-tabs' });
  private info = h('div', { class: 'pm-info' });
  private feed = h('div', { class: 'pm-feed' });
  private feedAt = 0;
  private status = h('span', { class: 'pm-status' });
  private chips = h('div', { class: 'pm-chips' });
  private onayHint = h('span', { class: 'pm-hint' });
  private cat: number | null = null;
  private search = h('input', { class: 'pm-search', type: 'search', placeholder: 'Ara… (ör. SpO₂, ampul, CPR)' });
  private closeBtn = h('button', { class: 'btn ghost pm-close', text: '⟵ Sahaya dön' });
  private onayBar: HTMLElement;
  private tab: TabId | null = null;
  private key = '';
  private unmount: () => void;

  constructor(private onOnay: (key: string) => void, onClose: () => void) {
    this.onayBar = h('div', { class: 'pm-onay' }, h('b', { class: 'pm-onay-t', text: 'Onayla' }), this.chips, this.onayHint);
    this.renderChips();
    this.closeBtn.onclick = onClose;
    this.search.addEventListener('input', () => this.filter());
    const disc = h('div', { class: 'pm-disc', text: `⚠ ${DISCLAIMER}`, title: 'Dokun: tamamını göster' });
    disc.onclick = () => disc.classList.toggle('open'); // phones show it on one line; tap expands
    this.el = h('div', { class: 'pm-manual', hidden: true },
      h('header', { class: 'pm-head' },
        h('div', { class: 'pm-brand', text: '112 İç Portal · Saha Protokol Kitapçığı' }), this.status, this.info, this.closeBtn),
      disc,
      h('div', { class: 'pm-bar' }, this.tabsEl, this.search), this.feed, this.body, this.onayBar,
    );
    this.unmount = mount(this.el);
  }

  private renderChips(): void {
    const chip = (label: Node | string, on: () => void, cls = '') => {
      const b = h('button', { class: `pm-chip ${cls}` }, label);
      b.onclick = on;
      return b;
    };
    const cat = this.cat === null ? null : ONAY_CATS[this.cat];
    const short = (k: string) => k.startsWith('ilac:')
      ? h('span', {}, swatch(k.split(':')[1] as AmpulColor), ` ${k.split(':')[2]} tık`)
      : k.startsWith('o2:') ? `O₂ ${k.slice(3)}` : actLabel(k).replace(/^Triyaj /, '');
    this.chips.replaceChildren(...(!cat
      ? ONAY_CATS.map(([label], i) => chip(label, () => ((this.cat = i), this.renderChips())))
      : [chip('‹', () => ((this.cat = null), this.renderChips()), 'back'),
        ...cat[1].map((k) => chip(short(k), () => {
          this.onOnay(k);
          this.cat = null;
          this.renderChips();
        }))]));
    this.chips.scrollLeft = 0;
  }

  show(on: boolean): void {
    if (this.el.hidden === !on) return;
    this.el.hidden = !on;
  }
  get visible(): boolean {
    return !this.el.hidden;
  }

  setFeed(text: string, color = '#f4f1ff'): void {
    this.feed.textContent = text;
    this.feed.style.color = color;
    this.feedAt = performance.now();
  }

  update(s: PmState, me: PmPlayer): void {
    const c = s.cur;
    if (!c) return;
    const left = s.phase === 'case' ? `Hastaneye ${clock(c.eta - s.tick)}` : '';
    this.info.textContent = `Vaka ${s.caseIdx + 1}/${s.cases} · Kod ${c.code} ${left ? '· ' + left : ''} · ${s.rules.rev}`;
    // the PU can't see the patient, but the state is on every device: status + trend + "ready to hand over"
    const trend = c.status === 'arrest' ? ' 🔔' : c.rate > 0 ? ' ↑ kötüleşiyor' : c.rate < 0 ? ' ↓ düzeliyor' : '';
    const ready = canHandOver(s);
    this.status.textContent = ready ? '✓ Hasta stabil · Teslim edilebilir' : `${LABELS.status[c.status]}${trend}`;
    this.status.style.background = ready ? '#22964a' : STATUS_CSS[c.status];
    this.status.hidden = s.phase !== 'case';
    if (this.feed.textContent && performance.now() - this.feedAt > FEED_MS) this.feed.textContent = '';
    this.closeBtn.hidden = me.role !== 'sp';
    this.onayBar.hidden = me.role !== 'pu' || s.phase !== 'case';
    const mine = s.onay.find((o) => o.by === me.id);
    this.onayHint.textContent = mine
      ? `Onaylandı: ${actLabel(mine.key)} (${Math.max(0, Math.ceil((B.teamWindowTicks - (s.tick - mine.t)) / TICK))} sn)`
      : 'SP 10 sn içinde yaparsa bonus';
    if (!this.tab || !me.tabs.includes(this.tab)) this.tab = me.tabs[0] ?? null;
    const owners = TABS.map((t) => s.players.find((q) => q.tabs.includes(t))?.name ?? '');
    const key = JSON.stringify([s.rules.rev, c.code, me.tabs, owners, this.tab]);
    if (key === this.key) return;
    this.key = key;
    this.tabsEl.replaceChildren(...TABS.map((t, i) => {
      const mine = me.tabs.includes(t);
      const b = h('button', { class: `pm-tab${t === this.tab ? ' on' : ''}`, disabled: !mine },
        LABELS.tab[t], ...(mine ? [] : [h('small', { text: owners[i] ? ` (${owners[i]}'de)` : '' })]));
      b.onclick = () => {
        this.tab = t;
        this.key = '';
        this.update(s, me);
      };
      return b;
    }));
    this.body.replaceChildren(...(this.tab ? tabContent(s, this.tab) : [p('Sana sekme düşmedi.')]));
    this.body.scrollTop = 0;
    this.filter();
  }

  private filter(): void {
    const q = this.search.value.trim().toLocaleLowerCase('tr');
    for (const el of this.body.querySelectorAll<HTMLElement>('.pm-row'))
      el.classList.toggle('pm-hide', !!q && !el.textContent!.toLocaleLowerCase('tr').includes(q));
  }

  destroy(): void {
    this.unmount();
  }
}

/** Intro / result card (DOM). Rebuilt when its content key changes; the countdown updates every frame. */
export class PhaseCard {
  private el: HTMLElement | null = null;
  private key = '';
  private timer: HTMLElement | null = null;
  constructor(private onReady: () => void) {}

  update(s: PmState, selfId: string): void {
    const show = s.phase === 'intro' || s.phase === 'result';
    if (!show) return this.close();
    const humans = s.players.filter((q) => q.connected && !q.bot);
    const ready = s.ready.includes(selfId);
    const key = JSON.stringify([s.phase, s.caseIdx, s.ready, s.players.map((q) => [q.name, q.role, q.tabs, q.connected])]);
    if (key !== this.key) {
      this.close();
      this.key = key;
      this.timer = h('div', { class: 'hint' });
      const btn = h('button', { class: 'btn green big', text: ready ? `Bekleniyor… (${s.ready.length}/${humans.length})` : `Hazırım (${s.ready.length}/${humans.length})` });
      btn.disabled = ready;
      btn.onclick = () => {
        btn.disabled = true;
        this.onReady();
      };
      const body = s.phase === 'intro' ? introBody(s, selfId) : resultBody(s);
      this.el = h('div', { class: 'screen endcard pm-phase' }, h('div', { class: 'card pm-card' }, ...body, this.timer, btn));
      mount(this.el);
    }
    if (this.timer) this.timer.textContent = `${Math.max(0, Math.ceil((s.phaseUntil - s.tick) / TICK))} sn`;
  }

  close(): void {
    this.el?.remove();
    this.el = null;
    this.key = '';
    this.timer = null;
  }
}

function introBody(s: PmState, selfId: string): HTMLElement[] {
  const c = s.cur!;
  const me = s.players.find((q) => q.id === selfId);
  const what = !me ? ''
    : me.role === 'sp'
      ? me.tabs.length ? 'Hastayı sen görürsün ve kitapçık da sende (📘 düğmesi). Antrenman: kendi kendine çöz.'
        : 'Hastayı sen görürsün ama kitapçığı göremezsin. Gördüğünü, ölçtüğünü yüksek sesle söyle! Arkadaşların onaylarsa takım bonusu.'
      : `Hastayı göremezsin; kitapçık sende (${me.tabs.map((t) => LABELS.tab[t]).join(', ')}). SP'ye ne yapacağını söyle. Alarmları sen de duyarsın, stetoskobu sadece SP: ona sor!`;
  const goal = !me ? ''
    : me.role === 'sp' ? 'Hedef: Ölç, Sor, müdahale et; hasta stabil olunca Teslim et (erken teslim = bonus).'
      : 'Hedef: Kitapçıktan oku, SP’ye söyle; alttaki Onayla ile söylediğini işaretle → takım bonusu.';
  return [
    h('h1', { class: 'title small', text: `Vaka ${s.caseIdx + 1}/${s.cases} · ${c.code}` }),
    h('div', { class: 'endline', text: me ? `Sen: ${LABELS.role[me.role]}` : '' }),
    h('div', { class: 'pm-goal', text: goal }),
    h('div', { class: 'hint', text: what }),
    h('ul', { class: 'players' }, ...s.players.map((q) => h('li', {},
      h('span', { class: 'dot', style: `background:${cssColor(q.color)}` }),
      h('span', { text: q.name }),
      h('span', { class: 'tag', text: q.connected ? LABELS.role[q.role] : 'bağlantı yok' }),
    ))),
    h('div', { class: 'pm-disc', text: `⚠ ${DISCLAIMER}` }),
  ];
}

function resultBody(s: PmState): HTMLElement[] {
  const r = s.results[s.results.length - 1];
  const c = s.cur!;
  if (!r) return [];
  const color = r.outcome === 'stabil' ? '#4be37a' : r.outcome === 'kritik' ? '#ffd23f' : '#ff6b6b';
  const team = r.outcome === 'kayip' ? 0 : Math.min(r.team * B.teamBonus, B.teamBonusMax);
  return [
    h('h1', { class: 'title small', text: LABELS.outcome[r.outcome], style: `color:${color}` }),
    h('div', { class: 'endline', text: `${r.code} · ${tplById(r.tpl).name} · ${r.score} puan` }),
    h('div', { class: 'hint', text: `Süre çarpanı ×${String(r.timeMult).replace('.', ',')} · Zararlı ${r.harm} · Gereksiz ${r.waste} · Takım +${team}` }),
    ...(c.herrings.length ? [h('div', { class: 'hint', text: `Yanıltıcı bulgular: ${c.herrings.map((g) => LABELS.sign[g]).join(', ')}` })] : []),
    h('ol', { class: 'pm-log' }, ...c.log.map((e) => h('li', { class: `r-${e.r}` },
      h('b', { text: clock(e.t * TICK) }), ` ${actLabel(e.key)} `, h('span', { text: RESULT_TEXT[e.r] }),
      ...(RESULT_WHY[e.r] ? [h('small', { text: ` – ${RESULT_WHY[e.r]}` })] : []),
    ))),
    h('div', { class: 'endline', text: `Vardiya toplamı: ${s.total}` }),
  ];
}

