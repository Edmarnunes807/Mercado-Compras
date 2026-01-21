// ========== CONFIGURAÇÕES ==========
const GOOGLE_SHEETS_API = "https://script.google.com/macros/s/AKfycbxWVfktrTr9y8yZTbk3zwdAUGx0tB9Lyp2m73xboc4k0d643cWbxIIG1x_ThTeI434P/exec";
const BLUESOFT_API_KEY = "7tF33vAL9xZs7ZRoSMBitg";

// ========== VARIÁVEIS GLOBAIS ==========
let html5QrCode = null;
let currentCameraId = null;
let isScanning = false;
let lastScanned = '';
let lastScanTime = 0;
let currentProduct = null;
let currentModalType = 'edit';
let isLoading = false;

const REAR_CAMERA_KEYWORDS = ["back", "rear", "environment", "traseira", "camera 0"];

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('manualCode').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchManual();
    });
    
    document.getElementById('saveEditBtn').addEventListener('click', saveEditedProduct);
    
    document.getElementById('cartCurrentPrice').addEventListener('input', updatePriceVariation);
    
    checkAPIStatus();
    
    updateCartInfo();
});

// ========== FUNÇÕES DE NAVEGAÇÃO ==========
function showPage(pageId) {
    if (isLoading) return;
    
    // Atualizar botões de navegação
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.page === pageId) {
            btn.classList.add('active');
        }
    });
    
    // Mostrar página selecionada
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    document.getElementById(`page-${pageId}`).classList.add('active');
    
    // Limpar resultados anteriores
    if (pageId !== 'scanner') {
        document.getElementById('result').innerHTML = '';
        document.getElementById('result').classList.remove('active');
    }
    
    // Carregar conteúdo da página
    switch(pageId) {
        case 'compras':
            loadCart();
            break;
        case 'historico':
            loadPurchaseHistory();
            break;
        case 'produtos':
            loadAllProducts();
            break;
    }
}

// ========== FUNÇÕES DO SCANNER ==========
async function initScanner() {
    if (isScanning || isLoading) return;
    
    try {
        updateStatus('Iniciando câmera...', 'scanning');
        
        const scannerContainer = document.getElementById('scannerContainer');
        const startBtn = document.getElementById('startBtn');
        const cameraInfo = document.getElementById('cameraInfo');
        const cameraControls = document.getElementById('cameraControls');
        
        if (scannerContainer) scannerContainer.style.display = 'block';
        if (startBtn) startBtn.style.display = 'none';
        if (cameraInfo) cameraInfo.classList.remove('hidden');
        if (cameraControls) cameraControls.classList.remove('hidden');
        
        const config = {
            fps: 30,
            qrbox: { width: 300, height: 200 },
            aspectRatio: 4/3,
            formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39
            ]
        };
        
        if (typeof Html5Qrcode === 'undefined') {
            throw new Error('Biblioteca de scanner não carregada');
        }
        
        html5QrCode = new Html5Qrcode("reader");
        
        const rearCameraId = await findRearCamera();
        
        if (rearCameraId) {
            currentCameraId = rearCameraId;
            
            const cameraConfig = {
                ...config,
                videoConstraints: {
                    deviceId: { exact: rearCameraId },
                    width: { min: 1280, ideal: 1920, max: 2560 },
                    height: { min: 720, ideal: 1080, max: 1440 },
                    frameRate: { ideal: 30, min: 24 }
                }
            };
            
            await html5QrCode.start(
                rearCameraId,
                cameraConfig,
                onScanSuccess,
                onScanError
            );
            
        } else {
            const fallbackConfig = {
                ...config,
                videoConstraints: {
                    facingMode: { exact: "environment" },
                    width: { min: 1280, ideal: 1920 },
                    height: { min: 720, ideal: 1080 }
                }
            };
            
            await html5QrCode.start(
                { facingMode: "environment" },
                fallbackConfig,
                onScanSuccess,
                onScanError
            );
            
            currentCameraId = "environment";
        }
        
        updateStatus('Scanner ativo! Aponte para um código de barras...', 'success');
        isScanning = true;
        
    } catch (error) {
        console.error('Erro ao iniciar scanner:', error);
        await handleScannerError(error);
    }
}

async function findRearCamera() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            return null;
        }
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        const exactCamera = videoDevices.find(device => 
            device.label && device.label.includes("camera 0, facing back")
        );
        
        if (exactCamera) return exactCamera.deviceId;
        
        const rearCamera = videoDevices.find(device => {
            if (!device.label) return false;
            const label = device.label.toLowerCase();
            return REAR_CAMERA_KEYWORDS.some(keyword => 
                label.includes(keyword.toLowerCase())
            );
        });
        
        if (rearCamera) return rearCamera.deviceId;
        
        if (videoDevices.length > 1) {
            return videoDevices[videoDevices.length - 1].deviceId;
        }
        
        if (videoDevices.length === 1) {
            return videoDevices[0].deviceId;
        }
        
        return null;
        
    } catch (error) {
        console.error("Erro ao encontrar câmera:", error);
        return null;
    }
}

async function handleScannerError(error) {
    if (html5QrCode) {
        try {
            await html5QrCode.stop();
            html5QrCode.clear();
        } catch (e) {
            console.log('Erro ao parar scanner:', e);
        }
    }
    
    isScanning = false;
    html5QrCode = null;
    currentCameraId = null;
    
    const startBtn = document.getElementById('startBtn');
    const scannerContainer = document.getElementById('scannerContainer');
    const cameraInfo = document.getElementById('cameraInfo');
    const cameraControls = document.getElementById('cameraControls');
    
    if (startBtn) startBtn.style.display = 'inline-block';
    if (scannerContainer) scannerContainer.style.display = 'none';
    if (cameraInfo) cameraInfo.classList.add('hidden');
    if (cameraControls) cameraControls.classList.add('hidden');
    
    if (error.message && error.message.includes('permission')) {
        updateStatus('Permissão da câmera negada.', 'error');
    } else if (error.message && error.message.includes('NotFoundError')) {
        updateStatus('Nenhuma câmera encontrada.', 'error');
    } else {
        updateStatus('Erro ao iniciar scanner.', 'error');
    }
}

function onScanError(error) {
    if (!error || typeof error !== 'string' || !error.includes("No MultiFormat Readers")) {
        console.log('Erro de scan:', error);
    }
}

async function stopScanner() {
    if (html5QrCode && isScanning) {
        try {
            await html5QrCode.stop();
        } catch (error) {
            console.log('Erro ao parar scanner:', error);
        }
        html5QrCode.clear();
    }
    
    isScanning = false;
    html5QrCode = null;
    currentCameraId = null;
    
    const scannerContainer = document.getElementById('scannerContainer');
    const startBtn = document.getElementById('startBtn');
    const cameraInfo = document.getElementById('cameraInfo');
    const cameraControls = document.getElementById('cameraControls');
    
    if (scannerContainer) scannerContainer.style.display = 'none';
    if (startBtn) startBtn.style.display = 'inline-block';
    if (cameraInfo) cameraInfo.classList.add('hidden');
    if (cameraControls) cameraControls.classList.add('hidden');
    
    updateStatus('Scanner parado.', 'default');
}

