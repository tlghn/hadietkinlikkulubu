# HADİ Sosyal sayfası üreticisi (hadi-sosyal.html + assets/css/hadi-sosyal.css).
# KURAL (kurucu, 2 Kasım 2026): uygulamaya eklenen her özellik ve her değişiklik bu sayfaya da işlenir.
#   1) Aşağıdaki F listesine (emoji, ad, tek cümle[, assets/img/app görseli]) ekle / çıkar; vitrin için SPOT.
#   2) VER'i artır (Cloudflare önbelleği için) ve çalıştır:  python tools/hadi_sosyal_sayfa.py
#   3) Diğer sayfalardaki ?v= ekleri de VER ile aynı olmalı (betik eski eki değiştirir).
# Yalnızca üyelere açık, canlı özellikler; test/kapalı hizmetler, ekip araçları ve kesin fiyat/ödül rakamları yazılmaz.
import io, os, re, glob
R = r'D:\hadietkinlikkulubu'
APP = 'https://hadisosyal.com/'
IMG = 'assets/img/app/'
VER = '20261102p'
ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'

# Vitrin: büyük, fotoğraflı anlatım (sırayla sol/sağ)
SPOT = [
  ('hero_etkinlikler', '--h', 'Etkinlikler', 'Şehrin en güzel planları tek dokunuşta',
   'Öne çıkanlar, sana özel öneriler ve harita görünümüyle etkinliği bul; QR biletinle kapıdan saniyeler içinde gir. Bilet aldığın an etkinliğin sohbetine katılır, anıları ortak albümde toplarsın.',
   ['QR bilet', 'Sekmeli etkinlik sayfası', 'Etkinlik menüsü', 'Paylaşımlı yolculuk']),
  ('card_etk_simdi', '--a', 'Şimdi HADİ!', '“Kahveye çıkıyorum, kim gelir?”',
   'Plan yapmaya gerek yok. Çevrendeki üyelere birkaç saatlik anlık buluşma çağrısı aç; kahve, yürüyüş, maç… Gelenlerle hemen buluş.',
   ['Anlık buluşma', 'Kahve Eşleşmesi', 'Etkinlik Çarkı']),
  ('hero_sohbet', '--i', 'Sohbet', 'Arkadaşlarınla her şey tek yerde',
   'Sesli mesaj, canlı konum, 10 fotoğraflık galeriler, tepkiler, konular görünümü ve sohbet içi oyunlar. İstersen uçtan uca şifreli gizli sohbet: içeriği HADİ dahil kimse okuyamaz.',
   ['Gizli sohbet', 'Kaybolan mesajlar', 'Sohbet oyunları', 'Kaldığın yerden devam']),
  ('wiz_privacy', '--ink', 'Güvenlik', 'Güven, her şeyin başı',
   'Güvenli buluşma modunda güvendiğin kişilere “Güvende misin?” kontrolü ve PANİK düğmesi. Fotoğraflardaki yüzleri paylaşmadan önce bulanıklaştır, kimliğini doğrula, taciz kalkanını aç.',
   ['PANİK düğmesi', 'Yüz bulanıklaştırma', 'Kimlik doğrulama', 'Taciz kalkanı']),
  ('hero_eglence', '--d', 'Lunapark', 'Oyna, kazan, eğlen',
   'Okey, 101, Tavla, Batak, King, Pişti, Satranç, Mangala… Rakip yoksa bot hazır. Günlük bulmacalar, canlı bilgi yarışması, görevler ve Akçe ödülleri.',
   ['Klasik oyunlar', 'Günlük bulmaca', 'Canlı yarışma', 'Görevler']),
  ('hero_yasam', '--d', 'Sağlık', 'Kendine iyi bak, birlikte',
   'AI personal trainer ve sağlık koçu, uyku ve nefes egzersizleri, yoga, adım yarışı, sigarayı bırakma sayacı ve iyi oluş günlüğü.',
   ['AI Trainer', 'Uyku ve nefes', 'Adım yarışı', 'Sigarayı bırak']),
  ('card_kitap', '--a', 'Kitap kulübü', 'Ayın kitabını birlikte oku, birlikte dinle',
   'E-kitap ve sesli kitap; dinlerken okunan kelime ekranda vurgulanır. Kulübünle ayın kitabını oyla, sesli kitabı aynı anda dinleyin.',
   ['Sesli kitap', 'Kitap kulübü', 'Türk klasikleri ücretsiz']),
  ('wiz_theme', '--pink', 'Temalar', 'Uygulama tam senin zevkinde',
   'Sinema, sanat, müzik, doğa ve şehir esintili 60’tan fazla tema; koyu mod, renk körlüğüne uygun ve yüksek kontrastlı seçenekler. Profilini arka planla, yazı tipiyle, çerçeveyle kişiselleştir.',
   ['60+ tema', 'Koyu mod', 'Profil stili', 'Erişilebilir']),
]

