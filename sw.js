// Service Worker para cache de assets
const CACHE_NAME = 'ferreteria-cache-v1.2';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/products.json'
];

// Instalar y cachear assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cacheando assets críticos');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activar y limpiar caches antiguos
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Eliminando cache antiguo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Interceptar fetch requests
self.addEventListener('fetch', event => {
    // Solo cachear GET requests
    if (event.request.method !== 'GET') return;
    
    // Evitar cachear requests de analytics
    if (event.request.url.includes('analytics')) return;
    
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Si existe en cache, devolverlo
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // Si no, hacer fetch a la red
                return fetch(event.request.clone())
                    .then(response => {
                        // Verificar respuesta válida
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // Clonar para cachear
                        const responseToCache = response.clone();
                        
                        // Agregar al cache
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        
                        return response;
                    })
                    .catch(() => {
                        // Fallback para products.json
                        if (event.request.url.includes('products.json')) {
                            return new Response(JSON.stringify([]), {
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }
                        
                        // Fallback para otros assets
                        if (event.request.url.endsWith('.css')) {
                            return new Response('', {
                                headers: { 'Content-Type': 'text/css' }
                            });
                        }
                        
                        if (event.request.url.endsWith('.js')) {
                            return new Response('', {
                                headers: { 'Content-Type': 'application/javascript' }
                            });
                        }
                    });
            })
    );
});
