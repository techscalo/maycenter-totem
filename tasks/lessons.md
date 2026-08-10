# Lecciones — maycenter-totem

## Dev server: correr SIEMPRE en el puerto 8080
- **Patrón**: el login (Better Auth) falla con `ERROR [Better Auth]: Invalid origin: http://localhost:<puerto>` si el dev NO corre en el puerto de `BETTER_AUTH_URL` del `.env` (= `http://localhost:8080`).
- **Por qué**: `trustedOrigins` se arma desde `BETTER_AUTH_URL`. Cualquier otro origin (p.ej. 3000/3001/3002) es rechazado por el chequeo CSRF → el login no anda aunque la página cargue 200.
- **Cómo aplicar**: lanzar con `node --env-file=.env node_modules/.bin/vite dev --port 8080 --strictPort`. No dejar que Vite caiga a otro puerto si 8080 está ocupado; liberar 8080 primero.
