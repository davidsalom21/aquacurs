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

## 5) Base de dades (Supabase) i comptes

Les dades (grups, alumnes, notes, diplomes) es guarden a **Supabase** i totes les persones veuen el mateix.

**Configuració (una sola vegada):**
1. Supabase → **SQL Editor → New query**: enganxa tot `supabase/schema.sql` i prem **Run**. Crea les taules, els permisos i els grups inicials. Es pot tornar a executar sense perdre dades.
2. Supabase → Authentication: desactiva **Confirm email** i **Allow new users to sign up**.
3. Vercel → Settings → Environment Variables (Production i Preview):
   - `VITE_SUPABASE_URL` = Project URL de Supabase
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = publishable key (o anon key)
   - `SUPABASE_SECRET_KEY` = secret key (o service_role). **Mai al codi ni a GitHub.**
   - `SEND_KEY` = codi de configuració (només es fa servir per a crear el primer compte de coordinació)
4. Redeploy. Les variables `VITE_` s'agafen en compilar: si les canvies, cal tornar a desplegar.
5. Obri l'app: la primera vegada surt **Configuració inicial** per a crear el primer compte de coordinació (cal el `SEND_KEY`). Des de la pestanya **Usuaris** es creen la resta de comptes.

**Comptes:** cada persona entra triant el seu perfil i el seu nom i escrivint el seu codi. El pot canviar des del botó **Codi** de la capçalera. Si l'oblida, coordinació el restableix a **Usuaris**. El nom dels monitors ha de coincidir amb el dels grups.

## 6) Enviament de diplomes per correu

Només coordinació pot enviar (es comprova amb la sessió). Variables a Vercel: `RESEND_API_KEY`, `MAIL_FROM` (adreça de `aquacurs.com`), `MAIL_REPLY_TO` (opcional). El pla gratuït de Resend permet 100 correus al dia.

---

## Coses importants que has de saber

- **Les dades es guarden a Supabase**: cal connexió a internet per a treballar. Si es perd un moment, l'app reintenta desar i ho indica a la capçalera.

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
