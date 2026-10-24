// Paramedik: humor line pools (Turkish, non-graphic). Teyze advice is sometimes right, mostly "well-meant".
export interface TeyzeTip {
  text: string;
  good?: string[]; // template ids this advice happens to fit (the manual still decides)
}

export const TEYZE_TIPS: TeyzeTip[] = [
  { text: 'Soğan suyu verin!' },
  { text: 'Ayağını yukarı kaldırın!', good: ['bayilma'] },
  { text: 'Bi’ bardak su içirin!' },
  { text: 'Kolonya koklatın!', good: ['bayilma'] },
  { text: 'Oturtun şunu!', good: ['astim'] },
  { text: 'Yatırın yan yatırın!', good: ['hipoglisemi'] },
  { text: 'Bizim komşu da böyle olmuştu, yarım limon sıktık, geçti' },
  { text: 'Ben ambulans çağırmadan önce ayakkabılarımı giyeyim' },
  { text: 'Kolunu sıkıca bağlayın, bi’ şey olmaz!' },
  { text: 'Pencereyi açın, hava alsın!', good: ['astim'] },
  { text: 'Bir kaşık şeker yedirin!', good: ['hipoglisemi'] },
  { text: 'Bana bakmayın, ben sadece seyrediyorum' },
];
export const TEYZE = TEYZE_TIPS.map((t) => t.text);

/** Paramedic-side quips shown when the SP does something silly (scene may use them on 'gereksiz'/'zararli'). */
export const QUIPS = {
  gereksiz: ['Hasta bunun için bekleyecek miydi?', 'Çanta ağır, ama bu kadar da değil', 'Kitapçıkçı: “Buna gerek yoktu…”'],
  zararli: ['Teyze bile “yapma” dedi', 'Kitapçıkta kırmızı kalemle yazılıydı!', 'Hasta tuhaf baktı'],
  dogru: ['Tam isabet!', 'Kitapçıkçı gülümsedi', 'Teyze bile şaşırdı'],
} as const;
