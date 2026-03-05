# FLOWJUYU API REFERENCE

## admin.routes.ts

- **GET** /dashboard
- **GET** /tickets/stats
- **GET** /tickets
- **GET** /tickets/:id
- **PATCH** /tickets/:id/assign
- **PATCH** /tickets/:id/status
- **POST** /tickets/:id/reply
- **PATCH** /tickets/:id/close
- **GET** /sellers
- **GET** /sellers/:id
- **PATCH** /sellers/:id/approve
- **PATCH** /sellers/:id/reject
- **PATCH** /sellers/:id/suspend
- **PATCH** /sellers/:id/reactivate
- **PATCH** /sellers/:id/kyc-review
- **GET** /products
- **GET** /products/:id

## admin.ticket.routes.ts

- **GET** /tickets
- **GET** /tickets/:id
- **POST** /tickets/:id/reply
- **PATCH** /tickets/:id/status
- **PATCH** /tickets/:id/assign
- **PATCH** /tickets/:id/close

## analytics.routes.ts

- **GET** /top-products
- **POST** /track/product/:productId
- **POST** /track/seller/:sellerId
- **GET** /seller/analytics

## auth.routes.ts

- **POST** /register
- **POST** /login
- **POST** /register/seller
- **PATCH** /change-password
- **POST** /logout-all
- **POST** /forgot-password
- **POST** /reset-password
- **POST** /login/google
- **POST** /logout
- **GET** /session

## buyer.routes.ts

- **GET** /dashboard
- **GET** /orders
- **GET** /profile
- **PUT** /profile
- **POST** /addresses
- **GET** /addresses
- **PUT** /addresses
- **DELETE** /addresses/:id
- **GET** /favorites
- **POST** /favorites
- **DELETE** /favorites/:id
- **GET** /reviews
- **POST** /reviews
- **DELETE** /reviews/:id
- **GET** /notifications
- **PUT** /notifications/settings
- **GET** /cards
- **POST** /cards
- **DELETE** /cards/:id
- **GET** /warranty
- **POST** /warranty

## intention.routes.ts

- **POST** /intentions

## product.routes.ts

- **GET** /categorias
- **GET** /clases
- **GET** /regiones
- **GET** /telas
- **GET** /accesorios
- **GET** /accesorio-tipos
- **GET** /accesorio-materiales
- **GET** /products
- **GET** /productos
- **GET** /filters/:tipo
- **GET** /categorias/:slug/productos
- **GET** /productos/nuevos
- **GET** /products/trending
- **GET** /products/top-by-category/:categoriaId
- **GET** /products/:id
- **GET** /productos/:id
- **GET** /products/:id/reviews
- **POST** /products/:id/reviews
- **POST** /productos
- **GET** /seller/products
- **GET** /productos/:id/edit
- **PUT** /productos/:id
- **PATCH** /productos/:id/set-principal
- **PATCH** /productos/:id/activo
- **DELETE** /productos/:id
- **DELETE** /productos/:id/imagenes/:imageId

## public.routes.ts

- **GET** /categorias
- **GET** /vendedores/destacados
- **GET** /public/seller/:id

## seller.routes.ts

- **GET** /sellers/top
- **GET** /tiendas
- **GET** /dashboard
- **GET** /orders
- **GET** /profile
- **PATCH** /profile
- **PUT** /customization
- **POST** /validar
- **GET** /analytics
- **GET** /analytics/daily
- **GET** /account-status
- **POST** /tickets
- **GET** /tickets
- **GET** /tickets/:id
- **POST** /tickets/:id/reply
- **PUT** /banner
- **DELETE** /banner
- **GET** /:id