function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    const code = decodedText.trim();
    
    if (!isValidBarcode(code)) return;
    if (code === lastScanned && (now - lastScanTime) < 2000) return;
    
    lastScanned = code;
    lastScanTime = now;
    
    updateStatus(`📷 Código detectado: ${code}`, 'success');
    
    if (html5QrCode) {
        html5QrCode.pause();
        setTimeout(() => {
            if (html5QrCode && isScanning) {
                html5QrCode.stop().then(() => {
                    html5QrCode.clear();
                    isScanning = false;
                    
                    const scannerContainer = document.getElementById('scannerContainer');
                    const startBtn = document.getElementById('startBtn');
                    const cameraInfo = document.getElementById('cameraInfo');
                    const cameraControls = document.getElementById('cameraControls');
                    
                    if (scannerContainer) scannerContainer.style.display = 'none';
                    if (startBtn) startBtn.style.display = 'inline-block';
                    if (cameraInfo) cameraInfo.classList.add('hidden');
                    if (cameraControls) cameraControls.classList.add('hidden');
                });
            }
        }, 100);
    }
    
    document.getElementById('manualCode').value = code;
    searchProduct(code);
}

// ========== FLUXO DE BUSCA OTIMIZADO ==========
async function searchProduct(code) {
    if (!code || !isValidBarcode(code)) {
        showAlert('Código EAN inválido. Use 8-13 dígitos.', 'error');
        return;
    }
    
    clearResult();
    updateStatus(`Buscando produto ${code}...`, 'scanning');
    isLoading = true;
    
    try {
        // 1º PASSO: Buscar no Banco Local (Google Sheets) - SEMPRE PRIMEIRO
        const localResult = await searchInGoogleSheets(code);
        
        if (localResult && localResult.success && localResult.found) {
            currentProduct = localResult.product;
            showProductInfo(localResult.product, true);
            updateStatus(`✅ Encontrado no banco local`, 'success');
            isLoading = false;
            return;
        }
        
        // 2º PASSO: Se não encontrou no banco local, buscar no Open Food Facts
        updateStatus('Não encontrado localmente. Buscando no Open Food Facts...', 'scanning');
        const openFoodProduct = await searchOpenFoodFacts(code);
        
        if (openFoodProduct && openFoodProduct.name) {
            showExternalProductInfo(openFoodProduct, code, 'Open Food Facts');
            updateStatus(`✅ Encontrado no Open Food Facts`, 'success');
            isLoading = false;
            return;
        }
        
        // 3º PASSO: Se não encontrou no Open Food Facts, buscar no Bluesoft
        updateStatus('Não encontrado no Open Food Facts. Buscando no Bluesoft...', 'scanning');
        const bluesoftProduct = await searchBluesoftCosmos(code);
        
        if (bluesoftProduct && bluesoftProduct.name) {
            showExternalProductInfo(bluesoftProduct, code, 'Bluesoft Cosmos');
            updateStatus(`✅ Encontrado no Bluesoft Cosmos`, 'success');
            isLoading = false;
            return;
        }
        
        // 4º PASSO: Se não encontrou em nenhuma fonte, mostrar formulário para cadastrar
        updateStatus('❌ Produto não encontrado em nenhuma fonte', 'error');
        showAddToDatabaseForm(code);
        
    } catch (error) {
        console.error('Erro no fluxo de busca:', error);
        updateStatus('Erro na busca. Tente novamente.', 'error');
        showErrorResult('Erro na busca', 'Ocorreu um erro ao buscar o produto.');
    } finally {
        isLoading = false;
    }
}

function searchManual() {
    const code = document.getElementById('manualCode').value.trim();
    if (!code || code.length < 8) {
        showAlert('Digite um código de barras válido (8-13 dígitos)', 'warning');
        return;
    }
    searchProduct(code);
}

// ========== API FUNCTIONS ==========
async function searchInGoogleSheets(ean) {
    if (!GOOGLE_SHEETS_API) {
        console.warn("URL do Google Sheets não configurada");
        return null;
    }
    
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=search&ean=${encodeURIComponent(ean)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Erro ao buscar no Google Sheets:', error);
        return null;
    }
}

async function getAllProductsFromSheets() {
    if (!GOOGLE_SHEETS_API) {
        console.warn("URL do Google Sheets não configurada");
        return null;
    }
    
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=getAll`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Erro ao buscar todos os produtos:', error);
        return null;
    }
}

async function saveToGoogleSheets(productData) {
    try {
        const params = new URLSearchParams({
            operation: 'save',
            ean: productData.ean,
            nome: productData.nome || '',
            marca: productData.marca || '',
            imagem: productData.imagem || '',
            preco: productData.preco || '',
            fonte: productData.fonte || 'Manual'
        });
        
        const url = `${GOOGLE_SHEETS_API}?${params.toString()}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Erro ao salvar no Google Sheets:', error);
        return { success: false, error: error.message };
    }
}

async function updateInGoogleSheets(productData) {
    try {
        const params = new URLSearchParams({
            operation: 'update',
            ean: productData.ean,
            nome: productData.nome || '',
            marca: productData.marca || '',
            imagem: productData.imagem || '',
            preco: productData.preco || '',
            fonte: productData.fonte || 'Editado'
        });
        
        if (productData.linha) {
            params.append('linha', productData.linha);
        }
        
        const url = `${GOOGLE_SHEETS_API}?${params.toString()}`;
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error('Erro ao atualizar:', error);
        return { success: false, error: error.message };
    }
}

async function deleteFromGoogleSheets(ean, linha) {
    try {
        const params = new URLSearchParams({
            operation: 'delete',
            ean: ean
        });
        
        if (linha) {
            params.append('linha', linha);
        }
        
        const url = `${GOOGLE_SHEETS_API}?${params.toString()}`;
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error('Erro ao excluir:', error);
        return { success: false, error: error.message };
    }
}

// ========== EXTERNAL APIS ==========
async function searchOpenFoodFacts(code) {
    try {
        const proxyUrl = 'https://api.allorigins.win/raw?url=';
        const apiUrl = `https://world.openfoodfacts.org/api/v0/product/${code}.json`;
        
        const response = await fetch(proxyUrl + encodeURIComponent(apiUrl));
        if (!response.ok) return null;
        
        const data = await response.json();
        
        if (data.status === 1 && data.product) {
            return {
                name: data.product.product_name || 
                      data.product.product_name_pt || 
                      data.product.product_name_en || 
                      'Produto',
                brand: data.product.brands || data.product.brand || '',
                image: data.product.image_front_url || 
                       data.product.image_url || 
                       data.product.image_front_small_url || 
                       data.product.image_thumb_url || 
                       null,
                price: data.product.product_quantity || '',
                source: 'Open Food Facts'
            };
        }
        return null;
    } catch (error) {
        console.error('Erro Open Food Facts:', error);
        return null;
    }
}

