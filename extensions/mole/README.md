# Mole System Cleaner & Monitor

MacBook çentiğinizin (Dynamic Island) yanından çalışan, **[Tw93 Mole (`mo`)](https://github.com/tw93/mole)** destekli hepsi bir arada macOS temizlik, optimizasyon ve sistem izleme eklentisi.

Gerçek zamanlı CPU ve RAM takibi, diskteki gereksiz önbellek (junk) tespiti, tek tıkla `mo clean` ve proje derleme kalıntılarını temizleme (`mo purge`) imkanı sunar.

**Öne Çıkan Özellikler:**
- **Canlı Sistem Takibi:** Adanotch `system.stats` API'si ile anlık CPU % ve RAM % kullanımı, bellek tahsisatı (GB) ve en çok kaynak tüketen uygulamalar.
- **Disk Temizleyici (`mo clean`):** Kullanıcı önbellekleri (`~/Library/Caches`), sistem günlükleri (`~/Library/Logs`), Çöp Sepeti (`~/.Trash`), tarayıcı kalıntıları, Homebrew/npm paket önbellekleri ve Xcode DerivedData.
- **Eşik Uyarısı (Threshold Alert):** Temizlenebilir gereksiz dosya boyutu belirlediğiniz eşiği (varsayılan: 5 GB) aştığında çentikte tek seferlik bildirim (`notify.island`) ve sesli uyarı.
- **Geliştirici Kalıntı Temizliği (`mo purge`):** Disk alanınızı tüketen `node_modules`, Xcode `DerivedData`, Cargo `target` ve Swift `.build` dizinlerini tarama ve tek tıkla temizleme.
- **macOS Hızlı Optimizasyon (`mo optimize`):** DNS önbelleğini temizleme (`dscacheutil`), inaktif belleği boşaltma (`sudo purge`), LaunchServices veritabanını onarma, QuickLook servisini sıfırlama ve terminal için Touch ID sudo yetkilendirmesi (`mo touchid`).
- **Terminal & CLI Köprüsü (`scripts/mole-bridge.sh`):** Gerçek `mo` CLI çıktılarını ve dosya sistemi boyutlarını çentikle senkronize eden arka plan köprü betiği ve `launchd` servisi.
- **Dış Komutlar (Shortcuts & CLI):** `adanotch ext local.adanotch.mole sync ...` veya Kestirmeler ile uzaktan kontrol.

**Gerekli İzinler:** `system.stats`, `clipboard.write`, `notifications`, `network:raw.githubusercontent.com`.

---

## Görünüm ve Slotlar

### 1. Compact Slot (Çentiğin Yanı)
- **Sol Taraf (Leading):** Mole süpürge / kıvılcım ikonu (`sparkles`). Çöp boyutu eşiği aştığında uyarıcı turuncu çöp kutusu (`trash.circle.fill`), yüksek işlemci yükünde alev (`flame.fill`).
- **Sağ Taraf (Trailing):** Tercihinize göre ayarlanabilir (`settings.compactMode`):
  - `junk` (Varsayılan): Temizlenebilir toplam boyut (örn. `3.4 GB`).
  - `ram`: Canlı RAM yüzdesi (örn. `64% RAM`).
  - `cpu`: Canlı CPU yüzdesi (örn. `28% CPU`).
  - `status`: CLI bağlantı durumu (`mo: live` / `mo`).

### 2. Expanded Card (Açılan Çentik Kartı)
- **Header:** Mole başlığı, Tw93 eklenti etiketi, CLI aktiflik rozeti, canlı CPU/RAM özeti ve yenile butonu.
- **Uyarı Banner'ı:** Eşik aşıldığında doğrudan kartın üzerinde beliren hızlı "Clean All" aksiyonu.
- **Sekmeler (Tabs):**
  1. **Cleaner:** Toplam temizlenebilir alan kartı, kategori bazlı liste (`User Caches`, `Logs`, `Trash`, `Browser`, `Packages`, `Xcode`), her kategoriye özel silme butonu, "Clean All", "Dry Run Preview" ve "Analyze Disk".
  2. **System:** CPU & RAM ibreleri (`ui.gauge`), bellek tahsisat çubuğu (`ui.progress`), en çok kaynak tüketen süreçler (`ps`), inaktif RAM boşaltma butonu.
  3. **Dev Purge:** Geliştirici projelerindeki büyük derleme klasörleri (`node_modules`, `DerivedData`, `.build`), her klasörün boyutu ve tek tıkla `mo purge` komutu.
  4. **Optimize:** Tek tıkla macOS performans onarımları (DNS flush, QuickLook reset, Touch ID sudo).
  5. **Bridge:** Tw93 Mole kurulum rehberi, senkronizasyon komutları ve geçmişi sıfırlama.

---

## Hızlı Başlangıç

1. Adanotch uygulamasında **Settings › Developer › Developer Mode**'u açın.
2. `adanotch` terminal komutu kurulu değilse, aynı sayfadan **Terminal Command › Install**'a tıklayın.
3. Mole eklentisi dizinine gelin:

   ```bash
   cd kit-examples/extensions/mole
   npm install
   npm run watch     # Değişikliklerde dist/index.js otomatik derlenir
   ```

4. İkinci bir terminal sekmesinde canlı geliştirme modunu başlatın:

   ```bash
   adanotch dev      # Değişiklikleri çentiğe aktarır ve logları gösterir
   ```

5. Eklentiyi kalıcı yüklemek için Adanotch menüsünden **Settings › Extensions › Load Folder** seçip bu klasörü ekleyin.

---

## Mole CLI Köprüsü (`mole-bridge.sh`)

Mole CLI sisteminizde kuruluysa (`brew install mole` veya `curl -fsSL https://raw.githubusercontent.com/tw93/mole/main/install.sh | bash`), eklenti ile terminal arasında iki yönlü gerçek zamanlı köprü kurabilirsiniz:

```bash
# 1. Tek seferlik anlık tarama ve çentiğe gönderme:
./scripts/mole-bridge.sh

# 2. Arka planda her 60 saniyede bir otomatik senkronizasyon:
./scripts/mole-bridge.sh --daemon 60

# 3. macOS açılışında otomatik çalışacak bir LaunchAgent olarak yükleme:
./scripts/mole-bridge.sh --install
```

### Dışarıdan Komut Tetikleme (CLI & Kestirmeler)

Adanotch CLI veya macOS Shortcuts üzerinden eklentiye veri aktarabilir veya temizlik tetikleyebilirsiniz:

```bash
# Özel veri paketi gönderme
adanotch ext local.adanotch.mole sync '{"cleanable":{"userCaches":1500000000,"trash":800000000}}'

# Temizlik bitti raporu gönderme
adanotch ext local.adanotch.mole cleaned '{"reclaimedBytes": 2300000000}'

# Yeniden tarama tetikleme
adanotch ext local.adanotch.mole scan
```

---

## Geliştirici Komutları

| Komut               | Açıklama                                                         |
| ------------------- | ---------------------------------------------------------------- |
| `npm run build`     | `src/` dosyalarını `dist/index.js` olarak derler                 |
| `npm run watch`     | Kod değiştiğinde otomatik olarak yeniden derler                 |
| `npm test`          | Adanotch runtime üzerinde 10 adet birim testi çalıştırır         |
| `npm run typecheck` | TypeScript tip kontrollerini gerçekleştirir                      |
| `npm run lint`      | `adanotch lint` ile manifest ve güvenlik kontrollerini yapar     |
| `npm run package`   | Dağıtılabilir `.adanotchext` arşiv paketi oluşturur             |

---

## Ayarlar

Adanotch › Settings › Extensions › **Mole Cleaner & Monitor** altından yapılandırılabilir:

| Ayar                  | Tip          | Varsayılan | Açıklama                                                  |
| --------------------- | ------------ | ---------- | --------------------------------------------------------- |
| `compactMode`         | Select       | `"junk"`   | Çentik yanında ne gösterileceği (`junk`, `ram`, `cpu`, `status`) |
| `warnThresholdGB`     | Number       | `5 GB`     | Gereksiz dosyalar bu boyutu aşınca ada bildirimi gösterir |
| `notifyOnJunkAlert`   | Toggle       | `true`     | Eşik aşıldığında çentik bildirimi gösterilsin mi          |
| `showDevPurge`        | Toggle       | `true`     | Geliştirici temizlik sekmesi kartta gösterilsin mi        |
| `terminalApp`         | Select       | `Terminal` | Tercih edilen terminal (Terminal, Ghostty, iTerm2, Warp)  |
| `soundEffects`        | Toggle       | `true`     | Temizlik ve komut kopyalamada macOS ses efektleri çalınsın|

---

## Kaynaklar ve Teşekkürler

- **Tw93 Mole CLI:** [https://github.com/tw93/mole](https://github.com/tw93/mole)
- **Adanotch Dokümantasyonu:** [https://www.adanotch.com/docs/en](https://www.adanotch.com/docs/en)
- **Lisans:** MIT
