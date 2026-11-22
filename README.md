# AquaCurs · Escola de Natació (PWA)

App d'avaluació, diplomes i gestió de cursos de natació. Projecte **Vite + React** amb **PWA** (instal·lable al mòbil i funciona sense connexió).

---

## 0) Què necessites
- **Node.js 18 o superior** instal·lat (el mateix que fas servir per a Bódate).
- Un compte de **GitHub** i un de **Vercel** (ja els tens).

---

## 1) Provar-la al teu ordinador (opcional però recomanat)
Obri una terminal dins de la carpeta del projecte i executa:

```bash
npm install
npm run dev
```

Obri el navegador a l'adreça que apareix (normalment `http://localhost:5173`). Si tot va bé, ja la veus funcionant. Per parar-la, `Ctrl + C`.

Per provar la versió de producció (com es veurà a Vercel):

```bash
npm run build
npm run preview
```

---

## 2) Pujar-la a GitHub
És el mateix flux que ja coneixes:

```bash
git init
git add .
git commit -m "AquaCurs PWA inicial"
```

Crea un repositori nou a GitHub (per exemple `aquacurs`) i després:

```bash
git remote add origin https://github.com/EL-TEU-USUARI/aquacurs.git
git branch -M main
git push -u origin main
```

---

## 3) Desplegar a Vercel
1. Entra a [vercel.com](https://vercel.com) → **Add New… → Project**.
2. Tria el repositori `aquacurs`.
3. Vercel detecta sol que és **Vite**. No has de canviar res:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. **Deploy**. En un minut tindràs una URL tipus `https://aquacurs.vercel.app`.

---

## 4) Instal·lar-la al mòbil
Obri la URL de Vercel al mòbil:

- **Android (Chrome):** menú (⋮) → **Instal·lar aplicació** / **Afegir a la pantalla d'inici**.
- **iPhone (Safari):** botó de compartir → **Afegir a la pantalla d'inici**.

Apareixerà com una app normal, amb la seua icona, pantalla completa i funcionant **sense connexió** un cop carregada la primera vegada.

---

## 5) Enviament de diplomes per correu

Des de «Generar diplomes» → **Enviar per correu**, l'app crea el PDF de cada diploma (anvers i revers) i l'envia a l'email de contacte de l'alumne. L'enviament el fa la funció `api/send-diploma.js` (Vercel) a través de **Resend**. Cal tindre connexió a internet.

**Configuració (una sola vegada):**
1. Crea un compte a [resend.com](https://resend.com) i verifica un domini (Domains → Add domain). Sense domini verificat, Resend només deixa enviar al teu propi correu (per a proves).
2. Crea una clau a API Keys.
3. A Vercel → Project → **Settings → Environment Variables**, afig:
   - `RESEND_API_KEY` = la clau de Resend
   - `MAIL_FROM` = `Piscina Municipal Carcaixent <diplomes@EL-TEU-DOMINI>`
   - `SEND_KEY` = un codi llarg inventat (és el que s'introdueix a l'app abans d'enviar)
   - `MAIL_REPLY_TO` (opcional) = el correu on vols rebre les respostes de les famílies
4. Torna a desplegar (Deployments → ⋯ → Redeploy) perquè agafe les variables.

**A tindre en compte:**
- El pla gratuït de Resend permet 100 correus al dia. Si s'arriba al límit, l'app s'atura i els que ja s'han enviat no es repeteixen.
- El registre de «ja enviat» es guarda al dispositiu des del qual s'envia.
- El `SEND_KEY` és una protecció bàsica: no el compartisques fora de l'equip de coordinació.

---

## Coses importants que has de saber

- **Les dades es guarden al dispositiu** (al navegador, amb `localStorage`). Cada mòbil/ordinador té les seues. Encara **no hi ha base de dades compartida**: això és el següent pas (Supabase o similar) quan decidiu implantar-la de veritat per a tot l'equip.

- **Mòdul de gimnàs:** ara fa servir el **motor propi** (rutines per regles, instantani i offline). La part d'IA necessita una clau i un xicotet backend; quan el muntem, es pot reactivar. Per a la demo, el motor propi funciona perfectament.

- **Tipografies offline:** les lletres es carreguen de Google Fonts la primera vegada (amb connexió) i es queden en memòria. Sense haver-les carregat mai, el navegador farà servir lletres del sistema. Si vols 100% offline des del primer moment, es poden incrustar les fonts (et puc ajudar).

- **Logos:** el projecte porta incrustats el logo de la Piscina i el de l'Ajuntament. Assegura't de tindre el vist-i-plau de ProCarsa / l'Ajuntament per a fer-los servir en un document oficial.

- **Actualitzacions:** cada vegada que faces `git push`, Vercel torna a desplegar sol. La PWA s'actualitza sola al mòbil la pròxima vegada que l'òbriga (gràcies al service worker amb `autoUpdate`).

---

## Estructura del projecte
```
aquacurs/
├── index.html
├── package.json
├── vite.config.js          ← configuració de la PWA (manifest + service worker)
├── tailwind.config.js
├── postcss.config.js
├── public/                 ← icones i favicon
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable-512.png
│   ├── apple-touch-icon.png
│   └── favicon.svg
└── src/
    ├── main.jsx
    ├── App.jsx             ← tota l'aplicació
    └── index.css
```