async function searchBluesoftCosmos(code) {
    try {
        const response = await fetch(
            `https://api.cosmos.bluesoft.com.br/gtins/${code}.json`,
            {
                headers: {
                    'X-Cosmos-Token': BLUESOFT_API_KEY,
                    'User-Agent': 'Cosmos-API-Request',
                    'Accept': 'application/json'
                }
            }
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        return {
            name: data.description || 'Produto',
            brand: data.brand?.name || data.brand_name || data.manufacturer || '',
            image: data.thumbnail || data.image || null,
            price: data.price || data.average_price || '',
            source: 'Bluesoft Cosmos'
        };
        
    } catch (error) {
        console.error('Erro Bluesoft:', error);
        return null;
    }
}

// ========== SHOPPING CART FUNCTIONS ==========
async function getCartInfo() {
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=getCart`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Erro ao buscar carrinho:', error);
        return { success: false, error: error.message };
    }
}

async function updateCartInfo() {
    const cartInfo = document.getElementById('cartInfo');
    if (!cartInfo) return;
    
    try {
        const cart = await getCartInfo();
        
        if (cart && cart.success) {
            if (cart.total > 0) {
                cartInfo.innerHTML = `
                    <div class="cart-info">
                        <div class="cart-info-left">
                            <div class="cart-info-item">
                                <i class="fas fa-shopping-cart"></i>
                                <span class="cart-info-value">${cart.total} itens</span>
                            </div>
                            <div class="cart-info-item">
                                <i class="fas fa-money-bill-wave"></i>
                                <span class="cart-info-value">R$ ${cart.subtotal}</span>
                            </div>
                            ${cart.economia > 0 ? `
                            <div class="cart-info-item">
                                <i class="fas fa-piggy-bank"></i>
                                <span class="cart-info-value">R$ ${cart.economia}</span>
                            </div>
                            ` : ''}
                        </div>
                        <div class="cart-info-actions">
                            <button class="btn-small btn-success" onclick="loadCart()">
                                <i class="fas fa-eye"></i> Ver
                            </button>
                            <button class="btn-small btn-danger" onclick="clearCart()">
                                <i class="fas fa-trash"></i> Limpar
                            </button>
                        </div>
                    </div>
                `;
                cartInfo.classList.remove('hidden');
            } else {
                cartInfo.classList.add('hidden');
            }
        } else {
            cartInfo.classList.add('hidden');
        }
    } catch (error) {
        console.error('Erro ao atualizar informações do carrinho:', error);
        cartInfo.classList.add('hidden');
    }
}

async function loadCart() {
    if (isLoading) return;
    
    showPage('compras');
    
    const cartContent = document.getElementById('cartContent');
    cartContent.innerHTML = `
        <div class="loading-state">
            <div class="loading"></div>
            <p>Carregando carrinho...</p>
        </div>
    `;
    
    isLoading = true;
    
    try {
        const cart = await getCartInfo();
        
        if (!cart || !cart.success) {
            cartContent.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3>Erro ao carregar carrinho</h3>
                    <p>${cart?.error || 'Tente novamente mais tarde.'}</p>
                </div>
            `;
            return;
        }
        
        if (cart.total === 0) {
            cartContent.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">
                        <i class="fas fa-shopping-cart"></i>
                    </div>
                    <h3>Carrinho vazio</h3>
                    <p>Adicione produtos ao carrinho para vê-los aqui.</p>
                    <button class="btn btn-primary" onclick="showPage('scanner')">
                        <i class="fas fa-barcode"></i> Escanear Produtos
                    </button>
                </div>
            `;
            return;
        }
        
        let cartHtml = `
            <div class="cart-items-container">
        `;
        
        cart.items.forEach(item => {
            const variacaoColor = item.variacao < 0 ? 'success' : (item.variacao > 0 ? 'danger' : 'secondary');
            const variacaoIcon = item.variacao < 0 ? 'arrow-down' : (item.variacao > 0 ? 'arrow-up' : 'minus');
            
            cartHtml += `
                <div class="cart-item">
                    <div class="cart-item-image">
                        ${item.imagem ? 
                            `<img src="${item.imagem}" alt="${item.nome}" onerror="handleImageError(this)">` : 
                            `<div class="no-image-small"><i class="fas fa-image"></i></div>`
                        }
                    </div>
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.nome}</div>
                        <div class="cart-item-details">
                            <span class="cart-item-ean">EAN: ${item.ean}</span>
                            <span class="cart-item-brand">${item.marca || 'Sem marca'}</span>
                        </div>
                    </div>
                    <div class="cart-item-prices">
                        <div class="cart-price-old">R$ ${item.preco_antigo.toFixed(2)}</div>
                        <div class="cart-price-current">R$ ${item.preco_atual.toFixed(2)}</div>
                        <div class="cart-price-variation ${variacaoColor}">
                            <i class="fas fa-${variacaoIcon}"></i> R$ ${Math.abs(item.variacao).toFixed(2)}
                        </div>
                    </div>
                    <div class="cart-item-actions">
                        <button class="btn-small btn-danger" onclick="removeFromCart('${item.ean}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        cartHtml += `</div>`;
        
        // Summary
        cartHtml += `
            <div class="cart-summary">
                <div class="summary-row">
                    <span>Total de Itens:</span>
                    <span class="summary-value">${cart.total}</span>
                </div>
                <div class="summary-row">
                    <span>Valor Anterior Total:</span>
                    <span class="summary-value">R$ ${cart.preco_antigo_total}</span>
                </div>
                <div class="summary-row total">
                    <span>Valor Atual Total:</span>
                    <span class="summary-value total">R$ ${cart.subtotal}</span>
                </div>
                <div class="summary-row">
                    <span>Variação Total:</span>
                    <span class="summary-value ${cart.variacao_total < 0 ? 'success' : (cart.variacao_total > 0 ? 'danger' : 'secondary')}">
                        R$ ${Math.abs(cart.variacao_total).toFixed(2)}
                    </span>
                </div>
                ${cart.economia > 0 ? `
                <div class="summary-row economy">
                    <span><i class="fas fa-piggy-bank"></i> Economia Total:</span>
                    <span class="summary-value success">R$ ${cart.economia}</span>
                </div>
                ` : ''}
            </div>
            
            <div class="cart-actions">
                <button class="btn btn-success" onclick="checkout()">
                    <i class="fas fa-check-circle"></i> Finalizar Compra
                </button>
                <button class="btn btn-danger" onclick="clearCart()">
                    <i class="fas fa-trash"></i> Limpar Carrinho
                </button>
            </div>
        `;
        
        cartContent.innerHTML = cartHtml;
        
    } catch (error) {
        console.error('Erro ao carregar carrinho:', error);
        cartContent.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3>Erro ao carregar carrinho</h3>
                <p>Tente novamente mais tarde.</p>
            </div>
        `;
    } finally {
        isLoading = false;
    }
}

async function addToCartFromAPI(ean, preco_atual, preco_antigo = null) {
    try {
        const params = new URLSearchParams({
            operation: 'addToCart',
            ean: ean,
            preco_atual: preco_atual
        });
        
        if (preco_antigo) {
            params.append('preco_antigo', preco_antigo);
        }
        
        const url = `${GOOGLE_SHEETS_API}?${params.toString()}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Erro ao adicionar ao carrinho:', error);
        return { success: false, error: error.message };
    }
}

