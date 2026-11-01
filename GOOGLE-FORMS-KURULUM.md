# Formları Google Forms'a bağlama

Sitedeki beş form, gönderilen bilgileri doğrudan sizin Google Formlarınıza iletir.
Cevaplar Google Forms'ta (ve isterseniz bağlı bir Google E-Tablo'da) birikir.

Bağlantı eklenmemiş bir form gönderildiğinde, ziyaretçinin e-posta uygulaması
açılır ve bilgiler `info@hadietkinlikkulubu.com` adresine yazılı hâlde hazırlanır.
Yani kurulum bitene kadar da hiçbir başvuru kaybolmaz.

---

## 1. Her form için bir Google Formu oluşturun

[forms.google.com](https://forms.google.com) adresinde yeni bir boş form açın.
Aşağıdaki tablolardaki her satır için **bir soru** ekleyin.

**Önemli kurallar**

- Tüm soruların türü **"Kısa yanıt"** veya **"Paragraf"** olsun.
  (Çoktan seçmeli ya da onay kutusu kullanmayın. Site, seçimleri metin olarak gönderir.)
- Hiçbir soruyu **"Zorunlu"** yapmayın. Zorunlu alan kontrolünü site zaten yapıyor.
- Soru başlıklarını istediğiniz gibi Türkçe yazabilirsiniz. Önemli olan 2. adımdaki
  **anahtar kelimeler**.
- Ayarlar → Yanıtlar bölümünde **"E-posta adreslerini topla"** seçeneğini
  **kapalı** bırakın.

### Üyelik başvurusu (`uyelik`)
| Soru başlığı (örnek) | Anahtar |
|---|---|
| Ad soyad | `ad` |
| Doğum yılı | `dogum` |
| E-posta | `eposta` |
| Telefon | `tel` |
| İl | `il` |
| İlçe | `ilce` |
| İlgi alanları | `ilgi` |
| Not | `not` |
| KVKK onayı | `kvkk` |
| Katılım koşulları onayı | `kosul` |
| Ticari ileti izni | `iys` |

### İletişim formu (`iletisim`)
| Soru başlığı | Anahtar |
|---|---|
| Ad soyad | `ad` |
| E-posta | `eposta` |
| Konu | `konu` |
| Mesaj | `mesaj` |
| KVKK onayı | `kvkk` |

### Bülten (`bulten`)
| Soru başlığı | Anahtar |
|---|---|
| E-posta | `eposta` |

### Etkinlik önerisi (`oner`)
| Soru başlığı | Anahtar |
|---|---|
| Ad soyad | `ad` |
| E-posta | `eposta` |
| Etkinlik fikri | `baslik` |
| Türü | `tur` |
| Açıklama | `aciklama` |
| Gönüllü olabilir mi | `gonullu` |
| KVKK onayı | `kvkk` |

### Gönüllü ev sahibi başvurusu (`evsahibi`)
| Soru başlığı | Anahtar |
|---|---|
| Ad soyad | `ad` |
| E-posta | `eposta` |
| Telefon | `tel` |
| Alan | `alan` |
| Deneyim | `deneyim` |
| KVKK onayı | `kvkk` |

---

## 2. "Önceden doldurulmuş bağlantı"yı alın

1. Formun sağ üstündeki **⋮** (üç nokta) menüsünden
   **"Önceden doldurulmuş bağlantı al"** seçeneğine tıklayın.
2. Açılan önizlemede **her sorunun cevabına o sorunun anahtarını** yazın.
   Örneğin "Ad soyad" sorusuna `ad`, "E-posta" sorusuna `eposta` yazın.
3. En alttaki **"Bağlantı al"** düğmesine, sonra **"Bağlantıyı kopyala"**ya tıklayın.

Kopyaladığınız bağlantı şuna benzer:

```
https://docs.google.com/forms/d/e/1FAIpQLSe.../viewform?usp=pp_url&entry.1234567=ad&entry.7654321=eposta
```

## 3. Bağlantıyı siteye yapıştırın

`assets/js/forms-config.js` dosyasını Not Defteri ile açın ve bağlantıyı ilgili
satırdaki tırnakların arasına yapıştırın:

```js
uyelik: "https://docs.google.com/forms/d/e/1FAIpQLSe.../viewform?usp=pp_url&entry.1234567=ad&entry.7654321=eposta",
```

Kaydedin; o kadar. Site bağlantıdaki `entry` numaralarını kendisi okur ve
cevapları doğru sorulara yerleştirir.

## 4. Test edin

Siteden formu bir kez doldurup gönderin. Google Forms'ta **Yanıtlar** sekmesinde
cevabınızın göründüğünü kontrol edin. Görünmüyorsa genellikle sebep şudur:
bir sorunun türü "Kısa yanıt/Paragraf" değil ya da soru "Zorunlu" işaretli.

**İpucu:** Yanıtlar sekmesindeki yeşil E-Tablo simgesiyle cevapları bir Google
E-Tablo'ya bağlayabilir, "Yeni yanıtlar için e-posta bildirimi al" seçeneğiyle her
başvuruda e-posta alabilirsiniz.

---

## Google Analytics (isteğe bağlı)

Ziyaretçi istatistiklerini görmek isterseniz:

1. [analytics.google.com](https://analytics.google.com) adresinde bir **GA4 mülkü** oluşturun.
2. Bir **web veri akışı** ekleyin.
3. Size verilen **Ölçüm Kimliği**ni (`G-` ile başlar) `forms-config.js` içindeki
   `googleAnalyticsId` satırına yazın.

Analitik yalnızca ziyaretçi çerez bandında **"Tümünü kabul et"** derse yüklenir.
