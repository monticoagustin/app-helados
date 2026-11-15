# Notas para Claude

- Leé `PROGRESS.md` al empezar. Respondé en castellano rioplatense.
- Stack: página estática (`web/`) + extensión de Chrome MV3 (`extension/`). Sin servidor.
  La búsqueda corre en el Chrome del usuario (IP argentina); el sandbox no llega a Rappi ni PedidosYa.
- Para ver datos reales: navegador integrado de la app de escritorio (Rappi anda; PedidosYa
  pide verificación anti-bot y no se saltea).
- Tests: `node --test` (siempre antes de commitear) y `python scripts/e2e_extension.py`.

## Publicación (flujo GitHub → Spacefast, configurado 2026-11-15)

- Destino: carpeta `helados/` del Space teskel (`spc_02ae51f4db5a45b3a6c013388fe16504`) →
  https://teskel.online/helados/
- Action: `.github/workflows/publicar-en-teskel.yml` (copia `web/*` + `helados-extension.zip`).
- Secreto requerido: `SPACEFAST_TOKEN` (API key de Spacefast con escritura sobre teskel).
- Trabajar en ramas. **Merge a main = publicar**: solo cuando el usuario lo pida.
- No editar a mano `helados/` en el Space.
