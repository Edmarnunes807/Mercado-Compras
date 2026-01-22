// ========== CONFIGURAÇÕES ==========
const GOOGLE_SHEETS_API = "https://script.google.com/macros/s/AKfycbzgcibH369NS25K6afIYWfspNev0OcaXkRl2C2_HsmNGvdMTTK0OO4cn0VqmaC70GLGfg/exec";
const BLUESOFT_API_KEY = "7tF33vAL9xZs7ZRoSMBitg";
const OPENFOODFACTS_PROXY = "https://api.allorigins.win/raw?url=";

// ========== VARIÁVEIS GLOBAIS ==========
let html5QrCode = null;
let currentCameraId = null;
let isScanning = false;
let currentProduct = null;
let modalData = {
    product: null,
    oldPrice: 0,
    newPrice: 0
};

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', function() {
    // Configurar eventos
    setupEventListeners();
    
    // Verificar API
    checkAPIStatus();
    
    // Carregar estatísticas iniciais
    loadStats();
    
    // Testar conexão
    setTimeout(testConnection, 1000);
    
    // Carregar carrinho inicial
    loadCart();
});

function setupEventListeners() {
    // Busca por Enter
    document.getElementById('manualCode').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchProduct();
    });
    
    // Preço modal
    document.getElementById('modalCurrentPrice').addEventListener('input', calculateVariationModal);
    
    // Filtro de produtos
    document.getElementById('searchProducts').addEventListener('input', filterProducts);
}

// ========== NAVEGAÇÃO ENTRE ABAS ==========
function switchTab(tabName) {
    // Remover active de todas as abas
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Ativar aba selecionada
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Carregar dados da aba
    switch(tabName) {
        case 'produtos':
            loadProducts();
            break;
        case 'compras':
            loadCart();
            break;
        case 'historico':
            loadHistory();
            break;
    }
}

// ========== SCANNER ==========
async function initScanner() {
    if (isScanning) return;
    
    try {
        updateStatus('Iniciando scanner...', 'info');
        
        // Mostrar scanner
        document.getElementById('scannerContainer').style.display = 'block';
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('cameraInfo').classList.remove('hidden');
        document.getElementById('cameraControls').classList.remove('hidden');
        
        // Configuração
        const config = {
            fps: 30,
            qrbox: { width: 250, height: 150 },
            aspectRatio: 4/3,
            formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.CODE_128
            ]
        };
        
        // Inicializar scanner
        html5QrCode = new Html5Qrcode("reader");
        
        // Tentar câmera traseira
        const cameras = await Html5Qrcode.getCameras();
        const rearCamera = cameras.find(cam => 
            cam.label.toLowerCase().includes('back') || 
            cam.label.toLowerCase().includes('traseira')
        );
        
        if (rearCamera) {
            await html5QrCode.start(rearCamera.id, config, onScanSuccess, onScanError);
            currentCameraId = rearCamera.id;
        } else {
            await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanError);
            currentCameraId = "environment";
        }
        
        updateStatus('Scanner ativo! Aponte para um código de barras.', 'success');
        isScanning = true;
        
    } catch (error) {
        console.error('Erro ao iniciar scanner:', error);
        updateStatus('Erro ao iniciar scanner: ' + error.message, 'danger');
    }
}

function stopScanner() {
    if (html5QrCode && isScanning) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            isScanning = false;
            currentCameraId = null;
            
            document.getElementById('scannerContainer').style.display = 'none';
            document.getElementById('startBtn').style.display = 'inline-block';
            document.getElementById('cameraInfo').classList.add('hidden');
            document.getElementById('cameraControls').classList.add('hidden');
            
            updateStatus('Scanner parado.', 'info');
        });
    }
}

function onScanSuccess(decodedText) {
    const code = decodedText.trim();
    
    // Validar EAN
    if (!isValidEAN(code)) {
        updateStatus('Código EAN inválido', 'danger');
        return;
    }
    
    updateStatus(`Código detectado: ${code}`, 'success');
    
    // Preencher campo e buscar
    document.getElementById('manualCode').value = code;
    searchProduct();
    
    // Parar scanner temporariamente
    stopScanner();
}