# Tüm özellikler, tek tek (kategori başlığı yok). (emoji, ad, açıklama[, görsel])
F = [
 ('🧭','Akıllı etkinlik keşfi','Öne çıkanlar, sana özel öneriler, süzgeçler ve harita ile şehrindeki etkinlikleri anında bul.','card_etk_harita'),
 ('🎟️','QR bilet','Sana özel QR biletinle kapıda saniyeler içinde giriş yap.'),
 ('💬','Etkinlik sohbeti','Bilet aldığın an etkinliğin sohbetine katıl, yola çıkmadan tanış.'),
 ('📸','Ortak etkinlik albümü','Fotoğraf ve videolar katılımcılara özel albümde toplanır.','cover_etk_gezi'),
 ('🗂️','Sekmeli etkinlik sayfası','Özet, Menü, Yolculuk, Sosyal, Şeffaflık ve Kurallar sekmeleriyle aradığın her şey bir dokunuş uzağında.'),
 ('🍽️','Etkinlik menüsü','Fix, set ya da alakart menüyü önceden gör; bilete dahil olanlar ve ayrıca ödenenler açıkça yazar.'),
 ('🚗','Paylaşımlı yolculuk','Aracını paylaş: rota ve buluşma noktaları kendiliğinden çıkar; yakıt türü, tüketim ve fiyatı sen ayarlarsın, hesap açıkça görünür.'),
 ('🙋','Yolculuk talebi','Henüz araç yoksa “Paylaşımlı yolculuk istiyorum” de; araç açılınca haber gelir.'),
 ('🚙','Araçlarım','Ruhsatını okut, aracın bir kez eklensin; okunan bilgiler değiştirilemez, şifreli saklanır, her yolculuğun raporu tutulur.'),
 ('🪪','Doğrulanmış sürücüler','Araç paylaşan herkesin ehliyeti doğrulanır ve her yolculukta geçerliliği kontrol edilir; kimlik doğrulamalı etkinliklerde ehliyet sahibinin kimliği de eşleşir.'),
 ('🎫','QR ile biniş','Yolcu biletini sürücüye okutur, biniş kesinleşir; masraf payı anında sürücüye geçer.'),
 ('🆘','Yolculukta güvenlik','Yolculuğa özel oda (yalnızca şoför ve onaylı yolcular), şoförle birebir sesli arama, gecikme bildirimi ve yönetime konumlu PANİK düğmesi.'),
 ('✅','Şoför onaylı rezervasyon','Yer ayırttığında talebin şoföre gider; onaylayınca kesinleşir, onaylanmazsa ücretin tamamen iade edilir. Engellediğin kişiler araçlarını göremez.'),
 ('🧺','Getir listesi','Piknik ve kampta ne getireceğini üstlen, bir gün önce hatırlatma al.'),
 ('⏳','Bekleme listesi','Etkinlik doluysa sıraya gir; yer açılınca otomatik katılırsın.'),
 ('📅','Takvime ekle','Etkinliği telefonunun takvimine ekle, bir gün önce hatırlatma gelsin.'),
 ('⭐','Karşılıklı değerlendirme','Etkinlik sonrası katılımcılar birbirini değerlendirir; güvenilir bir topluluk böyle büyür.'),
 ('💡','Etkinlik öner','Aklındaki etkinliği öner, topluluk oylasın, takvime girsin.'),
 ('🛠️','Kendi etkinliğini düzenle','Premium üyeler etkinliğini yapay zekâ sihirbazıyla oluşturup onaya gönderir.'),
 ('⚡','Şimdi HADİ!','Çevrendeki üyelere birkaç saatlik anlık buluşma çağrısı aç.','card_etk_simdi'),
 ('☕','Kahve Eşleşmesi','Rızanla katıl; her hafta ilgi alanların uyan bir üyeyle kahvede tanış.','cover_etk_tanisma'),
 ('🎡','Etkinlik Çarkı','“Ne yapsak?” diyorsan çarkı çevir, çıkan fikri etkinlik olarak öner.'),
 ('🖼️','Görseller akışı','Fotoğraf ve videoları kaydırarak keşfet.'),
 ('✍️','Yazılar','Kısa yazılarla düşünceni paylaş.'),
 ('🎬','Anlar','90 saniyeye kadar dikey videolar çek ve paylaş.'),
 ('🎨','Gelişmiş düzenleyici','Filtreler, animasyonlu yazılar ve HADİ çıkartma paketleri.'),
 ('⏰','Zamanlanmış gönderi','Gönderini ileri bir saate zamanla, o an kendiliğinden yayınlansın.'),
 ('🎵','Gönderiye müzik','Lisanslı kitaplıktan parça seç, şarkı sözleri fotoğrafının üstünde aksın.','card_etk_muzik'),
 ('🤩','Yüz efektleri','Taç, gözlük, konfeti… Kamerada eğlenceli yüz efektleri dene.'),
 ('🎈','AR Dünya','Kamerada odana 3B balonlar ve hediyeler yerleştir.'),
 ('✂️','Kendi çıkartmanı yap','Fotoğrafından çıkartma oluştur; kesme işlemi telefonunda yapılır.'),
 ('💡','Işığı düzelt','Karanlık fotoğrafın ışığını tek dokunuşla ücretsiz düzelt.'),
 ('🪄','Fotoğraf onarma','Eski fotoğrafları yapay zekâyla onar ya da renklendir.'),
 ('📲','Video olarak dışarıda paylaş','Gönderilerin WhatsApp ve Instagram’a şık kısa videolar olarak gider.'),
 ('🚀','Gönderini tanıt','Daha çok kişiye ulaşmak için gönderine tanıtım yap.'),
 ('🔍','Akıllı arama','Üyeleri, etiketleri, etkinlikleri ve hizmetleri tek kutudan bul.'),
 ('⭕','Story','Müzik, anket, soru ve geri sayım çıkartmalarıyla 24 saatlik story.'),
 ('💚','Yakın arkadaşlar','Story’ni yalnızca yakın arkadaşların görsün.'),
 ('📌','Öne çıkanlar','Süresi dolan story’lerini profilinde kalıcı sergile.'),
 ('👻','Snap','En çok 1, 2 ya da 3 kez açılabilen anlık fotoğraf gönder.'),
 ('🗒️','Notlar','Mesajlar listesinin üstünde 24 saatlik kısa durumunu paylaş.'),
 ('📣','Story’ni öne çıkar','Seni takip etmeyenlerin story şeridinde de görün.'),
 ('🔴','Canlı yayın','Tek dokunuşla görüntülü yayın aç, kullanmadığın süre iade edilir.','hero_aktuel'),
 ('🎙️','Sesli odalar','Konuşmaya katıl ya da kendi sohbet odanı aç.'),
 ('✋','Söz iste','Dinleyiciler el kaldırır, yayıncı söz verir.'),
 ('🛡️','Yayın moderatörleri','Yayınına moderatör ata; yorum sabitlesinler, odayı düzenlesinler.'),
 ('🎧','Temiz ses','Gürültü ve yankı engelleme; web’de ses efektleri ve arka plan filtreleri.'),
 ('🤐','Küfür koruması','Küfürlü konuşanın mikrofonu otomatik kapanır; ses kaydedilmez.'),
 ('🎁','Canlı hediyeler','Sevdiğin yayıncıya yayın sırasında hediye gönder.'),
 ('🗣️','Sesli mesaj','Yazmak yerine konuş; sesli mesaj gönder.','hero_sohbet'),
 ('📍','Canlı konum','Buluşmaya giderken konumunu canlı paylaş.'),
 ('🖼️','Galeri paylaşımı','Tek seferde 10 fotoğrafa kadar galeri gönder; isteğinle grupla ya da tek tek göster.'),
 ('🖌️','Göndermeden düzenle','Fotoğrafa çiz, yazı ekle; yüz, plaka ya da adresi pikselleştir.'),
 ('🏷️','Fotoğrafta etiketleme','Sohbet fotoğraflarında arkadaşlarını etiketle; etiketlenen kendi gönderisinde paylaşabilir.'),
 ('⌛','Kaybolan mesajlar','Mesajlar 24 saat, 7 gün ya da 90 gün sonra kendiliğinden silinsin.'),
 ('😍','Mesaj tepkileri','Mesajlara emojiyle tepki ver.'),
 ('✏️','Mesajı düzenle','Gönderdiğin mesajı sonradan düzelt.'),
 ('📌','Mesaj sabitleme','Önemli mesajları sohbetin üstüne sabitle.'),
 ('🧵','Konular görünümü','Kalabalık grupları konu başlıklarına ayırarak oku.'),
 ('🎲','Sohbet oyunları','Sohbetin içinde kelime oyunu, zar turu ve düello oyna.'),
 ('🤖','Sohbet botları','Botlu odalarda karakterler yalnızca odada üye varken konuşur: sohbete katılır, alıntılayarak yanıtlar, güler, emoji ve tepki bırakır; kendi aralarında konuşmaz.'),
 ('🌅','Fotoğraflı duvar kâğıdı','Sohbet balonları seçtiğin fotoğrafın renklerine uyar.'),
 ('👁️','Görüldü bilgisi','Grup ve kanallarda mesajını kaç kişinin gördüğünü bil.'),
 ('↩️','Kaldığın yerden devam','Sohbet son okuduğun yerden açılır; aşağıda kaç mesaj beklediğini görürsün.'),
 ('🔐','Gizli sohbet','Uçtan uca şifreli birebir sohbet; içeriği HADİ sunucuları da göremez.','wiz_privacy'),
 ('📢','@hepsi duyurusu','Gruptaki herkese tek mesajla bildirim gönder.'),
 ('🏕️','Topluluklar','Kamp, kitap, dalış… İlgi alanına göre topluluğa katıl ya da kendininkini kur.','cover_etk_doga'),
 ('🧩','Hazır şablonlu gruplar','Kitap Kulübü, Koşu, Gezi & Kamp, Mahalle şablonlarıyla hemen grup aç.'),
 ('📚','Kitap kulübü','Ayın kitabını oylayın, sesli kitabı birlikte dinleyin.','card_kitap'),
 ('📡','Kanallar','İlgini çeken kanallara abone ol, duyuruları kaçırma.'),
 ('🗳️','Anketler','Kulüp anketlerine katıl, sonuçları canlı izle; istersen anonim oy ver.'),
 ('🎭','Topluluk takma adı','Her toplulukta farklı bir adla görünebilirsin.'),
 ('🎂','Doğum günleri','Bugün doğanları tek dokunuşla kutla; yaşın hiçbir yerde görünmez.'),
 ('🔮','Fal ve burçlar','Burç yorumu ve günün tarot kartı ücretsiz; kahve falı ve yıldız haritası da var.'),
 ('🧑‍🏫','Yaşam Koçları','Kariyer, öğrenci, ilişki ve aile konularında yapay zekâ koçlarıyla konuş.'),
 ('💄','Makyaj ve moda asistanı','Makyaj rutini al, dolabını fotoğrafla, kombin önerisi iste.'),
 ('✈️','Seyahat planlayıcı','Gideceğin yere göre gün gün gezi planı çıkar.','cover_etk_gezi'),
 ('🍳','Mutfak şefi','Elindeki malzemelerle tarif öner.','cover_etk_yeme'),
 ('🗨️','Dil partneri','Yabancı dil pratiği yap.'),
 ('🎁','Hediye fikri','Sevdiğine ne alacağını birlikte bulun.'),
 ('🛋️','Ev dekoru','Odanı fotoğrafla, dekor önerisi al.'),
 ('💇','Saç modeli','Yüz şekline göre saç modeli önerisi al.'),
 ('📄','CV ve mülakat','Özgeçmişini güçlendir, mülakata hazırlan.'),
 ('🌟','Influencer Stüdyosu','Söz duvarı, caps ve “Bu mu O mu” kartları hazırla, içerik takvimini kur.'),
 ('🎥','AI video','Hazır şablon videolarda kendi yüzünle başrole geç.'),
 ('💱','HADİ Finans','Günlük kurlar, bülten, kur alarmları ve finans asistanı.','hero_cuzdan'),
 ('🀄','Okey ve 101','Okey ve 101 Okey; rakip yoksa botla oyna.','hero_eglence'),
 ('🎲','Tavla','Klasik tavla keyfi, istediğin an.'),
 ('🃏','Batak, King, Pişti','Kâğıt oyunlarının klasikleri bir arada.'),
 ('♟️','Satranç ve Mangala','Strateji sevenler için.'),
 ('🔤','Günün Kelimesi','Her gün yeni bir kelime bulmacası; sıralamaya gir.'),
 ('🔢','Sudoku ve Kelime Avı','Günlük bulmacalarla zihnini çalıştır.'),
 ('🏆','Canlı bilgi yarışması','Herkesle aynı anda yarış ya da takım kurup oyun gecesine katıl.'),
 ('🎯','Görevler ve seri','Günlük ve haftalık görevlerle XP ve Akçe kazan, serini büyüt.'),
 ('🐷','Kumbara','Akçe’ni vadeye yatır, vade sonunda üstüne ödülle geri al.'),
 ('📻','Benim Radyom','Kulübün lisanslı müzik radyosu; sözleri takip et, emojiyle tepki ver.'),
 ('🏋️','AI Personal Trainer','Hedefine göre program al, animasyonlu hareketlerle antrenman yap.','cover_etk_spor'),
 ('🥗','AI Sağlık Koçu','Su, öğün ve günlük dengen tek ekranda.'),
 ('😴','Uyku takibi','Uykunu kaydet, düzenini gör.'),
 ('🌬️','Nefes ve sakinleşme','Nefes egzersizleri ve SOS sakinleşme anında yanında.'),
 ('🧘','Yoga & pilates','Evde uygulayabileceğin akışlar.','hero_yasam'),
 ('🚭','Sigarayı bırak','Canlı sayaçla biriken parayı ve bedenindeki iyileşmeyi gör.'),
 ('👟','Adım yarışı','Arkadaşlarınla grup adım meydan okuması başlat.'),
 ('📓','İyi oluş günlüğü','Ruh hâlini kaydet, kendini daha iyi tanı.'),
 ('🪑','Postür molası','Masa başında mola hatırlatmaları al.'),
 ('🎨','60’tan fazla tema','Sinemadan İznik çinisine; koyu mod ve renk körlüğü dostu temalar.','wiz_theme'),
 ('✨','Profil stili','Profiline arka plan, yazı tipi, efekt ve çerçeve seç (Premium).'),
 ('👥','Ayrı profiller','Arkadaşlarına ve iş çevrene ayrı fotoğraf ve biyografi göster.'),
 ('❓','Bana sor','Profilinden soru al, istersen anonim; beğendiğin cevapları sergile.'),
 ('🧳','Seyahat modu','Başka şehre gidince profilinde “Seyahatte” görün.'),
 ('💼','Profesyonel profil','Mesleğini tanıt, randevu ve teklif talepleri al.'),
 ('⚖️','Dijital denge','Günlük kullanım sınırı koy, gece modunu aç, haftalık özetini gör.'),
 ('🔠','Yazı boyutu','Yazıları beş kademede büyüt ya da küçült.'),
 ('🔗','Profilini paylaş','QR kart, story ya da bağlantı olarak paylaş.'),
 ('🛡️','Gizlilik Merkezi','Gizlilik puanını gör; Açık, Dengeli, Gizli ya da Hayalet profil seç.'),
 ('😶‍🌫️','Yüz bulanıklaştırma','Paylaşmadan önce fotoğraftaki başkalarının yüzlerini bulanıklaştır.'),
 ('🙈','Yüzüm görünmesin','Rıza verirsen yüzün seçtiğin kitle dışında otomatik bulanıklaştırılır.'),
 ('🆘','Güvenli buluşma modu','“Güvende misin?” kontrolü ve PANİK düğmesiyle güvendiğin kişilere haber ver.'),
 ('🧱','Taciz kalkanı','İstersen sana yalnızca kimliği doğrulanmış üyeler ulaşabilsin.'),
 ('🪪','Kimlik doğrulaması','NFC çip ve rehberli yüz çekimiyle doğrula; yüz verin telefonunda işlenir.'),
 ('🔑','İki adımlı doğrulama','Hesabına ikinci bir kilit ekle; yeni cihaz girişlerinde uyarı al.'),
 ('🤝','Güvenilir kişilerle kurtarma','Hesabına erişemezsen güvendiğin kişiler yardım etsin.'),
 ('📍','Konum temizliği','Fotoğraflardaki gizli konum bilgisi yüklenmeden silinir.'),
 ('🧹','Otomatik silme','Mesajlar, arşiv ve destek kayıtları için otomatik silme kur.'),
 ('📦','Verilerini indir','Tüm verilerinin kopyasını al, rıza makbuzlarını gör.'),
 ('❄️','Hesabı dondur','Ara vermek istediğinde hesabını dondur, hazır olunca dön.'),
 ('💎','Elmas','Uygulama içi para birimi; fiyatlara KDV dahildir. Biletler, yolculuk, canlı yayın ve işletme ödemeleri satın aldığın ve canlı yayında topladığın Elmas’la yapılır.','hero_cuzdan'),
 ('🏦','Havale ile Elmas','HADİ Web’de havale/EFT ile paket ya da “Diğer” seçip istediğin miktarda Elmas al.'),
 ('🪙','Akçe','Görevler, oyunlar ve ödüllerle kazanılır; Akçe kabul eden hizmetlerde harcanır.'),
 ('🔄','Akçe Market','Elmas ile Akçe’yi diğer üyelerle takas et.'),
 ('🧾','Şeffaf hareketler','Bütün harcamalarını gör; kullanılmamış Elmas için iade iste.'),
 ('👑','HADİ Premium','İndirimler, profil stili, altın çerçeveli gönderiler ve etkinlik oluşturma; fiyatlara KDV dahildir.'),
 ('✔️','Doğrulanmış hesap','Mavi tik al, story’ni 48 saate uzat.'),
 ('🎀','Hediyeler','Klasik ve 3B hediyeler; bayramlarda sınırlı sayıda sezonluk hediyeler.'),
 ('❤️','Bağış','Onaylı vakıf ve derneklere bağış yap.'),
 ('⭐','Üye abonelikleri','Sevdiğin üreticilere aylık abone ol.'),
 ('👕','HADİ Mağaza','Tişört, kupa ya da kapüşonluyu kendi yazınla tasarla; kargoyla al.','card_magaza'),
 ('🎧','Sesli kitap','Dinlerken okunan kelime ekranda vurgulanır; Türk klasikleri ücretsiz.'),
 ('🍽️','Rezervasyon ve sipariş','İşletmelerden randevu al, sipariş ver: gel-al, masaya, kurye ya da kargo.','cover_etk_yeme'),
 ('🏷️','Kampanya ve kuponlar','İşletmelerin indirim, kupon ve damga kartlarından yararlan.'),
 ('💳','Kartla güvenli ödeme','Ödemen, sipariş teslim edilene kadar işletmeye geçmez.'),
 ('🛵','Kurye ol','Kimliğini doğrula, HADİ’de kurye olarak çalış.'),
 ('🏪','İşletme hesabı','İşletmeni HADİ’ye taşı, topluluğa ulaş.'),
 ('🎓','HADİ Akademi','Özellikleri deneyerek öğren; ders ve modüllerde Akçe kazan, rozet topla.','hero_yetenekler'),
 ('💌','Arkadaşını davet et','Arkadaşın ilk etkinliğine gelince ikinize de Akçe.'),
 ('🎖️','Elçi programı','Şehrinde HADİ Elçisi ol, topluluğu büyüt.'),
 ('🎉','Hoş geldin hediyesi','Hesabın açılınca başlangıç Elmas’ı ve Akçe’si cüzdanına yüklenir.','evim_eglenceli'),
 ('🏅','Başarılarını paylaş','Fal, oyun, rozet ve etkinlik kartlarını story olarak paylaş.'),
 ('🛟','HADİ Destek','Sorunu sor; işlemi cevabın altındaki düğmelerle oradan hallet.'),
 ('📞','Sesli destek','Destek’le konuşarak yardım al; temel katman ücretsiz.'),
 ('👆','Bana göster','Gideceğin ekranı rehberli turla adım adım gösterir.'),
 ('🙋','İnsana bağlan','İstersen doğrudan destek ekibinden bir kişiye yaz.'),
 ('🚨','Acil güvenlik bildirimi','Taciz ya da acil durumu hemen ekibe ilet.'),
 ('🗺️','Yol haritası','Fikrini öner, planlanan yenilikleri oyla ve takip et.'),
]
COLORS = ['--h', '--a', '--d', '--i', '--pink']

