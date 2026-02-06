// ==============================================
// SISTEMA DE BÚSQUEDA OPTIMIZADO PARA MÓVIL
// Ferretería Carnevale - Versión Ultra Lite
// ==============================================

class OptimizedProductSearch {
    constructor() {
        // Configuración de performance
        this.CONFIG = {
            BATCH_SIZE: 30,
            DEBOUNCE_MS: 300,
            LAZY_LOAD_THRESHOLD: 100,
            MAX_RESULTS: 100,
            CACHE_SIZE: 50
        };

        // Estado de la aplicación
        this.state = {
            products: [],
            filtered: [],
            visible: [],
            rubros: new Set(),
            searchIndex: new Map(),
            loading: false,
            searchTerm: '',
            currentRubro: '',
            sortBy: 'relevance',
            offset: 0,
            hasMore: false
        };

        // Cache de resultados
        this.cache = new Map();
        this.searchCache = new Map();
        
        // Referencias a DOM
        this.refs = {};
        
        // Pool de nodos reutilizables
        this.nodePool = {
            cards: [],
            currentIndex: 0
        };

        // Inicialización diferida
        this.init();
    }

    // ==============================================
    // 1. INICIALIZACIÓN OPTIMIZADA
    // ==============================================

    async init() {
        this.cacheDOM();
        this.setupEventDelegation();
        this.setupIntersectionObserver();
        await this.loadData();
        this.setupInitialState();
    }