function onScanError(error) {
    // Ignorar erros comuns de leitura
    if (!error.includes("No MultiFormat Readers")) {
        console.log('Erro de scan:', error);
    }
}

// ========== BUSCA DE PRODUTOS ==========
async function searchProduct() {
    const ean = document.getElementById('manualCode').value.trim();
    
    if (!ean || !isValidEAN(ean)) {
        showAlert('Digite um EAN válido (8-13 dígitos)', 'danger');
        return;
    }
    
    // Limpar resultados anteriores
    clearResult();
    updateStatus(`Buscando produto ${ean}...`, 'info');
    
    try {
        // 1. Buscar no Banco Local
        updateStatus('Buscando no banco local...', 'info');
        const localProduct = await searchInDatabase(ean);
        
        if (localProduct) {
            showProductResult(localProduct, true);
            updateStatus('Produto encontrado no banco local!', 'success');
            return;
        }
        
        // 2. Buscar no Open Food Facts
        updateStatus('Buscando no Open Food Facts...', 'info');
        const offProduct = await searchOpenFoodFacts(ean);
        
        if (offProduct) {
            // Salvar automaticamente no banco
            await saveProductToDatabase(offProduct);
            showProductResult(offProduct, false);
            updateStatus('Produto encontrado no Open Food Facts!', 'success');
            return;
        }
        
        // 3. Buscar no Bluesoft
        updateStatus('Buscando no Bluesoft Cosmos...', 'info');
        const bluesoftProduct = await searchBluesoft(ean);
        
        if (bluesoftProduct) {
            // Salvar automaticamente no banco
            await saveProductToDatabase(bluesoftProduct);
            showProductResult(bluesoftProduct, false);
            updateStatus('Produto encontrado no Bluesoft Cosmos!', 'success');
            return;
        }
        
        // Produto não encontrado
        showNotFoundResult(ean);
        updateStatus('Produto não encontrado em nenhuma fonte.', 'danger');
        
    } catch (error) {
        console.error('Erro na busca:', error);
        updateStatus('Erro na busca: ' + error.message, 'danger');
        showErrorResult('Erro na busca', 'Tente novamente mais tarde.');
    }
}

// ========== FUNÇÕES DE BUSCA ==========
async function searchInDatabase(ean) {
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=search&ean=${ean}`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success && result.found) {
            return {
                ean: result.product.ean,
                nome: result.product.nome,
                marca: result.product.marca || '',
                imagem: result.product.imagem || '',
                preco: result.product.preco || '0',
                fonte: 'Banco Local',
                linha: result.product.linha
            };
        }
        return null;
    } catch (error) {
        console.error('Erro ao buscar no banco:', error);
        return null;
    }
}

async function searchOpenFoodFacts(ean) {
    try {
        const url = `${OPENFOODFACTS_PROXY}https://world.openfoodfacts.org/api/v0/product/${ean}.json`;
        const response = await fetch(url);
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        if (data.status === 1 && data.product) {
            return {
                ean: ean,
                nome: data.product.product_name_pt || 
                      data.product.product_name || 
                      data.product.product_name_en || 
                      'Produto',
                marca: data.product.brands || data.product.brand || '',
                imagem: data.product.image_front_url || 
                       data.product.image_url || 
                       data.product.image_front_small_url || 
                       '',
                preco: '0',
                fonte: 'Open Food Facts'
            };
        }
        return null;
    } catch (error) {
        console.error('Erro Open Food Facts:', error);
        return null;
    }
}

