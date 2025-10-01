| Método | Path | Auth | Archivo | Handlers |
|---|---|---|---|---|
| GET | `/accesorio-materiales` | — | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/product.routes.ts` | getAccesorioMateriales |
| GET | `/accesorio-tipos` | — | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/product.routes.ts` | getAccesorioTipos |
| GET | `/accesorios` | — | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/product.routes.ts` | getAccesorios |
| GET | `/categorias` | — | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/product.routes.ts` | getCategorias |
| GET | `/clases` | — | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/product.routes.ts` | getClases |
| GET | `/dashboard` | seller | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/seller.routes.ts` | getSellerDashboard |
| GET | `/dashboard` | buyer | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/buyer.routes.ts` | getBuyerDashboard |
| POST | `/login` | — | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/auth.routes.ts` | login |
| POST | `/login/google` | — | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/auth.routes.ts` |  |
| POST | `/logout` | — | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/auth.routes.ts` |  |
| GET | `/orders` | seller | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/seller.routes.ts` | getSellerOrders |
| GET | `/orders` | buyer | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/buyer.routes.ts` | getBuyerOrders |
| POST | `/perfil` | seller | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/vendedor.ts` | upsertPerfil |
| DELETE | `/productos/:id` | seller | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/product.routes.ts` | deleteProduct |
| PUT | `/productos/:id` | seller | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/product.routes.ts` | updateProduct |
| GET | `/productos/:id` | seller | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/product.routes.ts` | getProductById |
| PATCH | `/productos/:id/activo` | seller | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/product.routes.ts` | toggleProductActive |
| GET | `/products` | seller | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/seller.routes.ts` | getSellerProducts |
| POST | `/profile` | seller | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/seller.routes.ts` | updateSellerProfile |
| GET | `/profile` | seller | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/seller.routes.ts` | getSellerProfile |
| GET | `/profile` | buyer | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/buyer.routes.ts` | getBuyerProfile |
| POST | `/profile/business` | seller | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/seller.routes.ts` | validateSellerBusiness |
| GET | `/regiones` | — | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/product.routes.ts` | getRegiones |
| POST | `/register` | — | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/auth.routes.ts` | register |
| GET | `/seller/productos` | seller | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/product.routes.ts` | getSellerProducts |
| GET | `/session` | — | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/auth.routes.ts` |  |
| GET | `/telas` | — | `/home/eku-sama/Flowjuyu/Marketplace-Backend-Flowjuyu/src/routes/product.routes.ts` | getTelas |