async function removeFromCart(ean) {
    if (!confirm('Remover este item do carrinho?')) return;
    
    updateStatus('Removendo item...', 'scanning');
    
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=removeFromCart&ean=${ean}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            updateStatus('✅ Item removido do carrinho', 'success');
            loadCart();
            updateCartInfo();
        } else {
            updateStatus(`❌ Erro: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Erro ao remover do carrinho:', error);
        updateStatus('Erro ao remover item', 'error');
    }
}

async function clearCart() {
    if (!confirm('Tem certeza que deseja esvaziar o carrinho?')) return;
    
    updateStatus('Esvaziando carrinho...', 'scanning');
    
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=clearCart`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            updateStatus('✅ Carrinho esvaziado', 'success');
            loadCart();
            updateCartInfo();
        } else {
            updateStatus(`❌ Erro: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Erro ao limpar carrinho:', error);
        updateStatus('Erro ao limpar carrinho', 'error');
    }
}

async function checkout() {
    if (!confirm('Finalizar compra e registrar no histórico?')) return;
    
    updateStatus('Finalizando compra...', 'scanning');
    
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=checkout`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            updateStatus(`✅ ${result.message}`, 'success');
            loadCart();
            updateCartInfo();
            
            // Mostrar recibo
            showCheckoutReceipt(result);
        } else {
            updateStatus(`❌ Erro: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Erro ao finalizar compra:', error);
        updateStatus('Erro ao finalizar compra', 'error');
    }
}

function showCheckoutReceipt(result) {
    const cartContent = document.getElementById('cartContent');
    
    cartContent.innerHTML = `
        <div class="checkout-receipt">
            <div class="receipt-header">
                <i class="fas fa-check-circle success" style="font-size: 48px;"></i>
                <h3>Compra Finalizada!</h3>
                <p class="receipt-date">${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}</p>
            </div>
            
            <div class="receipt-summary">
                <div class="receipt-row">
                    <span>Total de Itens:</span>
                    <span class="receipt-value">${result.resumo.total_itens}</span>
                </div>
                <div class="receipt-row">
                    <span>Valor Total:</span>
                    <span class="receipt-value total">R$ ${result.resumo.total_valor}</span>
                </div>
                ${result.resumo.economia > 0 ? `
                <div class="receipt-row economy">
                    <span><i class="fas fa-piggy-bank"></i> Economia:</span>
                    <span class="receipt-value success">R$ ${result.resumo.economia}</span>
                </div>
                ` : ''}
                <div class="receipt-row">
                    <span>Variação Total:</span>
                    <span class="receipt-value ${result.resumo.total_variacao < 0 ? 'success' : (result.resumo.total_variacao > 0 ? 'danger' : 'secondary')}">
                        R$ ${Math.abs(result.resumo.total_variacao).toFixed(2)}
                    </span>
                </div>
            </div>
            
            <div class="receipt-footer">
                <p>Compra registrada no histórico com sucesso!</p>
                <button class="btn btn-primary" onclick="loadCart()">
                    <i class="fas fa-redo"></i> Continuar Comprando
                </button>
            </div>
        </div>
    `;
}

// ========== ADD TO CART MODAL ==========
function openAddToCartModal(product, isFromDatabase = true) {
    currentProduct = product;
    
    document.getElementById('cartProductName').textContent = product.nome || product.name;
    document.getElementById('cartProductEAN').textContent = product.ean;
    
    // Se for do banco, mostrar preço antigo
    if (isFromDatabase && product.preco) {
        document.getElementById('cartOldPrice').value = `R$ ${product.preco}`;
    } else {
        document.getElementById('cartOldPrice').value = 'N/A';
    }
    
    document.getElementById('cartCurrentPrice').value = product.preco || product.price || '';
    document.getElementById('variationAmount').textContent = '0.00';
    
    // Mostrar opção de salvar no banco se for produto externo
    const saveOption = document.getElementById('saveToDatabaseOption');
    if (!isFromDatabase) {
        saveOption.style.display = 'block';
        document.getElementById('saveProductToDb').checked = true;
    } else {
        saveOption.style.display = 'none';
    }
    
    const modal = document.getElementById('addToCartModal');
    modal.classList.remove('hidden');
    modal.classList.add('active');
}

function closeAddToCartModal() {
    const modal = document.getElementById('addToCartModal');
    modal.classList.remove('active');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
    
    currentProduct = null;
}

function updatePriceVariation() {
    const currentPriceInput = document.getElementById('cartCurrentPrice');
    const oldPriceText = document.getElementById('cartOldPrice').value;
    const variationElement = document.getElementById('variationAmount');
    
    const currentPrice = parseFloat(currentPriceInput.value.replace(',', '.'));
    const oldPriceMatch = oldPriceText.match(/[\d.,]+/);
    const oldPrice = oldPriceMatch ? parseFloat(oldPriceMatch[0].replace(',', '.')) : 0;
    
    if (!isNaN(currentPrice) && !isNaN(oldPrice) && oldPrice > 0) {
        const variation = currentPrice - oldPrice;
        variationElement.textContent = variation.toFixed(2);
        
        if (variation < 0) {
            variationElement.style.color = 'var(--success)';
            variationElement.innerHTML = `<i class="fas fa-arrow-down"></i> R$ ${Math.abs(variation).toFixed(2)}`;
        } else if (variation > 0) {
            variationElement.style.color = 'var(--danger)';
            variationElement.innerHTML = `<i class="fas fa-arrow-up"></i> R$ ${variation.toFixed(2)}`;
        } else {
            variationElement.style.color = 'var(--secondary)';
            variationElement.innerHTML = `R$ ${variation.toFixed(2)}`;
        }
    } else {
        variationElement.textContent = '0.00';
        variationElement.style.color = 'var(--secondary)';
        variationElement.innerHTML = 'R$ 0.00';
    }
}

async function addToCart() {
    const currentPrice = document.getElementById('cartCurrentPrice').value.trim();
    
    if (!currentPrice) {
        showAlert('Informe o preço atual do produto', 'warning');
        return;
    }
    
    const priceNumber = parseFloat(currentPrice.replace(',', '.'));
    if (isNaN(priceNumber)) {
        showAlert('Preço inválido. Use números (ex: 10.59)', 'error');
        return;
    }
    
    updateStatus('Adicionando ao carrinho...', 'scanning');
    
    try {
        // Verificar se precisa salvar no banco primeiro (produto externo)
        const saveToDb = document.getElementById('saveProductToDb')?.checked;
        const isFromExternalSource = document.getElementById('saveToDatabaseOption').style.display === 'block';
        
        if (isFromExternalSource && saveToDb && currentProduct) {
            // Salvar produto no banco primeiro
            const productData = {
                ean: currentProduct.ean,
                nome: currentProduct.nome || currentProduct.name || '',
                marca: currentProduct.marca || currentProduct.brand || '',
                imagem: currentProduct.imagem || currentProduct.image || '',
                preco: priceNumber.toString(),
                fonte: 'API Externa + Carrinho'
            };
            
            const saveResult = await saveToGoogleSheets(productData);
            
            if (!saveResult.success) {
                updateStatus(`❌ Erro ao salvar produto: ${saveResult.error}`, 'error');
                return;
            }
        }
        
        // Adicionar ao carrinho
        const oldPriceText = document.getElementById('cartOldPrice').value;
        const oldPriceMatch = oldPriceText.match(/[\d.,]+/);
        const oldPrice = oldPriceMatch ? parseFloat(oldPriceMatch[0].replace(',', '.')) : 0;
        
        const result = await addToCartFromAPI(currentProduct.ean, priceNumber, oldPrice);
        
        if (result.success) {
            updateStatus('✅ Produto adicionado ao carrinho!', 'success');
            closeAddToCartModal();
            updateCartInfo();
            
            // Se estava na página de produtos, recarregar
            if (document.getElementById('page-produtos').classList.contains('active')) {
                loadAllProducts();
            }
        } else {
            updateStatus(`❌ Erro: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Erro ao adicionar ao carrinho:', error);
        updateStatus('Erro ao adicionar ao carrinho', 'error');
    }
}

// ========== DISPLAY FUNCTIONS ==========
function showProductInfo(product, isFromDatabase = true) {
    const resultDiv = document.getElementById('result');
    
    let imageHtml = '';
    if (product.imagem) {
        imageHtml = `
            <div class="product-image-container">
                <img src="${product.imagem}" 
                     class="product-image" 
                     alt="${product.nome}"
                     onerror="handleImageError(this)">
            </div>
        `;
    } else {
        imageHtml = `
            <div class="product-image-container">
                <div class="no-image">
                    <i class="fas fa-image"></i>
                    <span>Sem imagem</span>
                </div>
            </div>
        `;
    }
    
    let sourceBadge = isFromDatabase ? 
        '<span class="db-badge">BANCO LOCAL</span>' : 
        '<span class="db-missing">EXTERNO</span>';
    
    let priceHtml = '';
    if (product.preco) {
        priceHtml = `
            <div class="product-price">
                <i class="fas fa-money-bill-wave"></i> R$ ${product.preco}
            </div>
        `;
    }
    
    resultDiv.innerHTML = `
        <div class="product-card">
            ${imageHtml}
            
            <div class="product-details">
                <div class="product-code">
                    <i class="fas fa-barcode"></i> EAN: ${product.ean}
                </div>
                
                <div class="product-title">${product.nome}</div>
                
                ${product.marca ? `
                <div class="product-brand">
                    <i class="fas fa-industry"></i> ${product.marca}
                </div>
                ` : ''}
                
                ${priceHtml}
                
                ${product.cadastro ? `
                <div class="product-meta">
                    <i class="fas fa-calendar"></i> Cadastro: ${product.cadastro}
                </div>
                ` : ''}
                
                <div class="source-badge">
                    <i class="fas fa-database"></i> ${sourceBadge}
                </div>
            </div>
        </div>
        
        <div class="action-buttons">
            <!-- SEMPRE mostrar botão de adicionar ao carrinho, mesmo para produtos externos -->
            <button class="btn btn-success" onclick="openAddToCartModal(${JSON.stringify(product)}, ${isFromDatabase})">
                <i class="fas fa-cart-plus"></i> Adicionar ao Carrinho
            </button>
            
            ${isFromDatabase ? `
            <button class="btn btn-warning" onclick="openEditModal('${product.ean}', '${encodeURIComponent(product.nome)}', '${encodeURIComponent(product.marca || '')}', '${encodeURIComponent(product.imagem || '')}', '${encodeURIComponent(product.preco || '')}', '${product.linha || ''}')">
                <i class="fas fa-edit"></i> Editar
            </button>
            <button class="btn btn-danger" onclick="deleteProduct('${product.ean}', '${product.linha || ''}')">
                <i class="fas fa-trash"></i> Excluir
            </button>
            ` : `
            <button class="btn btn-warning" onclick="openEditModalForNewProduct('${product.ean}', '${encodeURIComponent(product.nome)}', '${encodeURIComponent(product.marca || '')}', '${encodeURIComponent(product.imagem || '')}', '${encodeURIComponent(product.preco || '')}', '${product.source || 'API Externa'}')">
                <i class="fas fa-save"></i> Salvar no Banco
            </button>
            `}
            <button class="btn btn-secondary" onclick="searchOnline('${product.ean}', '${encodeURIComponent(product.nome)}')">
                <i class="fas fa-globe"></i> Pesquisar Online
            </button>
        </div>
    `;
    
    resultDiv.classList.add('active');
}

function showExternalProductInfo(product, code, source) {
    const resultDiv = document.getElementById('result');
    
    let imageHtml = '';
    if (product.image) {
        imageHtml = `
            <div class="product-image-container">
                <img src="${product.image}" 
                     class="product-image" 
                     alt="${product.name}"
                     onerror="handleImageError(this)">
            </div>
        `;
    } else {
        imageHtml = `
            <div class="product-image-container">
                <div class="no-image">
                    <i class="fas fa-image"></i>
                    <span>Sem imagem</span>
                </div>
            </div>
        `;
    }
    
    let priceHtml = '';
    if (product.price) {
        priceHtml = `
            <div class="product-price">
                <i class="fas fa-money-bill-wave"></i> ${product.price}
            </div>
        `;
    }
    
    // Criar objeto produto para passar para o modal
    const productObj = {
        ean: code,
        nome: product.name,
        marca: product.brand,
        imagem: product.image,
        price: product.price,
        source: source
    };
    
    resultDiv.innerHTML = `
        <div class="product-card">
            ${imageHtml}
            
            <div class="product-details">
                <div class="product-code">
                    <i class="fas fa-barcode"></i> EAN: ${code}
                </div>
                
                <div class="product-title">${product.name}</div>
                
                ${product.brand ? `
                <div class="product-brand">
                    <i class="fas fa-industry"></i> ${product.brand}
                </div>
                ` : ''}
                
                ${priceHtml}
                
                <div class="source-badge">
                    <i class="fas fa-external-link-alt"></i> Fonte: ${source} <span class="db-missing">EXTERNO</span>
                </div>
            </div>
        </div>
        
        <div class="action-buttons">
            <button class="btn btn-success" onclick="openAddToCartModal(${JSON.stringify(productObj)}, false)">
                <i class="fas fa-cart-plus"></i> Adicionar ao Carrinho
            </button>
            <button class="btn btn-warning" onclick="openEditModalForNewProduct('${code}', '${encodeURIComponent(product.name)}', '${encodeURIComponent(product.brand || '')}', '${encodeURIComponent(product.image || '')}', '${encodeURIComponent(product.price || '')}', '${source}')">
                <i class="fas fa-save"></i> Salvar no Banco
            </button>
            <button class="btn btn-secondary" onclick="searchOnline('${code}', '${encodeURIComponent(product.name)}')">
                <i class="fas fa-globe"></i> Pesquisar Online
            </button>
        </div>
    `;
    
    resultDiv.classList.add('active');
}

function showAddToDatabaseForm(code) {
    const resultDiv = document.getElementById('result');
    
    resultDiv.innerHTML = `
        <div class="no-results">
            <div class="no-results-icon">
                <i class="fas fa-plus-circle"></i>
            </div>
            <h3>Produto não encontrado</h3>
            <p>
                Código: <strong>${code}</strong><br>
                O produto não foi encontrado em nenhuma fonte.
            </p>
            
            <div class="action-buttons">
                <button class="btn btn-success" onclick="openManualAddModal('${code}')">
                    <i class="fas fa-plus"></i> Cadastrar Manualmente
                </button>
                <button class="btn btn-secondary" onclick="searchOnline('${code}')">
                    <i class="fas fa-globe"></i> Pesquisar na Web
                </button>
            </div>
        </div>
    `;
    
    resultDiv.classList.add('active');
}

function showErrorResult(title, message) {
    const resultDiv = document.getElementById('result');
    
    resultDiv.innerHTML = `
        <div class="no-results">
            <div class="no-results-icon">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <h3>${title}</h3>
            <p>${message}</p>
            <button class="btn btn-secondary" onclick="searchManual()">
                <i class="fas fa-redo"></i> Tentar novamente
            </button>
        </div>
    `;
    
    resultDiv.classList.add('active');
}

function clearResult() {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = '';
    resultDiv.classList.remove('active');
}

// ========== HISTORY FUNCTIONS ==========
async function getPurchaseHistory() {
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=getHistorico`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        return { success: false, error: error.message };
    }
}

async function loadPurchaseHistory() {
    if (isLoading) return;
    
    showPage('historico');
    
    const historyContent = document.getElementById('historyContent');
    historyContent.innerHTML = `
        <div class="loading-state">
            <div class="loading"></div>
            <p>Carregando histórico...</p>
        </div>
    `;
    
    isLoading = true;
    
    try {
        const result = await getPurchaseHistory();
        
        if (result && result.success) {
            displayPurchaseHistory(result);
        } else {
            historyContent.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3>${result?.message || 'Erro ao carregar histórico'}</h3>
                    <p>Tente novamente mais tarde.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        historyContent.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3>Erro ao carregar histórico</h3>
                <p>Tente novamente mais tarde.</p>
            </div>
        `;
    } finally {
        isLoading = false;
    }
}

function displayPurchaseHistory(result) {
    const historyContent = document.getElementById('historyContent');
    
    if (!result.historico || result.total_datas === 0) {
        historyContent.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">
                    <i class="fas fa-history"></i>
                </div>
                <h3>Nenhuma compra registrada</h3>
                <p>As compras finalizadas aparecerão aqui no histórico.</p>
                <button class="btn btn-primary" onclick="showPage('scanner')">
                    <i class="fas fa-shopping-cart"></i> Fazer uma Compra
                </button>
            </div>
        `;
        return;
    }
    
    let historyHtml = `<div class="history-dates-container">`;
    
    result.historico.forEach(compra => {
        historyHtml += `
            <div class="history-date-card" onclick="showDateDetails('${compra.data}')">
                <div class="history-date-header">
                    <div class="history-date">
                        <i class="fas fa-calendar-day"></i> ${compra.data}
                    </div>
                    <div class="history-arrow">
                        <i class="fas fa-chevron-right"></i>
                    </div>
                </div>
                <div class="history-date-summary">
                    <span class="history-item-count">
                        <i class="fas fa-box"></i> ${compra.total_itens} itens
                    </span>
                    <span class="history-total">
                        <i class="fas fa-money-bill-wave"></i> R$ ${compra.total_valor.toFixed(2)}
                    </span>
                    ${compra.total_variacao < 0 ? `
                    <span class="history-savings">
                        <i class="fas fa-piggy-bank"></i> Economia: R$ ${Math.abs(compra.total_variacao).toFixed(2)}
                    </span>
                    ` : ''}
                </div>
            </div>
        `;
    });
    
    historyHtml += `</div>`;
    
    historyContent.innerHTML = historyHtml;
}

async function showDateDetails(dateStr) {
    if (isLoading) return;
    
    const historyContent = document.getElementById('historyContent');
    historyContent.innerHTML = `
        <div class="loading-state">
            <div class="loading"></div>
            <p>Carregando detalhes...</p>
        </div>
    `;
    
    isLoading = true;
    
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=getHistoricoData&data=${dateStr}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            displayDateDetails(result);
        } else {
            historyContent.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3>${result.message}</h3>
                    <button class="btn btn-secondary" onclick="loadPurchaseHistory()">
                        <i class="fas fa-arrow-left"></i> Voltar
                    </button>
                </div>
            `;
        }
    } catch (error) {
        console.error('Erro ao carregar detalhes:', error);
        historyContent.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3>Erro ao carregar detalhes</h3>
                <button class="btn btn-secondary" onclick="loadPurchaseHistory()">
                    <i class="fas fa-arrow-left"></i> Voltar
                </button>
            </div>
        `;
    } finally {
        isLoading = false;
    }
}

function displayDateDetails(result) {
    const historyContent = document.getElementById('historyContent');
    
    let detailsHtml = `
        <div class="history-details-header">
            <button class="btn-small btn-secondary" onclick="loadPurchaseHistory()">
                <i class="fas fa-arrow-left"></i> Voltar
            </button>
            <h3><i class="fas fa-calendar-day"></i> ${result.data}</h3>
        </div>
        
        <div class="history-details-summary">
            <div class="summary-card">
                <div class="summary-icon">
                    <i class="fas fa-box"></i>
                </div>
                <div class="summary-content">
                    <div class="summary-label">Total de Itens</div>
                    <div class="summary-value">${result.total_itens}</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-icon">
                    <i class="fas fa-money-bill-wave"></i>
                </div>
                <div class="summary-content">
                    <div class="summary-label">Valor Total</div>
                    <div class="summary-value total">R$ ${result.total_valor}</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-icon">
                    <i class="fas fa-chart-line"></i>
                </div>
                <div class="summary-content">
                    <div class="summary-label">Variação</div>
                    <div class="summary-value ${result.total_variacao < 0 ? 'success' : (result.total_variacao > 0 ? 'danger' : 'secondary')}">
                        R$ ${Math.abs(result.total_variacao).toFixed(2)}
                    </div>
                </div>
            </div>
            ${result.economia > 0 ? `
            <div class="summary-card economy">
                <div class="summary-icon">
                    <i class="fas fa-piggy-bank"></i>
                </div>
                <div class="summary-content">
                    <div class="summary-label">Economia</div>
                    <div class="summary-value success">R$ ${result.economia}</div>
                </div>
            </div>
            ` : ''}
        </div>
        
        <div class="history-items-title">
            <h4><i class="fas fa-list"></i> Itens Comprados</h4>
        </div>
        
        <div class="history-items-list">
    `;
    
    if (result.itens && result.itens.length > 0) {
        result.itens.forEach(item => {
            const variacaoColor = item.variacao < 0 ? 'success' : (item.variacao > 0 ? 'danger' : 'secondary');
            const variacaoIcon = item.variacao < 0 ? 'arrow-down' : (item.variacao > 0 ? 'arrow-up' : 'minus');
            
            detailsHtml += `
                <div class="history-item-card">
                    <div class="history-item-image">
                        ${item.imagem ? 
                            `<img src="${item.imagem}" alt="${item.nome}" onerror="handleImageError(this)">` : 
                            `<div class="no-image-small"><i class="fas fa-image"></i></div>`
                        }
                    </div>
                    <div class="history-item-details">
                        <div class="history-item-name">${item.nome}</div>
                        <div class="history-item-info">
                            <span class="history-item-ean">EAN: ${item.ean}</span>
                            <span class="history-item-brand">${item.marca || 'Sem marca'}</span>
                        </div>
                        <div class="history-item-time">
                            <i class="fas fa-clock"></i> ${item.hora_compra}
                        </div>
                    </div>
                    <div class="history-item-prices">
                        <div class="history-price-old">R$ ${item.preco_antigo.toFixed(2)}</div>
                        <div class="history-price-current">R$ ${item.preco_atual.toFixed(2)}</div>
                        <div class="history-price-variation ${variacaoColor}">
                            <i class="fas fa-${variacaoIcon}"></i> R$ ${Math.abs(item.variacao).toFixed(2)}
                        </div>
                    </div>
                </div>
            `;
        });
    } else {
        detailsHtml += `
            <div class="no-results">
                <p>Nenhum item encontrado para esta data.</p>
            </div>
        `;
    }
    
    detailsHtml += `</div>`;
    
    historyContent.innerHTML = detailsHtml;
}

// ========== PRODUCTS PAGE ==========
async function loadAllProducts() {
    if (isLoading) return;
    
    showPage('produtos');
    
    const productsContent = document.getElementById('productsContent');
    productsContent.innerHTML = `
        <div class="loading-state">
            <div class="loading"></div>
            <p>Carregando produtos...</p>
        </div>
    `;
    
    isLoading = true;
    
    try {
        const result = await getAllProductsFromSheets();
        
        if (result && result.success && result.produtos && result.produtos.length > 0) {
            displayProductsList(result.produtos);
        } else {
            productsContent.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">
                        <i class="fas fa-box-open"></i>
                    </div>
                    <h3>Banco de dados vazio</h3>
                    <p>Nenhum produto cadastrado no banco local.</p>
                    <div class="action-buttons">
                        <button class="btn btn-primary" onclick="showPage('scanner')">
                            <i class="fas fa-barcode"></i> Escanear Produto
                        </button>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        productsContent.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3>Erro ao carregar produtos</h3>
                <p>Tente novamente mais tarde.</p>
            </div>
        `;
    } finally {
        isLoading = false;
    }
}