async function searchBluesoft(ean) {
    try {
        const response = await fetch(
            `https://api.cosmos.bluesoft.com.br/gtins/${ean}.json`,
            {
                headers: {
                    'X-Cosmos-Token': BLUESOFT_API_KEY,
                    'User-Agent': 'CompraInteligente/1.0'
                }
            }
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        return {
            ean: ean,
            nome: data.description || 'Produto',
            marca: data.brand?.name || data.brand_name || '',
            imagem: data.thumbnail || data.image || '',
            preco: data.price || data.average_price || '0',
            fonte: 'Bluesoft Cosmos'
        };
        
    } catch (error) {
        console.error('Erro Bluesoft:', error);
        return null;
    }
}

async function saveProductToDatabase(product) {
    try {
        const params = new URLSearchParams({
            operation: 'save',
            ean: product.ean,
            nome: product.nome,
            marca: product.marca || '',
            imagem: product.imagem || '',
            preco: product.preco || '0',
            fonte: product.fonte
        });
        
        const url = `${GOOGLE_SHEETS_API}?${params.toString()}`;
        await fetch(url);
        
    } catch (error) {
        console.error('Erro ao salvar produto:', error);
    }
}

// ========== EXIBIÇÃO DE RESULTADOS ==========
function showProductResult(product, fromDatabase) {
    const container = document.getElementById('resultContainer');
    
    const price = parseFloat(product.preco || 0).toFixed(2);
    
    let imageHtml = product.imagem ? 
        `<img src="${product.imagem}" alt="${product.nome}" onerror="this.src='';">` :
        `<i class="fas fa-box"></i>`;
    
    container.innerHTML = `
        <div class="product-result-card">
            <div class="product-image-container">
                ${imageHtml}
            </div>
            <div class="product-details">
                <div class="product-title">${product.nome}</div>
                <div class="product-meta">
                    <span class="product-meta-item">
                        <i class="fas fa-barcode"></i> ${product.ean}
                    </span>
                    ${product.marca ? `
                    <span class="product-meta-item">
                        <i class="fas fa-industry"></i> ${product.marca}
                    </span>` : ''}
                    <span class="product-meta-item">
                        <i class="fas fa-database"></i> ${product.fonte}
                    </span>
                </div>
                <div class="product-price">
                    <i class="fas fa-tag"></i> R$ ${price}
                </div>
                <div class="product-actions">
                    <button class="btn btn-primary" onclick="openPriceModal(${JSON.stringify(product).replace(/"/g, '&quot;')})">
                        <i class="fas fa-cart-plus"></i> Adicionar ao Carrinho
                    </button>
                    ${fromDatabase ? `
                    <button class="btn btn-secondary" onclick="editProduct(${product.linha || 'null'})">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

function showNotFoundResult(ean) {
    const container = document.getElementById('resultContainer');
    
    container.innerHTML = `
        <div class="product-result-card">
            <div class="product-image-container">
                <i class="fas fa-question-circle"></i>
            </div>
            <div class="product-details">
                <div class="product-title">Produto não encontrado</div>
                <p>O produto com EAN <strong>${ean}</strong> não foi encontrado em nenhuma fonte.</p>
                <div class="product-actions">
                    <button class="btn btn-warning" onclick="addProductManually('${ean}')">
                        <i class="fas fa-plus"></i> Cadastrar Manualmente
                    </button>
                </div>
            </div>
        </div>
    `;
}

function showErrorResult(title, message) {
    const container = document.getElementById('resultContainer');
    
    container.innerHTML = `
        <div class="product-result-card">
            <div class="product-image-container">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <div class="product-details">
                <div class="product-title">${title}</div>
                <p>${message}</p>
                <div class="product-actions">
                    <button class="btn btn-primary" onclick="searchProduct()">
                        <i class="fas fa-redo"></i> Tentar Novamente
                    </button>
                </div>
            </div>
        </div>
    `;
}

function clearResult() {
    document.getElementById('resultContainer').innerHTML = '';
}

// ========== MODAL DE PREÇO ==========
function openPriceModal(product) {
    currentProduct = product;
    
    // Preencher informações do produto
    document.getElementById('modalProductName').textContent = product.nome;
    document.getElementById('modalProductEAN').textContent = `EAN: ${product.ean}`;
    document.getElementById('modalProductBrand').textContent = `Marca: ${product.marca || 'Não informada'}`;
    
    // Imagem
    const imgContainer = document.getElementById('modalProductImage');
    if (product.imagem) {
        imgContainer.innerHTML = `<img src="${product.imagem}" alt="${product.nome}" style="width:100%;height:100%;object-fit:contain;">`;
    } else {
        imgContainer.innerHTML = '<i class="fas fa-image"></i>';
    }
    
    // Preços
    const oldPrice = parseFloat(product.preco || 0);
    modalData.oldPrice = oldPrice;
    modalData.product = product;
    
    document.getElementById('modalOldPrice').textContent = `R$ ${oldPrice.toFixed(2)}`;
    document.getElementById('modalCurrentPrice').value = oldPrice.toFixed(2);
    
    // Calcular variação inicial
    calculateVariationModal();
    
    // Mostrar modal
    document.getElementById('priceModal').classList.add('active');
}

function closePriceModal() {
    document.getElementById('priceModal').classList.remove('active');
    currentProduct = null;
    modalData = { product: null, oldPrice: 0, newPrice: 0 };
}

function calculateVariationModal() {
    const input = document.getElementById('modalCurrentPrice');
    const newPrice = parseFloat(input.value) || 0;
    const oldPrice = modalData.oldPrice;
    
    modalData.newPrice = newPrice;
    
    // Calcular variação
    const variationValue = newPrice - oldPrice;
    const variationPercent = oldPrice > 0 ? (variationValue / oldPrice) * 100 : 0;
    
    // Atualizar display
    document.getElementById('modalVariationValue').textContent = 
        `R$ ${variationValue.toFixed(2)}`;
    document.getElementById('modalVariationPercent').textContent = 
        `${variationPercent.toFixed(1)}%`;
    
    // Indicador visual
    const indicator = document.getElementById('priceIndicator');
    const icon = indicator.querySelector('.indicator-icon');
    const text = indicator.querySelector('.indicator-text');
    
    if (variationValue < 0) {
        // Mais barato
        indicator.className = 'price-indicator cheaper';
        icon.innerHTML = '<i class="fas fa-arrow-down"></i>';
        text.textContent = `Economia de R$ ${Math.abs(variationValue).toFixed(2)}`;
        indicator.classList.add('cheaper');
        indicator.classList.remove('expensive');
    } else if (variationValue > 0) {
        // Mais caro
        indicator.className = 'price-indicator expensive';
        icon.innerHTML = '<i class="fas fa-arrow-up"></i>';
        text.textContent = `Aumento de R$ ${variationValue.toFixed(2)}`;
        indicator.classList.add('expensive');
        indicator.classList.remove('cheaper');
    } else {
        // Mesmo preço
        indicator.className = 'price-indicator';
        icon.innerHTML = '<i class="fas fa-minus"></i>';
        text.textContent = 'Mesmo preço';
        indicator.classList.remove('cheaper', 'expensive');
    }
}

async function addToCartFromModal() {
    if (!modalData.product || modalData.newPrice <= 0) {
        showAlert('Digite um preço válido maior que zero', 'danger');
        return;
    }
    
    try {
        updateStatus('Adicionando ao carrinho...', 'info');
        
        // Preparar dados
        const params = new URLSearchParams({
            operation: 'addToCart',
            ean: modalData.product.ean,
            nome: modalData.product.nome,
            marca: modalData.product.marca || '',
            imagem: modalData.product.imagem || '',
            preco_atual: modalData.newPrice.toString(),
            preco_antigo: modalData.oldPrice.toString(),
            variacao: (modalData.newPrice - modalData.oldPrice).toFixed(2)
        });
        
        // Enviar para API
        const url = `${GOOGLE_SHEETS_API}?${params.toString()}`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            showAlert('Produto adicionado ao carrinho!', 'success');
            closePriceModal();
            
            // Atualizar carrinho
            loadCart();
            
            // Atualizar contador
            updateCartCount();
            
            // Se estava na aba carrinho, recarregar
            if (document.querySelector('[data-tab="compras"]').classList.contains('active')) {
                switchTab('compras');
            }
            
        } else {
            showAlert('Erro ao adicionar ao carrinho: ' + result.message, 'danger');
        }
        
    } catch (error) {
        console.error('Erro ao adicionar ao carrinho:', error);
        showAlert('Erro ao adicionar ao carrinho', 'danger');
    }
}

// ========== CARRINHO ==========
async function loadCart() {
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=getCart`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            displayCart(result);
            updateCartSummary(result);
        } else {
            displayEmptyCart();
        }
        
    } catch (error) {
        console.error('Erro ao carregar carrinho:', error);
        displayEmptyCart();
    }
}

function displayCart(cartData) {
    const tbody = document.getElementById('cartBody');
    const checkoutBtn = document.getElementById('checkoutBtn');
    const clearBtn = document.getElementById('clearCartBtn');
    
    if (!cartData.items || cartData.items.length === 0) {
        displayEmptyCart();
        checkoutBtn.disabled = true;
        clearBtn.disabled = true;
        return;
    }
    
    checkoutBtn.disabled = false;
    clearBtn.disabled = false;
    
    let html = '';
    
    cartData.items.forEach((item, index) => {
        const variation = parseFloat(item.variacao || 0);
        const variationClass = variation < 0 ? 'text-success' : variation > 0 ? 'text-danger' : '';
        const variationIcon = variation < 0 ? 'fa-arrow-down' : variation > 0 ? 'fa-arrow-up' : 'fa-minus';
        
        html += `
            <tr>
                <td>${index + 1}</td>
                <td>${item.ean}</td>
                <td>
                    <strong>${item.nome}</strong><br>
                    <small class="text-muted">${item.marca || ''}</small>
                </td>
                <td>R$ ${parseFloat(item.preco_antigo || 0).toFixed(2)}</td>
                <td>R$ ${parseFloat(item.preco_atual || 0).toFixed(2)}</td>
                <td class="${variationClass}">
                    <i class="fas ${variationIcon}"></i>
                    R$ ${Math.abs(variation).toFixed(2)}
                </td>
                <td>
                    <button class="btn-icon" onclick="removeFromCart('${item.ean}')" title="Remover">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

function displayEmptyCart() {
    const tbody = document.getElementById('cartBody');
    
    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center">
                <div style="padding: 40px;">
                    <i class="fas fa-shopping-cart" style="font-size: 48px; color: #ddd; margin-bottom: 20px;"></i>
                    <h3 style="color: #999; margin-bottom: 10px;">Carrinho vazio</h3>
                    <p style="color: #aaa;">Adicione produtos escaneando ou buscando.</p>
                </div>
            </td>
        </tr>
    `;
    
    // Resetar resumo
    document.getElementById('cartItemsCount').textContent = '0';
    document.getElementById('cartTotalCurrent').textContent = 'R$ 0,00';
    document.getElementById('cartTotalPrevious').textContent = 'R$ 0,00';
    document.getElementById('cartVariation').textContent = 'R$ 0,00';
}

function updateCartSummary(cartData) {
    document.getElementById('cartItemsCount').textContent = cartData.total || 0;
    document.getElementById('cartTotalCurrent').textContent = `R$ ${parseFloat(cartData.subtotal || 0).toFixed(2)}`;
    document.getElementById('cartTotalPrevious').textContent = `R$ ${parseFloat(cartData.preco_antigo_total || 0).toFixed(2)}`;
    
    const variation = parseFloat(cartData.variacao_total || 0);
    const variationElement = document.getElementById('cartVariation');
    
    if (variation < 0) {
        variationElement.innerHTML = `<span class="text-success">-R$ ${Math.abs(variation).toFixed(2)}</span>`;
    } else if (variation > 0) {
        variationElement.innerHTML = `<span class="text-danger">+R$ ${variation.toFixed(2)}</span>`;
    } else {
        variationElement.textContent = 'R$ 0,00';
    }
}

async function removeFromCart(ean) {
    showConfirm(
        'Remover do carrinho',
        'Tem certeza que deseja remover este item do carrinho?',
        async () => {
            try {
                const url = `${GOOGLE_SHEETS_API}?operation=removeFromCart&ean=${ean}`;
                const response = await fetch(url);
                const result = await response.json();
                
                if (result.success) {
                    showAlert('Item removido do carrinho!', 'success');
                    loadCart();
                    updateCartCount();
                } else {
                    showAlert('Erro ao remover item: ' + result.message, 'danger');
                }
            } catch (error) {
                console.error('Erro ao remover do carrinho:', error);
                showAlert('Erro ao remover item', 'danger');
            }
        }
    );
}

async function clearCart() {
    showConfirm(
        'Limpar carrinho',
        'Tem certeza que deseja limpar todo o carrinho? Esta ação não pode ser desfeita.',
        async () => {
            try {
                const url = `${GOOGLE_SHEETS_API}?operation=clearCart`;
                const response = await fetch(url);
                const result = await response.json();
                
                if (result.success) {
                    showAlert('Carrinho limpo com sucesso!', 'success');
                    loadCart();
                    updateCartCount();
                } else {
                    showAlert('Erro ao limpar carrinho: ' + result.message, 'danger');
                }
            } catch (error) {
                console.error('Erro ao limpar carrinho:', error);
                showAlert('Erro ao limpar carrinho', 'danger');
            }
        }
    );
}

async function checkout() {
    showConfirm(
        'Finalizar compra',
        'Finalizar compra e mover itens para o histórico? Os preços serão atualizados no banco.',
        async () => {
            try {
                updateStatus('Finalizando compra...', 'info');
                
                const url = `${GOOGLE_SHEETS_API}?operation=checkout`;
                const response = await fetch(url);
                const result = await response.json();
                
                if (result.success) {
                    showReceipt(result);
                    loadCart();
                    updateCartCount();
                    loadProducts(); // Atualizar lista de produtos
                    updateStatus('Compra finalizada com sucesso!', 'success');
                } else {
                    showAlert('Erro ao finalizar compra: ' + result.message, 'danger');
                }
            } catch (error) {
                console.error('Erro no checkout:', error);
                showAlert('Erro ao finalizar compra', 'danger');
            }
        }
    );
}

// ========== PRODUTOS ==========
async function loadProducts() {
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=list`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            displayProducts(result.produtos);
            updateProductsInfo(result.produtos.length);
        } else {
            displayNoProducts();
        }
        
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        displayNoProducts();
    }
}

