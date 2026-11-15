# App Helados

Comparador de descuentos en heladerías de las apps de delivery (PedidosYa, Rappi,
Mercado Libre y Uber Eats). Junta los datos, normaliza las promos a un % efectivo y a
precio por kg, arma rankings y manda alertas por Telegram.

Ubicación por defecto: **Rosario, Santa Fe**. Moneda: ARS. Uso personal.

> Proyecto en construcción. Ver [PROGRESS.md](PROGRESS.md) para el estado actual.

## Estructura

```
connectors/   un módulo por plataforma (misma interfaz, activables desde .env)
normalizer/   convierte cualquier promo a % efectivo y precio por kg
matching/     identifica la misma heladería en distintas plataformas
alerts/       reglas y evaluación
notifiers/    telegram, email
scheduler/    jobs periódicos
api/          FastAPI
web/          templates HTMX
tests/        pytest
```

## Configuración

```bash
cp .env.example .env
# editá .env con tu dirección y tus tokens
```

Instalación, uso y cómo sumar una plataforma nueva se completan a medida que avanzan las fases.
