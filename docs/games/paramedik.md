# Paramedik — "Konuş, Yoksa Hasta Gider"

Asimetrik co-op, 2–4 kişi, telefon yatay + PC. Bir oyuncu hastanın başında (sahayı görür, aletleri kullanır), diğeri **Saha Protokol Kitapçığı**'nı görür (hastayı görmez). Hasta gerçek zamanda kötüleşir; yanlış müdahale durumu ağırlaştırır. Sesli sohbet (WhatsApp) oyunun motorudur; oyun içi chat yok.

> **Uyarı (oyun içi menüde ve kitapçık başında):** Bu bir oyundur, tıbbi tavsiye değildir. Kitapçıktaki kurallar, ilaçlar ("İlaç A/B/C", "Kırmızı ampul") ve eşik değerler kurgusaldır ve her oturumda değişir. Gerçek acil durumda 112'yi arayın.

## 1. Araştırma özeti — neden eğlenceli?

| Kaynak | Alınan ders |
|---|---|
| **KTaNE** | Eğlence bilgi asimetrisinden değil, *bilgiyi sözle aktarma zorluğundan* gelir. Kurallar "kolay bakılır, sözle zor anlatılır" olmalı (renk + sayı + istisna). Zaman baskısı + hata sayacı. Manuel bilinçli olarak hafif bürokratik/komik. |
| **Spaceteam** | Herkes aynı anda bağırır; "görev akışı" kısa cümlelerle (jargon) verilir. Biz: hastadan gelen uyarılar ("SpO₂ düşüyor!") sahadakine düşer, çözüm kitapçıkta. |
| **Trauma Center / Surgeon Sim** | Prosedürler fiziksel mini-oyun olarak (ritim, basınç, titreyen el). Beceri + stres. |
| **Project Hospital / ER games** | Teşhis = semptom toplama → eleme. Bulgu listesi sırayla açılır, her test zaman yer. |
| **Emergency (Sixteen Tons)** | Çoklu rol (şoför, telsiz) ve yol/araç yönetimi; mantıksal kaynak baskısı. |
| **Gerçek protokoller (ABCDE, triyaj)** | Yapı: Airway→Breathing→Circulation→Disability→Exposure; her harfte "bak-ölç-müdahale-tekrar değerlendir" döngüsü; akış şemaları (evet/hayır dallanma); SAMPLE anamnez (Semptom, Alerji, İlaç, Geçmiş, Son yemek, Olay). START triyajı: yürüyebiliyor mu → nefes → kapiller dolum → komut alıyor mu. Kitapçık bu iskelete oturur ama içerik kurgusal. |

Tasarım ilkesi: **sahadaki oyuncu "ne görüyorum"u, kitapçıkçı "ne yapılır"ı bilir; ikisi de tek başına ilerleyemez.**

## 2. Roller

| Rol | Görür | Görmez | Yapar |
|---|---|---|---|
| **Saha Paramediği (SP)** | Hasta vücut diyagramı, semptom ikonları, monitör (canlı), alet çantası, hasta/çevre diyalogları, kötüleşme sayacı (kalp ikonu) | Kitapçık, laboratuvar, hastane bilgisi | Muayene/test yapar, ölçüm okur, mini-oyunlarla müdahale eder |
| **Protokol Uzmanı (PU)** | Kitapçık "web sitesi" (arama, şema, tablolar), vaka kodu (ör. "KD-7" seed etiketi), oturum kural varyantı | Hasta, vital değerler | Soru sorar, protokol adımlarını yönetir, ilaç/doz-birimi kuralını çözer |
| **3. — Ambulans Şoförü (AŞ)** *(opsiyonel)* | Üstten harita, trafik, yol tipi (asfalt/kasis/toprak), ETA, telsiz | Hasta detayları, kitapçık | Rota seçer (kısa ama kasisli / uzun ama düz), siren/sinyal, "sarsıntı" uyarısı verir — sarsıntı sırasında SP'nin mini-oyunları zorlaşır (IV titrer, CPR ritmi kayar) |
| **3./4. — Hastane Koordinatörü (HK)** *(opsiyonel alternatif)* | Hastane listesi (branş, doluluk, mesafe), lab/EKG sonuçları *SP tarama yaptıysa* 20 sn sonra burada belirir, "ön bildirim formu" | Hasta görüntüsü, kitapçık | Doğru hastaneyi seçer (inme → inme merkezi), ekibi hazırlar (bonus), SP'den gelen EKG şeridini okur ve PU'ya aktarır |
| **4. — İkinci Paramedik (SP2)** | SP ile aynı sahne ama sadece "sol el" aletleri (airway, CPR, kanama basıncı) | Monitör ve çanta SP1'de | Eşzamanlı işler: biri CPR yaparken diğeri airway; biri IV takarken diğeri kanamaya basar |

