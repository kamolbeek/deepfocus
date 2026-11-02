# DeepFokus — Mac kompanyoni

Ish stolida yashaydigan kompanyon: shaffof oyna, menyu satrida taymer, 7 ta usul.

- `⌥⌘F` — fokusni boshlash / pauza
- `⌥⌘H` — kompanyonni yashirish / ko'rsatish
- Kompanyonni sichqoncha bilan surib qo'yish mumkin, ikki marta bosish — boshlash / pauza
- Ma'lumotlar: `~/Library/Application Support/DeepFokus/deepfokus.json`

## Yig'ish

```bash
npm install
npm run build          # renderer + umumiy kod (../lib dan)
npx electron .         # sinab ko'rish
npm run pack           # dist/DeepFokus-darwin-arm64/DeepFokus.app
```

## Minnatdorchilik

Notch'dagi kompanyonning animatsiya mantig'i (bosh burilishi, ko'z qisish, emotsiyalar,
kiyimlar fizikasi) [Coucou](https://github.com/Louis-CFM/coucou) loyihasining MIT
litsenziyali kodidan olingan va moslashtirilgan — `renderer/buddy/LICENSE-coucou.txt`.
Personajning ko'rinishi (binafsha tana, krem yuz, antenna) DeepFokus'niki.

## Momiq va agentlar (1.0)
Notch'dagi kompanyon — Momiq — Coucou'ning Mochi dizayni va animatsiyalari bilan (muallif Louis Raillé'ning
ruxsati bilan; kod MIT, `renderer/buddy/LICENSE-coucou.txt`). Claude Code, Gemini CLI va Cursor sessiyalari
hook'lar orqali `momiq.sock` soketiga keladi (`hooks/momiq-hook.py`, Coucou'ning nb-hook relayidan moslashtirilgan):
har bir agent o'z kichkina Mochi'si bilan notch'da turadi, ruxsat va savollarga notch'dan javob beriladi,
ish tugaganda Momiq xabar beradi. Savol-javob va fayl tahlili kompyuterdagi Claude Code orqali, Claude obunasi bilan ishlaydi.
