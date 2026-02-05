// Aplicación de búsqueda de productos para ferretería
document.addEventListener('DOMContentLoaded', function() {
    // Elementos del DOM
    const searchInput = document.getElementById('searchInput');
    const clearSearch = document.getElementById('clearSearch');
    const rubroFilter = document.getElementById('rubroFilter');
    const productsList = document.getElementById('productsList');
    const noResults = document.getElementById('noResults');
    const resultsCount = document.getElementById('resultsCount');
    const whatsappBtn = document.getElementById('whatsappBtn');
    const infoBtn = document.getElementById('infoBtn');
    const infoModal = document.getElementById('infoModal');
    const closeModal = document.getElementById('closeModal');
    
    // Variables de estado
    let allProducts = [];
    let filteredProducts = [];
    let rubros = new Set();
    
    // Inicializar la aplicación
    initApp();
    
    async function initApp() {
        // Cargar productos desde el archivo JSON
        await loadProducts();
        
        // Configurar eventos
        setupEventListeners();
        
        // Mostrar todos los productos inicialmente
        filterProducts();
    }
    
    // Cargar productos desde el archivo JSON
    async function loadProducts() {
        try {
            showLoadingState();
            
            // Cargar el archivo products.json
            const response = await fetch('products.json');
            
            if (!response.ok) {
                throw new Error(`Error al cargar productos: ${response.status}`);
            }
            
            allProducts = await response.json();
            
            // Extraer rubros únicos
            extractRubros();
            
            // Llenar el selector de rubros
            populateRubroFilter();
            
            console.log(`${allProducts.length} productos cargados correctamente`);
            
        } catch (error) {
            console.error('Error cargando productos:', error);
            showErrorState('Error al cargar los productos. Asegúrate de que el archivo products.json esté disponible.');
        }
    }
    
    // Extraer rubros únicos de los productos
    function extractRubros() {
        rubros.clear();
        allProducts.forEach(product => {
            if (product.rubro && product.rubro.trim()) {
                rubros.add(product.rubro);
            }
        });
        
        // Convertir a array y ordenar alfabéticamente
        rubros = new Set([...rubros].sort());
    }
    
    // Llenar el selector de rubros
    function populateRubroFilter() {
        // Limpiar opciones existentes (excepto la primera)
        while (rubroFilter.options.length > 1) {
            rubroFilter.remove(1);
        }
        
        // Agregar cada rubro como opción
        rubros.forEach(rubro => {
            const option = document.createElement('option');
            option.value = rubro;
            option.textContent = rubro;
            rubroFilter.appendChild(option);
        });
    }
    
    // Configurar event listeners
    function setupEventListeners() {
        // Búsqueda en tiempo real
        searchInput.addEventListener('input', filterProducts);
        
        // Limpiar búsqueda
        clearSearch.addEventListener('click', () => {
            searchInput.value = '';
            searchInput.focus();
            filterProducts();
        });
        
        // Filtrar por rubro
        rubroFilter.addEventListener('change', filterProducts);
        
        // Modal de información
        infoBtn.addEventListener('click', () => {
            infoModal.classList.add('active');
        });
        
        closeModal.addEventListener('click', () => {
            infoModal.classList.remove('active');
        });
        
        // Cerrar modal al hacer clic fuera
        infoModal.addEventListener('click', (e) => {
            if (e.target === infoModal) {
                infoModal.classList.remove('active');
            }
        });
        
        // Cerrar modal con tecla Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && infoModal.classList.contains('active')) {
                infoModal.classList.remove('active');
            }
        });
    }
    
    // Filtrar productos según búsqueda y filtros
    function filterProducts() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const selectedRubro = rubroFilter.value;
        
        // Filtrar productos
        filteredProducts = allProducts.filter(product => {
            // Filtrar por rubro si se seleccionó uno
            if (selectedRubro && product.rubro !== selectedRubro) {
                return false;
            }
            
            // Si no hay término de búsqueda, mostrar todos los productos del rubro seleccionado
            if (!searchTerm) {
                return true;
            }
            
            // Buscar en código, descripción y marca
            const inCodigo = product.codigo.toLowerCase().includes(searchTerm);
            const inDescripcion = product.descripcion.toLowerCase().includes(searchTerm);
            const inMarca = product.marca.toLowerCase().includes(searchTerm);
            
            return inCodigo || inDescripcion || inMarca;
        });
        
        // Actualizar contador de resultados
        updateResultsCount();
        
        // Mostrar productos o mensaje de no resultados
        if (filteredProducts.length === 0) {
            showNoResults();
        } else {
            renderProducts();
        }
        
        // Ocultar botón de WhatsApp global
        whatsappBtn.classList.add('hidden');
    }
    
    // Actualizar contador de resultados
    function updateResultsCount() {
        const total = allProducts.length;
        const filtered = filteredProducts.length;
        
        if (filtered === total) {
            resultsCount.textContent = `${total} productos`;
        } else {
            resultsCount.textContent = `${filtered} de ${total} productos`;
        }
    }
    
    // Mostrar estado de carga
    function showLoadingState() {
        productsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Cargando productos...</p>
            </div>
        `;
        noResults.classList.add('hidden');
    }
    
    // Mostrar estado de error
    function showErrorState(message) {
        productsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${message}</p>
                <button id="retryBtn" class="whatsapp-product-btn" style="margin-top: 20px;">
                    <i class="fas fa-redo"></i> Reintentar
                </button>
            </div>
        `;
        
        // Agregar event listener al botón de reintentar
        document.getElementById('retryBtn').addEventListener('click', initApp);
        
        noResults.classList.add('hidden');
    }
    
    // Mostrar mensaje de no resultados
    function showNoResults() {
        productsList.innerHTML = '';
        noResults.classList.remove('hidden');
    }
    
    // Renderizar productos en la lista
    function renderProducts() {
        noResults.classList.add('hidden');
        
        // Limpiar lista
        productsList.innerHTML = '';
        
        // Crear y agregar tarjetas de producto
        filteredProducts.forEach(product => {
            const productCard = createProductCard(product);
            productsList.appendChild(productCard);
        });
    }
    
    // Crear tarjeta de producto
    function createProductCard(product) {
        const card = document.createElement('div');
        card.className = 'product-card';
        
        // Formatear precio
        const formattedPrice = new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 2
        }).format(product.precio_venta);
        
        // Crear contenido de la tarjeta
        card.innerHTML = `
            <div class="product-header">
                <div class="product-code">Código: ${product.codigo}</div>
                <div class="product-rubro">${product.rubro || 'SIN RUBRO'}</div>
            </div>
            
            <div class="product-body">
                <h3 class="product-description">${product.descripcion}</h3>
                
                ${product.marca ? `
                    <div class="product-marca">
                        <i class="fas fa-tag"></i>
                        <span>${product.marca}</span>
                    </div>
                ` : ''}
            </div>
            
            <div class="product-footer">
                <div class="product-price">${formattedPrice}</div>
                <button class="whatsapp-product-btn" data-product='${JSON.stringify(product)}'>
                    <i class="fab fa-whatsapp"></i>
                    Consultar por WhatsApp
                </button>
            </div>
        `;
        
        // Agregar evento al botón de WhatsApp
        const whatsappButton = card.querySelector('.whatsapp-product-btn');
        whatsappButton.addEventListener('click', () => {
            openWhatsApp(product);
        });
        
        return card;
    }
    
    // Abrir WhatsApp con mensaje predefinido
    function openWhatsApp(product) {
        // Crear mensaje para WhatsApp
        const message = `Hola, quiero consultar por:
${product.descripcion}
Código: ${product.codigo}
Precio: $${product.precio_venta.toFixed(2)}`;
        
        // Codificar el mensaje para URL
        const encodedMessage = encodeURIComponent(message);
        
        // Crear enlace de WhatsApp
        const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
        
        // Abrir en nueva pestaña
        window.open(whatsappUrl, '_blank');
    }
    
    // Función para generar un archivo de ejemplo (products.json) si no existe
    function generateExampleData() {
        const exampleData = [
            {
                "codigo": "29921",
                "rubro": "ABRAZADERAS",
                "descripcion": "ABRAZADERA 12 A 20",
                "marca": "FERRETERA",
                "precio_venta": 847
            },
            {
                "codigo": "29922",
                "rubro": "ABRAZADERAS",
                "descripcion": "ABRAZADERA 20 A 30",
                "marca": "FERRETERA",
                "precio_venta": 1050
            },
            {
                "codigo": "30567",
                "rubro": "TORNILLOS",
                "descripcion": "TORNILLO 3X25 C/SELLO",
                "marca": "ACERO PLUS",
                "precio_venta": 45
            },
            {
                "codigo": "30568",
                "rubro": "TORNILLOS",
                "descripcion": "TORNILLO 4X40 C/SELLO",
                "marca": "ACERO PLUS",
                "precio_venta": 62
            },
            {
                "codigo": "41234",
                "rubro": "HERRAMIENTAS",
                "descripcion": "MARTILLO DE OREJAS 500G",
                "marca": "PROFESIONAL",
                "precio_venta": 2850
            },
            {
                "codigo": "41235",
                "rubro": "HERRAMIENTAS",
                "descripcion": "ALICATE UNIVERSAL 8\"",
                "marca": "PROFESIONAL",
                "precio_venta": 3200
            },
            {
                "codigo": "52341",
                "rubro": "PINTURAS",
                "descripcion": "PINTURA BLANCO 1L",
                "marca": "COLOREX",
                "precio_venta": 5890
            },
            {
                "codigo": "52342",
                "rubro": "PINTURAS",
                "descripcion": "PINTURA NEGRO 1L",
                "marca": "COLOREX",
                "precio_venta": 5890
            },
            {
                "codigo": "63456",
                "rubro": "ELECTRICIDAD",
                "descripcion": "CABLE DUPLAR 2.5MM 50M",
                "marca": "CABLEMAX",
                "precio_venta": 12500
            },
            {
                "codigo": "63457",
                "rubro": "ELECTRICIDAD",
                "descripcion": "INTERRUPTOR SIMPLE",
                "marca": "LUMINEX",
                "precio_venta": 450
            }
        ];
        
        return exampleData;
    }
    
    // Si no hay archivo products.json, podemos generar datos de ejemplo
    // Nota: En producción, esto debería venir del archivo JSON real
    window.generateExampleJSON = function() {
        const exampleData = generateExampleData();
        const jsonString = JSON.stringify(exampleData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'products_example.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert('Archivo de ejemplo descargado. Renómbralo a "products.json" y súbelo a Netlify.');
    };
});
