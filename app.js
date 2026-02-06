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
            closeModal: document.getElementById('closeModal')
        };
    }

    setupEventDelegation() {
        // Un solo listener para todos los eventos
        document.addEventListener('input', this.debounce(this.handleSearch.bind(this), this.CONFIG.DEBOUNCE_MS));
        document.addEventListener('change', this.handleFilterChange.bind(this));
        document.addEventListener('click', this.handleClick.bind(this));
        
        // Eventos táctiles optimizados
        this.refs.productsViewport.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });
        
        // Eventos del modal
        this.refs.closeModal?.addEventListener('click', () => this.refs.modal.close());
        this.refs.modal?.addEventListener('click', (e) => {
            if (e.target === this.refs.modal) this.refs.modal.close();
        });
    }

    setupIntersectionObserver() {
        // Observer para lazy loading de productos
        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting && this.state.hasMore) {
                        this.loadMoreProducts();
                    }
                });
            },
            { root: this.refs.productsViewport, threshold: 0.1 }
        );
    }

    // ==============================================
    // 2. CARGA DE DATOS EFICIENTE
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
            
            // Liberar control al event loop
            if (i % 5 === 0) await this.yieldToMainThread();
        }
        
        // Construir índice después de procesar todo
        this.buildSearchIndex();
        this.updateRubroFilter();
        this.updateProductCount();
    }

    async processBatch(batch) {
        return new Promise(resolve => {
            requestIdleCallback(() => {
                batch.forEach(product => {
                    // Normalización y almacenamiento eficiente
                    const normalized = this.normalizeProduct(product);
                    this.state.products.push(normalized);
                    
                    // Indexar para búsqueda rápida
                    this.indexProduct(normalized);
                    
                    // Agrupar rubros
                    if (normalized.rubro) {
                        this.state.rubros.add(normalized.rubro);
                    }
                });
                resolve();
            });
        });
    }

    yieldToMainThread() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    // ==============================================
    // 3. INDEXACIÓN Y BÚSQUEDA ÓPTIMA
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
            if (field) {
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

    normalizeString(str) {
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

    async handleSearch(e) {
        if (e.target !== this.refs.searchInput) return;
        
        const searchTerm = e.target.value.trim();
        this.state.searchTerm = searchTerm;
        
        // Limpiar si está vacío
        if (!searchTerm) {
            this.refs.clearBtn.style.display = 'none';
            this.showEmptyState();
            return;
        }
        
        this.refs.clearBtn.style.display = 'block';
        
        // Verificar cache primero
        const cacheKey = `${searchTerm}-${this.state.currentRubro}-${this.state.sortBy}`;
        
        if (this.searchCache.has(cacheKey)) {
            this.state.filtered = this.searchCache.get(cacheKey);
            this.renderResults();
            return;
        }
        
        // Búsqueda optimizada con índice
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
        
        // Buscar en índice
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
        
        // Cachear resultados
        if (this.searchCache.size >= this.CONFIG.CACHE_SIZE) {
            const firstKey = this.searchCache.keys().next().value;
            this.searchCache.delete(firstKey);
        }
        this.searchCache.set(cacheKey, this.state.filtered);
        
        // Renderizar
        this.renderResults();
    }

    // ==============================================
    // 5. RENDERIZADO VIRTUALIZADO
    // ==============================================

    renderResults() {
        // Resetear offset
        this.state.offset = 0;
        this.state.hasMore = this.state.filtered.length > this.CONFIG.BATCH_SIZE;
        
        // Limpiar container eficientemente
        this.clearContainer();
        
        if (this.state.filtered.length === 0) {
            this.showNoResults();
            return;
        }
        
        // Renderizar primer lote
        this.renderNextBatch();
        
        // Actualizar contador
        this.updateProductCount();
    }

    clearContainer() {
        // Reutilizar nodos en lugar de recrearlos
        const container = this.refs.productsContainer;
        
        // Mover nodos al pool
        while (container.firstChild) {
            const node = container.firstChild;
            container.removeChild(node);
            this.nodePool.cards.push(node);
        }
        
        // Resetear pool index
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
        if (this.state.hasMore) {
            const lastChild = this.refs.productsContainer.lastChild;
            this.observer.observe(lastChild);
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
        // Actualizar solo lo necesario
        node.innerHTML = `
            <div class="product-image">🛠️</div>
            <div class="product-info">
                <div class="product-code">${product.codigo}</div>
                <div class="product-desc">${product.descripcion}</div>
                <div class="product-meta">
                    ${product.marca ? `<span class="product-brand">${product.marca}</span>` : ''}
                    <span class="product-price">${this.formatPrice(product.precio_venta)}</span>
                </div>
                <div class="product-actions">
                    <button class="btn btn-whatsapp" data-action="whatsapp" data-product='${JSON.stringify(product)}'>
                        WhatsApp
                    </button>
                    <button class="btn btn-details" data-action="details" data-product='${JSON.stringify(product)}'>
                        Detalles
                    </button>
                </div>
            </div>
        `;
    }

    // ==============================================
    // 6. MANEJO DE EVENTOS OPTIMIZADO
    // ==============================================

    handleFilterChange(e) {
        if (e.target === this.refs.rubroFilter) {
            this.state.currentRubro = e.target.value;
        } else if (e.target === this.refs.sortFilter) {
            this.state.sortBy = e.target.value;
        }
        
        // Re-buscar con nuevos filtros
        if (this.state.searchTerm) {
            this.performSearch(this.state.searchTerm);
        }
    }

    handleClick(e) {
        const target = e.target;
        
        // Delegación de eventos para botones
        if (target.matches('[data-action]')) {
            const action = target.dataset.action;
            const product = JSON.parse(target.dataset.product);
            
            if (action === 'whatsapp') {
                this.openWhatsApp(product);
            } else if (action === 'details') {
                this.openProductModal(product);
            }
        }
        
        // Botón clear
        if (target === this.refs.clearBtn) {
            this.refs.searchInput.value = '';
            this.refs.clearBtn.style.display = 'none';
            this.state.searchTerm = '';
            this.showEmptyState();
        }
        
        // Botón reset search
        if (target === this.refs.resetSearch) {
            this.refs.searchInput.value = '';
            this.state.searchTerm = '';
            this.state.filtered = [];
            this.showEmptyState();
        }
    }

    handleScroll() {
        // Virtual scrolling simple
        requestAnimationFrame(() => {
            const scrollTop = this.refs.productsViewport.scrollTop;
            const scrollHeight = this.refs.productsViewport.scrollHeight;
            const clientHeight = this.refs.productsViewport.clientHeight;
            
            if (scrollHeight - scrollTop - clientHeight < 100 && this.state.hasMore) {
                this.loadMoreProducts();
            }
        });
    }

    // ==============================================
    // 7. FUNCIONALIDADES AUXILIARES
    // ==============================================

    loadMoreProducts() {
        if (this.state.loading || !this.state.hasMore) return;
        
        this.state.loading = true;
        requestAnimationFrame(() => {
            this.renderNextBatch();
            this.state.loading = false;
        });
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
                    // Mantener orden de relevancia (ya está ordenado por la búsqueda)
                    return 0;
            }
        });
    }

    openWhatsApp(product) {
        const message = `Hola, quiero consultar por:
${product.descripcion}
Código: ${product.codigo}
Precio: $${this.formatPrice(product.precio_venta)}`;
        
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }

    openProductModal(product) {
        const content = `
            <h3>${product.descripcion}</h3>
            <p><strong>Código:</strong> ${product.codigo}</p>
            ${product.marca ? `<p><strong>Marca:</strong> ${product.marca}</p>` : ''}
            ${product.rubro ? `<p><strong>Rubro:</strong> ${product.rubro}</p>` : ''}
            <p class="modal-price"><strong>Precio:</strong> $${this.formatPrice(product.precio_venta)}</p>
            <button class="btn btn-whatsapp" onclick="app.openWhatsApp(${JSON.stringify(product)})">
                Consultar por WhatsApp
            </button>
        `;
        
        this.refs.modalContent.innerHTML = content;
        this.refs.modal.showModal();
    }

    formatPrice(price) {
        return new Intl.NumberFormat('es-AR').format(price);
    }

    updateProductCount() {
        const total = this.state.products.length;
        const showing = this.state.filtered.length || total;
        
        this.refs.productCount.textContent = 
            this.state.searchTerm || this.state.currentRubro
                ? `${showing} de ${total} productos`
                : `${total} productos disponibles`;
    }

    updateRubroFilter() {
        const rubros = Array.from(this.state.rubros).sort();
        const select = this.refs.rubroFilter;
        
        // Limpiar opciones existentes (excepto la primera)
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // Agregar opciones
        rubros.forEach(rubro => {
            const option = document.createElement('option');
            option.value = rubro;
            option.textContent = rubro;
            select.appendChild(option);
        });
    }

    // ==============================================
    // 8. ESTADOS DE UI OPTIMIZADOS
    // ==============================================

    showLoading() {
        this.refs.loadingIndicator?.classList.add('active');
        this.refs.emptyState?.classList.remove('active');
        this.refs.noResults?.classList.remove('active');
        this.refs.productsContainer.style.display = 'none';
    }

    hideLoading() {
        this.refs.loadingIndicator?.classList.remove('active');
    }

    showEmptyState() {
        this.refs.emptyState?.classList.add('active');
        this.refs.noResults?.classList.remove('active');
        this.refs.productsContainer.style.display = 'none';
        this.state.filtered = [];
        this.clearContainer();
        this.updateProductCount();
    }

    showNoResults() {
        this.refs.noResults?.classList.add('active');
        this.refs.emptyState?.classList.remove('active');
        this.refs.productsContainer.style.display = 'none';
    }

    showError() {
        this.refs.productCount.textContent = 'Error cargando productos';
        this.refs.loadingIndicator.classList.remove('active');
    }

    setupInitialState() {
        // Pre-cache de nodos
        this.prefillNodePool();
        
        // Establecer altura del viewport
        this.setViewportHeight();
        
        // Cargar primeros productos si no hay búsqueda
        if (!this.state.searchTerm) {
            this.state.filtered = this.state.products.slice(0, this.CONFIG.BATCH_SIZE);
            this.state.hasMore = this.state.products.length > this.CONFIG.BATCH_SIZE;
            this.renderResults();
        }
    }

    prefillNodePool() {
        // Crear algunos nodos por adelantado
        for (let i = 0; i < 10; i++) {
            const node = document.createElement('div');
            node.className = 'product-card';
            this.nodePool.cards.push(node);
        }
    }

    setViewportHeight() {
        // Ajustar altura para mobile
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
        
        this.refs.productsViewport.style.height = 
            `calc(var(--vh, 1vh) * 100 - ${this.refs.appHeader?.offsetHeight + this.refs.searchSection?.offsetHeight}px)`;
    }
}

// ==============================================
// INICIALIZACIÓN
// ==============================================

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Polyfill para requestIdleCallback
    window.requestIdleCallback = window.requestIdleCallback || 
        function(cb) { return setTimeout(cb, 1); };
    
    // Iniciar aplicación
    window.app = new OptimizedProductSearch();
});

// Service Worker para cache (opcional pero recomendado)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}
