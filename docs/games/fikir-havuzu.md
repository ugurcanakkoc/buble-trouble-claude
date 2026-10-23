# Fikir Havuzu — Oyun Gecesi için 9 yeni konsept

Hedef kitle: 2–4 arkadaş, WhatsApp sesli görüşme açık, telefon yatay + PC. Ortak kriter: **konuşmaya zorlayan asimetri, yönetim/upgrade'li co-op kaosu, god-mode benzeri "bozucu" rol, atışma, Türk mahalle tadı.** Reddedilenler (skribbl, Okey, generic listeler) listede yok.

Kısaltmalar: **Efor** S/M/L · **Latency** = 30–130 ms P2P + host-authoritative sim'e uyum · **Motor** = hangi mevcut/tasarlanan oyunla kod paylaşır.

---

## 1. Dolmuş Hattı (Spaceteam × Lovers in a Dangerous Spacetime)

- **İlham/kanıt:** Spaceteam — her oyuncuya rastgele panel, komutlar *başkasının* ekranına düşer, bağırmak tek yol ([wiki](https://en.wikipedia.org/wiki/Spaceteam)). Lovers — tek gemi, istasyonlar arası koşturma, gem'le upgrade ([wiki](https://en.wikipedia.org/wiki/Lovers_in_a_Dangerous_Spacetime)).
- **Çığlık anı:** "ARKADA İNEN VAR DEDİM, KAPIYI AÇ!" — şoför fren yaparken muavin para üstü sayıyor, teyp de bozuldu.
- **Roller / ekran:** Şoför (joystick + yol, yan görünüm 2D, trafik); Muavin (para üstü mini-UI: gelen banknot → doğru üstü ver); Kapıcı (kapı/durak paneli, yolcu kuyruğu); Teypçi-Klimacı (arıza paneli, kaset değiştir). Komut kartları Spaceteam gibi *başka* rolün ekranında çıkar.
- **Telefon:** Şoför joystick+fren; diğerleri 4–6 büyük buton/slider.
- **Latency:** Mükemmel — paneller toggle, araç tek host sim'de; 130 ms hissedilmez.
- **Ölçek:** 1–4. Eksik roller bot (yavaş ama doğru) veya tek kişiye 2 panel.
- **Efor:** M. **Motor:** Paramedik'in komut/panel sistemi + Mutfak Kaosu'nun vardiya/upgrade döngüsü (hat kazancı → yeni dolmuş, klima, "Ankara–Konya" uzun hat).
- **Twist:** **Hain Muavin** modu — bir oyuncunun ekranındaki komutların %20'si sahte; tur sonunda "kim haindi" oylaması. 3–4 kişiyle Project Winter'ın kırmızı telsiz fikrinin minimal hali ([Epic](https://store.epicgames.com/p/project-winter-3b9e84)).

## 2. Gece Bekçisi (Monaco × Operation: Tango)

- **İlham:** Monaco — top-down 1–4 kişilik soygun, sınıf bazlı yetenekler ([Giant Bomb](https://www.giantbomb.com/games/3030-30093/)). Operation: Tango — ajan sahada, hacker ekranları görür, kimse diğerinin ekranını görmez ([PS Blog](https://blog.playstation.com/?p=347233)).
- **Çığlık anı:** Gözcü "kamera 3'te bekçi, DUR" der, Çilingir çoktan koridora girmiştir.
- **Roller / ekran:** Gözcü (sadece kamera karoları + kapı/ışık butonları, haritada hırsızlar yok); Çilingir ve Çantacı (fog-of-war top-down, görüş konisi); 4. oyuncu **Bekçi** (rakip: el feneri, "kim var orda?" — god mode'un rekabetçi hali).
- **Telefon:** Joystick + 2 buton (etkileşim/koş); Gözcü tamamen dokunmatik grid.
- **Latency:** İyi — stealth yavaş tempolu, görüş konisi host'ta hesaplanır.
- **Ölçek:** 2 (Gözcü+Çilingir) – 4. Bekçi yoksa bot devriye.
- **Efor:** L (LOS, kamera UI, seviye tasarımı). **Motor:** Bomba'nın grid haritası + LOS; Mutfak Kaosu'nun dükkânı (ganimet → ekipman).
- **Twist:** Hedef düğün salonundaki **takı kutusu**; alarm çalınca "kına gecesi" kalabalığı sahaya dolar, kalabalıkta saklanabilirsin.

## 3. Yalancı Çaycı (Liar's Bar)

- **İlham:** Liar's Deck — 2–4 kişi, kapalı kart at, "YALANCI" de, yanılan rulet çevirir ([kurallar](https://www.debigare.com/how-to-play-liars-deck-from-liars-bar-full-rules-and-variants/)).
- **Çığlık anı:** Blöfün tutmadığında tepsi döner ve kaynar bardağı sen çekersin.
- **Roller:** Simetrik ama *sesli oda* asimetri yaratır: sadece sıradaki oyuncu kartlarını görür; diğerleri yüz ifadesi yerine sesini okur.
- **Telefon:** Kart seç (3 buton) + "Yalancı!" büyük butonu.
- **Latency:** Alakasız, turn-based.
- **Ölçek:** 2–4; bot blöf olasılığı basit tablo.
- **Efor:** S (sadece HTML overlay, Phaser bile gerekmez). **Motor:** Platform lobby/P2P katmanı doğrudan.
- **Twist:** Rulet yerine **tepsi**: 6 bardak, biri kaynar. Yanan oyuncu 1 tur **sessiz** (mikrofon ikonu kırmızı, sesi olsa da kuralen konuşamaz) — konuşmaya zorlayan oyunun tersi: susmaya zorlamak.

## 4. Körebe (Crawl × körebe/saklambaç)

- **İlham:** Crawl — bir kahraman, diğerleri canavar/tuzak; kahramanı öldüren kahraman olur ([wiki](https://en.wikipedia.org/wiki/Crawl_(video_game))).
- **Çığlık anı:** Ebe karanlıkta "sol kapı mı?" diye sorar, üç kişi aynı anda farklı yön söyler.
- **Roller / ekran:** Ebe'nin ekranı siyah; sadece ses halkaları (adım, kapı gıcırtısı) ve dokunarak hissettiği 1 karo. Hayaletler tam haritayı görür, tuzak kurar, "ses" yaratır. Ebe birini yakalarsa roller değişir (Crawl swap).
- **Telefon:** Ebe joystick; hayaletler haritaya dokun = tuzak/ses.
- **Latency:** İyi — yavaş hareket, dokunma etkileşimi.
- **Ölçek:** 2–4; hayalet botlar rastgele ses üretir.
- **Efor:** M. **Motor:** Bomba'nın grid'i, Balon Avı'nın god-mode rolü (hayalet = god mode'un rekabetçi versiyonu).
- **Twist:** Tüm oyuncular aynı WhatsApp odasında → hayaletler ebeyi **sesle** kandırır; oyun bunu yasaklamaz, ödüllendirir ("yalan yön" sayacı tur sonu tabloda).

## 5. Yakar Top: Mahalle Ligi

- **İlham:** Yakan top — vurulan yanar, havada tutan yanmaz + can kazanır, tek kalana 12 atış ([MEB PDF](https://bagcilarertugrulgazi.meb.k12.tr/meb_iys_dosyalar/34/27/742609/dosyalar/2023_11/10130220_yakantopkurallar.pdf), [egitimsistem](https://www.egitimsistem.com/yakan-top-oyunu-kurallari-ve-kisaca-oynanisi-111161h.htm)).
- **Çığlık anı:** Son kişi kaldın, 12 atış, her tutuşta arkadaşın geri geliyor.
- **Roller:** 2v2 — ortadakiler vs çizgidekiler; pozisyonlar yarıda değişir.
- **Telefon:** Joystick + Tut (zamanlamalı) + Fırlat (basılı tut = güç).
- **Latency:** Dikkat — hızlı top. Çözüm: atış 300 ms wind-up ile telegraflanır, tutma penceresi geniş (±150 ms), host-authoritative + basit interpolasyon.
- **Ölçek:** 1–4 bot kolay (koş-tut-at state machine). 2 kişi = 1v1 + bot eşler.
- **Efor:** M. **Motor:** Balon Avı'nın arena + top fiziği.
- **Twist:** **"Cam kırıldı!"** olayı — top apartman camına girer, bir oyuncu zil çalıp "topu alabilir miyiz teyze" mini-görevi yaparken takımı dondurulur.

## 6. Survivor: Gözü Bağlı Parkur (We Were Here × Survivor iletişim oyunu)

- **İlham:** We Were Here — iki oyuncu ayrı odalarda, sadece telsiz, aynı anda tek kişi konuşabilir ([Epic](https://store.epicgames.com/p/we-were-here-8867b1)). Survivor parkur/dokunulmazlık formatı ([Hürriyet](https://hurriyet.com.tr/haberleri/survivor-performans-oyunu)); gözü bağlı yönlendirme oyunları şovun klasik formatı, birebir kaynak doğrulanmadı.
- **Çığlık anı:** "SOL DEDİM — SENİN SOLUN, BENİM DEĞİL!"
- **Roller / ekran:** Rehber kuşbakışı haritayı görür; Koşucu sadece 2 karo yarıçap + rastgele döndürülmüş kamera (kuzey aşağıda olabilir). 2v2'de iki takım **aynı sesli odada** → şifreli kelimeler gerekir.
- **Telefon:** Koşucu joystick; Rehber haritaya dokunur (işaret koyma yok, sadece bakma — konuşmak zorunda).
- **Latency:** Mükemmel.
- **Ölçek:** 2 (co-op zaman rekoru) – 4 (2v2). Bot rehber yok; 3 kişide 2v1+süre handikapı.
- **Efor:** S. **Motor:** Bomba grid + fog; Paramedik'in "ayrı ekran" prensibi.
- **Twist:** Son etap "**sembol bulmacası**": rehber sembolü görür ama *adını bilmez*, tarif eder; koşucu 6 sembolden seçer.

## 7. Perili Köşk TV (Content Warning)

- **İlham:** Content Warning — 2–4 kişi korkunç şeyleri filme çeker, izlenme = başarı, reklam geliri ekipman alır ([Landfall](https://landfall.se/content-warning)).
- **Çığlık anı:** Kameraman arkadaşı yem olarak öne iter, canavar kadraja girer, pil biter.
- **Roller / ekran:** Kameraman (sadece vizör, dar görüş, pil); Yemci (geniş görüş, canavarı çeker); Işıkçı (feneri yönetir, karanlıkta kameraman kör); Montajcı (tur sonu 30 sn klip-kes mini-oyunu, izlenme buna göre).
- **Telefon:** Joystick + 1–2 buton; Montaj = timeline slider.
- **Latency:** İyi — canavar host'ta, "kadrajda mı" host karar verir.
- **Ölçek:** 2–4; bot Işıkçı/Yemci basit takip AI.
- **Efor:** L. **Motor:** Mutfak Kaosu'nun rol + dükkân + vardiya ("3 bölüm, kanal kapanmasın") sistemi neredeyse birebir.
- **Twist:** Yüklenen videoya sahte **Türk yorumları** üretilir ("montaj belli", "abi bu Konya'daki köşk mü"); yorum türü sonraki bölüm izlenmesini etkiler.

## 8. Bayram Turu (Pummel Party meta-board)

- **İlham:** Pummel Party — tahta + mini oyunlar, eşyalarla sabotaj, botlar boş yerleri doldurur ([Xbox](https://www.xbox.com/en-US/games/store/-/9P1V4FPR7NBL)).
- **Çığlık anı:** Son karede "Akraba sorusu" kartı yedin: "Ne zaman evleniyorsun?" — 1 tur donuksun, harçlığı kaptırdın.
- **Roller:** Simetrik tahta; mini oyunlar **mevcut oyunların 60 sn modları** (Balon Avı skor yarışı, Bomba son kalan, Yakar Top 1v1v1v1).
- **Telefon:** Tahta = dokunmatik; mini oyunlar kendi kontrolleri.
- **Latency:** Tahta turn-based; mini oyunlar zaten çözülmüş.
- **Ölçek:** 1–4, bot zar atar + mini oyunlarda mevcut botlar.
- **Efor:** M (tahta+eşyalar), mini oyun maliyeti sıfır. **Motor:** Tümü — platformun "gece" akışı olur; Mutfak Kaosu/Paramedik de ileride 90 sn mini mod verebilir.
- **Twist:** Eşyalar bayram temalı: Kolonya (rakibi geri kaydır), Şeker (ekstra zar), **Çocuk Akrabalar** (rakibin mini-oyun ekranına rastgele dokunan god-mode hayaletleri 10 sn).

## 9. Anneanne vs Torun (Who's Your Daddy)

- **İlham:** Who's Your Daddy — bebek kendine zarar vermeye çalışır, baba engeller; asimetrik 1v1 ([Steam](https://store.steampowered.com/app/427730/Whos_Your_Daddy/)).
- **Çığlık anı:** Torun prize uzanırken anneanne mutfakta, kedi kapıyı açtı, zil çalıyor.
- **Roller / ekran:** Torun (yan görünüm ev, 5 tehlike hedefi, küçük/hızlı); Anneanne (yavaş ama eşya taşır, kapı kilitler); 3–4. oyuncu **Kedi** ve **Kapıcı** — kaos ajanları, her tur taraf değiştirir.
- **Telefon:** Joystick + Zıpla/Al; Kedi tek buton "devir".
- **Latency:** Orta — platformer; zıplama host'ta, 130 ms'de biraz "kaygan", hız düşük tutulur.
- **Ölçek:** 2–4; Kedi/Kapıcı bot rastgele olay üretir.
- **Efor:** M. **Motor:** Balon Avı'nın god-mode katmanı + platform fiziği.
- **Twist:** 90 sn'de roller döner; sezon sonu "**el öpme**" sahnesi: kazanan torun harçlık alır, puan tablosu bayram harçlığı cinsinden.

---

## Sıralama (ilk 4)

| # | Konsept | Neden | Paylaşılan motor |
|---|---|---|---|
| 1 | **Dolmuş Hattı** | Konuşmaya en çok zorlayan format; latency'ye bağışık; Hain Muavin ile atışma; Türk tadı en yüksek | Paramedik panel/komut sistemi + Mutfak Kaosu upgrade döngüsü |
| 2 | **Bayram Turu** | Mevcut 3 oyunu tek "gece akışı"na bağlar, içerik maliyeti sıfıra yakın, her yeni oyun otomatik mini-oyun olur | Hepsi; lobby/P2P katmanı |
| 3 | **Körebe** | Rol takası = rekabetçi atışma; sesli oda kandırmacası tasarımın parçası; Bomba grid'i hazır | Bomba grid + Balon Avı god-mode |
| 4 | **Gözü Bağlı Parkur** | Efor S, bir haftasonu çıkar; aynı sesli oda sorununu (2v2 herkes duyar) özelliğe çevirir | Bomba grid/fog + Paramedik ayrı-ekran prensibi |

Yedek: **Yalancı Çaycı** (S, sadece overlay — "ara oyun" olarak hızlı kazanç) ve **Anneanne vs Torun** (god-mode'un en komik hali, ama platformer latency riski).

Not: Gece Bekçisi ve Perili Köşk TV en güçlü "büyük oyun" adayları, ancak L efor; Mutfak Kaosu bittikten sonra onun rol/dükkân motoruyla yeniden değerlendirilmeli.