def esc(s): return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

src = io.open(os.path.join(R, 'hakkimizda.html'), encoding='utf8').read()
head = src[:src.index('<main id="icerik">')]
foot = src[src.index('</main>'):]
TITLE = 'HADİ Sosyal | HADİ Etkinlik Kulübü'
N = len(F)
DESC = f'HADİ Sosyal’da tam {N} özellik: etkinlikler, QR bilet, anlık buluşmalar, gizli sohbet, canlı yayın, oyunlar, sağlık, temalar… Üyelik ücretsiz.'
head = head.replace('<title>Hakkımızda | HADİ Etkinlik Kulübü</title>', f'<title>{TITLE}</title>')
for k in ('name="description"', 'property="og:description"', 'name="twitter:description"'):
    head = re.sub(r'(<meta ' + re.escape(k) + r' content=")[^"]*', lambda m: m.group(1) + DESC, head)
head = head.replace('Hakkımızda | HADİ Etkinlik Kulübü', TITLE).replace('https://hadietkinlikkulubu.com/hakkimizda', 'https://hadietkinlikkulubu.com/hadi-sosyal')
head = head.replace(' aria-current="page"', '')
head = head.replace(f'<link rel="stylesheet" href="assets/css/style.css?v={VER[:-1]}b">', f'<link rel="stylesheet" href="assets/css/style.css?v={VER}">')
head = re.sub(r'<link rel="stylesheet" href="assets/css/style\.css\?v=[^"]*">', f'<link rel="stylesheet" href="assets/css/style.css?v={VER}">\n<link rel="stylesheet" href="assets/css/hadi-sosyal.css?v={VER}">', head)
head = head.replace('<meta property="og:image" content="https://hadietkinlikkulubu.com/assets/img/og-hadi.jpg">', '<meta property="og:image" content="https://hadietkinlikkulubu.com/assets/img/og-hadi.jpg">')

