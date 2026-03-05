# Cleanup backend dependencies

## Contexto

El backend contiene dependencias que no pertenecen al entorno server.

Ejemplo:
- recharts
- tailwindcss
- postcss
- autoprefixer

Estas dependencias pertenecen al frontend y aumentan el peso del proyecto.

## Objetivo

Eliminar dependencias que no se usan en el backend para mantener un entorno limpio.

## No-objetivos

No modificar lógica de negocio ni endpoints.

## Criterios de aceptación

- [ ] El backend compila
- [ ] pnpm install funciona
- [ ] pnpm run build funciona
- [ ] pnpm run lint pasa
- [ ] pnpm run typecheck pasa

## Archivos impactados

backend:
package.json

## Estrategia de pruebas

Unit:
Compilar el proyecto.

Manual:
Ejecutar el backend y verificar que las rutas siguen funcionando.