# buble-trouble-claude

Arkadaşlar arası online co-op balon patlatma oyunu (1–4 kişi, PC + telefon). Bubble Trouble 2
oynanışından esinlenildi; grafik ve sesler koddan üretilir. Ticari değildir.

Modlar: **Klasik** (sonsuz seviye), **Tanrı** (bir kişi top yağdırır, diğerleri hayatta kalır),
**Yağmur** (herkes aynı takım, toplar yukarıdan yağar).

## Çalıştırma

```bash
npm install
npm run dev      # http://localhost:5173 (aynı ağdaki telefondan da açılır)
npm test
npm run build    # dist/
```

`.env` içinde Supabase adresi ve publishable key bulunur (tarayıcıya açık olması normaldir).
Realtime (oda kanalları) ve `scores` tablosu (rekorlar) kullanılır.

## Yapı

- `src/sim/` — oyun simülasyonu (saf TypeScript, deterministik)
- `src/net/` — Supabase Realtime odaları ve rekor tablosu
- `src/ui/` — Phaser 4 sahneleri, çizimler, sesler, dokunmatik kontroller
- `docs/` — tasarım dokümanı