letters = ''.join(f'<img class="hx-l" src="{IMG}{c}.webp" alt="" width="72" height="96" style="--n:{i}">' for i, c in enumerate('HADI'))
marquee_items = ''.join(f'<span>{e} {esc(t)}</span>' for e, t, *_ in F[:60])

spots = []
for i, (img, c, kicker, h, p, tags) in enumerate(SPOT):
    spots.append(f'''  <article class="hx-spot{' hx-spot--rev' if i % 2 else ''} reveal" style="--c:var({c})">
    <div class="hx-spot-img"><img src="{IMG}{img}.webp" alt="" loading="lazy" decoding="async"></div>
    <div class="hx-spot-txt">
      <span class="hx-kicker">{esc(kicker)}</span>
      <h3>{esc(h)}</h3>
      <p>{esc(p)}</p>
      <ul class="hx-tags">{''.join(f'<li>{esc(t)}</li>' for t in tags)}</ul>
    </div>
  </article>''')

cards = []
for i, f in enumerate(F):
    e, t, d = f[0], f[1], f[2]
    img = f[3] if len(f) > 3 else None
    c = COLORS[i % len(COLORS)]
    key = esc((t + ' ' + d).lower())
    if img:
        cards.append(f'<article class="hx-f hx-f--img" style="--c:var({c})" data-q="{key}"><img src="{IMG}{img}.webp" alt="" loading="lazy" decoding="async"><div><span class="hx-ic" aria-hidden="true">{e}</span><h3>{esc(t)}</h3><p>{esc(d)}</p></div></article>')
    else:
        cards.append(f'<article class="hx-f" style="--c:var({c})" data-q="{key}"><span class="hx-ic" aria-hidden="true">{e}</span><h3>{esc(t)}</h3><p>{esc(d)}</p></article>')

