-- Nuevo rol "recepcionista" (solo ve/opera la página de Recepción, sin sidebar). Idempotente.
ALTER TYPE "app_role" ADD VALUE IF NOT EXISTS 'recepcionista';