Oyuncu sayısına göre: 2 = SP+PU. 3 = +AŞ veya +HK (lobide seçilir). 4 = SP+SP2+PU+AŞ/HK. SP2 yoksa iki elli işler "seri" yapılır (daha yavaş → hasta daha çok kötüleşir); zorluk buna göre ayarlanır.

Bilgi katılığı: SP'nin ekranında sayılar var ama anlamı yok ("SpO₂ 86" — kaç olmalı bilmez, kitapçık söyler). PU'da kurallar var ama veriler yok. HK'ye gelen EKG şeridi görseldir (etiketi yok), PU'daki "ritim tanıma tablosu"yla eşleşmeli.

## 3. Vaka üretimi

**Şablon kütüphanesi (MVP 6, sonra 12+):** anafilaksi, kardiyak arrest, hipoglisemi/hiperglisemi, sıcak çarpması, kırık + dış kanama, boğulma (yabancı cisim), zehirlenme (mantar/ilaç — soyut "madde X"), astım krizi, inme belirtileri, bayılma (vazovagal — *tuzak*: hiçbir ağır müdahale gerekmez), panik atak (*tuzak*: astımla karışır), hipotermi.

Her şablon:
```ts
interface CaseTemplate {
  id: string; baseVitals: VitalRange;          // HR, RR, SpO2, BP, glucose, temp, GCS (aralık)
  signs: Sign[];                               // görünür: dudak rengi, terleme, döküntü, tek taraflı güçsüzlük…
  history: HistoryPool;                        // hasta/yakın söyler: alerji, ilaç, son yemek, olay
  redHerrings: Sign[];                         // 0–2 yanıltıcı bulgu
  deterioration: Curve;                        // dakika başına vital kayması; müdahalesiz kaç dk'da "kritik"
  correctPath: Step[];                         // doğru müdahale sırası (eşik koşullu)
  harmfulActions: Record<ActionId, Penalty>;   // yanlış ilaç → ek kötüleşme
}
```
Seed'den: vital sayıları, hangi bulguların açık/gizli olduğu, hasta profili (yaş grubu, isim, ses tonu), çevre (ev/düğün/halı saha/otobüs durağı), yanıltıcı bulgu seçimi, **kitapçık kural varyantı** (bkz. §4). Aynı şablon iki kez aynı görünmez.

**Sim (host):** 1 Hz tick. `state.vitals` deterioration eğrisine göre kayar; her başarılı müdahale eğriyi düzleştirir/çevirir; zararlı eylem ek düşüş ekler. Üç eşik: Stabil → Kritik → Arrest (CPR mini-oyunu zorunlu) → Kayıp. Vaka süresi 4–8 dk; "hastaneye teslim" (AŞ varsa varış, yoksa sabit sayaç) ile biter.

