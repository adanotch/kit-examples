# Video Downloader

Adanotch için kapsamlı, güvenli bir video indirme kuyruğu. URL’yi yapıştırır, metadata önizlemesi alır, kalite/format seçer ve `yt-dlp` komutunu panoya kopyalar. İndirme işlemi kullanıcının kendi Terminal yetkileriyle çalışır; eklenti dosya sistemi veya shell çalıştırmaz.

## Kurulum

```bash
cd kit-examples/extensions/video-downloader
npm install
npm run build
brew install yt-dlp ffmpeg
```

Ardından Adanotch Developer Mode › Extensions › Load Folder ile bu klasörü yükleyin. URL yapıştırıp **Inspect URL**, sonra karttaki **Copy command** aksiyonunu kullanın.

## Bridge ilerlemesi

İsteğe bağlı bir indirme bridge’i aşağıdaki komutlarla karta ilerleme gönderebilir:

```bash
adanotch ext local.adanotch.video-downloader download.progress '{"id":"video-...","progress":42}'
adanotch ext local.adanotch.video-downloader download.done '{"id":"video-..."}'
```

Yalnızca kullanıcının indirme hakkına sahip olduğu içerikleri indirin; platformların kullanım şartlarına ve telif kurallarına uyun.