function displayProducts(products) {
    const tbody = document.getElementById('productsBody');
    
    if (!products || products.length === 0) {
        displayNoProducts();
        return;
    }
    
    let html = '';
    
    products.forEach((product, index) => {
        html += `
            <tr>
                <td>${product.ean}</td>
                <td>
                    <strong>${product.nome}</strong><br>
                    <small class="text-muted">${product.fonte || ''}</small>
                </td>
                <td>${product.marca || ''}</td>
                <td>R$ ${parseFloat(product.preco || 0).toFixed(2)}</td>
                <td>${formatShortDate(product.ultima_consulta || product.cadastro)}</td>
                <td>
                    <button class="btn-icon" onclick="openPriceModal(${JSON.stringify(product).replace(/"/g, '&quot;')})" title="Comprar">
                        <i class="fas fa-cart-plus"></i>
                    </button>
                    <button class="btn-icon" onclick="editProduct(${product.linha})" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

function displayNoProducts() {
    const tbody = document.getElementById('productsBody');
    
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="text-center">
                <div style="padding: 40px;">
                    <i class="fas fa-box-open" style="font-size: 48px; color: #ddd; margin-bottom: 20px;"></i>
                    <h3 style="color: #999; margin-bottom: 10px;">Nenhum produto</h3>
                    <p style="color: #aaa;">Cadastre produtos escaneando códigos de barras.</p>
                </div>
            </td>
        </tr>
    `;
}

function filterProducts() {
    const search = document.getElementById('searchProducts').value.toLowerCase();
    const rows = document.querySelectorAll('#productsBody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? '' : 'none';
    });
}

function updateProductsInfo(count) {
    document.getElementById('productsInfo').textContent = `${count} produtos encontrados`;
    document.getElementById('totalProducts').textContent = `${count} produtos`;
}

// ========== HISTÓRICO ==========
async function loadHistory() {
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=getHistorico`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            displayHistoryDates(result.historico);
            displayAllHistory(result.historico);
            updateHistoryInfo(result.total_compras);
        } else {
            displayNoHistory();
        }
        
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        displayNoHistory();
    }
}

function displayHistoryDates(history) {
    const container = document.getElementById('historyDates');
    
    if (!history || history.length === 0) {
        container.innerHTML = '<p class="text-muted">Nenhuma compra registrada</p>';
        return;
    }
    
    // Extrair datas únicas
    const dates = [...new Set(history.map(item => item.data))];
    
    let html = '<button class="date-chip active" onclick="showAllHistory()">Todas</button>';
    
    dates.forEach(date => {
        html += `<button class="date-chip" onclick="filterHistoryByDate('${date}')">${date}</button>`;
    });
    
    container.innerHTML = html;
}

function displayAllHistory(history) {
    const tbody = document.getElementById('historyBody');
    
    if (!history || history.length === 0) {
        displayNoHistory();
        return;
    }
    
    let html = '';
    
    // Ordenar por data (mais recente primeiro)
    history.sort((a, b) => new Date(b.data_completa) - new Date(a.data_completa));
    
    history.forEach(item => {
        item.itens.forEach(product => {
            const variation = parseFloat(product.variacao || 0);
            const variationClass = variation < 0 ? 'text-success' : variation > 0 ? 'text-danger' : '';
            
            html += `
                <tr>
                    <td>${product.data_compra}</td>
                    <td>${product.ean}</td>
                    <td>
                        <strong>${product.nome}</strong><br>
                        <small class="text-muted">${product.marca || ''}</small>
                    </td>
                    <td>R$ ${parseFloat(product.preco_antigo || 0).toFixed(2)}</td>
                    <td>R$ ${parseFloat(product.preco_atual || 0).toFixed(2)}</td>
                    <td class="${variationClass}">
                        R$ ${Math.abs(variation).toFixed(2)}
                    </td>
                </tr>
            `;
        });
    });
    
    tbody.innerHTML = html;
}

function filterHistoryByDate(date) {
    // Implementar filtro por data
    showAlert('Filtro por data em desenvolvimento', 'info');
}

function showAllHistory() {
    // Recarregar histórico completo
    loadHistory();
}

function displayNoHistory() {
    const tbody = document.getElementById('historyBody');
    
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="text-center">
                <div style="padding: 40px;">
                    <i class="fas fa-history" style="font-size: 48px; color: #ddd; margin-bottom: 20px;"></i>
                    <h3 style="color: #999; margin-bottom: 10px;">Nenhum histórico</h3>
                    <p style="color: #aaa;">Nenhuma compra registrada no histórico.</p>
                </div>
            </td>
        </tr>
    `;
}

function updateHistoryInfo(count) {
    document.getElementById('totalHistory').textContent = `${count} compras`;
}

// ========== RECIBO ==========
function showReceipt(checkoutData) {
    const date = new Date().toLocaleString('pt-BR');
    
    document.getElementById('receiptDate').textContent = date;
    document.getElementById('receiptTotalItems').textContent = checkoutData.resumo.total_itens || 0;
    document.getElementById('receiptTotalValue').textContent = `R$ ${parseFloat(checkoutData.resumo.total_valor || 0).toFixed(2)}`;
    document.getElementById('receiptTotalSavings').textContent = `R$ ${parseFloat(checkoutData.resumo.economia || 0).toFixed(2)}`;
    
    // Itens do recibo (simplificado)
    document.getElementById('receiptItems').innerHTML = `
        <div class="receipt-item">
            <span class="receipt-item-name">Compra finalizada</span>
            <span class="receipt-item-price">${checkoutData.resumo.total_itens} itens</span>
        </div>
    `;
    
    // Mostrar modal
    document.getElementById('receiptModal').classList.add('active');
}

function closeReceiptModal() {
    document.getElementById('receiptModal').classList.remove('active');
}

// ========== FUNÇÕES AUXILIARES ==========
function isValidEAN(code) {
    if (!/^\d+$/.test(code)) return false;
    if (code.length < 8 || code.length > 13) return false;
    return true;
}

function updateStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status');
    
    let icon = '';
    switch(type) {
        case 'success': icon = '<i class="fas fa-check-circle"></i>'; break;
        case 'danger': icon = '<i class="fas fa-exclamation-circle"></i>'; break;
        case 'warning': icon = '<i class="fas fa-exclamation-triangle"></i>'; break;
        default: icon = '<i class="fas fa-info-circle"></i>';
    }
    
    statusDiv.innerHTML = `${icon} ${message}`;
    statusDiv.className = `status ${type}`;
}