    cacheDOM() {
        // Solo cachear elementos críticos
        this.refs = {
            searchInput: document.getElementById('searchInput'),
            productsContainer: document.getElementById('productsContainer'),
            productsViewport: document.getElementById('productsViewport'),
            rubroFilter: document.getElementById('rubroFilter'),
            sortFilter: document.getElementById('sortFilter'),
            productCount: document.getElementById('productCount'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            emptyState: document.getElementById('emptyState'),
            noResults: document.getElementById('noResults'),
            clearBtn: document.getElementById('clearBtn'),
            resetSearch: document.getElementById('resetSearch'),
            modal: document.getElementById('productModal'),
            closeModal: document.getElementById('closeModal'),
            modalContent: document.getElementById('modalContent')
        };
    }

    setupEventDelegation() {
        // Eventos de búsqueda con debounce
        this.refs.searchInput?.addEventListener('input', 
            this.debounce(this.handleSearch.bind(this), this.CONFIG.DEBOUNCE_MS)
        );
        
        // Eventos de cambio en filtros
        this.refs.rubroFilter?.addEventListener('change', this.handleFilterChange.bind(this));
        this.refs.sortFilter?.addEventListener('change', this.handleFilterChange.bind(this));
        
        // Eventos de clic
        document.addEventListener('click', this.handleClick.bind(this));
        
        // Eventos de scroll (passive para mejor performance)
        this.refs.productsViewport?.addEventListener('scroll', 
            this.handleScroll.bind(this), 
            { passive: true }
        );
        
        // Eventos del modal
        this.refs.closeModal?.addEventListener('click', () => this.refs.modal?.close());
        this.refs.modal?.addEventListener('click', (e) => {
            if (e.target === this.refs.modal) this.refs.modal.close();
        });
        
        // Eventos de botones
        this.refs.clearBtn?.addEventListener('click', () => {
            this.refs.searchInput.value = '';
            this.refs.clearBtn.style.display = 'none';
            this.state.searchTerm = '';
            this.showEmptyState();
        });
        
        this.refs.resetSearch?.addEventListener('click', () => {
            this.refs.searchInput.value = '';
            this.state.searchTerm = '';
            this.state.filtered = [];
            this.showEmptyState();
        });
    }

    setupIntersectionObserver() {
        // Observer para lazy loading de productos
        if ('IntersectionObserver' in window) {
            this.observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting && this.state.hasMore && !this.state.loading) {
                            this.loadMoreProducts();
                        }
                    });
                },
                { 
                    root: this.refs.productsViewport, 
                    rootMargin: '50px',
                    threshold: 0.1 
                }
            );
        }
    }

    // ==============================================
    // 2. CARGA DE DATOS EFICIENTE (CORREGIDO)
    // ==============================================

    async loadData() {
        this.showLoading();
        
        try {
            // Stream de datos con fetch optimizado
            const response = await fetch('products.json', {
                priority: 'high',
                cache: 'force-cache'
            });

            if (!response.ok) throw new Error('Error cargando datos');

            // Parseo incremental
            const data = await response.json();
            
            // Procesamiento en lotes para no bloquear UI
            await this.processDataInBatches(data);
            
            // Construir índice de búsqueda DESPUÉS de procesar todos los datos
            this.buildSearchIndex();
            this.updateRubroFilter();
            this.updateProductCount();
            
            this.hideLoading();
            this.showEmptyState();
            
        } catch (error) {
            console.error('Error loading products:', error);
            this.showError();
        }
    }

    async processDataInBatches(data) {
        const batchSize = 1000;
        const totalBatches = Math.ceil(data.length / batchSize);
        
        for (let i = 0; i < totalBatches; i++) {
            const start = i * batchSize;
            const end = start + batchSize;
            const batch = data.slice(start, end);
            
            // Procesar batch sin bloquear
            await this.processBatch(batch);
            
            // Liberar control al event loop cada 5 batches
            if (i % 5 === 0) {
                await this.yieldToMainThread();
            }
        }
    }

    async processBatch(batch) {
        return new Promise(resolve => {
            // Usar requestIdleCallback o setTimeout para no bloquear
            if ('requestIdleCallback' in window) {
                requestIdleCallback(() => {
                    this.processBatchSync(batch);
                    resolve();
                });
            } else {
                // Fallback para navegadores que no soportan requestIdleCallback
                setTimeout(() => {
                    this.processBatchSync(batch);
                    resolve();
                }, 0);
            }
        });
    }

    processBatchSync(batch) {
        batch.forEach(product => {
            // Normalización y almacenamiento eficiente
            const normalized = this.normalizeProduct(product);
            this.state.products.push(normalized);
            
            // Agrupar rubros (esto es síncrono y rápido)
            if (normalized.rubro) {
                this.state.rubros.add(normalized.rubro);
            }
        });
    }

    yieldToMainThread() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    normalizeProduct(product) {
        return {
            codigo: String(product.codigo || '').trim(),
            descripcion: String(product.descripcion || '').trim(),
            rubro: String(product.rubro || '').trim(),
            marca: String(product.marca || '').trim(),
            precio_venta: Number(product.precio_venta) || 0,
            searchable: this.normalizeString(
                `${product.descripcion} ${product.codigo} ${product.marca} ${product.rubro}`
            )
        };
    }

    // ==============================================
    // 3. INDEXACIÓN Y BÚSQUEDA ÓPTIMA (CORREGIDO)
    // ==============================================

    buildSearchIndex() {
        // Índice invertido para búsqueda O(1)
        this.state.searchIndex.clear();
        
        this.state.products.forEach((product, index) => {
            // Indexar por tokens
            const tokens = this.getSearchTokens(product);
            tokens.forEach(token => {
                if (!this.state.searchIndex.has(token)) {
                    this.state.searchIndex.set(token, new Set());
                }
                this.state.searchIndex.get(token).add(index);
            });
        });
    }

    getSearchTokens(product) {
        const tokens = new Set();
        
        // Normalizar y tokenizar cada campo
        const fields = [
            product.descripcion,
            product.codigo,
            product.marca,
            product.rubro
        ];
        
        fields.forEach(field => {
            if (field && field.length > 0) {
                const normalized = this.normalizeString(field);
                const words = normalized.split(/\s+/);
                words.forEach(word => {
                    if (word.length >= 2) {
                        tokens.add(word);
                        // También agregar prefijos para búsqueda incremental
                        for (let i = 2; i <= word.length; i++) {
                            tokens.add(word.substring(0, i));
                        }
                    }
                });
            }
        });
        
        return Array.from(tokens);
    }

    normalizeString(str) {
        if (!str) return '';
        return str
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
            .replace(/[^a-z0-9\s]/g, ' ') // Keep only alphanumeric
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();
    }

    // ==============================================
    // 4. BÚSQUEDA CON DEBOUNCE Y CACHE
    // ==============================================

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    handleSearch(e) {
        const searchTerm = e.target.value.trim();
        this.state.searchTerm = searchTerm;
        
        // Mostrar/ocultar botón clear
        if (this.refs.clearBtn) {
            this.refs.clearBtn.style.display = searchTerm ? 'block' : 'none';
        }
        
        // Si está vacío, mostrar estado inicial
        if (!searchTerm) {
            this.showEmptyState();
            return;
        }
        
        // Realizar búsqueda
        this.performSearch(searchTerm);
    }

    performSearch(searchTerm) {
        const normalizedSearch = this.normalizeString(searchTerm);
        const searchWords = normalizedSearch.split(/\s+/).filter(w => w.length >= 2);
        
        if (searchWords.length === 0) {
            this.state.filtered = [];
            this.renderResults();
            return;
        }
        
        // Verificar cache primero
        const cacheKey = `${searchTerm}-${this.state.currentRubro}-${this.state.sortBy}`;
        
        if (this.searchCache.has(cacheKey)) {
            this.state.filtered = this.searchCache.get(cacheKey);
            this.renderResults();
            return;
        }
        
        // Buscar en índice invertido
        let resultIndices = new Set();
        
        searchWords.forEach((word, index) => {
            const wordResults = this.state.searchIndex.get(word) || new Set();
            
            if (index === 0) {
                resultIndices = new Set(wordResults);
            } else {
                // Intersección para AND search
                resultIndices = new Set(
                    [...resultIndices].filter(x => wordResults.has(x))
                );
            }
        });
        
        // Convertir índices a productos
        this.state.filtered = Array.from(resultIndices)
            .map(idx => this.state.products[idx])
            .filter(product => {
                // Filtrar por rubro si está seleccionado
                if (this.state.currentRubro && product.rubro !== this.state.currentRubro) {
                    return false;
                }
                return product.precio_venta > 0;
            });
        
        // Ordenar resultados
        this.sortResults();
        
        // Cachear resultados (LRU cache)
        if (this.searchCache.size >= this.CONFIG.CACHE_SIZE) {
            const firstKey = this.searchCache.keys().next().value;
            this.searchCache.delete(firstKey);
        }
        this.searchCache.set(cacheKey, [...this.state.filtered]);
        
        // Renderizar resultados
        this.renderResults();
    }

    handleFilterChange() {
        this.state.currentRubro = this.refs.rubroFilter?.value || '';
        this.state.sortBy = this.refs.sortFilter?.value || 'relevance';
        
        // Si hay término de búsqueda, re-buscar con nuevos filtros
        if (this.state.searchTerm) {
            this.performSearch(this.state.searchTerm);
        } else if (this.state.currentRubro) {
            // Filtrar por rubro sin búsqueda
            this.state.filtered = this.state.products.filter(product => {
                if (this.state.currentRubro && product.rubro !== this.state.currentRubro) {
                    return false;
                }
                return true;
            });
            this.sortResults();
            this.renderResults();
        } else {
            // Sin filtros ni búsqueda, mostrar estado inicial
            this.showEmptyState();
        }
    }

    sortResults() {
        const { filtered, sortBy } = this.state;
        
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'price_asc':
                    return a.precio_venta - b.precio_venta;
                case 'price_desc':
                    return b.precio_venta - a.precio_venta;
                case 'relevance':
                default:
                    // Mantener orden de relevancia (score de búsqueda)
                    return 0;
            }
        });
    }

    // ==============================================
    // 5. RENDERIZADO VIRTUALIZADO Y OPTIMIZADO
    // ==============================================

    renderResults() {
        // Resetear offset y estado
        this.state.offset = 0;
        this.state.hasMore = this.state.filtered.length > this.CONFIG.BATCH_SIZE;
        
        // Limpiar container eficientemente
        this.clearContainer();
        
        if (this.state.filtered.length === 0) {
            this.showNoResults();
            return;
        }
        
        // Ocultar estados vacíos
        this.refs.emptyState?.classList.remove('active');
        this.refs.noResults?.classList.remove('active');
        this.refs.productsContainer.style.display = 'grid';
        
        // Renderizar primer lote
        this.renderNextBatch();
        
        // Actualizar contador
        this.updateProductCount();
    }

    clearContainer() {
        const container = this.refs.productsContainer;
        if (!container) return;
        
        // Mover nodos existentes al pool para reutilizar
        while (container.firstChild) {
            const node = container.firstChild;
            container.removeChild(node);
            this.nodePool.cards.push(node);
        }
        
        // Resetear índice del pool
        this.nodePool.currentIndex = 0;
    }

    renderNextBatch() {
        const start = this.state.offset;
        const end = Math.min(start + this.CONFIG.BATCH_SIZE, this.state.filtered.length);
        const batch = this.state.filtered.slice(start, end);
        
        // Usar DocumentFragment para batch update
        const fragment = document.createDocumentFragment();
        
        batch.forEach(product => {
            const node = this.getProductNode(product);
            fragment.appendChild(node);
        });
        
        this.refs.productsContainer.appendChild(fragment);
        
        // Actualizar estado
        this.state.offset = end;
        this.state.hasMore = end < this.state.filtered.length;
        
        // Observar último elemento para infinite scroll
        if (this.state.hasMore && this.observer && this.refs.productsContainer.lastChild) {
            this.observer.observe(this.refs.productsContainer.lastChild);
        }
    }

    getProductNode(product) {
        // Reutilizar nodo del pool si está disponible
        if (this.nodePool.currentIndex < this.nodePool.cards.length) {
            const node = this.nodePool.cards[this.nodePool.currentIndex];
            this.updateProductNode(node, product);
            this.nodePool.currentIndex++;
            return node;
        }
        
        // Crear nuevo nodo
        const node = document.createElement('div');
        node.className = 'product-card';
        node.dataset.id = product.codigo;
        
        this.updateProductNode(node, product);
        return node;
    }

    updateProductNode(node, product) {
        // Actualizar contenido del nodo
        node.innerHTML = `
            <div class="product-image">🛠️</div>
            <div class="product-info">
                <div class="product-code">${this.escapeHtml(product.codigo)}</div>
                <div class="product-desc">${this.escapeHtml(product.descripcion)}</div>
                <div class="product-meta">
                    ${product.marca ? `<span class="product-brand">${this.escapeHtml(product.marca)}</span>` : ''}
                    <span class="product-price">${this.formatPrice(product.precio_venta)}</span>
                </div>
                <div class="product-actions">
                    <button class="btn btn-whatsapp" data-action="whatsapp" data-product='${this.escapeJson(product)}'>
                        WhatsApp
                    </button>
                    <button class="btn btn-details" data-action="details" data-product='${this.escapeJson(product)}'>
                        Detalles
                    </button>
                </div>
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeJson(obj) {
        return JSON.stringify(obj).replace(/"/g, '&quot;');
    }

    // ==============================================
    // 6. MANEJO DE EVENTOS Y SCROLL
    // ==============================================

    handleScroll() {
        // Virtual scrolling optimizado con requestAnimationFrame
        if (this.scrollRaf) return;
        
        this.scrollRaf = requestAnimationFrame(() => {
            const scrollTop = this.refs.productsViewport.scrollTop;
            const scrollHeight = this.refs.productsViewport.scrollHeight;
            const clientHeight = this.refs.productsViewport.clientHeight;
            
            // Cargar más productos cuando esté cerca del final
            if (scrollHeight - scrollTop - clientHeight < 200 && 
                this.state.hasMore && 
                !this.state.loading) {
                this.loadMoreProducts();
            }
            
            this.scrollRaf = null;
        });
    }

    loadMoreProducts() {
        if (this.state.loading || !this.state.hasMore) return;
        
        this.state.loading = true;
        requestAnimationFrame(() => {
            this.renderNextBatch();
            this.state.loading = false;
        });
    }

    handleClick(e) {
        const target = e.target;
        
        // Delegación de eventos para botones de productos
        if (target.matches('[data-action]') || target.closest('[data-action]')) {
            const button = target.matches('[data-action]') ? target : target.closest('[data-action]');
            const action = button.dataset.action;
            const product = JSON.parse(button.dataset.product.replace(/&quot;/g, '"'));
            
            if (action === 'whatsapp') {
                this.openWhatsApp(product);
            } else if (action === 'details') {
                this.openProductModal(product);
            }
            e.stopPropagation();
        }
    }

    // ==============================================
    // 7. FUNCIONALIDADES PRINCIPALES
    // ==============================================

    openWhatsApp(product) {
        const message = `Hola, quiero consultar por:
${product.descripcion}
Código: ${product.codigo}
Precio: $${this.formatPrice(product.precio_venta)}`;
        
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    openProductModal(product) {
        if (!this.refs.modal || !this.refs.modalContent) return;
        
        const content = `
            <h3>${this.escapeHtml(product.descripcion)}</h3>
            <p><strong>Código:</strong> ${this.escapeHtml(product.codigo)}</p>
            ${product.marca ? `<p><strong>Marca:</strong> ${this.escapeHtml(product.marca)}</p>` : ''}
            ${product.rubro ? `<p><strong>Rubro:</strong> ${this.escapeHtml(product.rubro)}</p>` : ''}
            <p class="modal-price"><strong>Precio:</strong> $${this.formatPrice(product.precio_venta)}</p>
            <button class="btn btn-whatsapp" id="modalWhatsAppBtn">
                Consultar por WhatsApp
            </button>
        `;
        
        this.refs.modalContent.innerHTML = content;
        
        // Agregar evento al botón del modal
        const whatsappBtn = document.getElementById('modalWhatsAppBtn');
        if (whatsappBtn) {
            whatsappBtn.addEventListener('click', () => {
                this.openWhatsApp(product);
                this.refs.modal.close();
            });
        }
        
        this.refs.modal.showModal();
    }

    formatPrice(price) {
        if (isNaN(price)) return '0';
        return new Intl.NumberFormat('es-AR').format(Math.round(price));
    }

    updateProductCount() {
        if (!this.refs.productCount) return;
        
        const total = this.state.products.length;
        const showing = this.state.filtered.length || (this.state.searchTerm ? 0 : total);
        
        let text = `${total} productos disponibles`;
        
        if (this.state.searchTerm || this.state.currentRubro) {
            text = `${showing} de ${total} productos`;
        }
        
        this.refs.productCount.textContent = text;
    }

    updateRubroFilter() {
        const rubros = Array.from(this.state.rubros).sort();
        const select = this.refs.rubroFilter;
        
        if (!select) return;
        
        // Limpiar opciones existentes (excepto la primera)
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // Agregar opciones de rubro
        rubros.forEach(rubro => {
            if (rubro && rubro.trim()) {
                const option = document.createElement('option');
                option.value = rubro;
                option.textContent = rubro;
                select.appendChild(option);
            }
        });
    }

    // ==============================================
    // 8. ESTADOS DE UI Y MANEJO DE ERRORES
    // ==============================================

    showLoading() {
        if (this.refs.loadingIndicator) {
            this.refs.loadingIndicator.classList.add('active');
        }
        if (this.refs.productsContainer) {
            this.refs.productsContainer.style.display = 'none';
        }
        this.hideOtherStates();
    }

    hideLoading() {
        if (this.refs.loadingIndicator) {
            this.refs.loadingIndicator.classList.remove('active');
        }
    }

    showEmptyState() {
        if (this.refs.emptyState) {
            this.refs.emptyState.classList.add('active');
        }
        if (this.refs.productsContainer) {
            this.refs.productsContainer.style.display = 'none';
        }
        this.hideOtherStates();
        this.updateProductCount();
    }

    showNoResults() {
        if (this.refs.noResults) {
            this.refs.noResults.classList.add('active');
        }
        if (this.refs.productsContainer) {
            this.refs.productsContainer.style.display = 'none';
        }
        this.hideOtherStates();
        this.updateProductCount();
    }

    hideOtherStates() {
        if (this.refs.emptyState) {
            this.refs.emptyState.classList.remove('active');
        }
        if (this.refs.noResults) {
            this.refs.noResults.classList.remove('active');
        }
        if (this.refs.loadingIndicator) {
            this.refs.loadingIndicator.classList.remove('active');
        }
    }

    showError() {
        if (this.refs.productCount) {
            this.refs.productCount.textContent = 'Error cargando productos';
        }
        this.hideLoading();
        
        // Mostrar mensaje de error
        if (this.refs.productsContainer) {
            this.refs.productsContainer.innerHTML = `
                <div class="error-state">
                    <p>⚠️ Error al cargar los productos</p>
                    <button onclick="location.reload()" class="btn">Reintentar</button>
                </div>
            `;
            this.refs.productsContainer.style.display = 'block';
        }
    }

    setupInitialState() {
        // Pre-cache de nodos para reutilización
        this.prefillNodePool();
        
        // Ajustar altura del viewport para mobile
        this.setViewportHeight();
        
        // Configurar resize listener (debounced)
        window.addEventListener('resize', this.debounce(() => {
            this.setViewportHeight();
        }, 250));
        
        // Cargar primeros productos si no hay búsqueda
        if (!this.state.searchTerm && this.state.products.length > 0) {
            this.state.filtered = this.state.products.slice(0, this.CONFIG.BATCH_SIZE);
            this.state.hasMore = this.state.products.length > this.CONFIG.BATCH_SIZE;
            this.renderResults();
        }
    }

    prefillNodePool() {
        // Crear algunos nodos por adelantado para reutilizar
        for (let i = 0; i < 10; i++) {
            const node = document.createElement('div');
            node.className = 'product-card';
            this.nodePool.cards.push(node);
        }
    }

    setViewportHeight() {
        // Ajustar altura para mobile (evitar problemas con viewport en iOS)
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
        
        // Calcular altura del viewport de productos
        const header = document.querySelector('.app-header');
        const searchSection = document.querySelector('.search-section');
        const footer = document.querySelector('.app-footer');
        
        if (header && searchSection && this.refs.productsViewport) {
            const headerHeight = header.offsetHeight;
            const searchHeight = searchSection.offsetHeight;
            const footerHeight = footer ? footer.offsetHeight : 0;
            
            const viewportHeight = window.innerHeight - headerHeight - searchHeight - footerHeight;
            this.refs.productsViewport.style.height = `${viewportHeight}px`;
        }
    }
}

// ==============================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ==============================================

// Polyfill para requestIdleCallback en navegadores que no lo soportan
if (!window.requestIdleCallback) {
    window.requestIdleCallback = function(callback) {
        return setTimeout(() => {
            callback({
                didTimeout: false,
                timeRemaining: function() {
                    return 50;
                }
            });
        }, 1);
    };
}

if (!window.cancelIdleCallback) {
    window.cancelIdleCallback = function(id) {
        clearTimeout(id);
    };
}

// Iniciar aplicación cuando el DOM esté listo
let app;

document.addEventListener('DOMContentLoaded', () => {
    try {
        app = new OptimizedProductSearch();
        window.app = app; // Exponer para debugging
    } catch (error) {
        console.error('Error inicializando la aplicación:', error);
        document.body.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <h2>⚠️ Error en la aplicación</h2>
                <p>${error.message}</p>
                <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 20px;">
                    Recargar página
                </button>
            </div>
        `;
    }
});

// Service Worker para cache (opcional)
if ('serviceWorker' in navigator && window.location.hostname !== 'localhost') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.log('ServiceWorker registration failed:', err);
        });
    });
}
