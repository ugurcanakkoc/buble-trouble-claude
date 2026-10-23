# Mutfak Kaosu — Tasarım Dokümanı

Oyun Gecesi için 1–4 kişilik, Overcooked/PlateUp esinli ama kendi "esnaf lokantası" oyunumuz. Hedef: WhatsApp sesli sohbette bağıra çağıra 30 dakikalık seans, "bir gün daha" isteği.

## 0. Referanslardan çıkan dersler

| Oyun | Ders | Kaynak |
|---|---|---|
| Overcooked | Herkes bilinen bir mekânda (mutfak), öğretmeye gerek yok. Tek kişi takımı sırtlayamamalı; level tasarımı rutini bozup rol değiştirtmeli, sonuç "manik felaket". | [Co-Optimus röportaj](https://co-optimus.com/interview/1838/page/1/indie-ana-co-op-and-the-overcooked-interview.html), [SuperJump analizi](https://superjumpmagazine.com/overcooked-how-design-creates-teamwork), [GMTK](https://amara.org/videos/1kyGmzeQjsv6/en/2301030) |
| PlateUp! | Gün → dükkan → gün döngüsü; her gün rastgele upgrade teklifi + bir "zorlaştırıcı kart". Kaybedilen run'da bile kalıcı açılımlar, "bir el daha" çekimi. Kaos yerine düzen kurmayı ödüllendirir. | [Nintendo Life](https://www.nintendolife.com/reviews/switch-eshop/plateup), [Push Square](https://www.pushsquare.com/games/ps5/plateup) |
| Good Pizza Great Pizza | Günlük süre sayacı, yanlış sipariş = iade, para → fırın/dekor/menü. Siparişler zamanla karmaşıklaşır ("peperonisiz peperonili pizza"). | [Nintendo Insider](https://www.nintendo-insider.com/good-pizza-great-pizza-review/) |
| Unrailed / Moving Out | İşbölümü hızla kararlaştırılmalı; iki kişilik eşyalar koordinasyon zorlar; bot ile solo mümkün olmalı. | [Gamereactor](https://www.gamereactor.eu/in-unrailed-you-need-to-micromanage-yourself-and-friends/), [Game Informer](https://www.gameinformer.com/review/moving-out/moving-out-review-packed-with-frustration) |

Bizim ekleyeceğimiz: **asimetrik bilgi** (garson siparişi görür, mutfak görmez → sesli sohbet şart), **kurye mini-haritası** (ayrı bir oyun içinde oyun), **Türk menüsü** ve **bulaşık/temizlik** baskısı.

## 1. Çekirdek döngü ve oturum

- **Gün = 5 dk** (300 s = 18 000 tick): 20 s *hazırlık* (müşteri yok, mise en place), 4 dk *servis*, 40 s *kapanış* (müşteri gelmez, kalan siparişler ve bulaşık bitirilir).
- **Dükkan fazı** (HTML overlay, host seçer, herkes görür, 60 s sayaç): kazancı harca → makine, personel, dekor, mutfak genişletme, kurye aracı. Her gün 3 rastgele teklif + sabit katalog.
- **Kampanya: 10 gün.** Her gün sonunda 1–3 yıldız (ciro hedefine göre: 1★ = hedef, 2★ = 1.4×, 3★ = 1.8×). Toplam yıldız → final rütbe (Çırak / Kalfa / Usta / Ankara'nın Lokantası).
- **Sonsuz mod:** gün 11+, hedef her gün ×1.12, müşteri sabrı −3 %/gün.
- **İtibar** (0–100, başlangıç 50): her teslim +2, iade/çok geç −5, müfettiş cezası −10. **İtibar 0 = iflas, kampanya biter.** Kira (gün başı sabit gider) ödenemezse de iflas. İtibar ≥ 80 → VIP müşteri (3× bahşiş).

## 2. Roller (1–4 oyuncu, esnek)

Roller kilitli değil: mutfaktaki herkes her şeyi yapabilir. Rol = nerede durduğun. **Kurye** ayrı: kapıdaki scooter'a bindiğinde mutfak görünümü sokak mini-haritasına geçer.

| Rol | Ne görür | Ne yapar |
|---|---|---|
| **Mutfak** | Mutfak ızgarası, sipariş panosu (sadece *sabitlenmiş* fişler), ocak sayaçları | Doğra, pişir, birleştir, paketle |
| **Garson/Kasa** | Müşteri baloncuğunda **gerçek sipariş** (dine-in'de yalnız o görür), masa sabırları | Kasada "Sipariş al" → eline fiş. Fişi panoya asarsa (2 s) mutfak görür; asmazsa **sesle söyler**. Tabakları masaya götürür, boşları toplar. |
| **Kurye** | Sokak mini-haritası (20×14 tile), hedef işareti, trafik, yağmur | Paketi al, scooter'la teslim et, dönüşte marketten malzeme getir |
| **Bulaşık/Temizlik** | Kirli tabak yığını, dökülen çorba lekeleri, çöp doluluk | Lavaboda yıka (hold 1.5 s/tabak), paspasla (hold 1 s), çöpü dışarı çıkar |

Paket siparişler (telefon) panoya doğrudan düşer — bilgi asimetrisi sadece dine-in'de.

**Oyuncu sayısına göre:**
- **1 kişi:** Sadece paket sipariş yok; kurye **bot** (yavaş, bahşiş yok). Bulaşık yığını yarı hızda. Sipariş panosu tam görünür (asimetri kapalı).
- **2 kişi:** Önerilen: biri mutfak+garson, biri kurye+bulaşık; ya da ikisi mutfakta, kurye bot. Asimetri açık (garson olan görür).
- **3 kişi:** Mutfak / Garson+bulaşık / Kurye.
- **4 kişi:** Tam set. Kurye yoğun; dönüşte market siparişi de taşır.
- Rol değişimi anlık: scooter tile'ına basan kurye olur; kasa tile'ında duran siparişi görür. Bot kurye sadece hiçbir oyuncu scooter'da değilse ve "Bot kurye" dükkanda alındıysa (1 kişide bedava).

## 3. Mekanikler

**Izgara:** mutfak 12×8 tile (büyütmeyle 16×10). Hareket `bomb` ile aynı: tile üstünde sürekli, 3.0 tile/s, `cornerAssist`. Çarpışma yok, itiş yok — aynı tile'a iki oyuncu giremez (ilk giren kalır, diğeri durur).

**İstasyonlar** (duvar kenarına dizili, oyuncu tile'dan bakarak etkileşir):

| İstasyon | Girdi → Çıktı | Süre | Not |
|---|---|---|---|
| Dolap (malzeme) | ∞ domates/soğan/kıyma/hamur/un… | anlık | Market yenilemesi olmazsa gün içinde 12 adet sınırı (kurye getirir) |
| Tezgâh | Ara depo, birleştirme (tabak + parçalar) | anlık | Tabak üstüne "Bırak" = birleştir |
| Doğrama | çiğ → doğranmış | hold 2 s | Elini çekersen ilerleme kalır |
| Ocak (tencere/tava) | çorba 12 s, köfte 8 s, ayran karıştırma 3 s | otomatik | **Yanma:** süre ×1.6 geçince yanık (çöpe); ×2.2 geçince **yangın** |
| Fırın / tandır | lahmacun 10 s, pide 14 s, künefe 12 s | otomatik | Yanma aynı |
| Döner ocağı | 20 s'de bir "kesmeye hazır" dilim; hold 1.5 s = 1 porsiyon et | pasif | Kesmezsen 3 dilim birikir, sonrası kurur (çöp) |
| Fritöz | patates 7 s | otomatik | Yangın riski yüksek (×1.4) |
| Çay ocağı | demlik 30 s'de 6 bardak; bardak al = anlık | pasif | Boş demlik = 30 s bekleme |
| Lavabo | kirli tabak → temiz, hold 1.5 s | | Kurutma rafı 6 tabak |
| Bulaşık makinesi (upgrade) | 4 tabak 12 s | otomatik | |
| Çöp | elindekini yok et | anlık | 10 atıkta dolar → dışarı çıkarmak 4 s yürüyüş |
| Paketleme | tabak → paket (hold 1 s) | | Paket sadece kurye kapısına |
| Servis tezgâhı | tabak koy → garson taşır | | |
| Kurye kapısı | paket raf (4 slot) + scooter | | |
| Yangın tüpü | yanan tile'a "Kullan" 2 s | | Yangın 4 s'de komşu istasyona yayılır, istasyon 15 s devre dışı |

**Tarifler (MVP'de ilk 4):** Çay (bardak) · Çorba (tencere: doğranmış mercimek+soğan → kâse) · Lahmacun (hamur + kıyma/soğan/domates karışımı → fırın) · Döner dürüm (lavaş + et + doğranmış domates/soğan) · Pide (hamur + kıyma|peynir → fırın) · Köfte (kıyma doğra → tava + ekmek + salata) · Ayran (yoğurt + su → ocak karıştır) · Künefe (kadayıf + peynir → fırın + şerbet) · Patates (fritöz).

**Müşteri/sipariş:** Dine-in 4–8 masa, telefon siparişi panoya düşer. Sabır çubuğu 60 s (çay 30 s). Sabır bitince masa gider: −5 itibar, 0 ₺. Teslim süresi sabırın %50'sinden kısaysa **bahşiş** +%30. Üst üste 3 hızlı teslim = **combo ×1.5** (yanlış/geç kırar). Yanlış yemek = iade, tabak kirli.

**Kurye haritası:** 20×14 sokak ızgarası, 6 mahalle hedefi. Scooter 6 tile/s, sokakta trafik arabaları (deterministik rotalar) — çarpınca 1.5 s dur. Bir seferde 3 paket, hedefler harita işaretli; **paket 90 s içinde** teslim edilmezse soğur (yarı para). Dönüşte market tile'ından (hold 2 s) 1 kasa malzeme (6 adet seçili ürün). Bahşiş: 60 s altı +10 ₺.

**Temizlik ölçeri (0–100):** zeminde leke (çorba taşıyan oyuncu düşürürse %10 ihtimal, hızlı dönüşlerde), dolu çöp, 8+ kirli tabak → her biri −1/s. <40 olursa müşteri gelme hızı yarıya iner; **müfettiş** (günde 1 kez rastgele, 2. günden itibaren) geldiğinde <50 ise −10 itibar ve 100 ₺ ceza.

**Özel olaylar** (host RNG, gün başında 0–1 tane, gün 3+):
- *Maç günü:* müşteri ×1.8, sadece çay/döner/lahmacun siparişi, 2 dk sürer.
- *Elektrik kesintisi:* 30 s fırın+fritöz+bulaşık makinesi kapalı; ocak ve döner (tüp) çalışır.
- *Yağmur:* kurye 4 tile/s, teslim bahşişi ×2.
- *Müfettiş:* yukarıda.
- *Toptancı kampanyası:* dükkanda malzeme %50 indirim (ekonomi olayı).

**Rush saati:** her günün 2:00–3:00 dakikası müşteri sıklığı ×1.5 (HUD'da "Öğle yoğunluğu").

## 4. Ekonomi ve geliştirmeler

Para birimi ₺ (soyut). Günlük kira: 150 + 25×gün. Gün 1 hedef: 400 ₺.

**Menü fiyatları:** çay 5 · ayran 8 · patates 15 · çorba 20 · lahmacun 25 · künefe 35 · döner dürüm 40 · pide 45 · köfte 50. Malzeme maliyeti fiyatın %25'i (kasa dolabından sınırsız ama günde 12/çeşit; fazlası kurye/marketten, 30 ₺/kasa).

**Katalog (dükkan):**

| Geliştirme | Fiyat | Etki |
|---|---|---|
| 2. ocak / 2. fırın | 200 / 250 | Paralel pişirme |
| Hızlı doğrama bıçağı | 120 | hold 2 s → 1.2 s |
| Bulaşık makinesi | 300 | 4 tabak/12 s otomatik |
| Büyük döner | 180 | Dilim süresi 20 → 12 s |
| Samovar | 100 | Çay demliği 12 bardak |
| Ekstra tabak seti (+4) | 60 | |
| Bot kurye | 150 (1 kişide 0) | 4 tile/s, bahşiş yok |
| Motorlu kurye (scooter→motor) | 350 | 6 → 8 tile/s, 4 paket |
| Kurye kutusu (termal) | 120 | Soğuma 90 → 150 s |
| Mutfak genişletme | 500 | 12×8 → 16×10, +2 istasyon yeri |
| Dekor: halı / avize / akvaryum | 80 / 150 / 250 | Müşteri sabrı +10 % / +15 % / +20 % (toplam 45 %) |
| Menü açma: pide / köfte / künefe / patates+ayran | 150 / 200 / 250 / 100 | Yeni sipariş çeşidi (daha pahalı yemek, daha fazla iş) |
| Garson çırağı (bot) | 200 | Tabakları masaya kendi taşır, sipariş *almaz* |

Her gün 3 rastgele "teklif" kartı %30 indirimli; bir de **isteğe bağlı zorlaştırıcı kart** (PlateUp usulü): "Yarın maç günü, hedef ×1.3" gibi — kabul edersen 3★ eşiği düşer.

Derinlik kaynağı: para ya **kapasite** (makine), ya **tolerans** (dekor/sabır), ya **gelir** (menü) alır; hepsine yetmez.

## 5. Kontroller

**Telefon (yatay):** sol floating joystick, sağda 3 büyük buton:
- **A — Al/Bırak:** boş el → bakılan tile'dan al; dolu el → bırak/birleştir/sun.
- **B — Kullan (basılı tut):** doğra / yıka / paketle / kes / söndür / paspasla / "Sipariş al" (kasa) / fişi panoya as.
- **C — Fırlat:** elindeki malzemeyi baktığı yönde 3 tile'a kadar at (tabak/sıvı atılamaz). Tezgâha veya yere düşer; yere düşerse 3 s sonra kirli.
- Kurye modunda: joystick sürer, **A = Teslim/Al** (hedef tile ya da market), B/C gizli.

**PC:** WASD/ok, **J/Space** = A, **K/E** = B, **L/Q** = C.

**Affedicilik:** oyuncu yönüne bakmadan, komşu 4 tile'dan "uygun" olan (elindekiyle uyumlu) istasyona otomatik hedeflenir; hedef tile sarı çerçeveyle vurgulanır. Joystick bırakınca tile merkezine kayar. B'yi erken bıraksan ilerleme %100 kalır (geri sayım yok). Yanlış birleştirme reddedilir, ceza yok (kırmızı titreme + "tık").

## 6. Netcode uyumu

- `bomb` ile aynı yapı: host-authoritative 60 Hz, intent input `{dx,dy,a,b,c,seq}` (B hold = her tick `b:true`). Fizik yok, itiş yok, grid+tile doluluk.
- **Deterministik olması gerekenler:** RNG (`random(s)` aynı LCG), müşteri gelişi/siparişi, kurye trafik rotaları, yanma sayaçları, olaylar, leke düşmesi. Hepsi sim içinde; sahne yalnız çizer.
- **Snapshot bütçesi (~7.5 Hz, hedef < 1.5 KB):**
  - Oyuncu ×4: tile x,y (u8), yön (u2), elindeki item id (u8), hold ilerlemesi (u8), mod (mutfak/kurye) → ~6 B.
  - İstasyon ×~20: tip sabit (level'da), durum (u8), sayaç (u16), içindeki item id'leri (≤4 × u8) → ~8 B.
  - Item tablosu: id → {kind u8, state u8 (çiğ/doğranmış/pişmiş/yanık), tileOrOwner u8} ≤ 64 item → 192 B.
  - Fişler ≤ 12 × {dish u8, table u8, sabır u8, pinned u1}.
  - Kurye: pos ×2 u8, paket id ×4, trafik ×8 araç (pos u8×2, dir u2).
  - Skalarlar: tick, para, itibar, temizlik, combo, olay, faz.
  - Toplam ≈ 600–900 B JSON'suz; JSON ile ~2 KB kabul edilebilir, gerekirse `msgpack`.
- Kurye haritası aynı state içinde (ayrı sim değil); sadece kurye modundaki istemci onu çizer.
- Client tahmini: yalnız kendi oyuncusunun tile hareketi (`reconcileDist` 1.5 tile); istasyon sayaçları snapshot arası interpolasyonla sürer.

## 7. Sanat ve ses

**Stil:** üstten %30 eğik (Overcooked gibi "2.5D" görünüm) ön-render sprite'lar, 64 px tile. Blender'da tek sahne, ortografik kamera 30°, 8 bit alpha PNG → WebP atlas.

**Blender'dan render (sprite listesi):**
- Zemin/duvar tile seti (fayans, ahşap, mutfak duvarı, sokak asfalt/kaldırım/bina 6 çeşit) — 12 tile.
- İstasyonlar (14 çeşit) × durum (boş/dolu/yanıyor) — ~30 sprite; büyük döner ve motor varyantı.
- Karakter ×4 renk (mutfak kıyafeti, önlük) × 4 yön × yürüme 4 kare + taşıma pozu = 128 kare/karakter → **spritesheet**; kurye kaskı overlay. Garson/bulaşıkçı için ayrı karakter gerekmez: rol = tuttuğu eşya.
- Müşteri ×6 (amca, teyze, öğrenci, çocuk, takım elbiseli, VIP) oturma + bekleme + sinirli = 18.
- Scooter + motor (4 yön), trafik arabası ×3 renk (4 yön), müfettiş.
- Yemekler: her tarif için tabak sprite'ı (9) + paket kutusu.

**Prosedürel (Phaser Graphics):** malzeme ikonları (çiğ/doğranmış/pişmiş/yanık = renk + şekil varyasyonu), sabır çubukları, hold daire, yangın (partikül), duman, leke, sipariş baloncuğu, kurye haritası hedef pini, HUD. Bu sayede MVP Blender'sız da oynanır (istasyonlar renkli dikdörtgen + ikon).

**Ses listesi (kısa WAV/OGG):** doğrama tık ×3, cızırtı loop, fırın "ding", çay bardağı, tabak koyma, tabak kırılma, su sesi, yangın loop, tüp "pşşt", kasa "çın", müşteri memnun/sinirli (2 kısa ünlem), scooter motor loop, korna, yağmur loop, müfettiş "düdük", gün sonu jingle, combo "tık-tık-tık". Müzik: 2 loop (sakin/rush), Anadolu rock tınısı, prosedürel değil, telifsiz üretim.

## 8. Yapım planı

**MVP (≈1 gün ajan işi), kapsam:**
- 1 mutfak düzeni (12×8), 4 tarif (çay, çorba, lahmacun, döner), istasyonlar: dolap, tezgâh ×3, doğrama, ocak, fırın, döner, çay ocağı, lavabo, çöp, servis tezgâhı, paketleme, kurye kapısı.
- Dine-in 4 masa + telefon siparişi; garson asimetrisi; sabır, bahşiş, iade; kirli tabak döngüsü (yangın yok, müfettiş yok).
- Kurye mini-harita (trafik yok), bot kurye.
- 1 gün = 5 dk, dükkan overlay'de 5 geliştirme (2. ocak, bıçak, bulaşık makinesi, bot kurye, halı), 3 günlük kampanya, yıldız.
- Prosedürel sanat, 6 ses.

**Sonraki fazlar:** F2 yangın+tüp, trafik, olaylar, müfettiş, temizlik ölçeri, combo. F3 menü açılımları (pide/köfte/künefe/ayran/patates), mutfak genişletme, teklif kartları, 10 gün + sonsuz. F4 Blender sprite'ları, müzik, 2. mutfak düzeni (rutin bozucu: döner kapı arkasında, servis karşı duvarda).

**Modül sınırları (4 paralel ajan):**

1. **Sim ajanı** — `src/games/mutfak/sim.ts`, `balance.ts`, `recipes.ts`: state tipleri, `createGame/step/applyInput`, istasyon makineleri, tarifler, fişler, müşteri RNG, ekonomi, gün fazları. `sim.test.ts` ile determinizm (aynı seed+input = aynı hash) ve "lahmacun yapılabilir" uçtan uca testi. **Arayüz sözleşmesini (state + event tipleri) ilk 1 saatte dondurur**, diğerleri ona yazar.
2. **Sahne ajanı** — `MutfakScene.ts`, `hud.ts`, `shop.ts` (HTML overlay): `GameLoop` bağlantısı, tile çizimi, hedef vurgusu, hold daireleri, sipariş panosu, kurye görünümüne geçiş, dükkan ekranı, uç kart. Touch: platformun joystick + 3 buton bileşeni.
3. **Sanat/ses ajanı** — `art.ts` (prosedürel çizimler, `bomb/art.ts` kalıbı), `sound.ts` (`war/sound.ts` kalıbı), Blender render betiği + atlas üretimi (F4), `assets/mutfak/`.
4. **Bot/kurye ajanı** — `bot.ts` (bot kurye yol bulma BFS, garson çırağı), `courier.ts` (sokak haritası, trafik, teslim mantığı; sim'den çağrılır), `bot.test.ts`.

Entegrasyon: `index.ts` `GameDef {id:'mutfak', title:'Mutfak Kaosu', modes:[kampanya, sonsuz]}` → registry'ye lead ekler.