main = f'''<main id="icerik" class="hx">
<section class="hx-hero">
  <img class="hx-hero-bg" src="{IMG}hero_etkinlikler.webp" alt="" fetchpriority="high">
  <div class="wrap hx-hero-in">
    <div class="hx-hero-txt">
      <div class="hx-letters" aria-hidden="true">{letters}</div>
      <h1>Kulüp cebinde.<br><span>HADİ Sosyal.</span></h1>
      <p class="hx-lead">Etkinliklere katıldığın, arkadaşlarınla buluştuğun, oynadığın, öğrendiğin ve kendini güvende hissettiğin tek uygulama. <b>{N} özellik</b>, temel üyelik tamamen ücretsiz.</p>
      <div class="btn-row"><a class="btn btn--h hx-cta" href="{APP}" rel="noopener">Hemen ücretsiz üye ol {ARROW}</a><a class="btn hx-ghost" href="#ozellikler">Tüm özellikleri gör</a></div>
      <ul class="hx-stats"><li><b data-count="{N}">{N}</b><span>özellik</span></li><li><b>0 ₺</b><span>temel üyelik</span></li><li><b>60+</b><span>tema</span></li></ul>
    </div>
    <div class="hx-phone" aria-hidden="true">
      <div class="hx-screen">
        <div class="hx-app-bar"><img src="{IMG}emblem.webp" alt=""><b>HADİ</b><span>💎 🔔 🔍</span></div>
        <div class="hx-app-card"><img src="{IMG}cover_etk_tanisma.webp" alt=""><div><small>Cumartesi · 14:00</small><b>Bahçede kahve buluşması</b><span>🎟️ Katıl</span></div></div>
        <div class="hx-bubble hx-bubble--in"><img src="{IMG}demo_av_elif.webp" alt="">Cumartesi geliyor musun? 😊</div>
        <div class="hx-bubble hx-bubble--out">Tabii! Biletimi aldım 🎟️</div>
        <div class="hx-bubble hx-bubble--in"><img src="{IMG}demo_av_can.webp" alt="">Ben de arabayla geliyorum, 2 kişilik yer var 🚗</div>
        <div class="hx-app-nav"><span>🏠</span><span>📅</span><span class="hx-plus">＋</span><span>🎡</span><span>👤</span></div>
      </div>
      <img class="hx-float hx-float--a" src="{IMG}jumper.webp" alt="">
      <img class="hx-float hx-float--b" src="{IMG}bub1.webp" alt="">
    </div>
  </div>
  <div class="hx-marquee" aria-hidden="true"><div>{marquee_items}{marquee_items}</div></div>
</section>

<section class="hx-sec">
  <div class="wrap">
    <div class="hx-head reveal"><span class="hx-kicker" style="--c:var(--h)">Öne çıkanlar</span><h2>Bir uygulamada, bütün bir sosyal hayat</h2></div>
{chr(10).join(spots)}
  </div>
</section>

<section class="hx-sec hx-sec--dark" id="ozellikler">
  <div class="wrap">
    <div class="hx-head reveal"><span class="hx-kicker" style="--c:var(--a)">Hepsi tek tek</span><h2><span class="hx-count" data-count="{N}">{N}</span> özellik. Ve artmaya devam ediyor.</h2>
      <p>Merak ettiğini yaz, hemen bul.</p>
      <label class="hx-search"><span aria-hidden="true">🔍</span><input type="search" id="hx-q" placeholder="Ör. sohbet, oyun, güvenlik, Elmas…" autocomplete="off" aria-label="Özelliklerde ara"></label>
      <p class="hx-found" id="hx-found" aria-live="polite"></p>
    </div>
    <div class="hx-grid" id="hx-grid">
      {chr(10).join('      ' + x for x in cards).strip()}
    </div>
    <p class="hx-note">Bazı hizmetler Elmas ya da Premium ile kullanılır; ücretler ve kapsam uygulamada her zaman açıkça yazar. Hizmetler zamanla değişebilir.</p>
  </div>
</section>

<section class="hx-final">
  <img class="hx-final-bg" src="{IMG}hero_yetenekler.webp" alt="" loading="lazy">
  <div class="wrap hx-final-in reveal">
    <img class="hx-final-emb" src="{IMG}duo.webp" alt="" width="120" height="120">
    <h2>Bir dokunuş uzağındasın.</h2>
    <p>HADİ Sosyal’a telefon numaranla gir, başvurunu birkaç dakikada tamamla. Onaylandığın an etkinlikler, sohbetler, oyunlar ve topluluklar seni bekliyor.</p>
    <div class="btn-row"><a class="btn btn--h hx-cta" href="{APP}" rel="noopener">Ücretsiz üye ol {ARROW}</a><a class="btn hx-ghost" href="etkinlikler.html">Yaklaşan etkinlikler</a></div>
  </div>
</section>
<script>
(function () {{
  var q = document.getElementById("hx-q"), grid = document.getElementById("hx-grid"), found = document.getElementById("hx-found");
  if (!q || !grid) return;
  var cards = Array.prototype.slice.call(grid.children);
  var fold = function (s) {{ return String(s).toLocaleLowerCase("tr").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/ı/g, "i"); }};
  cards.forEach(function (c) {{ c.dataset.f = fold(c.dataset.q); }});
  q.addEventListener("input", function () {{
    var t = fold(q.value.trim()), n = 0;
    cards.forEach(function (c) {{ var ok = !t || c.dataset.f.indexOf(t) !== -1; c.hidden = !ok; if (ok) n++; }});
    found.textContent = t ? (n ? n + " özellik bulundu" : "Bulunamadı. Başka bir kelime dene.") : "";
  }});
  /* Kartlar ekrana girerken sırayla belirir */
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {{
    var io = new IntersectionObserver(function (en) {{ en.forEach(function (x) {{ if (x.isIntersecting) {{ x.target.classList.add("in"); io.unobserve(x.target); }} }}); }}, {{ rootMargin: "0px 0px -40px 0px" }});
    cards.forEach(function (c, i) {{ c.style.setProperty("--d", (i % 6) * 60 + "ms"); c.classList.add("hx-pre"); io.observe(c); }});
  }}
}})();
</script>
'''
io.open(os.path.join(R, 'hadi-sosyal.html'), 'w', encoding='utf8').write(head + main + foot)

