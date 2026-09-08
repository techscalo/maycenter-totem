# Lecciones — maycenter-totem

## Dev server: correr SIEMPRE en el puerto 8080
- **Patrón**: el login (Better Auth) falla con `ERROR [Better Auth]: Invalid origin: http://localhost:<puerto>` si el dev NO corre en el puerto de `BETTER_AUTH_URL` del `.env` (= `http://localhost:8080`).
- **Por qué**: `trustedOrigins` se arma desde `BETTER_AUTH_URL`. Cualquier otro origin (p.ej. 3000/3001/3002) es rechazado por el chequeo CSRF → el login no anda aunque la página cargue 200.
- **Cómo aplicar**: lanzar con `node --env-file=.env node_modules/.bin/vite dev --port 8080 --strictPort`. No dejar que Vite caiga a otro puerto si 8080 está ocupado; liberar 8080 primero.

## Asistencia GHL: appointmentStatus nativo ≠ custom field que leen los workflows
- **Patrón**: Recepción marcaba asistencia con `PUT appointmentStatus: "showed"/"noshow"` (campo nativo de la cita), pero el workflow "Recupero citas inasistidas" no puede evaluar el appointmentStatus en un If/Else → se creó un **custom field de contacto "Estado de la cita"** (Asistido/No Asistido) y el workflow decide sobre ESE. Como Recepción nunca escribía el custom field, a pacientes marcados presentes les llegaba igual el mensaje de "no asistió" al día siguiente.
- **Por qué**: doble fuente de verdad para lo mismo. El campo que escribe nuestro sistema y el que lee la automatización de GHL eran distintos y no estaban sincronizados. El `appointmentStatus` es correcto (showed), pero irrelevante para el workflow.
- **Cómo aplicar**: cuando una automatización de GHL dependa de un estado que también toca nuestro código, verificar que escribimos el MISMO campo que ella lee. GHL no expone el appointmentStatus nativo en condiciones If/Else de workflows → si hace falta ramificar por asistencia, hay que espejar a un custom field. Fix: `marcarEstadoTurno` ahora escribe también `estadoCitaField` ("Asistido"/"No Asistido"). El field solo existe en CABA (`qGZJCp60BtzNyipXIjvD`); en La Plata/Diag77 es null y no se escribe. Brecha residual de proceso (no de código): si la recepcionista no marca el turno, el field nunca pasa a "Asistido" y el mensaje se envía igual.
