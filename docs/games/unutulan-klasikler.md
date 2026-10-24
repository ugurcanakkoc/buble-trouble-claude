# Unutulan Klasikler — modernize edilince tutacak 10 oyun

Kriter: yıllar önce çok sevilmiş, bugün az oynanan; **online 2–4 kişi + telefon kontrolü + yeni twist** ile yeniden tutabilecek oyunlar. fikir-havuzu.md'dekiler ve mevcut oyunlar (Balon Avı, Çağlar Savaşı, Bomba, Mutfak Kaosu, Paramedik) tekrarlanmadı.

Kısaltmalar: **Efor** S/M/L · **Latency** = 30–130 ms P2P, host-authoritative sim · **Motor** = kod paylaşılan mevcut oyun.

---

## 1. Tank 1990 → "Tank 1990: Mahalle Savunması"

- **Neydi / kanıt:** Namco Battle City (1985); Türkiye'ye "9999 in 1" Atari kartuşlarında *Tank 1990* hack'i olarak girdi, famiclone kartuşlarının en yaygın oyunu ([wiki](https://en.wikipedia.org/wiki/Battle_City)). Türkçe kaynaklar "arkadaşla müttefik oynanan Atari klasiği" diye anıyor ([Tamindir](https://www.tamindir.com/indir/tank-1990-free/)). Hamster 2024'te Arcade Archives'a aldı — talep hâlâ var.
- **Neden unutuldu:** Sadece 2 kişi, yerel; hiç online sürümü olmadı.
- **Çığlık anı:** Kartal (üs) tek tuğla kaldı, sen tuğla örüyorsun, arkadaşın yanlışlıkla kendi tuğlanı vuruyor.
- **Modern tasarım:** 2–4 kişi co-op, dalga bazlı; 4. oyuncu isteğe bağlı **Düşman Komutan** (god-mode: spawn noktası seçer, kayan tankları yönlendirir — Balon Avı'nın bozucu rolü). Dalga arası dükkân: zırh, hızlı mermi, "kürek" (tuğla). Türk tadı: üs = apartman girişi, haritalar Kızılay/Konya Alaeddin; tuğla yerine "kömür çuvalı".
- **Telefon:** Joystick (4 yön) + Ateş + Kürek.
- **Latency:** İyi — grid hareket, yavaş mermi; host sim, kendi tankını lokal tahmin.
- **Bot:** Düşman tankları zaten AI; boş müttefik slotu "takip + ateş" botu.
- **Efor:** M. **Motor:** Bomba'nın grid/yıkılabilir tuğla haritası neredeyse birebir.

## 2. Pac-Man Vs. → "Hırsız Polis"

- **Neydi / kanıt:** Miyamoto tasarımı GameCube asimetrik oyunu (2003): 1 Pac-Man tam labirenti görür, 3 hayalet sadece çevresini görür; Metacritic 78, "15 yıl sonra hâlâ multiplayer mutluluğu" ([wiki](https://en.wikipedia.org/wiki/Pac-Man_Vs.), [GameRevolution](https://www.gamerevolution.com/features/464149-pac-man-vs-15-years-later)). 2017 Switch'te geri geldi ama 2 konsol şart.
- **Neden unutuldu:** GBA kablosu, sonra 2 Switch — donanım engeli hep vardı. Biz bunu sıfırlıyoruz: 4 telefon.
- **Çığlık anı:** "SAĞDA, SAĞDA — hayır senin sağın!" Polisler sesle koordine ederken hırsız güç simidini yedi.
- **Modern tasarım:** 1 Hırsız (tam harita, hızlı) vs 3 Polis (3 karo görüş, yavaş ama sesli iletişim). Yakalayan polis hırsız olur (Pac-Man Vs. kuralı). Simit = puan, **Çay** = güç bardağı (polisler 8 sn kaçar). Tur bitince toplam simit sıralaması. Yeni twist: **Bekçi düdüğü** — polis düdük çalınca hırsızın konumu 1 sn herkese görünür, ama hırsız 2 sn hızlanır.
- **Telefon:** Joystick (Pac-Man tarzı dönüş kuyruğu: erken bastığın yön köşede uygulanır) + Düdük.
- **Latency:** İyi — grid, dönüş tamponu 130 ms'yi yutar.
- **Bot:** 2 kişide 2 bot polis (Pac-Man hayalet AI: Blinky takip / Pinky öngörü).
- **Efor:** S–M. **Motor:** Bomba grid + fog; Körebe fikriyle aynı altyapı.

## 3. Achtung, die Kurve! / Curve Fever → "Kıvrım"

- **Neydi / kanıt:** 1995 DOS freeware, tek klavyede 6 kişi; Curve Fever olarak 2010'larda tarayıcıda patladı, site 400.000 online oyuncu iddiasıyla pazarlandı ([wiki](https://en.wikipedia.org/wiki/Achtung,_die_Kurve!), [AlternativeTo](https://alternativeto.net/software/curve-fever/about/)). Türkiye'de bilgisayar laboratuvarı/yurt klasiği.
- **Neden unutuldu:** Flash öldü; Curve Fever Pro paralı/kalabalık, arkadaşla özel oda kültürü dağıldı.
- **Çığlık anı:** Deliğe son anda girip 3 kişiyi duvara sıkıştırmak.
- **Modern tasarım:** 2–4 kişi, 10 tur, ilk 30 puan. Güçler: freni, ters-kontrol (rakibe), duvardan geçiş. Türk tadı: arena şekilleri Ankara çevre yolu, Konya dairesel bulvar; çizgi = dolmuş rotası. Twist: **Takım modu 2v2** — aynı renk çizgiye çarpınca ölmezsin, bu yüzden partnerinle sarmal örüp alan kapatıyorsun.
- **Telefon:** Sadece 2 buton (sol/sağ), ekranın yarıları — en kolay mobil kontrol.
- **Latency:** **Dikkat, en twitchy olan.** Çözüm: deterministik lockstep + 3 tick (100 ms) sabit input gecikmesi; çizgi hızı düşük, dönüş yarıçapı geniş. 130 ms'de hâlâ oynanır; 1v1 ölüm "aynı tick" beraberlik sayılır.
- **Bot:** Basit ray-cast kaçış.
- **Efor:** S. **Motor:** Sadece lobby/P2P katmanı; lockstep ileride Yakar Top'a da lazım.

## 4. Scorched Earth / Pocket Tanks / Raft Wars / Territory War → "Topçu"

- **Neydi / kanıt:** Scorched Earth 1991 shareware, 10 kişiye kadar hot-seat, türün arketipi ([wiki](https://en.wikipedia.org/wiki/Scorched_Earth_(video_game))). Pocket Tanks: Android'de 10M+ indirme, PC'de download.com'dan ~2M ([AppBrain](https://www.appbrain.com/dev/BlitWise+Productions%2C+LLC/), [Metacritic](https://legacy.prod.metacritic.com/game/pc/pocket-tanks)). Territory War Newgrounds'ta 2.54M görüntüleme, 4.56/5 ([NG wiki](https://newgrounds.wiki.gg/wiki/Territory_War)); Raft Wars 2007 Flash portallarında devasa, hâlâ fan remake'leri çıkıyor ([itch](https://zaidadoo.itch.io/raft-wars-remake)).
- **Neden unutuldu:** Flash öldü, Worms online'ı gerçek zamana kaydı, Pocket Tanks hâlâ tek ekran hot-seat.
- **Çığlık anı:** Rüzgâr 7, açı 63, güç 71 — arkadaşının tepesine düşen "kolonya bombası".
- **Modern tasarım:** 2v2 veya herkes-herkese, yıkılabilir arazi. **Twist: eşzamanlı atış** — sıra beklemek yok, 4 kişi 15 sn içinde nişan alır, mermiler aynı anda uçar; "senin mermin benim mermime çarptı" anları. Raundlar arası dükkân (Mutfak Kaosu paradan upgrade). Türk tadı: haritalar fındık bahçesi, Tuz Gölü, Ankara Kalesi; silahlar kolonya, cağ kebabı şişi, "akraba sorusu" (rakibi 1 tur dondurur).
- **Telefon:** Sürükle = açı+güç (Angry Birds tarzı), Silah seç butonu, Ateş.
- **Latency:** Sıfır sorun — turn/zamanlayıcı tabanlı.
- **Bot:** Balistik çözücü + rastgele hata; zorluk = hata payı.
- **Efor:** M. **Motor:** Çağlar Savaşı yan görünüm + Balon Avı mermi fiziği; arazi = Bomba'nın yıkılabilir karo mantığı yüksek çözünürlükte.

## 5. Micro Machines → "Sofra Rallisi"

- **Neydi / kanıt:** Codemasters 1991–97, tek ekranda 4 kişi, ekrandan düşen elenir; orijinaller eleştirmen övgüsü aldı, 2017 World Series "ruhsuz" bulundu ve seri tekrar öldü ([wiki](https://en.wikipedia.org/wiki/Micro_Machines_(video_game_series)), [GodisaGeek](https://www.godisageek.com/reviews/micro-machines-world-series-review/)).
- **Neden unutuldu:** Online'da "tek paylaşılan kamera" zor; 2017 remake'i yarış yerine battle'a odaklanıp kitleyi kaybetti.
- **Çığlık anı:** Arkadaşını çay bardağının arkasına sıkıştırıp ekrandan düşürmek.
- **Modern tasarım:** Kuşbakışı, tek ortak kamera (lider belirler), ekrandan çıkan elenir, tur kazanan puan. Pistler **Türk kahvaltı sofrası**: zeytin kâsesi, çay tabağı, bal kavanozu yapışkan bölge, simit halkası köprü. Twist: elenenler kalan tura **Teyze eli** olarak girer (god-mode: ekrana dokunup 1 çatal düşürür).
- **Telefon:** Joystick (yön) + Gaz + Fren/Drift.
- **Latency:** **Dikkat** — çarpışmalı yarış. Çözüm: kendi arabanı lokal tahmin + host uzlaşması, çarpışmalar "yumuşak" (itme kuvveti, anlık teleport yok), kamera 200 ms lerp.
- **Bot:** Waypoint takipçisi.
- **Efor:** M–L. **Motor:** Balon Avı'nın god-mode katmanı; fizik yeni (Phaser arcade top-down).

## 6. Gauntlet → "Zindan"

- **Neydi / kanıt:** Atari 1985, ilk 4 kişilik co-op arcade; "Wizard needs food, badly!" hâlâ hatırlanıyor; 7.848 kabin ([wiki](https://en.wikipedia.org/wiki/Gauntlet_(1985_video_game)), [Den of Geek](https://www.denofgeek.com/games/gauntlet-a-history-of-the-classic-dungeon-crawler/)).
- **Neden unutuldu:** 2014 remake'i sessiz öldü; türün devamı Diablo-tipi tek oyunculu derinliğe kaydı.
- **Çığlık anı:** "YEMEĞİ VURMA!" — Savaşçı yemeği patlattı, Büyücü 50 can'da.
- **Modern tasarım:** 4 rol (Savaşçı güçlü/yavaş, Okçu uzun menzil, Büyücü alan büyüsü, Hırsız anahtar/kilit) — sürekli azalan can = süre, yemek kavgası. Anahtarlar ortak havuzda: kapıyı kim açsın tartışması. Türk tadı: zindan = Kapadokya yeraltı şehri, yemek = gözleme, iksir = ayran. Twist: bir odada **üleşme** — ganimet otomatik bölünmez, oylamayla dağıtılır.
- **Telefon:** Joystick + Ateş + Büyü/Yetenek.
- **Latency:** İyi — düşman sürüsü host'ta, yavaş tempo.
- **Bot:** Boş rol "takip et + en yakını vur".
- **Efor:** L (rol dengesi, seviye üretimi). **Motor:** Bomba grid + Mutfak Kaosu rol/dükkân.

## 7. Snow Bros. / Bubble Bobble → "Kartopu"

- **Neydi / kanıt:** Toaplan 1990, Türk atari salonlarının demirbaşı ([Tamindir](https://www.tamindir.com/indir/snowbros/), [Webtekno atari salonu listesi](https://www.webtekno.com/atari-salonlari-oyunlari-h133864.html)); Bubble Bobble 4 Friends (2019, 4 kişi) Switch'te 100.000+ sattı — talep ölçüldü ([Nintenderos](https://www.nintenderos.com/2020/06/bubble-bobble-4-friends-100-000-copias-vendidas-en-nintendo-switch-y-vistazo-a-los-nuevos-niveles/)).
- **Neden unutuldu:** Tek ekran, 2 kişi, yerel; online sürümü hiç olmadı.
- **Çığlık anı:** Senin kartopunu arkadaşın itip tüm düşmanları devirip puanı kapıyor.
- **Modern tasarım:** 4 kişi tek ekran, 20 oda; düşmanları kar/baloncukla sarıp yuvarla. **Kill-steal puanı** rekabet üretir, ama bölüm geçmek ortak. Türk tadı: düşmanlar yerine "zam canavarı", bonuslar gazoz kapağı/Cin Ali. Twist: **Versus odası** her 5 bölümde — yuvarlanan kartopu arkadaşı da götürür.
- **Telefon:** Joystick + Zıpla + Ateş.
- **Latency:** Orta — platformer. Balon Avı'nın çözümü aynen: host sim, kendi karakteri lokal, geniş hitbox, düşük yerçekimi.
- **Bot:** Düşmanlar AI; boş slot gerekmez.
- **Efor:** M. **Motor:** Balon Avı tek-ekran arena + platform fiziği birebir; en ucuz "büyük" oyun.

## 8. Space Impact → "Uzay Darbesi"

- **Neydi / kanıt:** Nokia 3310 ile 126M cihazda dağıtıldı; Snake'ten sonra en anılan 3310 oyunu ([wiki](https://en.wikipedia.org/wiki/Nokia_3310), [GSMArena](https://fo.gsmarena.com/counterclockwise_remembering_the_classic_mobile_games_that_are_not_snake-news-35905.php)).
- **Neden unutuldu:** Telefon öldü, oyun hiçbir platforma taşınmadı; nostaljisi var, oynanacak yeri yok.
- **Çığlık anı:** Boss'ta tek pil kaldı, "ben öndeyim sen arkamda dur".
- **Modern tasarım:** 2–4 gemi yan kaydırmalı co-op, 1-bit yeşil Nokia estetiği (ucuz!). Ortak **pil** havuzu: vurulan pil düşürür, ölen gemi 1 pil karşılığı döner. Roller: 1 kişi "kalkan gemisi" (hasar yutar, az ateş). Twist: tuşlu telefon menüsü ve **T9 şifre** bölümleri (boss'u susturmak için 3 tuşla kelime yaz).
- **Telefon:** Yukarı/Aşağı + Ateş + Bomba (orijinal 4 tuş).
- **Latency:** Orta — mermi kalabalığı host'ta deterministik; kendi gemin lokal; düşman mermileri yavaş (Nokia hızında).
- **Bot:** Boş gemi otomatik ateş + ortalama hiza.
- **Efor:** M. **Motor:** Balon Avı mermi/çarpışma; Çağlar Savaşı'nın dalga sistemi.

## 9. Lemmings → "Göç"

- **Neydi / kanıt:** Psygnosis 1991, tüm platformlarda ~15M kopya; Amiga'da 2 kişilik eşzamanlı mod vardı ([wiki](https://en.wikipedia.org/wiki/Lemmings_(video_game)), [SuperJump](https://superjumpmagazine.com/what-happened-to-lemmings)).
- **Neden unutuldu:** Sony lisansı rafta; mobil sürümü free-to-play'e boğuldu; co-op hiç denenmedi.
- **Çığlık anı:** "KAZ DEDİM, PATLAT DEMEDİM" — 40 lemming uçurumdan.
- **Modern tasarım:** Co-op: yetenekler oyunculara **bölünmüş** (sen kazıcı+bloklayıcı, ben köprücü+şemsiye) → konuşmadan çözülmez. Versus 2v2: iki sürü, iki çıkış, aynı harita (Amiga modu). Türk tadı: sürü = bayram tatili trafiği, çıkış "Konya ↔ Ankara", engeller gişe ve "yol çalışması". Twist: bir oyuncu **Trafik Polisi** (god-mode: 2 işaret koyar, sürüyü saptırır).
- **Telefon:** Yetenek seç (≤4 büyük buton) + lemming'e dokun; joystick gerekmez.
- **Latency:** Mükemmel — komut tabanlı, sürü host'ta deterministik.
- **Bot:** Gerekmez (2 kişi yeterli).
- **Efor:** L (seviye tasarımı + piksel arazi). **Motor:** Çağlar Savaşı birim yürüyüşü; arazi Topçu ile ortak.

## 10. Motherload → "Maden"

- **Neydi / kanıt:** XGen Studios 2004 Flash; Miniclip'in uzun soluklu hitlerinden, PS4'e Super Motherload olarak taşındı (2013) ([wiki](https://en.wikipedia.org/wiki/Super_Motherload), [PushSquare](https://pushsquare.com/reviews/ps4/super_motherload)).
- **Neden unutuldu:** Flash öldü; sequel tek oyunculu kaldı.
- **Çığlık anı:** Yakıt %4, 900 m derinde, "asansörü indir!" diye bağırıyorsun.
- **Modern tasarım:** 2–3 kazıcı aynı madende + 1 **Çavuş** yüzeyde (asansör/vinç, yakıt borusu, satış, dükkân — asimetrik rol). Ortak kasa, upgrade kavgası. Türk tadı: Zonguldak, cevherler bor/krom, "grizu" olayı herkesin feneri söner. Twist: haftalık **kota** — vardiya sonunda kota tutmazsa herkes para kaybeder.
- **Telefon:** Joystick (kaz yönü) + Hızlan; Çavuş tamamen dokunmatik panel.
- **Latency:** İyi — yavaş kazı, karo yıkımı host'ta.
- **Bot:** Çavuş botu basit (yakıt istendiğinde gönder).
- **Efor:** M. **Motor:** Bomba'nın yıkılabilir karo grid'i + Mutfak Kaosu dükkân/vardiya; Paramedik'in panel UI'ı Çavuş için.

Yedek (S): **Warlords** (Atari 1980, 4 köşe kale, paddle) — "Kale Pong"; tek slider kontrol, lockstep Kıvrım'dan hazır olunca bir hafta sonu ([wiki](https://en.wikipedia.org/wiki/Warlords_(1980_video_game))).

---

## İlk 4 ve yapım sırası

| # | Oyun | Neden | Motor |
|---|---|---|---|
| 1 | **Hırsız Polis** | S–M efor, asimetri + sesle koordinasyon, latency bağışık, Pac-Man Vs.'nin donanım engeli bizde yok | Bomba grid + fog |
| 2 | **Tank 1990** | Türkiye'de nostaljisi en yüksek isim; Bomba grid'i Hırsız Polis'ten sonra sıcak; Düşman Komutan god-mode rolü | Bomba grid + yıkılabilir tuğla |
| 3 | **Topçu** | Dört Flash/DOS klasiğini tek oyunda toplar, latency sıfır, eşzamanlı atış twist'i yeni his verir; arazi kodu Göç'e de hazırlık | Çağlar Savaşı yan görünüm + Balon Avı mermi |
| 4 | **Kartopu** | Balon Avı'nın neredeyse birebir uzantısı, 4 kişi tek ekran; Bubble Bobble 4 Friends talebi kanıtladı | Balon Avı |

Sonra: **Kıvrım** (S ama lockstep altyapısı ister — Yakar Top ve Warlords da bundan yararlanır), **Maden** (Mutfak Kaosu bitince vardiya motoru hazır). **Sofra Rallisi**, **Zindan** ve **Göç** L/latency riskli; ilk dördün sonuçlarına göre.