**Zorluk (vardiya seviyesi):** bulgu sayısı ve gizlilik ↑, yanıltıcı bulgu ↑, deterioration hızı ↑, kitapçıkta istisna katmanı ↑, aynı vardiyada art arda 2–3 vaka (yorgunluk: alet sayısı sınırlı, IV seti bitti → HK'den ikmal).

**Puan:** Sonuç (stabil teslim 100 / kritik teslim 60 / kayıp 0) × zaman çarpanı; − her zararlı eylem 15; − gereksiz test 5 (tuzak vakalarda ağır müdahale cezası); + takım bonusu (PU'nun "onayla" adımları SP'nin eylemiyle 10 sn içinde eşleşirse). Vardiya sonu rapor ekranı: zaman çizelgesi, hatalar, "en iyi an".

## 4. Saha Protokol Kitapçığı (PU ekranı)

HTML overlay, tam ekran, telefonda dikey kaydırma; Phaser yok. Yapı bir "112 iç portalı" parodisi:

- **Üst bar:** arama kutusu (anahtar kelime + bölüm no), oturum varyant kodu (ör. "Revizyon 2026-Ç3/B"), sekmeler: *Hızlı Triyaj · ABCDE · Semptom Tabloları · İlaç Rehberi · Ritimler · Hastaneler · Ekler*.
- **Hızlı Triyaj:** START benzeri 4 soruluk akış şeması (SVG, dokununca dal vurgulanır). Sonucu "renk kodu" (Yeşil/Sarı/Kırmızı/Siyah) — SP'nin ekranında bu renk yok, PU kuralı yürütür.
- **ABCDE sayfaları:** her harf için "Sor → Ölç → Eşik → Müdahale → Yeniden değerlendir" tablosu. Örnek (varyant B):
  > SpO₂ < 90 **ve** dudaklar morsa → Maske-O₂ (ayar 3). SpO₂ < 90 ama dudaklar normal → önce hava yolunu kontrol et (Ek-2). SpO₂ ≥ 90 ve RR > 28 → Astım tablosu, **ancak** hasta 60 yaş üstüyse önce Kalp tablosu.
- **Semptom tabloları:** satır = bulgu kombinasyonu, sütun = şüpheli durum → "git: bölüm X". KTaNE tarzı çapraz referans: bir tablo "Ek-5'teki sayaç tek ise satır 2'yi atla" diyebilir.
- **İlaç Rehberi:** kurgusal ilaçlar (Kırmızı/Mavi/Sarı ampul, "Dilaltı D", "Enjektör E"). Doz **oyun birimi** ("1 tık", "2 tık"), gerçek mg yok. Kontrendikasyon tablosu: "Mavi ampul + nabız < 50 → verme". Doz, SP'nin *göreceği* ama anlamını bilmeyeceği bir değere bağlı (hasta bilekliğindeki renk/sayı, yaş grubu).
- **Ritimler:** 6 stilize EKG şeridi (sinüs, hızlı, yavaş, "titrek", düz, "düzensiz geniş") + eylem (şok ver / verme / CPR). Şok kararı defibrilatör mini-oyunu açar.
- **Hastaneler (HK varsa):** branş × mesafe tablosu; "inme → sadece Merkez-A ve B".

**Rastgeleleştirme (seed):** eşik sayıları (SpO₂ 88/90/92), ilaç isimleri ↔ ampul renkleri eşlemesi, istisna cümleleri (yaş, mevsim, "vaka kodu çift ise"), tablo satır sırası, hangi bölümün hangi ek'e gönderdiği. Her oturumda `manual = render(templateRules, seed)`; kurallar `rules.json`'da parametrik, sim aynı dosyadan doğrular. Bu sayede kitapçık ezberlenemez ama mantık tanıdık kalır (adil).

**Telefon:** 16px gutter, tablolar yatay kaydırılabilir, "son 5 sayfa" geri butonu, arama anında filtreler, yer imi (uzun bas). Koyu/açık tema.

## 5. Saha mini-etkileşimleri (SP)

Hepsi **SP'nin cihazında lokal**; host (tercihen SP'nin kendisi — en çok etkileşim onda, böylece 0 ms) sadece sonucu (`{action, quality 0–1, t}`) alır ve vitalleri günceller. PU/AŞ/HK'ye giden şey sadece state snapshot (1 Hz, ~200 B). 130 ms latency hissedilmez.

