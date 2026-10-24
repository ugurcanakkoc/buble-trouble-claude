// Paramedik: the Protokol Uzmanı's manual, rendered from the session's RuleSet (seeded => cannot be memorized).
// `sections` is the text the scene shows (5 tabs); `facts` is the same data in structured form so bot/tests can
// follow the manual without peeking at hidden rules. Fictional medicine, every number comes from `rules`.
import { shuffle } from '../cases';
import { TEMPLATES } from './templates';
import {
  COLORS, DISCLAIMER, DRUG_ROLES, LABELS,
  type AgeGroup, type AmpulColor, type DrugRole, type LungSound, type RuleSet, type SignId, type StepId, type TabId,
} from '../types';

export type Cond =
  | { k: 'lung'; is: LungSound }
  | { k: 'sign'; has: SignId }
  | { k: 'glu' | 'hr' | 'sys'; lt?: number; gte?: number };

export interface SymRow {
  tpl: string;
  name: string;
  signs: SignId[];
  when: Cond[]; // ALL must hold (tool readings / monitor / signs)
  plan: StepId[];
}
export interface ManualLine { text: string; ref?: string }
export interface ManualSection { id: string; title: string; lines: ManualLine[] }
export interface Manual {
  rev: string;
  disclaimer: string;
  sections: Record<TabId, ManualSection[]>;
  facts: {
    triage: { rrThr: number; sysThr: number };
    abcde: { spo2Thr: number; o2Level: number };
    rows: SymRow[]; // in the order the table lists them
    ilac: {
      byRole: Record<DrugRole, AmpulColor>; decoy: AmpulColor; dose: Record<AgeGroup, number>;
      ageMaxCocuk: number; ageMaxYetiskin: number; add: 'tek' | 'cift' | null; maxDose: number;
      contra: { color: AmpulColor; hrBelow: number };
    };
    ekler: { cprRate: number };
  };
}

/** How a diagnosis shows up in readings. Fixed across sessions; the numbers on the other tabs are what vary. */
const WHEN: Record<string, Cond[]> = {
  anafilaksi: [{ k: 'lung', is: 'hirilti' }, { k: 'sys', lt: 110 }],
  astim: [{ k: 'lung', is: 'hirilti' }, { k: 'sys', gte: 110 }],
  hipoglisemi: [{ k: 'lung', is: 'normal' }, { k: 'glu', lt: 70 }],
  kanama: [{ k: 'lung', is: 'normal' }, { k: 'glu', gte: 70 }, { k: 'hr', gte: 85 }],
  arrest: [{ k: 'sign', has: 'nefesYok' }],
  bayilma: [{ k: 'lung', is: 'normal' }, { k: 'glu', gte: 70 }, { k: 'hr', lt: 85 }],
};
const COND_TXT = (c: Cond): string =>
  c.k === 'lung' ? `akciğer: ${LABELS.lung[c.is]}`
    : c.k === 'sign' ? `bulgu: ${LABELS.sign[c.has]}`
      : `${{ glu: 'şeker', hr: 'nabız', sys: 'sistolik' }[c.k]} ${c.lt !== undefined ? `< ${c.lt}` : `≥ ${c.gte}`}`;

const STEP_TXT = (st: StepId, ek: (id: string) => string): string => {
  if (st === 'triyaj') return 'Hızlı Triyaj';
  if (st === 'cpr') return `göğüs basısı (ritim: ${ek('cpr')})`;
  if (st === 'basinc') return 'kanamaya baskı';
  if (st.startsWith('ilac:')) return `${LABELS.drug[st.slice(5) as DrugRole]} ampul (renk ve doz: İlaç Rehberi)`;
  if (st.startsWith('poz:')) return LABELS.pose[st.slice(4) as keyof typeof LABELS.pose].toLocaleLowerCase('tr');
  return st;
};

