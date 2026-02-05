// Sistema de búsqueda para Ferretería Carnevale
class ProductSearchSystem {
    constructor() {
        this.products = [];
        this.filteredProducts = [];
        this.rubros = new Set();
        this.currentSearch = '';
        this.currentRubro = '';
        this.currentSort = 'descripcion';
        
        // Inicializar
        this.init();
    }
    
    async init() {
        // Cargar productos
        await this.loadProducts();
        
        // Inicializar controles
        this.initControls();
        
        // Renderizar productos iniciales
        this.renderProducts();
        
        // Actualizar fecha
        this.updateDates();
    }
    
    async loadProducts() {
        try {
            // Mostrar spinner de carga
            document.getElementById('productCount').textContent = 'Cargando productos...';
            
            // Cargar el archivo JSON
            const response = await fetch('products.json');
            
            if (!response.ok) {
                throw new Error(`Error al cargar productos: ${response.status}`);
            }
            
            this.products = await response.json();
            
            // Extraer rubros únicos
            this.extractRubros();
            
            // Productos iniciales son todos los productos
            this.filteredProducts = [...this.products];
            
            // Actualizar contador
            this.updateProductCount();
            
        } catch (error) {
            console.error('Error cargando productos:', error);
            document.getElementById('productCount').textContent = 'Error cargando productos';
            document.getElementById('productsContainer').innerHTML = `
                <div class="no-results" style="display: block;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Error al cargar los productos</h3>
                    <p>Por favor, verifica que el archivo products.json esté en la carpeta correcta</p>
                </div>
            `;
        }
    }
    
    extractRubros() {
        this.rubros.clear();
        
        // Agregar rubros únicos
        this.products.forEach(product => {
            if (product.rubro && product.rubro.trim() !== '') {
                this.rubros.add(product.rubro.trim());
            }
        });
        
        // Ordenar rubros alfabéticamente
        const rubrosArray = Array.from(this.rubros).sort();
        
        // Actualizar selector de rubros
        const rubroFilter = document.getElementById('rubroFilter');
        rubroFilter.innerHTML = '<option value="">Todos los rubros</option>';
        
        rubrosArray.forEach(rubro => {
            const option = document.createElement('option');
            option.value = rubro;
            option.textContent = rubro;
            rubroFilter.appendChild(option);
        });
    }
    