| Etkileşim | Giriş | Kalite ölçümü |
|---|---|---|
| CPR | Ekrana dokunarak 100–120/dk ritim; metronom yok, hedef kitapçıkta ("bir saniyede iki") | ritim sapması; 30 bası sonra "nefes" düğmesi; AŞ sarsıntı yaparsa kayma |
| Kanama basıncı | Yarayı basılı tut (hold), basınç çubuğu yeşil bantta kalmalı | bant dışı süre |
| Monitör okuma | Değerler ±3 titrer; 2 sn stabil okuma için "dondur" düğmesi — PU'ya söylenecek sayıyı seçer | yanlış okuma → yanlış karar |
| Solunum sayma | 15 sn göğüs animasyonunu izle, dokunarak say | sayı farkı |
| Tansiyon | Pompa butonuna bas-bırak, iğne yavaşça iner, ses ikonunda değeri yakala | timing |
| Airway | Başı geri it (drag), aspirasyon (sürükle-bırak), airway tüpü (boy seçimi kitapçıkta: "boyun uzunluğu ÷ ...") | boy yanlışsa SpO₂ düşer |
| IV | Damarı bul (3 adaydan doğru renk), açı kaydırıcısını tut | sarsıntıda titrer |
| Glukometre / Pulse ox / Stetoskop | Alet → vücut bölgesine sürükle; stetoskop ses kliplerinden birini duyar (hırıltı/normal/çıtırtı), kitapçıkta eşleşir | bölge doğruluğu |
| Defibrilatör | Pedleri doğru iki bölgeye sürükle, "herkes çekilsin" butonu, şarj tut | yanlış ritme şok = ceza |
| İlaç | Çantadan ampul seç (renk + harf), "tık" sayısı seç, uygula | kontrendikasyon |

Tüm mini-oyunlar tek parmakla, yatay telefon. Deterioration sayacı her zaman görünür (kalp ikonu rengi).

## 6. İlerleme, tekrar, mizah