function displayProductsList(products) {
    const productsContent = document.getElementById('productsContent');
    
    let productsHtml = `
        <div class="products-header">
            <h3><i class="fas fa-boxes"></i> Produtos no Banco (${products.length})</h3>
        </div>
        <div class="products-list-container">
    `;
    
    products.forEach(product => {
        let imageHtml = product.imagem ? 
            `<img src="${product.imagem}" class="product-list-image" alt="${product.nome}" onerror="handleListImageError(this)">` :
            `<div class="product-list-no-image"><i class="fas fa-image"></i></div>`;
        
        let priceHtml = product.preco ? 
            `<span class="product-list-price">R$ ${product.preco}</span>` :
            `<span class="product-list-price na">N/A</span>`;
        
        let marcaHtml = product.marca ? product.marca : 'Sem marca';
        
        productsHtml += `
            <div class="product-list-item" data-linha="${product.linha || ''}">
                <div class="product-list-image-container">
                    ${imageHtml}
                </div>
                <div class="product-list-details">
                    <div class="product-list-name">${product.nome}</div>
                    <div class="product-list-ean">EAN: ${product.ean}</div>
                </div>
                <div class="product-list-brand">${marcaHtml}</div>
                <div class="product-list-price-container">
                    ${priceHtml}
                </div>
                <div class="product-list-actions">
                    <button class="btn-small btn-success" onclick="openAddToCartModal(${JSON.stringify(product)}, true)">
                        <i class="fas fa-cart-plus"></i>
                    </button>
                    <button class="btn-small btn-warning" onclick="openEditModal('${product.ean}', '${encodeURIComponent(product.nome)}', '${encodeURIComponent(product.marca || '')}', '${encodeURIComponent(product.imagem || '')}', '${encodeURIComponent(product.preco || '')}', '${product.linha || ''}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-small btn-danger" onclick="deleteProduct('${product.ean}', '${product.linha || ''}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    productsHtml += `</div>`;
    
    productsContent.innerHTML = productsHtml;
}

// ========== MODAL FUNCTIONS ==========
function openEditModal(ean, nome, marca, imagem, preco, linha) {
    currentModalType = 'edit';
    currentProduct = { ean, linha };
    
    document.getElementById('editNome').value = decodeURIComponent(nome);
    document.getElementById('editMarca').value = decodeURIComponent(marca);
    document.getElementById('editImagem').value = decodeURIComponent(imagem);
    document.getElementById('editPreco').value = decodeURIComponent(preco);
    
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Produto';
    
    const modal = document.getElementById('editModal');
    modal.classList.remove('hidden');
    modal.classList.add('active');
}

function openEditModalForNewProduct(ean, nome, marca, imagem, preco, source) {
    currentModalType = 'new';
    currentProduct = { ean, source };
    
    document.getElementById('editNome').value = decodeURIComponent(nome);
    document.getElementById('editMarca').value = decodeURIComponent(marca);
    document.getElementById('editImagem').value = decodeURIComponent(imagem);
    document.getElementById('editPreco').value = decodeURIComponent(preco);
    
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus-circle"></i> Cadastrar Novo Produto';
    
    const modal = document.getElementById('editModal');
    modal.classList.remove('hidden');
    modal.classList.add('active');
}

function openManualAddModal(code) {
    currentModalType = 'new';
    currentProduct = { ean: code };
    
    document.getElementById('editNome').value = '';
    document.getElementById('editMarca').value = '';
    document.getElementById('editImagem').value = '';
    document.getElementById('editPreco').value = '';
    
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus-circle"></i> Cadastrar Novo Produto';
    
    const modal = document.getElementById('editModal');
    modal.classList.remove('hidden');
    modal.classList.add('active');
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    modal.classList.remove('active');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
    
    currentProduct = null;
    currentModalType = 'edit';
}

async function saveEditedProduct() {
    const nome = document.getElementById('editNome').value.trim();
    const marca = document.getElementById('editMarca').value.trim();
    const imagem = document.getElementById('editImagem').value.trim();
    const preco = document.getElementById('editPreco').value.trim();
    
    if (!nome) {
        showAlert('Por favor, informe o nome do produto', 'warning');
        return;
    }
    
    if (!currentProduct) return;
    
    const productData = {
        ean: currentProduct.ean,
        nome: nome,
        marca: marca,
        imagem: imagem,
        preco: preco,
        fonte: currentModalType === 'edit' ? 'Editado' : 'API Externa'
    };
    
    if (currentProduct.linha && currentModalType === 'edit') {
        productData.linha = currentProduct.linha;
    }
    
    updateStatus('Salvando produto...', 'scanning');
    
    let result;
    if (currentModalType === 'edit') {
        result = await updateInGoogleSheets(productData);
    } else {
        result = await saveToGoogleSheets(productData);
    }
    
    if (result.success) {
        updateStatus('✅ Produto salvo no banco local!', 'success');
        closeEditModal();
        
        // Recarregar conteúdo apropriado
        if (document.getElementById('page-produtos').classList.contains('active')) {
            loadAllProducts();
        } else {
            setTimeout(() => searchProduct(currentProduct.ean), 1000);
        }
    } else {
        updateStatus(`❌ Erro ao salvar: ${result.error || result.message}`, 'error');
    }
}

async function deleteProduct(ean, linha) {
    if (!confirm(`Tem certeza que deseja excluir o produto ${ean}?`)) {
        return;
    }
    
    updateStatus('Excluindo produto...', 'scanning');
    
    const result = await deleteFromGoogleSheets(ean, linha);
    
    if (result.success) {
        updateStatus('✅ Produto excluído do banco local!', 'success');
        
        if (document.getElementById('page-produtos').classList.contains('active')) {
            loadAllProducts();
        } else {
            const resultDiv = document.getElementById('result');
            resultDiv.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">
                        <i class="fas fa-trash"></i>
                    </div>
                    <h3>Produto excluído</h3>
                    <p>
                        Código: <strong>${ean}</strong><br>
                        O produto foi removido do banco local.
                    </p>
                </div>
            `;
        }
    } else {
        updateStatus(`❌ Erro ao excluir: ${result.error || result.message}`, 'error');
    }
}