function showAlert(message, type = 'info') {
    // Implementação simples - pode ser substituída por um toast
    alert(`[${type.toUpperCase()}] ${message}`);
}

function showConfirm(title, message, onConfirm) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    
    const btn = document.getElementById('confirmActionBtn');
    const modal = document.getElementById('confirmModal');
    
    // Configurar ação
    btn.onclick = function() {
        onConfirm();
        modal.classList.remove('active');
    };
    
    modal.classList.add('active');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
}

async function updateCartCount() {
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=getCart`;
        const response = await fetch(url);
        const result = await response.json();
        
        const count = result.success ? (result.total || 0) : 0;
        document.getElementById('cartCount').textContent = count;
        
    } catch (error) {
        console.error('Erro ao atualizar contador:', error);
        document.getElementById('cartCount').textContent = '0';
    }
}

function formatShortDate(dateString) {
    if (!dateString) return '';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        return dateString;
    }
}

async function checkAPIStatus() {
    const element = document.getElementById('apiStatus');
    
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=test`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            element.textContent = 'Conectado';
            element.style.color = 'var(--success)';
        } else {
            element.textContent = 'Erro na API';
            element.style.color = 'var(--danger)';
        }
    } catch (error) {
        element.textContent = 'Sem conexão';
        element.style.color = 'var(--danger)';
    }
}

