// ==============================================
// SISTEMA DE BÚSQUEDA COMERCIAL FERRETERÍA
// Versión optimizada para móvil +6000 productos
// ==============================================

class FerreteriaSearchSystem {
    constructor() {
        // CONFIGURACIÓN COMERCIAL
        this.CONFIG = {
            MAX_RESULTS: 25,           // Máximo de resultados relevantes
            DEBOUNCE_MS: 350,          // Debounce optimizado para móvil
            MIN_SCORE: 0.15,           // Puntaje mínimo para mostrar
            BATCH_SIZE: 15,            // Renderizado por lotes
            CACHE_SIZE: 50,            // Cache de búsquedas LRU
            SCORE_WEIGHTS: {
                CODIGO_EXACTO: 100,
                CODIGO_STARTS_WITH: 50,
                CODIGO_CONTAINS: 30,
                DESCRIPCION_EXACTA: 40,
                DESCRIPCION_PALABRA: 35,
                DESCRIPCION_CONTAINS: 20,
                MARCA_EXACTA: 25,
                MARCA_CONTAINS: 15,
                RUBRO_EXACTO: 10,
                MULTIPLE_MATCHES: 5
            }
        };

        // ESTADO DE LA APLICACIÓN
        this.state = {
            products: [],               // Productos originales
            normalizedData: [],         // Datos normalizados para búsqueda
            searchIndex: new Map(),     // Índice invertido por palabra
            rubros: new Set(),          // Rubros únicos
            searchTerm: '',             // Término actual de búsqueda
            currentRubro: '',           // Rubro seleccionado
            results: [],                // Resultados actuales (con score)
            offset: 0,                  // Offset para scroll infinito
            hasMore: false,             // Si hay más resultados
            isLoading: false,           // Estado de carga
            lastSearchTime: 0           // Tiempo de última búsqueda
        };

        // CACHE Y OPTIMIZACIONES
        this.searchCache = new Map();   // Cache LRU de búsquedas
        this.nodePool = [];             // Pool de nodos DOM reutilizables
        this.debounceTimer = null;      // Timer para debounce
        
        // REFERENCIAS DOM
        this.refs = {};
        
        // ESTADÍSTICAS
        this.stats = {
            totalProducts: 0,
            searchCount: 0,
            avgSearchTime: 0
        };

        // INICIALIZAR
        this.init();
    }

    // ==============================================
    // 1. INICIALIZACIÓN DEL SISTEMA
    // ==============================================

    async init() {
        try {
            // Ocultar critical loading
            this.hideCriticalLoading();
            
            // Cachear referencias DOM
            this.cacheDOMReferences();
            
            // Configurar event listeners
            this.setupEventListeners();
            
            // Cargar productos
            await this.loadProducts();
            
            // Construir estructuras de búsqueda
            this.buildSearchStructures();
            
            // Configurar UI inicial
            this.setupInitialUI();
            
            // Mostrar UI principal
            this.showMainUI();
            
        } catch (error) {
            console.error('Error inicializando sistema:', error);
            this.showFatalError(error);
        }
    }

    hideCriticalLoading() {
        const loadingEl = document.getElementById('criticalLoading');
        if (loadingEl) {
            loadingEl.style.opacity = '0';
            setTimeout(() => {
                loadingEl.style.display = 'none';
            }, 300);
        }
    }

    showMainUI() {
        const appContainer = document.getElementById('appContainer');
        if (appContainer) {
            appContainer.style.display = 'block';
            setTimeout(() => {
                appContainer.style.opacity = '1';
            }, 50);
        }
    }

