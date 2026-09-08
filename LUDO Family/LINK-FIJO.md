# LUDO Family — Link fijo que no expira

Los links `*.trycloudflare.com` **siempre expiran**.  
Para un link **fijo** hay que **publicar** la app en internet (hosting).

La opción más simple y gratis: **Render** o **Railway**.

---

## Opción recomendada: Render (gratis, paso a paso)

### Antes
- Cuenta en [GitHub](https://github.com) (gratis)
- Cuenta en [Render](https://render.com) (gratis)

### 1. Subí el proyecto a GitHub

**En tu PC** (con el código de `ludo-matic`):

```bash
cd ludo-matic
git init
git add .
git commit -m "LUDO Family online"
```

Creá un repo vacío en GitHub (ej. `ludo-family`) y:

```bash
git branch -M main
git remote add origin https://github.com/TU_USUARIO/ludo-family.git
git push -u origin main
```

> Si no sabés usar git: en github.com → New repository → subir la carpeta con la web “Upload files”.

### 2. Crear el servicio en Render

1. Entrá a https://dashboard.render.com  
2. **New +** → **Web Service**  
3. Conectá tu cuenta de GitHub y elegí el repo `ludo-family`  
4. Configuración:

| Campo | Valor |
|--------|--------|
| Name | `ludo-family` (o el que quieras) |
| Region | la más cercana (ej. Oregon / Frankfurt) |
| Runtime | **Node** |
| Build Command | `npm install` |
| Start Command | `node server/index.js` |
| Instance type | **Free** |

5. **Create Web Service**  
6. Esperá 2–5 minutos hasta que diga **Live**

### 3. Tu link fijo

Render te da algo como:

```text
https://ludo-family-xxxx.onrender.com
```

**Ese es tu link permanente.** Anotalo.

### 4. (Recomendado) Fijar PUBLIC_BASE_URL

1. En Render → tu servicio → **Environment**  
2. **Add Environment Variable**:

| Key | Value |
|-----|--------|
| `PUBLIC_BASE_URL` | `https://ludo-family-xxxx.onrender.com` |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |

3. Save → espera el redeploy  

(La app también puede detectar la URL sola, pero fijarla evita confusiones en las invitaciones.)

### 5. Jugar

1. Todos abren: `https://ludo-family-xxxx.onrender.com`  
2. Uno **Crea sala** → **Copiar invitación**  
3. Los demás se unen  
4. El anfitrión inicia  

**Ese link ya no cambia** mientras el servicio exista.

### Nota del plan Free de Render
- Si nadie entra por ~15 min, se “duerme”.  
- El **primer** visitante puede esperar 30–60 s (cold start).  
- Después va normal.  
- Para que no duerma: plan pago, o un ping cada 10 min a `/api/health`.

---

## Alternativa: Railway

1. https://railway.app → login con GitHub  
2. **New Project** → **Deploy from GitHub repo** → elegí `ludo-family`  
3. Railway detecta Node y corre `npm start`  
4. **Settings → Networking → Generate Domain**  
5. Te queda: `https://ludo-family-production-xxxx.up.railway.app`  
6. Variables (opcional pero recomendado):

```text
PUBLIC_BASE_URL=https://tu-dominio.up.railway.app
HOST=0.0.0.0
```

7. Compartí ese dominio. **Fijo.**

---

## Alternativa: Fly.io

```bash
# en tu PC, con flyctl instalado
cd ludo-matic
fly launch
fly apps open
```

Usá la URL que te da Fly. Opcional:

```bash
fly secrets set PUBLIC_BASE_URL=https://tu-app.fly.dev
```

---

## VPS / tu propio dominio (avanzado)

```bash
# en el servidor
cd ludo-matic
npm install --omit=dev
PUBLIC_BASE_URL=https://ludo.tudominio.com HOST=0.0.0.0 PORT=3000 npm start
```

Nginx (WebSocket obligatorio):

```nginx
server {
  server_name ludo.tudominio.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

HTTPS con Certbot (`certbot --nginx`).

---

## Qué NO sirve como link fijo

| Tipo | ¿Fijo? |
|------|--------|
| `*.trycloudflare.com` | No — expira |
| Preview de Arena (`*.arena.site`) | No — solo dentro del chat |
| `localhost` / IP de casa sin abrir puertos | No desde afuera |
| Render / Railway / Fly / tu dominio | **Sí** |

---

## Checklist post-deploy

- [ ] Abrís `https://tu-app.../api/health` y ves `{"ok":true,"app":"LUDO Family",...}`  
- [ ] Abrís la home y ves LUDO Family  
- [ ] Dos celulares: crear sala + unirse + iniciar  
- [ ] El botón **Copiar invitación** muestra tu dominio fijo (no trycloudflare / arena)

---

## Resumen en 5 líneas

1. Subí `ludo-matic` a GitHub  
2. Render → New Web Service → ese repo  
3. Build: `npm install` · Start: `node server/index.js`  
4. Copiá `https://….onrender.com`  
5. Ese es el link fijo para siempre (o hasta que borres el servicio)