- **Vardiya kampanyası:** 8 vardiya × 2–3 vaka; rütbe (Stajyer → ATT → Paramedik → Kıdemli → "Efsane Ekip"). Vardiya içi istatistik ve "ekip kartı".
- **Kilit açma:** ekipman (EKG, defib, glukometre vardiya 2–4'te açılır; MVP'de 6 temel alet), ambulans yükseltmeleri (süspansiyon → az sarsıntı, siren → kısa ETA, ikinci IV seti), kitapçık "kişisel notlar" (oyuncular 3 yer imi kaydedebilir — ama kural varyantı değişince işe yaramaz, komik).
- **Tekrar kancaları:** günlük seed ("Bugünün vakası", skor karşılaştırma), rol rotasyonu bonusu, "sessiz mod" (sadece kitapçıkçı konuşur), "acemi haftası" modifier'ı (kitapçık sayfaları karışık).
- **Mizah (Türkçe doku, kibar):** hasta replikleri ("Oğlum ben iyiyim, bi' kolonya sür geçer"), yanlış tavsiye veren komşu teyze ("Soğan suyu verin!", "Ayağını yukarı kaldırın" — bazen doğru, bazen zararlı; PU'ya sormak gerekir), düğünde davul sesi solunum saymayı zorlaştırır, halı sahada "hocam maç var, çabuk" baskısı, telsizden "Merkez, konum neresi? — Konya'nın orası işte". Hiçbir şey grafik/kanlı değil: vücut diyagramı stilize, kan = kırmızı ikon.

## 7. Sanat & ses listesi

**Blender'dan pre-render (sprite sheet, 2D ortografik/izometrik, düz gölgeli):**
- Ambulans dış (harita ikonu, 8 yön) ve iç (sedye, dolap, arka kapı açık/kapalı)
- Alet çantası ve 12 alet (çanta ikonu + büyük sahne hali): stetoskop, pulse ox, tansiyon aleti, el feneri, EKG cihazı, glukometre, airway seti, ambu, IV seti, ilaç ampulleri (5 renk), defibrilatör + pedler, sedye
- 3 hasta gövdesi (çocuk/yetişkin/yaşlı), sırtüstü, modüler: baş yönü, göğüs (nefes anim 4 kare), kollar
- 5 çevre arka planı (ev salonu, düğün salonu, halı saha, otobüs durağı, köy yolu)

**Prosedürel / 2D elle:** vücut diyagramı overlay'i (renk durumu: morarma, kızarıklık, döküntü, terleme ikonları), monitör UI (dalga formları Phaser Graphics ile çizilir, 6 ritim parametrik), basınç/ritim çubukları, harita (tile + rastgele yollar), kitapçık (HTML/CSS, SVG akış şemaları), hasta portreleri (basit yüz üreteci: 4 kaş × 4 ağız × ten), teyze/çevre karakterleri (silüet + konuşma balonu).

**Ses:** monitör bip (hıza göre pitch), alarm, stetoskop 3 klip (sentezlenebilir: gürültü + filtre), ambulans siren/motor/kasis, CPR tık, defib şarj "vınn" + "pat", UI tık, telsiz paraziti; Türkçe repliklerin ses yerine metin + "mırıltı" (Animal Crossing tarzı) — seslendirme gerekmez.

## 8. MVP → sonrası

**MVP (2 oyuncu, 1 vardiya):** SP + PU; 6 şablon; 6 alet (stetoskop, pulse ox, tansiyon, glukometre, ilaç çantası, kanama basıncı); CPR mini-oyunu; kitapçık 5 sekme, 3 parametrik varyant; 1 çevre; rapor ekranı. Ambulans/harita yok — teslim sabit sayaç.

**Sonra:** AŞ ve HK rolleri, SP2, defib + EKG ritimleri, airway/IV mini-oyunları, kampanya/rütbe, günlük seed, çevre çeşitliliği, modifier'lar, "sessiz mod".

## 9. Build planı (paralel ajanlar)

Ortak sözleşme önce: `src/paramedik/types.ts` (CaseState, Vitals, ActionId, RuleSet, ManualPage) + `rules/*.json` şeması. Sonra:

1. **Ajan A — Case engine / sim (`src/paramedik/sim/`)**: şablonlar, seed'li üretim, deterioration, eylem doğrulama, puanlama; saf TS, vitest. Mevcut `sim/` deterministik kurallarına uy (Math.random yok, seed RNG).
2. **Ajan B — Saha sahnesi (`src/paramedik/scene/`)**: Phaser sahne, vücut diyagramı, çanta, monitör, 7 mini-oyun, touch; sim'e `applyAction` ile bağlanır. Mock state ile tek başına çalışır.
3. **Ajan C — Kitapçık renderer (`src/paramedik/manual/`)**: `rules.json` + seed → HTML; arama, sekmeler, SVG akış şemaları, telefon düzeni; sim'siz çalışır (statik seed).
4. **Ajan D — Sanat/ses**: Blender sprite sheet'leri (§7), prosedürel üreteçler, WebAudio sfx; ortak `assets/paramedik/` manifest.
5. **Entegrasyon (tek ajan, sonra)**: lobi rol seçimi, mevcut `net/` ile host-authoritative döngü (SP host), snapshot 1 Hz, rapor ekranı.
6. **Sonraki tur**: AŞ harita mini-oyunu + sarsıntı olayı, HK ekranı, SP2 split, kampanya kaydı (localStorage, Supabase tablo gerekmez).

Çıkış kriteri MVP: iki telefon, 30 sn'de lobi, 5 dk'lık vaka, hiçbir ekranda kaydırma dışı taşma, stabil teslim oranı test ekibinde ~%50 (ne çok kolay ne imkânsız).