// ========== UTILITY FUNCTIONS ==========
function updateStatus(message, type = 'default') {
    const statusDiv = document.getElementById('status');
    
    let icon = '';
    switch(type) {
        case 'success': icon = '<i class="fas fa-check-circle"></i>'; break;
        case 'error': icon = '<i class="fas fa-times-circle"></i>'; break;
        case 'warning': icon = '<i class="fas fa-exclamation-triangle"></i>'; break;
        case 'scanning': icon = '<div class="loading"></div>'; break;
        default: icon = '<i class="fas fa-info-circle"></i>';
    }
    
    statusDiv.innerHTML = `${icon} ${message}`;
    statusDiv.className = `status ${type}`;
}

function isValidBarcode(code) {
    if (!/^\d+$/.test(code)) return false;
    if (code.length < 8 || code.length > 13) return false;
    if (code.length === 13) return validateEAN13(code);
    return true;
}

function validateEAN13(code) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(code[i]);
        sum += digit * (i % 2 === 0 ? 1 : 3);
    }
    const checksum = (10 - (sum % 10)) % 10;
    return checksum === parseInt(code[12]);
}

function handleImageError(img) {
    img.onerror = null;
    img.parentElement.innerHTML = `
        <div class="no-image">
            <i class="fas fa-image"></i>
            <span>Imagem não carregada</span>
        </div>
    `;
}

