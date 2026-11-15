# DeepChat AI Scraper & API Client

Modul Node.js ESM zero-dependency untuk mengakses API DeepChat AI (reverse-engineered dari aplikasi Android). Mendukung berbagai model LLM terkemuka (standar & PRO), vision multi-modal, generator gambar, image-to-image, inpainting, face swap, AI humanizer, dan prompt optimizer.

---

## Fitur Utama

1. **Multi-Provider LLM (`chat`)**
   - Mendukung ChatGPT (`gpt-4o-mini`, `gpt-4.1`), Claude (`claude-haiku-4-5-20251001`, `claude-opus-4-7`), Gemini (`gemini-2.5-flash-lite`, `gemini-2.5-pro`), DeepSeek (`deepseek-chat`, `deepseek-reasoner`), Kimi (`kimi-k3`), Grok, Mistral, dan Perplexity.
   - Opsi reasoning / thinking mode (`deepThink`), deep research (`deepResearch`), dan coding mode (`writeCode`).
2. **Multimodal Vision Input**
   - Menganalisis gambar dari URL remote, file lokal biner, Buffer, atau Base64.
3. **Image Generation & Image-to-Image (`generateImage`, `imageToImage`)**
   - Generate gambar baru dari teks atau menggunakan gambar referensi via model Flux Schnell tanpa watermark.
4. **Edit Image / Inpainting (`editImage`)**
   - Modifikasi bagian tertentu dari gambar menggunakan prompt dan mask.
5. **Face Swap (`faceSwap`)**
   - Menukar wajah antara gambar sumber dan target.
6. **AI Humanizer (`humanize`)**
   - Mengubah teks buatan AI agar terbaca natural seperti tulisan manusia.
7. **Prompt Optimizer (`optimizePrompt`)**
   - Memperluas dan mempertajam prompt sederhana menjadi prompt komprehensif.
8. **Sistem Sesi & Auto-Topup**
   - Registrasi sesi anonim otomatis via Supabase + otentikasi signature HMAC-SHA256.
   - Auto-healing & auto-claim reward iklan jika kredit habis (kuota 30 klaim/hari per sesi).

---

## Cara Penggunaan

### 1. Chat Teks Sederhana
```javascript
import { chat } from '/root/Scrape/deepchat.mjs';

const res = await chat('Jelaskan apa itu quantum computing dalam 1 paragraf.');
console.log(res.reply);
console.log('Model:', res.model);
console.log('Sisa kredit:', res.creditsRemaining);
```

### 2. Chat Menggunakan Model PRO (GPT-4.1, Gemini Pro, Claude Opus)
```javascript
import { chat } from '/root/Scrape/deepchat.mjs';

// Menggunakan GPT-4.1
const gpt = await chat('Buatkan rencana arsitektur microservices.', {
  providerId: 'chatgpt',
  modelId: 'gpt-4.1'
});
console.log(gpt.reply);

// Menggunakan Gemini 2.5 Pro
const gemini = await chat('Analisis efisiensi algoritma ini.', {
  providerId: 'gemini',
  modelId: 'gemini-2.5-pro'
});
console.log(gemini.reply);

// Menggunakan Claude Opus 4.7
const opus = await chat('Refactor kode sistem berikut.', {
  providerId: 'claude',
  modelId: 'claude-opus-4-7'
});
console.log(opus.reply);
```

### 3. Vision / Analisis Gambar
```javascript
import { chat } from '/root/Scrape/deepchat.mjs';

// Analisis via file lokal atau URL
const vision = await chat('Deskripsikan isi gambar ini secara detail.', {
  providerId: 'chatgpt',
  modelId: 'gpt-4o-mini',
  image: '/root/foto.jpg' // Bisa path lokal atau URL http/https
});
console.log(vision.reply);
```

### 4. Text-to-Image & Image-to-Image (Flux Schnell)
```javascript
import { generateImage, imageToImage, downloadMedia } from '/root/Scrape/deepchat.mjs';

// Text-to-Image
const img = await generateImage('cyberpunk samurai standing in the rain, neon lights, 4k');
console.log('URL Gambar:', img.images[0].url);

// Image-to-Image (Menggunakan gambar referensi)
const i2i = await imageToImage('make it futuristic anime style', '/root/input.jpg');
console.log('URL Hasil:', i2i.images[0].url);

// Unduh file biner
const buffer = await downloadMedia(img.images[0].url);
console.log('Ukuran buffer:', buffer.length, 'bytes');
```

### 5. AI Humanizer
```javascript
import { humanize } from '/root/Scrape/deepchat.mjs';

const res = await humanize('It is of paramount importance that we execute the strategic initiative with utmost diligence.', {
  intensity: 'medium' // 'low' | 'medium' | 'high'
});
console.log('Hasil Humanize:', res.humanizedText);
```

### 6. Prompt Optimizer
```javascript
import { optimizePrompt } from '/root/Scrape/deepchat.mjs';

const opt = await optimizePrompt('retro synthwave car wallpaper', {
  context: 'image'
});
console.log('Prompt Optimal:', opt.optimizedPrompt);
```

### 7. Cek Saldo & Klaim Reward Kredit
```javascript
import { getBalance, claimReward } from '/root/Scrape/deepchat.mjs';

// Cek saldo saat ini
const balance = await getBalance();
console.log('Saldo:', balance.balance);
console.log('Kadaluarsa:', balance.expiresAt);

// Klaim 1 kredit reward gratis
const reward = await claimReward();
console.log('Kredit ditambah:', reward.creditsAdded);
console.log('Total saldo baru:', reward.newBalance);
console.log('Sisa klaim hari ini:', reward.adsRemainingToday);
```