css = r'''/* HADİ Sosyal sayfası — uygulamanın görselleri (Meydan), HADİ renkleri ve simge dili. */
.hx { --night: #0D2033; --night2: #152D45; --nline: #244460; --ntext: #E8EFF5; --nmuted: #9DB0C2; }
.hx-kicker { display: inline-flex; align-items: center; gap: .45rem; font-weight: 800; font-size: .82rem; letter-spacing: .08em; text-transform: uppercase; color: var(--c, var(--h)); }
.hx-kicker::before { content: ""; width: 22px; height: 3px; border-radius: 3px; background: currentColor; }

/* Giriş */
.hx-hero { position: relative; overflow: hidden; background: var(--night); color: #fff; padding: clamp(3rem, 7vw, 6rem) 0 0; isolation: isolate; }
.hx-hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .38; z-index: -2; transform: scale(1.06); animation: hx-pan 26s ease-in-out infinite alternate; }
.hx-hero::before { content: ""; position: absolute; inset: 0; z-index: -1; background: radial-gradient(70% 90% at 15% 30%, rgba(13,32,51,.25), rgba(13,32,51,.92) 70%), linear-gradient(180deg, rgba(13,32,51,.2), var(--night) 92%); }
@keyframes hx-pan { to { transform: scale(1.14) translate(-2%, -1%); } }
.hx-hero-in { display: grid; grid-template-columns: 1.15fr .85fr; gap: clamp(2rem, 5vw, 4rem); align-items: center; padding-bottom: clamp(3rem, 6vw, 5rem); }
.hx-letters { display: flex; gap: .35rem; margin-bottom: 1.25rem; }
.hx-l { width: clamp(38px, 5vw, 56px); height: auto; filter: drop-shadow(0 8px 18px rgba(0,0,0,.35)); animation: hx-hop 2.8s var(--ease) infinite; animation-delay: calc(var(--n) * .18s); }
@keyframes hx-hop { 0%, 60%, 100% { transform: translateY(0) rotate(0); } 30% { transform: translateY(-14px) rotate(-4deg); } }
.hx-hero h1 { color: #fff; font-size: clamp(2.6rem, 6.4vw, 4.8rem); line-height: 1; letter-spacing: -.035em; margin: 0 0 1.25rem; }
.hx-hero h1 span { background: linear-gradient(90deg, var(--h), var(--pink) 35%, var(--i) 60%, var(--a)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.hx-lead { font-size: clamp(1.08rem, 1.6vw, 1.25rem); color: var(--ntext); max-width: 36rem; margin-bottom: 1.75rem; }
.hx-lead b { color: #fff; }
.hx-cta { box-shadow: 0 14px 34px -12px rgba(242,128,31,.75); }
.hx-ghost { background: rgba(255,255,255,.08); color: #fff; border: 1.5px solid rgba(255,255,255,.28); backdrop-filter: blur(6px); }
.hx-ghost:hover { background: rgba(255,255,255,.16); color: #fff; }
.hx-stats { list-style: none; display: flex; flex-wrap: wrap; gap: 1.75rem; margin: 2.25rem 0 0; padding: 0; }
.hx-stats li { display: grid; }
.hx-stats b { font-family: var(--display); font-size: 2rem; line-height: 1; color: #fff; }
.hx-stats span { color: var(--nmuted); font-size: .9rem; }

/* Telefon kolajı */
.hx-phone { position: relative; justify-self: center; width: min(320px, 82vw); aspect-ratio: 9 / 18.5; border-radius: 44px; padding: 12px; background: linear-gradient(145deg, #2b4a68, #0a1828); box-shadow: 0 40px 90px -30px rgba(0,0,0,.8), inset 0 0 0 1.5px rgba(255,255,255,.12); transform: rotate(3deg); animation: hx-float 7s ease-in-out infinite; }
@keyframes hx-float { 50% { transform: rotate(2deg) translateY(-12px); } }
.hx-screen { position: relative; height: 100%; border-radius: 34px; overflow: hidden; background: #F2F6F9; display: flex; flex-direction: column; gap: .6rem; padding: .8rem .7rem 0; }
.hx-app-bar { display: flex; align-items: center; gap: .4rem; font-family: var(--display); color: var(--ink); }
.hx-app-bar img { width: 26px; height: auto; }
.hx-app-bar span { margin-left: auto; font-size: .78rem; letter-spacing: .15em; }
.hx-app-card { border-radius: 18px; overflow: hidden; background: #fff; box-shadow: 0 8px 22px -12px rgba(23,52,79,.35); }
.hx-app-card img { width: 100%; height: 118px; object-fit: cover; display: block; }
.hx-app-card div { padding: .55rem .7rem .7rem; display: grid; gap: .1rem; }
.hx-app-card small { color: var(--h); font-weight: 700; font-size: .7rem; }
.hx-app-card b { color: var(--ink); font-size: .9rem; line-height: 1.2; }
.hx-app-card span { justify-self: start; margin-top: .35rem; background: var(--h); color: #fff; font-weight: 700; font-size: .72rem; padding: .25rem .65rem; border-radius: 999px; }
.hx-bubble { max-width: 86%; font-size: .78rem; line-height: 1.3; padding: .5rem .7rem; border-radius: 16px; color: var(--ink); display: flex; gap: .4rem; align-items: flex-end; }
.hx-bubble img { width: 22px; height: 22px; border-radius: 50%; flex: none; }
.hx-bubble--in { background: #fff; border-bottom-left-radius: 4px; box-shadow: 0 4px 12px -8px rgba(23,52,79,.4); }
.hx-bubble--out { align-self: flex-end; background: var(--a); color: #fff; border-bottom-right-radius: 4px; }
.hx-app-nav { margin-top: auto; display: flex; justify-content: space-around; align-items: center; background: #fff; margin-inline: -.7rem; padding: .6rem 0 .9rem; font-size: 1.05rem; box-shadow: 0 -6px 18px -14px rgba(23,52,79,.5); }
.hx-plus { width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; background: linear-gradient(135deg, var(--h), var(--pink)); color: #fff; font-weight: 800; }
.hx-float { position: absolute; width: 74px; height: auto; filter: drop-shadow(0 10px 18px rgba(0,0,0,.4)); }
.hx-float--a { left: -46px; top: 18%; animation: hx-hop 3.4s var(--ease) infinite; }
.hx-float--b { right: -38px; bottom: 22%; width: 64px; animation: hx-hop 3s var(--ease) infinite .6s; }

/* Kayan özellik şeridi */
.hx-marquee { border-top: 1px solid var(--nline); background: rgba(13,32,51,.85); overflow: hidden; padding: .9rem 0; -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
.hx-marquee div { display: flex; gap: .75rem; width: max-content; animation: hx-run 90s linear infinite; }
.hx-marquee span { white-space: nowrap; color: var(--ntext); font-weight: 600; font-size: .92rem; padding: .35rem .85rem; border: 1px solid var(--nline); border-radius: 999px; background: rgba(255,255,255,.04); }
@keyframes hx-run { to { transform: translateX(-50%); } }

/* Vitrin */
.hx-sec { padding: clamp(4rem, 8vw, 7rem) 0; }
.hx-head { text-align: center; max-width: 46rem; margin: 0 auto clamp(2.5rem, 5vw, 4rem); }
.hx-head h2 { font-size: clamp(2rem, 4.4vw, 3.2rem); letter-spacing: -.03em; margin: .6rem 0 .5rem; }
.hx-spot { display: grid; grid-template-columns: 1.1fr .9fr; gap: clamp(1.5rem, 4vw, 3.5rem); align-items: center; margin-bottom: clamp(3rem, 6vw, 5rem); }
.hx-spot--rev .hx-spot-img { order: 2; }
.hx-spot-img { position: relative; border-radius: 32px; overflow: hidden; aspect-ratio: 16 / 11; box-shadow: 0 40px 80px -40px rgba(23,52,79,.55); }
.hx-spot-img::after { content: ""; position: absolute; inset: 0; box-shadow: inset 0 0 0 1px rgba(255,255,255,.1); border-radius: inherit; background: linear-gradient(180deg, transparent 55%, rgba(13,32,51,.35)); }
.hx-spot-img img { width: 100%; height: 100%; object-fit: cover; transition: transform 1.2s var(--ease); }
.hx-spot:hover .hx-spot-img img { transform: scale(1.05); }
.hx-spot-txt h3 { font-size: clamp(1.7rem, 3.2vw, 2.5rem); line-height: 1.08; letter-spacing: -.025em; margin: .7rem 0 .9rem; }
.hx-spot-txt p { font-size: 1.08rem; color: var(--ink-2); }
.hx-tags { list-style: none; display: flex; flex-wrap: wrap; gap: .5rem; margin: 1.25rem 0 0; padding: 0; }
.hx-tags li { font-weight: 700; font-size: .88rem; padding: .4rem .85rem; border-radius: 999px; color: var(--c); background: color-mix(in srgb, var(--c) 12%, #fff); border: 1px solid color-mix(in srgb, var(--c) 28%, #fff); }

/* Tüm özellikler */
.hx-sec--dark { background: var(--night); color: var(--ntext); }
.hx-sec--dark h2 { color: #fff; }
.hx-sec--dark .hx-head p { color: var(--nmuted); }
.hx-count { background: linear-gradient(90deg, var(--h), var(--pink)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.hx-search { display: flex; align-items: center; gap: .6rem; max-width: 30rem; margin: 1.5rem auto 0; background: var(--night2); border: 1.5px solid var(--nline); border-radius: 999px; padding: .2rem .4rem .2rem 1.1rem; transition: border-color .2s; }
.hx-search:focus-within { border-color: var(--a); box-shadow: 0 0 0 4px rgba(29,154,214,.2); }
.hx-search input { flex: 1; min-width: 0; background: transparent; border: 0; outline: 0; color: #fff; font: inherit; font-size: 1rem; padding: .75rem 0; }
.hx-search input::placeholder { color: var(--nmuted); }
.hx-found { min-height: 1.5em; margin: .75rem 0 0; color: var(--nmuted); }
.hx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); grid-auto-flow: dense; gap: 1rem; }
.hx-f { position: relative; background: var(--night2); border: 1px solid var(--nline); border-radius: 22px; padding: 1.25rem 1.2rem 1.3rem; overflow: hidden; transition: transform .35s var(--ease), border-color .35s, box-shadow .35s; }
.hx-f::before { content: ""; position: absolute; inset: auto -30% -60% auto; width: 160px; height: 160px; border-radius: 50%; background: var(--c); opacity: .12; filter: blur(30px); transition: opacity .35s; }
.hx-f:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--c) 60%, var(--nline)); box-shadow: 0 22px 40px -24px color-mix(in srgb, var(--c) 70%, transparent); }
.hx-f:hover::before { opacity: .3; }
.hx-ic { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 15px; font-size: 1.5rem; background: color-mix(in srgb, var(--c) 22%, var(--night2)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 45%, transparent); margin-bottom: .9rem; }
.hx-f h3 { color: #fff; font-size: 1.08rem; line-height: 1.25; margin: 0 0 .35rem; }
.hx-f p { color: var(--nmuted); font-size: .93rem; line-height: 1.45; margin: 0; }
.hx-f--img { grid-row: span 2; padding: 0; display: flex; flex-direction: column; justify-content: flex-end; min-height: 340px; border: 0; }
.hx-f--img > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform 1s var(--ease); }
.hx-f--img:hover > img { transform: scale(1.06); }
.hx-f--img > div { position: relative; padding: 1.25rem; background: linear-gradient(180deg, transparent, rgba(13,32,51,.88) 38%); padding-top: 4rem; }
.hx-f--img .hx-ic { backdrop-filter: blur(8px); background: color-mix(in srgb, var(--c) 45%, rgba(13,32,51,.4)); }
.hx-f--img p { color: var(--ntext); }
.hx-f[hidden] { display: none; }
.hx-pre { opacity: 0; transform: translateY(18px); }
.hx-pre.in { opacity: 1; transform: none; transition: opacity .6s var(--ease) var(--d), transform .6s var(--ease) var(--d), border-color .35s, box-shadow .35s; }
.hx-note { color: var(--nmuted); font-size: .88rem; text-align: center; margin: 2rem auto 0; max-width: 40rem; }

/* Kapanış */
.hx-final { position: relative; overflow: hidden; isolation: isolate; color: #fff; text-align: center; padding: clamp(5rem, 10vw, 8rem) 0; background: var(--night); }
.hx-final-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .35; z-index: -2; }
.hx-final::before { content: ""; position: absolute; inset: 0; z-index: -1; background: radial-gradient(60% 80% at 50% 50%, rgba(13,32,51,.55), rgba(13,32,51,.95)); }
.hx-final-in { max-width: 44rem; }
.hx-final-emb { width: 110px; height: auto; margin: 0 auto 1rem; animation: hx-hop 3s var(--ease) infinite; }
.hx-final h2 { color: #fff; font-size: clamp(2.2rem, 5vw, 3.6rem); letter-spacing: -.03em; }
.hx-final p { color: var(--ntext); font-size: 1.12rem; margin: 1rem auto 2rem; }
.hx-final .btn-row { justify-content: center; }

@media (max-width: 900px) {
  .hx-hero-in { grid-template-columns: 1fr; }
  .hx-phone { width: min(280px, 72vw); margin-top: 1rem; }
  .hx-spot, .hx-spot--rev { grid-template-columns: 1fr; }
  .hx-spot--rev .hx-spot-img { order: 0; }
}
@media (max-width: 560px) {
  .hx-float { display: none; }
  .hx-grid { grid-template-columns: 1fr 1fr; gap: .7rem; }
  .hx-f { padding: 1rem .9rem; border-radius: 18px; }
  .hx-ic { width: 40px; height: 40px; font-size: 1.25rem; border-radius: 12px; margin-bottom: .6rem; }
  .hx-f h3 { font-size: .98rem; }
  .hx-f p { font-size: .85rem; }
  .hx-f--img { grid-column: span 2; grid-row: span 1; min-height: 260px; }
  .hx-stats { gap: 1.25rem; }
}
@media (prefers-reduced-motion: reduce) {
  .hx-hero-bg, .hx-l, .hx-phone, .hx-float, .hx-marquee div, .hx-final-emb { animation: none; }
}
'''
io.open(os.path.join(R, r'assets\css\hadi-sosyal.css'), 'w', encoding='utf8').write(css)

# Eski .hs-* kurallarını style.css'ten çıkar; tüm sayfalarda sürüm ekini artır.
sp = os.path.join(R, r'assets\css\style.css')
s = io.open(sp, encoding='utf8', newline='').read()
i = s.find('/* ---------------- HADİ Sosyal sayfası ---------------- */')
if i != -1:
    s = s[:i].rstrip() + '\n'
    io.open(sp, 'w', encoding='utf8', newline='').write(s)
n = 0
for p in glob.glob(R + r'\*.html') + glob.glob(R + r'\hp\*.html'):
    raw = io.open(p, encoding='utf8', newline='').read()
    t = re.sub(r'\?v=2026\d{4}[a-z]"', f'?v={VER}"', raw)
    if t != raw: io.open(p, 'w', encoding='utf8', newline='').write(t); n += 1
print('özellik', N, 'görselli', sum(1 for f in F if len(f) > 3), 'sürüm eki', n)