    cacheDOMReferences() {
        this.refs = {
            // Inputs y controles
            searchInput: document.getElementById('searchInput'),
            clearBtn: document.getElementById('clearBtn'),
            rubroFilter: document.getElementById('rubroFilter'),
            sortFilter: document.getElementById('sortFilter'),
            resetSearch: document.getElementById('resetSearch'),
            
            // Contenedores
            productsContainer: document.getElementById('productsContainer'),
            productsViewport: document.getElementById('productsViewport'),
            scrollLoader: document.getElementById('scrollLoader'),
            
            // Estados
            emptyState: document.getElementById('emptyState'),
            noResults: document.getElementById('noResults'),
            loadingState: document.getElementById('loadingState'),
            
            // Información
            productCount: document.getElementById('productCount'),
            resultsCount: document.getElementById('resultsCount'),
            searchTime: document.getElementById('searchTime'),
            resultsInfo: document.getElementById('resultsInfo'),
            lastUpdate: document.getElementById('lastUpdate'),
            
            // Modal
            modalOverlay: document.getElementById('modalOverlay'),
            modalClose: document.getElementById('modalClose'),
            modalBody: document.getElementById('modalBody'),
            modalWhatsAppBtn: document.getElementById('modalWhatsAppBtn')
        };
    }

    setupEventListeners() {
        // Evento de búsqueda con debounce
        this.refs.searchInput?.addEventListener('input', (e) => {
            this.handleSearchInput(e.target.value);
        });

        // Botón clear
        this.refs.clearBtn?.addEventListener('click', () => {
            this.clearSearch();
        });

        // Filtro por rubro
        this.refs.rubroFilter?.addEventListener('change', (e) => {
            this.state.currentRubro = e.target.value;
            this.performSearch();
        });

        // Ordenamiento
        this.refs.sortFilter?.addEventListener('change', (e) => {
            this.sortResults(e.target.value);
            this.renderResults();
        });

        // Reset search
        this.refs.resetSearch?.addEventListener('click', () => {
            this.resetSearch();
        });

        // Scroll infinito
        this.refs.productsViewport?.addEventListener('scroll', () => {
            this.handleScroll();
        }, { passive: true });

        // Modal
        this.refs.modalClose?.addEventListener('click', () => {
            this.hideModal();
        });

        this.refs.modalOverlay?.addEventListener('click', (e) => {
            if (e.target === this.refs.modalOverlay) {
                this.hideModal();
            }
        });

        // Cerrar modal con ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.refs.modalOverlay.style.display === 'block') {
                this.hideModal();
            }
        });

        // Delegación de eventos para botones de producto
        document.addEventListener('click', (e) => this.handleProductClick(e));
    }

    // ==============================================
    // 2. CARGA Y PROCESAMIENTO DE DATOS
    // ==============================================

    async loadProducts() {
        this.showLoadingState();
        
        try {
            const startTime = performance.now();
            const response = await fetch('products.json', {
                cache: 'force-cache',
                headers: {
                    'Cache-Control': 'max-age=3600'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const products = await response.json();
            const loadTime = performance.now() - startTime;
            
            console.log(`✅ Productos cargados: ${products.length} en ${loadTime.toFixed(0)}ms`);
            
            // Procesar productos
            this.processProducts(products);
            
            // Actualizar estadísticas
            this.stats.totalProducts = products.length;
            
            // Actualizar fecha de actualización
            this.updateLastUpdateDate();
            
            this.hideLoadingState();
            
        } catch (error) {
            console.error('❌ Error cargando productos:', error);
            this.showErrorState('No se pudieron cargar los productos. Verifica la conexión.');
            throw error;
        }
    }

    processProducts(products) {
        const startTime = performance.now();
        
        // Limpiar datos anteriores
        this.state.products = [];
        this.state.normalizedData = [];
        this.state.rubros.clear();
        
        // Procesar cada producto
        products.forEach((product, index) => {
            // Validar datos mínimos
            if (!product.codigo || !product.descripcion || !product.precio_venta) {
                return; // Saltar producto incompleto
            }
            
            // Crear objeto normalizado UNA VEZ
            const normalized = {
                index: index,
                codigo: String(product.codigo).trim(),
                descripcion: String(product.descripcion).trim(),
                rubro: String(product.rubro || '').trim(),
                marca: String(product.marca || '').trim(),
                precio_venta: Number(product.precio_venta) || 0,
                
                // Campos normalizados para búsqueda (creados una sola vez)
                searchText: this.normalizeSearchText(
                    `${product.codigo} ${product.descripcion} ${product.marca} ${product.rubro}`
                ),
                codigoNormalized: this.normalizeText(product.codigo),
                descripcionNormalized: this.normalizeText(product.descripcion),
                marcaNormalized: this.normalizeText(product.marca || ''),
                rubroNormalized: this.normalizeText(product.rubro || '')
            };
            
            // Guardar productos
            this.state.products.push({
                ...product,
                codigo: normalized.codigo,
                descripcion: normalized.descripcion,
                rubro: normalized.rubro,
                marca: normalized.marca,
                precio_venta: normalized.precio_venta
            });
            
            this.state.normalizedData.push(normalized);
            
            // Agregar rubro
            if (normalized.rubro) {
                this.state.rubros.add(normalized.rubro);
            }
        });
        
        const processTime = performance.now() - startTime;
        console.log(`✅ Productos procesados: ${this.state.products.length} en ${processTime.toFixed(0)}ms`);
    }

    normalizeSearchText(text) {
        // Normalización COMPLETA para búsqueda (hacer solo una vez)
        return this.normalizeText(text)
            .replace(/[^a-z0-9\s]/g, ' ')   // Eliminar símbolos
            .replace(/\s+/g, ' ')           // Unificar espacios
            .trim();
    }

    normalizeText(text) {
        // Normalización básica: minúsculas y sin acentos
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    // ==============================================
    // 3. CONSTRUCCIÓN DE ÍNDICES DE BÚSQUEDA
    // ==============================================

    buildSearchStructures() {
        const startTime = performance.now();
        
        // Limpiar índice anterior
        this.state.searchIndex.clear();
        
        // Construir índice invertido por palabra
        this.state.normalizedData.forEach((product, index) => {
            // Obtener palabras únicas del searchText
            const words = new Set(product.searchText.split(/\s+/));
            
            // Indexar cada palabra
            words.forEach(word => {
                if (word.length >= 2) { // Ignorar palabras muy cortas
                    if (!this.state.searchIndex.has(word)) {
                        this.state.searchIndex.set(word, new Set());
                    }
                    this.state.searchIndex.get(word).add(index);
                }
            });
        });
        
        // Actualizar UI
        this.updateRubroFilter();
        this.updateProductCount();
        
        const indexTime = performance.now() - startTime;
        console.log(`✅ Índice construido: ${this.state.searchIndex.size} palabras únicas en ${indexTime.toFixed(0)}ms`);
    }

    // ==============================================
    // 4. SISTEMA DE BÚSQUEDA CON SCORING COMERCIAL
    // ==============================================

    handleSearchInput(searchTerm) {
        // Actualizar término
        this.state.searchTerm = searchTerm.trim();
        
        // Mostrar/ocultar botón clear
        if (this.refs.clearBtn) {
            this.refs.clearBtn.style.display = searchTerm ? 'block' : 'none';
        }
        
        // Si está vacío, mostrar estado inicial
        if (!searchTerm) {
            this.showEmptyState();
            return;
        }
        
        // Debounce de búsqueda
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.performSearch();
        }, this.CONFIG.DEBOUNCE_MS);
    }

    performSearch() {
        const startTime = performance.now();
        
        // Verificar cache
        const cacheKey = this.getCacheKey();
        if (this.searchCache.has(cacheKey)) {
            this.state.results = this.searchCache.get(cacheKey);
            this.renderResults();
            
            const cacheTime = performance.now() - startTime;
            this.updateSearchStats(cacheTime, true);
            return;
        }
        
        // Buscar productos relevantes
        const relevantProducts = this.findRelevantProducts();
        
        // Calcular scores
        const scoredResults = this.calculateProductScores(relevantProducts);
        
        // Filtrar y ordenar
        this.state.results = scoredResults
            .filter(result => result.score >= this.CONFIG.MIN_SCORE)
            .sort((a, b) => b.score - a.score)
            .slice(0, this.CONFIG.MAX_RESULTS);
        
        // Cachear resultados
        this.cacheSearchResults(cacheKey);
        
        // Renderizar
        this.renderResults();
        
        // Actualizar estadísticas
        const searchTime = performance.now() - startTime;
        this.updateSearchStats(searchTime, false);
    }

    findRelevantProducts() {
        if (!this.state.searchTerm) return [];
        
        const searchWords = this.normalizeSearchText(this.state.searchTerm)
            .split(/\s+/)
            .filter(word => word.length >= 2);
        
        if (searchWords.length === 0) return [];
        
        // Encontrar productos que contengan TODAS las palabras (AND lógico)
        let productIndices = null;
        
        searchWords.forEach((word, index) => {
            const indices = this.state.searchIndex.get(word) || new Set();
            
            if (index === 0) {
                productIndices = new Set(indices);
            } else {
                // Intersección de conjuntos
                productIndices = new Set(
                    [...productIndices].filter(idx => indices.has(idx))
                );
            }
        });
        
        if (!productIndices || productIndices.size === 0) {
            return [];
        }
        
        // Convertir índices a productos
        return Array.from(productIndices).map(index => ({
            product: this.state.products[index],
            normalized: this.state.normalizedData[index],
            index: index
        }));
    }

    calculateProductScores(products) {
        if (!this.state.searchTerm || products.length === 0) {
            return [];
        }
        
        const searchWords = this.normalizeSearchText(this.state.searchTerm)
            .split(/\s+/)
            .filter(word => word.length >= 2);
        
        return products.map(item => {
            let score = 0;
            const { normalized } = item;
            
            searchWords.forEach(word => {
                // 1. PUNTUACIÓN POR CÓDIGO (MÁXIMA PRIORIDAD)
                if (normalized.codigoNormalized === word) {
                    score += this.CONFIG.SCORE_WEIGHTS.CODIGO_EXACTO;
                } else if (normalized.codigoNormalized.startsWith(word)) {
                    score += this.CONFIG.SCORE_WEIGHTS.CODIGO_STARTS_WITH;
                } else if (normalized.codigoNormalized.includes(word)) {
                    score += this.CONFIG.SCORE_WEIGHTS.CODIGO_CONTAINS;
                }
                
                // 2. PUNTUACIÓN POR DESCRIPCIÓN (ALTA PRIORIDAD)
                const descWords = normalized.descripcionNormalized.split(/\s+/);
                if (descWords.includes(word)) {
                    score += this.CONFIG.SCORE_WEIGHTS.DESCRIPCION_PALABRA;
                } else if (normalized.descripcionNormalized.includes(word)) {
                    score += this.CONFIG.SCORE_WEIGHTS.DESCRIPCION_CONTAINS;
                }
                
                // 3. PUNTUACIÓN POR MARCA
                if (normalized.marcaNormalized === word) {
                    score += this.CONFIG.SCORE_WEIGHTS.MARCA_EXACTA;
                } else if (normalized.marcaNormalized.includes(word)) {
                    score += this.CONFIG.SCORE_WEIGHTS.MARCA_CONTAINS;
                }
                
                // 4. PUNTUACIÓN POR RUBRO
                if (normalized.rubroNormalized === word) {
                    score += this.CONFIG.SCORE_WEIGHTS.RUBRO_EXACTO;
                }
                
                // 5. COINCIDENCIAS MÚLTIPLES EN SEARCH TEXT
                const regex = new RegExp(`\\b${word}\\b`, 'g');
                const matches = normalized.searchText.match(regex);
                if (matches) {
                    score += matches.length * this.CONFIG.SCORE_WEIGHTS.MULTIPLE_MATCHES;
                }
            });
            
            // Penalizar si no coincide con rubro filtrado
            if (this.state.currentRubro && 
                item.product.rubro !== this.state.currentRubro) {
                score = 0;
            }
            
            return {
                ...item,
                score: score / 100 // Normalizar a escala 0-1
            };
        });
    }

    getCacheKey() {
        return `${this.state.searchTerm}-${this.state.currentRubro}`;
    }

    cacheSearchResults(key) {
        // LRU Cache - eliminar la entrada más antigua si se excede el tamaño
        if (this.searchCache.size >= this.CONFIG.CACHE_SIZE) {
            const oldestKey = this.searchCache.keys().next().value;
            this.searchCache.delete(oldestKey);
        }
        
        this.searchCache.set(key, [...this.state.results]);
    }

    // ==============================================
    // 5. RENDERIZADO OPTIMIZADO PARA MÓVIL
    // ==============================================

    renderResults() {
        // Resetear estado
        this.state.offset = 0;
        this.state.hasMore = this.state.results.length > this.CONFIG.BATCH_SIZE;
        
        // Limpiar container eficientemente
        this.clearProductsContainer();
        
        if (this.state.results.length === 0) {
            this.showNoResultsState();
            return;
        }
        
        // Ocultar estados
        this.hideAllStates();
        
        // Mostrar contenedor de productos
        this.refs.productsContainer.style.display = 'grid';
        
        // Renderizar primer lote
        this.renderProductBatch();
        
        // Actualizar información
        this.updateResultsInfo();
    }

    clearProductsContainer() {
        if (!this.refs.productsContainer) return;
        
        // Reutilizar nodos existentes en el pool
        while (this.refs.productsContainer.firstChild) {
            const node = this.refs.productsContainer.firstChild;
            this.refs.productsContainer.removeChild(node);
            this.nodePool.push(node);
        }
    }

    renderProductBatch() {
        if (this.state.results.length === 0) return;
        
        const start = this.state.offset;
        const end = Math.min(start + this.CONFIG.BATCH_SIZE, this.state.results.length);
        const batch = this.state.results.slice(start, end);
        
        // Usar DocumentFragment para batch rendering
        const fragment = document.createDocumentFragment();
        
        batch.forEach(result => {
            const node = this.createProductCard(result);
            fragment.appendChild(node);
        });
        
        this.refs.productsContainer.appendChild(fragment);
        
        // Actualizar estado
        this.state.offset = end;
        this.state.hasMore = end < this.state.results.length;
        
        // Ocultar loader de scroll
        if (this.refs.scrollLoader) {
            this.refs.scrollLoader.style.display = 'none';
        }
    }

    createProductCard(result) {
        // Reutilizar nodo del pool si está disponible
        let cardElement = this.nodePool.pop();
        
        if (!cardElement) {
            cardElement = document.createElement('div');
            cardElement.className = 'product-card';
        }
        
        const { product, score } = result;
        
        // Plantilla ultra compacta y optimizada
        cardElement.innerHTML = `
            <div class="product-header">
                <div class="product-code">${this.escapeHtml(product.codigo)}</div>
                <div class="product-desc">${this.escapeHtml(product.descripcion)}</div>
            </div>
            <div class="product-meta">
                ${product.marca ? `<span class="product-brand">${this.escapeHtml(product.marca)}</span>` : ''}
                <span class="product-price">${this.formatPrice(product.precio_venta)}</span>
            </div>
            ${product.rubro ? `<div class="product-rubro">${this.escapeHtml(product.rubro)}</div>` : ''}
            <div class="product-actions">
                <button class="btn-whatsapp" data-action="whatsapp" data-product='${this.escapeJson(product)}'>
                    <span class="whatsapp-icon">💬</span>
                    <span>Consultar</span>
                </button>
            </div>
        `;
        
        return cardElement;
    }

    handleScroll() {
        if (!this.state.hasMore || this.state.isLoading) return;
        
        const viewport = this.refs.productsViewport;
        const container = this.refs.productsContainer;
        
        if (!viewport || !container) return;
        
        const scrollBottom = viewport.scrollTop + viewport.clientHeight;
        const containerBottom = container.scrollHeight;
        
        // Cargar más productos cuando esté cerca del final
        if (scrollBottom >= containerBottom - 100) {
            this.state.isLoading = true;
            
            // Mostrar loader
            if (this.refs.scrollLoader) {
                this.refs.scrollLoader.style.display = 'flex';
            }
            
            // Usar requestAnimationFrame para no bloquear
            requestAnimationFrame(() => {
                this.renderProductBatch();
                this.state.isLoading = false;
            });
        }
    }

    // ==============================================
    // 6. MANEJO DE EVENTOS Y UI
    // ==============================================

    handleProductClick(event) {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        
        event.stopPropagation();
        
        const action = button.dataset.action;
        const productData = button.dataset.product;
        
        if (!productData) return;
        
        try {
            const product = JSON.parse(productData.replace(/&quot;/g, '"'));
            
            switch (action) {
                case 'whatsapp':
                    this.openWhatsApp(product);
                    break;
                case 'details':
                    this.showProductDetails(product);
                    break;
            }
        } catch (error) {
            console.error('Error procesando click:', error);
        }
    }

    openWhatsApp(product) {
        const message = `Hola, quiero consultar por:
${product.descripcion}
Código: ${product.codigo}
Precio: $${this.formatPrice(product.precio_venta)}`;
        
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        
        // Abrir en nueva pestaña
        window.open(url, '_blank', 'noopener,noreferrer');
        
        // Registrar estadística
        this.stats.searchCount++;
    }

    showProductDetails(product) {
        if (!this.refs.modalOverlay || !this.refs.modalBody) return;
        
        // Actualizar contenido del modal
        this.refs.modalBody.innerHTML = `
            <div class="modal-product-info">
                <p>
                    <strong>Código:</strong>
                    <span>${this.escapeHtml(product.codigo)}</span>
                </p>
                <p>
                    <strong>Descripción:</strong>
                    <span>${this.escapeHtml(product.descripcion)}</span>
                </p>
                ${product.marca ? `
                <p>
                    <strong>Marca:</strong>
                    <span>${this.escapeHtml(product.marca)}</span>
                </p>
                ` : ''}
                ${product.rubro ? `
                <p>
                    <strong>Rubro:</strong>
                    <span>${this.escapeHtml(product.rubro)}</span>
                </p>
                ` : ''}
                <div class="modal-price-large">
                    ${this.formatPrice(product.precio_venta)}
                </div>
            </div>
        `;
        
        // Configurar botón de WhatsApp en el modal
        if (this.refs.modalWhatsAppBtn) {
            this.refs.modalWhatsAppBtn.onclick = () => {
                this.openWhatsApp(product);
                this.hideModal();
            };
        }
        
        // Mostrar modal
        this.refs.modalOverlay.style.display = 'flex';
        
        // Prevenir scroll del body
        document.body.style.overflow = 'hidden';
    }

    hideModal() {
        if (this.refs.modalOverlay) {
            this.refs.modalOverlay.style.display = 'none';
        }
        
        // Restaurar scroll del body
        document.body.style.overflow = '';
    }

    // ==============================================
    // 7. UTILIDADES Y HELPERS
    // ==============================================

    formatPrice(price) {
        if (isNaN(price) || price === null || price === undefined) {
            return '0';
        }
        
        return new Intl.NumberFormat('es-AR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(Math.round(price));
    }

    escapeHtml(text) {
        if (!text) return '';
        
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    escapeJson(obj) {
        return JSON.stringify(obj).replace(/"/g, '&quot;');
    }

    // ==============================================
    // 8. GESTIÓN DE ESTADOS DE UI
    // ==============================================

    showEmptyState() {
        this.hideAllStates();
        if (this.refs.emptyState) {
            this.refs.emptyState.style.display = 'block';
        }
        if (this.refs.productsContainer) {
            this.refs.productsContainer.style.display = 'none';
        }
        this.updateProductCount();
    }

    showNoResultsState() {
        this.hideAllStates();
        if (this.refs.noResults) {
            this.refs.noResults.style.display = 'block';
        }
        if (this.refs.productsContainer) {
            this.refs.productsContainer.style.display = 'none';
        }
        if (this.refs.resultsInfo) {
            this.refs.resultsInfo.style.display = 'none';
        }
        this.updateProductCount();
    }

    showLoadingState() {
        this.hideAllStates();
        if (this.refs.loadingState) {
            this.refs.loadingState.style.display = 'block';
        }
    }

    hideLoadingState() {
        if (this.refs.loadingState) {
            this.refs.loadingState.style.display = 'none';
        }
    }

    hideAllStates() {
        const states = ['emptyState', 'noResults', 'loadingState'];
        states.forEach(state => {
            if (this.refs[state]) {
                this.refs[state].style.display = 'none';
            }
        });
        
        if (this.refs.resultsInfo) {
            this.refs.resultsInfo.style.display = 'block';
        }
    }

    showErrorState(message) {
        this.hideAllStates();
        
        // Mostrar mensaje de error simple
        if (this.refs.productsContainer) {
            this.refs.productsContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 2rem;">
                    <div style="font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
                    <h3 style="color: #c62828; margin-bottom: 0.5rem;">Error</h3>
                    <p style="color: #666; margin-bottom: 1.5rem;">${this.escapeHtml(message)}</p>
                    <button onclick="location.reload()" style="
                        background: #2196f3;
                        color: white;
                        border: none;
                        padding: 0.75rem 1.5rem;
                        border-radius: 8px;
                        font-weight: 600;
                        cursor: pointer;
                    ">Reintentar</button>
                </div>
            `;
            this.refs.productsContainer.style.display = 'grid';
        }
    }

    showFatalError(error) {
        document.body.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, #1a237e 0%, #283593 100%);
                color: white;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 2rem;
                text-align: center;
            ">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🚨</div>
                <h1 style="margin-bottom: 1rem; font-size: 1.5rem;">Error crítico</h1>
                <p style="margin-bottom: 2rem; opacity: 0.9; max-width: 400px;">
                    No se pudo iniciar el sistema. Por favor, recarga la página.
                </p>
                <button onclick="location.reload()" style="
                    background: white;
                    color: #1a237e;
                    border: none;
                    padding: 1rem 2rem;
                    border-radius: 8px;
                    font-size: 1rem;
                    font-weight: bold;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                ">Reiniciar aplicación</button>
                <p style="margin-top: 2rem; font-size: 0.8rem; opacity: 0.7;">
                    Error: ${this.escapeHtml(error.message)}
                </p>
            </div>
        `;
    }

    // ==============================================
    // 9. ACTUALIZACIÓN DE UI Y ESTADÍSTICAS
    // ==============================================

    updateProductCount() {
        if (!this.refs.productCount) return;
        
        const total = this.state.products.length;
        const showing = this.state.searchTerm || this.state.currentRubro 
            ? this.state.results.length 
            : Math.min(total, 10);
        
        let text = `${total} productos`;
        
        if (this.state.searchTerm || this.state.currentRubro) {
            text = `${showing} de ${total} productos`;
        }
        
        this.refs.productCount.textContent = text;
    }

    updateResultsInfo() {
        if (!this.refs.resultsCount) return;
        
        const showing = this.state.results.length;
        const total = this.state.products.length;
        
        this.refs.resultsCount.textContent = `${showing} resultado${showing !== 1 ? 's' : ''}`;
        
        // Mostrar tiempo de búsqueda si es relevante
        if (this.state.lastSearchTime > 0 && this.state.searchTerm) {
            if (this.refs.searchTime) {
                this.refs.searchTime.textContent = `en ${this.state.lastSearchTime}ms`;
                this.refs.searchTime.style.display = 'inline';
            }
        }
    }

    updateSearchStats(searchTime, fromCache) {
        this.state.lastSearchTime = Math.round(searchTime);
        
        // Actualizar estadísticas
        this.stats.avgSearchTime = (this.stats.avgSearchTime * this.stats.searchCount + searchTime) / 
                                  (this.stats.searchCount + 1);
        this.stats.searchCount++;
        
        if (!fromCache) {
            console.log(`🔍 Búsqueda: "${this.state.searchTerm}" - ${this.state.results.length} resultados en ${searchTime.toFixed(0)}ms`);
        }
    }

    updateRubroFilter() {
        const select = this.refs.rubroFilter;
        if (!select) return;
        
        // Ordenar rubros alfabéticamente
        const rubros = Array.from(this.state.rubros)
            .filter(rubro => rubro && rubro.trim())
            .sort((a, b) => a.localeCompare(b));
        
        // Limpiar opciones existentes (excepto la primera)
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // Agregar rubros
        rubros.forEach(rubro => {
            const option = document.createElement('option');
            option.value = rubro;
            option.textContent = rubro;
            select.appendChild(option);
        });
    }

    updateLastUpdateDate() {
        if (!this.refs.lastUpdate) return;
        
        const now = new Date();
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        const dateString = now.toLocaleDateString('es-AR', options);
        this.refs.lastUpdate.textContent = `Última actualización: ${dateString}`;
    }

    // ==============================================
    // 10. FUNCIONES DE CONTROL
    // ==============================================

    clearSearch() {
        this.state.searchTerm = '';
        this.state.currentRubro = '';
        this.state.results = [];
        
        if (this.refs.searchInput) {
            this.refs.searchInput.value = '';
        }
        
        if (this.refs.rubroFilter) {
            this.refs.rubroFilter.value = '';
        }
        
        if (this.refs.clearBtn) {
            this.refs.clearBtn.style.display = 'none';
        }
        
        if (this.refs.searchTime) {
            this.refs.searchTime.style.display = 'none';
        }
        
        this.showEmptyState();
    }

    resetSearch() {
        this.clearSearch();
        this.showEmptyState();
    }

    sortResults(sortType) {
        if (this.state.results.length === 0) return;
        
        switch (sortType) {
            case 'price_asc':
                this.state.results.sort((a, b) => a.product.precio_venta - b.product.precio_venta);
                break;
            case 'price_desc':
                this.state.results.sort((a, b) => b.product.precio_venta - a.product.precio_venta);
                break;
            case 'relevance':
            default:
                this.state.results.sort((a, b) => b.score - a.score);
                break;
        }
    }

    setupInitialUI() {
        // Precargar nodos para el pool
        for (let i = 0; i < 10; i++) {
            const node = document.createElement('div');
            node.className = 'product-card';
            this.nodePool.push(node);
        }
        
        // Mostrar estado inicial
        this.showEmptyState();
    }
}

// ==============================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ==============================================

// Polyfill para navegadores antiguos
if (!window.requestIdleCallback) {
    window.requestIdleCallback = function(callback) {
        return setTimeout(() => {
            callback({
                didTimeout: false,
                timeRemaining: function() {
                    return 15;
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

// Inicializar cuando el DOM esté listo
let ferreteriaApp;

document.addEventListener('DOMContentLoaded', () => {
    try {
        ferreteriaApp = new FerreteriaSearchSystem();
        window.ferreteriaApp = ferreteriaApp; // Para debugging
    } catch (error) {
        console.error('Error fatal inicializando:', error);
        
        // Mostrar error crítico
        document.body.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #f44336;
                color: white;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 2rem;
                text-align: center;
                font-family: sans-serif;
            ">
                <h1 style="font-size: 2rem; margin-bottom: 1rem;">🚨 Error Crítico</h1>
                <p style="margin-bottom: 2rem; font-size: 1.1rem;">
                    No se pudo cargar el sistema. Por favor, contacta al administrador.
                </p>
                <button onclick="location.reload()" style="
                    background: white;
                    color: #f44336;
                    border: none;
                    padding: 1rem 2rem;
                    font-size: 1rem;
                    font-weight: bold;
                    border-radius: 8px;
                    cursor: pointer;
                    margin-bottom: 1rem;
                ">
                    Reintentar
                </button>
                <p style="font-size: 0.8rem; opacity: 0.8; max-width: 500px;">
                    Si el problema persiste, verifica que el archivo products.json esté en la misma carpeta.
                </p>
            </div>
        `;
    }
});

// Service Worker para cache (opcional)
if ('serviceWorker' in navigator && window.location.hostname !== 'localhost') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registrado:', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker no registrado:', error);
            });
    });
}

// Manejar conexión offline
window.addEventListener('offline', () => {
    if (ferreteriaApp && ferreteriaApp.showErrorState) {
        ferreteriaApp.showErrorState('Sin conexión a internet. Los datos pueden no estar actualizados.');
    }
});

window.addEventListener('online', () => {
    if (ferreteriaApp && ferreteriaApp.refs && ferreteriaApp.refs.productsContainer) {
        ferreteriaApp.refs.productsContainer.innerHTML = '';
        ferreteriaApp.showEmptyState();
    }
});
