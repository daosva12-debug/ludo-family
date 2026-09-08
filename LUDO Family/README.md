# LUDO Family

Ludo multijugador online (PC + smartphone, desde cualquier lugar).

## Link fijo (no expira)

Seguí la guía completa:

→ **[LINK-FIJO.md](./LINK-FIJO.md)** (Render / Railway / Fly / VPS)

Resumen rápido (Render):

1. Subí este repo a GitHub  
2. [Render](https://render.com) → New Web Service → el repo  
3. Build: `npm install` · Start: `node server/index.js`  
4. Usá la URL `https://….onrender.com` para siempre  

Variable opcional: `PUBLIC_BASE_URL=https://tu-url-de-render`

## Prueba rápida temporal (expira)

```bash
npm run online          # túnel Cloudflare (link cambia)
npm run stop:online
```

## Local

```bash
npm install
npm start
# http://localhost:3000
```

## Stack

Node.js + Express + Socket.IO · frontend estático · sin build step