async function testConnection() {
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=test`;
        await fetch(url, { timeout: 5000 });
        console.log('API conectada com sucesso');
    } catch (error) {
        console.error('Erro de conexão com API:', error);
        showAlert('Erro de conexão com o servidor. Verifique sua internet.', 'danger');
    }
}

async function loadStats() {
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=stats`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            const stats = result.estatisticas;
            document.getElementById('totalProducts').textContent = `${stats.total_produtos || 0} produtos`;
        }
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
    }
}

function editProduct(linha) {
    showAlert('Edição de produto em desenvolvimento', 'info');
}

function addProductManually(ean) {
    showAlert('Cadastro manual em desenvolvimento', 'info');
}

// ========== EXPORTAR FUNÇÕES PARA ESCOPO GLOBAL ==========
window.switchTab = switchTab;
window.initScanner = initScanner;
window.stopScanner = stopScanner;
window.searchProduct = searchProduct;
window.openPriceModal = openPriceModal;
window.closePriceModal = closePriceModal;
window.calculateVariationModal = calculateVariationModal;
window.addToCartFromModal = addToCartFromModal;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.checkout = checkout;
window.filterProducts = filterProducts;
window.filterHistoryByDate = filterHistoryByDate;
window.showAllHistory = showAllHistory;
window.closeReceiptModal = closeReceiptModal;
window.closeConfirmModal = closeConfirmModal;
window.editProduct = editProduct;
window.addProductManually = addProductManually;
