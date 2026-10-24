// Paramedik: the 6 MVP case templates (fictional, non-graphic). Moved here from cases.ts; cases.ts re-exports TEMPLATES.
import type { CaseTemplate } from '../types';

const okGlu: [number, number] = [85, 125];

export const TEMPLATES: CaseTemplate[] = [
  {
    id: 'anafilaksi', name: 'Alerjik şok', code: 'AN',
    base: { hr: [105, 125], rr: [24, 30], spo2: [84, 87], sys: [84, 98], glu: okGlu, gcs: [14, 15] },
    worst: { hr: 150, rr: 38, spo2: 70, sys: 55, glu: 100, gcs: 9 },
    sev0: [30, 45], rate: [6, 9],
    signs: ['dokuntu', 'sisYuz', 'kasinti'], lung: 'hirilti',
    history: {
      olay: ['Düğünde baklava yedim, sonra boğazım kaşındı', 'Bahçede bir şey soktu galiba'],
      yemek: ['Fıstıklı bir şeyler yedim', 'Yarım saat önce tatlı yedim'],
    },
    says: ['Boğazım daralıyor gibi…', 'Her yerim kaşınıyor!', 'Bi’ kolonya sürün geçer oğlum', 'Düğünde herkes bana bakıyor, yüzüm mü şişti?', 'Baklavayı bırakmam ama bu sefer ağır geldi'],
    path: ['triyaj', 'ilac:alerji'], useful: ['pulseox', 'tansiyon', 'stetoskop'], walks: false,
  },
  {
    id: 'astim', name: 'Astım krizi', code: 'AS',
    base: { hr: [100, 120], rr: [29, 34], spo2: [84, 87], sys: [120, 140], glu: okGlu, gcs: [15, 15] },
    worst: { hr: 140, rr: 42, spo2: 72, sys: 100, glu: 100, gcs: 11 },
    sev0: [30, 42], rate: [5, 8],
    signs: ['konusamiyor', 'omuzNefes', 'terleme'], lung: 'hirilti',
    history: {
      gecmis: ['Çocukluktan beri astımım var', 'Spreyim evde kaldı'],
      olay: ['Halı sahada koşarken başladı', 'Toz alırken birden sıkıştı'],
    },
    says: ['Nefes… alamıyorum…', 'Spreyim… nerede…', 'Hocam maç var, çabuk olun', 'Ben kaleciydim, nefesim kaleci değil artık', 'Spreyi takımın çantasında unuttum'],
    path: ['triyaj', 'poz:otur', 'ilac:bronkodilator'], useful: ['pulseox', 'stetoskop', 'solunum'], walks: false,
  },
  {
    id: 'hipoglisemi', name: 'Şeker düşmesi', code: 'HG',
    base: { hr: [95, 115], rr: [16, 20], spo2: [95, 98], sys: [110, 130], glu: [38, 52], gcs: [12, 14] },
    worst: { hr: 125, rr: 24, spo2: 90, sys: 95, glu: 22, gcs: 7 },
    sev0: [30, 45], rate: [5, 8],
    signs: ['terleme', 'titreme', 'konfuzyon', 'solukluk'], lung: 'normal',
    history: {
      ilac: ['İğnesini yaptı ama yemek yemedi', 'Şeker hapını iki kere içmiş'],
      yemek: ['Sabahtan beri bir şey yemedi', 'Diyetteyim, kahvaltı yapmadım'],
    },
    says: ['Neredeyim ben?', 'Başım dönüyor, elim titriyor', 'Ben iyiyim ya, bırakın', 'Bir simit alsam geçer', 'Herkes ikiye bölünmüş görünüyor'],
    path: ['triyaj', 'olc:glukometre', 'ilac:seker', 'poz:yan'], useful: ['glukometre', 'pulseox'], walks: false,
  },
  {
    id: 'kanama', name: 'Kırık ve kanama', code: 'KK',
    base: { hr: [110, 130], rr: [20, 26], spo2: [94, 97], sys: [88, 100], glu: okGlu, gcs: [15, 15] },
    worst: { hr: 155, rr: 32, spo2: 85, sys: 55, glu: 100, gcs: 8 },
    sev0: [35, 48], rate: [6, 9],
    signs: ['kanama', 'deformite', 'solukluk', 'sogukCilt'], lung: 'normal',
    history: {
      olay: ['Merdivenden düştüm', 'Bisikletten uçtum, bacağım…'],
    },
    says: ['Bacağım çok acıyor!', 'Üşüyorum…', 'Sakın kımıldatmayın beni', 'Bisiklet de benim kadar yamuldu mu?', 'Annem duymasın, tamam mı'],
    path: ['triyaj', 'basinc', 'ilac:agri'], useful: ['tansiyon', 'pulseox'], walks: false,
  },
  {
    id: 'arrest', name: 'Kalp durması', code: 'KD',
    base: { hr: [48, 60], rr: [8, 12], spo2: [62, 70], sys: [78, 90], glu: okGlu, gcs: [6, 8] },
    worst: { hr: 0, rr: 0, spo2: 40, sys: 0, glu: 90, gcs: 3 },
    sev0: [86, 88], rate: [4, 6],
    signs: ['bilincsiz', 'nefesYok', 'morDudak'], lung: 'sessiz',
    history: {
      olay: ['Otobüs durağında bir anda yığıldı', 'Göğsünü tuttu ve düştü'],
      gecmis: ['Kalp ilacı kullanıyordu', 'Bilmiyoruz, tanımıyoruz'],
    },
    says: [],
    path: ['cpr'], useful: ['pulseox', 'stetoskop', 'solunum'], walks: false,
  },
  {
    id: 'bayilma', name: 'Basit bayılma', code: 'BY', trap: true,
    base: { hr: [52, 62], rr: [14, 18], spo2: [96, 99], sys: [88, 96], glu: okGlu, gcs: [14, 15] },
    worst: { hr: 45, rr: 20, spo2: 94, sys: 80, glu: 100, gcs: 13 },
    sev0: [20, 30], rate: [-2, -1],
    signs: ['solukluk', 'terleme', 'basDonmesi'], lung: 'normal',
    history: {
      olay: ['Kalabalıkta ayakta beklerken karardı gözlerim', 'Kan aldırırken bayıldım'],
      yemek: ['Kahvaltı yaptım, iyiyim'],
    },
    says: ['Bir an karardı her yer', 'Abartmayın, iyiyim', 'Soğan suyu verin dedi teyze', 'Kan aldırmayı sevmem, söylemiştim', 'Kendimi salıverdim sadece'],
    path: ['triyaj', 'poz:bacak'], useful: ['tansiyon', 'pulseox'], walks: false,
  },
];