function handleListImageError(img) {
    img.onerror = null;
    img.parentElement.innerHTML = `
        <div class="product-list-no-image">
            <i class="fas fa-image"></i>
        </div>
    `;
}

function searchOnline(code, name = '') {
    const query = name ? `${decodeURIComponent(name)} ${code}` : `EAN ${code}`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=shop`, '_blank');
}

function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.innerHTML = `
        <i class="fas fa-${type === 'error' ? 'times-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
        ${message}
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 3000);
}

function checkAPIStatus() {
    const apiStatus = document.getElementById('apiStatus');
    if (!GOOGLE_SHEETS_API) {
        console.warn("URL do Google Sheets não configurada");
        apiStatus.textContent = "Não configurado";
        apiStatus.style.color = "#ef4444";
        updateStatus('⚠️ Configure a URL do Google Sheets API!', 'warning');
    } else {
        apiStatus.textContent = "Conectado";
        apiStatus.style.color = "#10b981";
    }
}

// ========== EXPORT FUNCTIONS ==========
window.searchManual = searchManual;
window.initScanner = initScanner;
window.stopScanner = stopScanner;
window.searchOnline = searchOnline;
window.showPage = showPage;
window.loadCart = loadCart;
window.loadPurchaseHistory = loadPurchaseHistory;
window.loadAllProducts = loadAllProducts;
window.openEditModal = openEditModal;
window.openEditModalForNewProduct = openEditModalForNewProduct;
window.openManualAddModal = openManualAddModal;
window.closeEditModal = closeEditModal;
window.saveEditedProduct = saveEditedProduct;
window.deleteProduct = deleteProduct;
window.openAddToCartModal = openAddToCartModal;
window.closeAddToCartModal = closeAddToCartModal;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.checkout = checkout;
window.showDateDetails = showDateDetails;
window.handleImageError = handleImageError;
window.handleListImageError = handleListImageError;