    initControls() {
        // Buscador
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        const rubroFilter = document.getElementById('rubroFilter');
        const sortFilter = document.getElementById('sortFilter');
        const scrollTopBtn = document.getElementById('scrollTopBtn');
        const closeModal = document.getElementById('closeModal');
        const modal = document.getElementById('productModal');
        
        // Evento de búsqueda
        searchInput.addEventListener('input', (e) => {
            this.currentSearch = e.target.value.toLowerCase().trim();
            this.filterProducts();
            this.renderProducts();
        });
        
        // Limpiar búsqueda
        clearSearch.addEventListener('click', () => {
            searchInput.value = '';
            this.currentSearch = '';
            this.filterProducts();
            this.renderProducts();
            searchInput.focus();
        });
        
        // Filtro por rubro
        rubroFilter.addEventListener('change', (e) => {
            this.currentRubro = e.target.value;
            this.filterProducts();
            this.renderProducts();
        });
        
        // Ordenar productos
        sortFilter.addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.sortProducts();
            this.renderProducts();
        });
        
        // Botón para subir
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                scrollTopBtn.classList.add('visible');
            } else {
                scrollTopBtn.classList.remove('visible');
            }
        });
        
        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        
        // Cerrar modal
        closeModal.addEventListener('click', () => {
            modal.classList.remove('active');
        });
        
        // Cerrar modal al hacer clic fuera
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
        
        // Cerrar modal con ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                modal.classList.remove('active');
            }
        });
    }
    
    filterProducts() {
        // Filtrar por búsqueda
        let filtered = this.products;
        
        if (this.currentSearch) {
            filtered = filtered.filter(product => {
                const searchLower = this.currentSearch.toLowerCase();
                return (
                    (product.descripcion && product.descripcion.toLowerCase().includes(searchLower)) ||
                    (product.codigo && product.codigo.toLowerCase().includes(searchLower)) ||
                    (product.marca && product.marca.toLowerCase().includes(searchLower))
                );
            });
        }
        
        // Filtrar por rubro
        if (this.currentRubro) {
            filtered = filtered.filter(product => 
                product.rubro && product.rubro === this.currentRubro
            );
        }
        
        this.filteredProducts = filtered;
        this.sortProducts();
        this.updateProductCount();
    }
    
    sortProducts() {
        switch (this.currentSort) {
            case 'descripcion':
                this.filteredProducts.sort((a, b) => 
                    (a.descripcion || '').localeCompare(b.descripcion || '')
                );
                break;
                
            case 'precio_asc':
                this.filteredProducts.sort((a, b) => 
                    (a.precio_venta || 0) - (b.precio_venta || 0)
                );
                break;
                
            case 'precio_desc':
                this.filteredProducts.sort((a, b) => 
                    (b.precio_venta || 0) - (a.precio_venta || 0)
                );
                break;
                
            case 'codigo':
                this.filteredProducts.sort((a, b) => 
                    (a.codigo || '').localeCompare(b.codigo || '')
                );
                break;
        }
    }
    
    updateProductCount() {
        const count = this.filteredProducts.length;
        const total = this.products.length;
        const countElement = document.getElementById('productCount');
        
        countElement.innerHTML = `
            <span class="count">${count}</span> productos
            ${this.currentSearch || this.currentRubro ? 
                `<span class="filter-info"> (filtrados de ${total})</span>` : 
                ''
            }
        `;
        
        // Mostrar/ocultar mensaje sin resultados
        const noResults = document.getElementById('noResults');
        const productsContainer = document.getElementById('productsContainer');
        
        if (count === 0 && this.products.length > 0) {
            noResults.style.display = 'block';
            productsContainer.style.display = 'none';
        } else {
            noResults.style.display = 'none';
            productsContainer.style.display = 'grid';
        }
    }
    
    renderProducts() {
        const container = document.getElementById('productsContainer');
        
        if (this.filteredProducts.length === 0 && this.products.length > 0) {
            container.innerHTML = '';
            return;
        }
        
        if (this.filteredProducts.length === 0) {
            // Mostrar spinner mientras carga
            container.innerHTML = `
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <p>Cargando listado de precios...</p>
                </div>
            `;
            return;
        }
        
        // Generar HTML de productos
        const productsHTML = this.filteredProducts.map(product => this.createProductCard(product)).join('');
        container.innerHTML = productsHTML;
        
        // Agregar event listeners a las tarjetas
        this.addProductCardListeners();
    }
    
    createProductCard(product) {
        const precioFormateado = this.formatPrice(product.precio_venta);
        
        return `
            <div class="product-card" data-id="${product.codigo}">
                <div class="product-header">
                    <div class="product-code">
                        <i class="fas fa-barcode"></i> ${product.codigo}
                    </div>
                    <div class="product-desc" title="${product.descripcion}">
                        ${product.descripcion}
                    </div>
                    ${product.marca ? `
                        <div class="product-brand">
                            <i class="fas fa-tag"></i> ${product.marca}
                        </div>
                    ` : ''}
                </div>
                <div class="product-body">
                    ${product.rubro ? `
                        <div class="product-rubro">
                            <i class="fas fa-folder"></i> ${product.rubro}
                        </div>
                    ` : ''}
                    <div class="product-price">${precioFormateado}</div>
                    <button class="whatsapp-btn" onclick="productSystem.openWhatsApp(event, ${JSON.stringify(product).replace(/"/g, '&quot;')})">
                        <i class="fab fa-whatsapp"></i> Consultar por WhatsApp
                    </button>
                </div>
            </div>
        `;
    }
    
    addProductCardListeners() {
        const productCards = document.querySelectorAll('.product-card');
        
        productCards.forEach(card => {
            card.addEventListener('click', (e) => {
                // Evitar abrir modal si se hizo clic en el botón de WhatsApp
                if (e.target.closest('.whatsapp-btn')) {
                    return;
                }
                
                const codigo = card.getAttribute('data-id');
                const product = this.filteredProducts.find(p => p.codigo === codigo);
                
                if (product) {
                    this.openProductModal(product);
                }
            });
        });
    }
    
    openProductModal(product) {
        const modal = document.getElementById('productModal');
        const precioFormateado = this.formatPrice(product.precio_venta);
        
        // Actualizar contenido del modal
        document.getElementById('modalCodigo').textContent = product.codigo;
        document.getElementById('modalDescripcion').textContent = product.descripcion;
        document.getElementById('modalMarca').textContent = product.marca || 'No especificada';
        document.getElementById('modalRubro').textContent = product.rubro || 'No especificado';
        document.getElementById('modalPrecio').textContent = precioFormateado;
        
        // Actualizar botón de WhatsApp en el modal
        const modalWhatsAppBtn = document.getElementById('modalWhatsAppBtn');
        modalWhatsAppBtn.onclick = (e) => {
            e.stopPropagation();
            this.openWhatsApp(e, product);
            modal.classList.remove('active');
        };
        
        // Mostrar modal
        modal.classList.add('active');
    }
    
    openWhatsApp(event, product) {
        event.stopPropagation();
        
        const message = `Hola, quiero consultar por:
${product.descripcion}
Código: ${product.codigo}
Precio: $${this.formatPrice(product.precio_venta)}`;
        
        const encodedMessage = encodeURIComponent(message);
        const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
        
        // Abrir WhatsApp en nueva pestaña
        window.open(whatsappUrl, '_blank');
    }
    
    formatPrice(price) {
        if (typeof price !== 'number') {
            price = parseFloat(price) || 0;
        }
        
        // Formato argentino con separador de miles
        return price.toLocaleString('es-AR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }
    
    updateDates() {
        const today = new Date();
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        
        const dateString = today.toLocaleDateString('es-AR', options);
        const timeString = today.toLocaleTimeString('es-AR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        // Actualizar fecha en el header
        document.getElementById('updateDate').textContent = `Actualizado: ${dateString}`;
        
        // Actualizar fecha en el footer
        document.getElementById('footerDate').textContent = `${dateString} ${timeString}`;
    }
}

// Inicializar el sistema cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.productSystem = new ProductSearchSystem();
});