const HOSPITALS: { ad: string; brans: string; tpl: string[] }[] = [
  { ad: 'Çınar Devlet', brans: 'dahiliye / endokrin', tpl: ['hipoglisemi', 'bayilma'] },
  { ad: 'Mehtap Göğüs Merkezi', brans: 'solunum / alerji', tpl: ['astim', 'anafilaksi'] },
  { ad: 'Yıldız Kalp Merkezi', brans: 'kalp / yoğun bakım', tpl: ['arrest'] },
  { ad: 'Kuzey Şifa', brans: 'travma / ortopedi', tpl: ['kanama'] },
  { ad: 'Defne Çocuk', brans: 'çocuk acil', tpl: [] },
];
const hash = (str: string) => [...str].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7) >>> 0 || 1;

export function buildManual(rules: RuleSet): Manual {
  const r = { rng: hash(rules.rev + rules.rowOrder.join()) };
  // Ek numbers are seeded: the same cross-reference points to a different "Ek" each session.
  const eks = shuffle(r, ['cpr', 'parite', 'hastane']);
  const ekNo = (id: string) => `Ek-${eks.indexOf(id) + 1}`;
  const hospitals = shuffle(r, [...HOSPITALS]);

  const rows: SymRow[] = rules.rowOrder.map((id) => {
    const t = TEMPLATES.find((x) => x.id === id)!;
    return { tpl: id, name: t.name, signs: t.signs, when: WHEN[id], plan: t.path };
  });
  const add: 'tek' | 'cift' | null = rules.variant === 'B' ? 'tek' : rules.variant === 'C' ? 'cift' : null;
  const colorTxt = (c: AmpulColor) => LABELS.color[c];
  const roleOf = (c: AmpulColor) => DRUG_ROLES.find((d) => rules.drugs[d] === c);

  const sections: Record<TabId, ManualSection[]> = {
    triyaj: [{
      id: 'triyaj', title: 'Hızlı Triyaj akışı',
      lines: [
        { text: 'Hasta yürüyebiliyorsa: YEŞİL.' },
        { text: `Solunum sayısı dakikada ${rules.rrThr}’den fazlaysa: KIRMIZI.` },
        { text: `Sistolik tansiyon ${rules.sysThr}’in altındaysa: KIRMIZI.` },
        { text: 'Hiçbiri değilse: SARI.' },
        { text: 'Sayı sınıra yakınsa bir kez daha ölçtür; aletler ±birkaç birim şaşar.' },
      ],
    }],
    abcde: [{
      id: 'abcde', title: 'ABCDE – bak, ölç, müdahale et, tekrar bak',
      lines: [
        { text: 'A – Havayolu: hasta konuşabiliyor mu? Nefes yoksa vakit kaybetme, göğüs basısına başla.', ref: ekNo('cpr') },
        { text: `B – Solunum: SpO₂ ${rules.spo2Thr}’in altındaysa maske oksijen, düzey ${rules.o2Level}.` },
        { text: 'C – Dolaşım: tansiyon ve nabız. Kanama varsa baskı; kan şekeri düşükse ampulden önce ölçüm yap.' },
        { text: 'D – Bilinç: şeker (glukometre) 70’in altındaysa Semptom Tablosu’na bak.' },
        { text: 'E – Örtün, ısıt, hastayı yalnız bırakma. Her müdahaleden sonra yeniden değerlendir.' },
        { text: 'Önce Hızlı Triyaj, sonra Semptom Tabloları: tanıyı bulgular + ölçümler birlikte koyar.' },
      ],
    }],
    semptom: [{
      id: 'tablo', title: 'Semptom tablosu (satır sırası bu kitapçığa özel)',
      lines: [
        { text: 'Önce stetoskopla akciğeri dinle; nefes yoksa doğrudan Ekler’deki Ritimler’e bak.', ref: ekNo('cpr') },
        ...rows.map((w) => ({
          text: `${w.name}: ${w.signs.map((g) => LABELS.sign[g].toLocaleLowerCase('tr')).join(', ')}. Kesin ayırıcı → ${w.when.map(COND_TXT).join(' ve ')}. Plan: ${w.plan.map((p) => STEP_TXT(p, ekNo)).join(' → ')}.`,
        })),
        { text: 'Tabloda olmayan bulgu yanıltıcı olabilir; ayırıcıya güven, bulgu sayısına değil.' },
      ],
    }],
    ilac: [
      {
        id: 'ampul', title: 'Ampul rehberi (kurgusal)',
        lines: COLORS.map((c) => ({
          text: roleOf(c) ? `${colorTxt(c)} ampul: ${LABELS.drug[roleOf(c)!]}` : `${colorTxt(c)} ampul: yalnız hastanede, sahada verme`,
        })),
      },
      {
        id: 'doz', title: 'Doz (tık sayısı)',
        lines: [
          { text: `Çocuk (14 yaş ve altı): ${rules.dose.cocuk} tık` },
          { text: `Yetişkin (15–64): ${rules.dose.yetiskin} tık` },
          { text: `Yaşlı (65 ve üstü): ${rules.dose.yasli} tık` },
          { text: 'Vaka koduna göre istisna var mı? Ekler’e bak. Hiçbir doz 3 tıkı geçmez.', ref: ekNo('parite') },
        ],
      },
      {
        id: 'yasak', title: 'Yasaklar',
        lines: [
          { text: 'Hastanın alerjisi olan rengi verme (hastaya sor: Alerji).' },
          { text: 'Aynı ampulü ikinci kez verme.' },
          { text: `${colorTxt(rules.contra.color)} ampul: nabız ${rules.contra.hrBelow}’in altındaysa verme.` },
          { text: 'Basit bayılmada ampul verilmez.' },
        ],
      },
    ],
    ekler: eks.map((id): ManualSection => {
      const no = ekNo(id);
      if (id === 'cpr') {
        const feel = rules.cprRate === 120 ? '“bir saniyede iki bası”' : rules.cprRate === 110 ? 'orta tempo bir halay' : 'yavaş bir türkü';
        return {
          id, title: `${no}: Ritimler`,
          lines: [
            { text: `Göğüs basısı hızı: dakikada ${rules.cprRate} (${feel} gibi say).` },
            { text: '30 bası = 1 döngü. İki iyi döngü ritmi geri getirir.' },
            { text: 'Çizgi gibi düz ritim: basıya başla. Düzenli ve hızlı: izle. Düzensiz: hastaneye bildir.' },
          ],
        };
      }
      if (id === 'parite') {
        return {
          id, title: `${no}: Doz istisnası`,
          lines: [{
            text: add === null ? 'Bu revizyonda istisna yok; doz tablosu aynen geçerli.'
              : `Vaka kodundaki rakam ${add === 'tek' ? 'TEK' : 'ÇİFT'} ise doza 1 tık ekle (en fazla 3). Örnek: AN-7 → rakam 7.`,
          }],
        };
      }
      return {
        id, title: `${no}: Hastaneler`,
        lines: hospitals.map((h) => ({
          text: `${h.ad} (${h.brans})${h.tpl.length ? ': ' + h.tpl.map((t) => TEMPLATES.find((x) => x.id === t)!.name).join(', ') : ''}`,
        })),
      };
    }),
  };

  return {
    rev: rules.rev, disclaimer: DISCLAIMER, sections,
    facts: {
      triage: { rrThr: rules.rrThr, sysThr: rules.sysThr },
      abcde: { spo2Thr: rules.spo2Thr, o2Level: rules.o2Level },
      rows,
      ilac: {
        byRole: rules.drugs, decoy: rules.decoy, dose: rules.dose, ageMaxCocuk: 14, ageMaxYetiskin: 64, add, maxDose: 3,
        contra: rules.contra,
      },
      ekler: { cprRate: rules.cprRate },
    },
  };
}
