// ========== CONFIGURAÇÕES ==========
const GOOGLE_SHEETS_API = "https://script.google.com/macros/s/AKfycbw2eL8uz9YV4Ju1IXo19AWEuKWjHz7o7cyHgL6_LMiUuZ0JJzRsKMTKxAot8ekwXu3-ew/exec";
const BLUESOFT_API_KEY = "7tF33vAL9xZs7ZRoSMBitg";

// ========== VARIÁVEIS GLOBAIS ==========
let html5QrCode = null;
let currentCameraId = null;
let isScanning = false;
let lastScanned = '';
let lastScanTime = 0;
let currentProduct = null;
let currentModalType = 'edit'; // 'edit' ou 'new'
let currentCartProduct = null;
let currentCartPrice = null;
let currentCartOldPrice = null;

const REAR_CAMERA_KEYWORDS = ["back", "rear", "environment", "traseira", "camera 0"];

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('manualCode').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchManual();
    });
    
    // Configurar botão de salvar no modal
    document.getElementById('saveEditBtn').addEventListener('click', saveEditedProduct);
    
    // Adicionar listener para calcular variação em tempo real
    const priceInput = document.getElementById('currentPriceInput');
    if (priceInput) {
        priceInput.addEventListener('input', calculateVariation);
    }
    
    // Verificar status da API
    checkAPIStatus();
    
    // Atualizar contador do carrinho
    updateCartCount();
});

// ========== FUNÇÕES DO SCANNER ==========
async function initScanner() {
    if (isScanning) return;
    
    try {
        updateStatus('Iniciando câmera...', 'scanning');
        
        // Mostrar interface do scanner
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
        
        // Verificar se a biblioteca está disponível
        if (typeof Html5Qrcode === 'undefined') {
            throw new Error('Biblioteca de scanner não carregada');
        }
        
        html5QrCode = new Html5Qrcode("reader");
        
        // Tentar encontrar câmera traseira
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
            // Fallback para modo ambiente
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

// ========== FUNÇÃO ONSCANSUCCESS MODIFICADA ==========
function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    const code = decodedText.trim();
    
    if (!isValidBarcode(code)) return;
    if (code === lastScanned && (now - lastScanTime) < 2000) return;
    
    lastScanned = code;
    lastScanTime = now;
    
    updateStatus(`📷 Código detectado: ${code}`, 'success');
    
    // PARAR O SCANNER IMEDIATAMENTE
    if (html5QrCode) {
        html5QrCode.pause();
        setTimeout(() => {
            if (html5QrCode && isScanning) {
                html5QrCode.stop().then(() => {
                    html5QrCode.clear();
                    isScanning = false;
                    
                    // Fechar a visualização da câmera
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
    
    // Buscar o produto
    searchProduct(code);
}

// ========== FLUXO DE BUSCA PRINCIPAL ==========
async function searchProduct(code) {
    if (!code || !isValidBarcode(code)) {
        showAlert('Código EAN inválido. Use 8-13 dígitos.', 'error');
        return;
    }
    
    clearResult();
    updateStatus(`Buscando produto ${code}...`, 'scanning');
    
    try {
        // 1º PASSO: Buscar no Banco Local (Google Sheets)
        const localResult = await searchInGoogleSheets(code);
        
        if (localResult && localResult.success && localResult.found) {
            currentProduct = localResult.product;
            showProductInfo(localResult.product, true);
            updateStatus(`✅ Encontrado no banco local`, 'success');
            return;
        }
        
        // 2º PASSO: Se não encontrou no banco local, buscar no Open Food Facts
        updateStatus('Não encontrado localmente. Buscando no Open Food Facts...', 'scanning');
        const openFoodProduct = await searchOpenFoodFacts(code);
        
        if (openFoodProduct && openFoodProduct.name) {
            showExternalProductInfo(openFoodProduct, code, 'Open Food Facts');
            updateStatus(`✅ Encontrado no Open Food Facts`, 'success');
            return;
        }
        
        // 3º PASSO: Se não encontrou no Open Food Facts, buscar no Bluesoft
        updateStatus('Não encontrado no Open Food Facts. Buscando no Bluesoft...', 'scanning');
        const bluesoftProduct = await searchBluesoftCosmos(code);
        
        if (bluesoftProduct && bluesoftProduct.name) {
            showExternalProductInfo(bluesoftProduct, code, 'Bluesoft Cosmos');
            updateStatus(`✅ Encontrado no Bluesoft Cosmos`, 'success');
            return;
        }
        
        // 4º PASSO: Se não encontrou em nenhuma fonte, mostrar formulário para cadastrar
        updateStatus('❌ Produto não encontrado em nenhuma fonte', 'error');
        showAddToDatabaseForm(code);
        
    } catch (error) {
        console.error('Erro no fluxo de busca:', error);
        updateStatus('Erro na busca. Tente novamente.', 'error');
        showErrorResult('Erro na busca', 'Ocorreu um erro ao buscar o produto.');
    }
}

// ========== BUSCA MANUAL ==========
function searchManual() {
    const code = document.getElementById('manualCode').value.trim();
    if (!code || code.length < 8) {
        showAlert('Digite um código de barras válido (8-13 dígitos)', 'warning');
        return;
    }
    searchProduct(code);
}

// ========== BANCO LOCAL (GOOGLE SHEETS) ==========
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

// ========== APIS EXTERNAS ==========
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

// ========== RENDERIZAÇÃO DE RESULTADOS ==========
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
            <button class="btn btn-cart" onclick="openPriceModal(${JSON.stringify(product).replace(/"/g, '&quot;')})">
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
            <button class="btn btn-success" onclick="saveExternalProductToDatabase('${product.ean}', '${encodeURIComponent(product.nome)}', '${encodeURIComponent(product.marca || '')}', '${encodeURIComponent(product.imagem || '')}', '${encodeURIComponent(product.preco || '')}', 'Banco Local')">
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
            <button class="btn btn-cart" onclick="openPriceModal({
                ean: '${code}',
                nome: '${encodeURIComponent(product.name)}',
                marca: '${encodeURIComponent(product.brand || '')}',
                imagem: '${encodeURIComponent(product.image || '')}',
                preco: '${encodeURIComponent(product.price || '')}'
            })">
                <i class="fas fa-cart-plus"></i> Adicionar ao Carrinho
            </button>
            
            <button class="btn btn-success" onclick="saveExternalProductToDatabase('${code}', '${encodeURIComponent(product.name)}', '${encodeURIComponent(product.brand || '')}', '${encodeURIComponent(product.image || '')}', '${encodeURIComponent(product.price || '')}', '${source}')">
                <i class="fas fa-save"></i> Salvar no Banco
            </button>
            <button class="btn btn-warning" onclick="openEditModalForNewProduct('${code}', '${encodeURIComponent(product.name)}', '${encodeURIComponent(product.brand || '')}', '${encodeURIComponent(product.image || '')}', '${encodeURIComponent(product.price || '')}', '${source}')">
                <i class="fas fa-edit"></i> Editar antes de Salvar
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

// ========== FUNÇÃO PARA MOSTRAR LISTA DE PRODUTOS ==========
async function showAllProducts() {
    updateStatus('Carregando todos os produtos...', 'scanning');
    clearResult();
    
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <div class="loading" style="margin: 20px auto;"></div>
            <p>Carregando produtos do banco...</p>
        </div>
    `;
    resultDiv.classList.add('active');
    
    try {
        const result = await getAllProductsFromSheets();
        
        if (result && result.success && result.products && result.products.length > 0) {
            displayProductsList(result.products);
            updateStatus(`✅ ${result.products.length} produtos carregados`, 'success');
        } else {
            showNoProductsMessage();
            updateStatus('❌ Nenhum produto encontrado no banco', 'warning');
        }
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        updateStatus('Erro ao carregar produtos', 'error');
        showErrorResult('Erro', 'Não foi possível carregar os produtos do banco.');
    }
}

function displayProductsList(products) {
    const resultDiv = document.getElementById('result');
    
    let productsHtml = `
        <div class="products-header">
            <h3><i class="fas fa-boxes"></i> Produtos no Banco (${products.length})</h3>
            <button class="btn btn-small btn-primary" onclick="showAllProducts()" style="margin: 0;">
                <i class="fas fa-sync-alt"></i> Atualizar
            </button>
        </div>
        <div class="products-list-container">
    `;
    
    // Criar uma linha para cada produto
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
    
    resultDiv.innerHTML = productsHtml;
    resultDiv.classList.add('active');
}

function showNoProductsMessage() {
    const resultDiv = document.getElementById('result');
    
    resultDiv.innerHTML = `
        <div class="no-results">
            <div class="no-results-icon">
                <i class="fas fa-box-open"></i>
            </div>
            <h3>Banco de dados vazio</h3>
            <p>Nenhum produto cadastrado no banco local.</p>
            <div class="action-buttons">
                <button class="btn btn-primary" onclick="searchManual()">
                    <i class="fas fa-plus"></i> Adicionar Primeiro Produto
                </button>
                <button class="btn btn-secondary" onclick="initScanner()">
                    <i class="fas fa-camera"></i> Escanear Produto
                </button>
            </div>
        </div>
    `;
    
    resultDiv.classList.add('active');
}

// ========== MODAL FUNCTIONS ==========
function openEditModal(ean, nome, marca, imagem, preco, linha) {
    currentModalType = 'edit';
    currentProduct = { ean, linha };
    
    document.getElementById('editNome').value = decodeURIComponent(nome);
    document.getElementById('editMarca').value = decodeURIComponent(marca);
    document.getElementById('editImagem').value = decodeURIComponent(imagem);
    document.getElementById('editPreco').value = decodeURIComponent(preco);
    
    // Atualizar título do modal
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
    
    // Atualizar título do modal
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
    
    // Atualizar título do modal
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus-circle"></i> Cadastrar Novo Produto';
    
    const modal = document.getElementById('editModal');
    modal.classList.remove('hidden');
    modal.classList.add('active');
}

function closeModal() {
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
        closeModal();
        
        // Se estava na lista de produtos, recarregar a lista
        if (document.querySelector('.products-list-container')) {
            setTimeout(() => showAllProducts(), 1000);
        } else {
            // Senão, buscar o produto novamente
            setTimeout(() => searchProduct(currentProduct.ean), 1000);
        }
    } else {
        updateStatus(`❌ Erro ao salvar: ${result.error || result.message}`, 'error');
    }
}

// ========== MODAL DE PREÇO DO CARRINHO ==========
function openPriceModal(product) {
    currentCartProduct = product;
    currentCartOldPrice = product.preco || product.preco_antigo || '0';
    
    // Preencher informações do produto
    document.getElementById('priceProductName').textContent = product.nome || product.name || 'Produto';
    document.getElementById('priceProductEAN').textContent = `EAN: ${product.ean}`;
    document.getElementById('priceProductBrand').textContent = `Marca: ${product.marca || product.brand || 'Não informada'}`;
    
    // Imagem do produto
    const imageContainer = document.getElementById('priceProductImage');
    if (product.imagem || product.image) {
        const imgUrl = product.imagem || product.image;
        imageContainer.innerHTML = `<img src="${imgUrl}" alt="${product.nome || product.name}" onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\"fas fa-image\"></i>';">`;
    } else {
        imageContainer.innerHTML = '<i class="fas fa-image" style="font-size: 36px; color: #9ca3af;"></i>';
    }
    
    // Preencher preço anterior
    document.getElementById('oldPriceDisplay').textContent = formatPrice(currentCartOldPrice);
    
    // Definir preço atual como o mesmo do produto
    const currentPrice = product.preco || product.price || currentCartOldPrice;
    document.getElementById('currentPriceInput').value = parseFloat(currentPrice).toFixed(2);
    
    // Calcular variação inicial
    calculateVariation();
    
    // Abrir modal
    const modal = document.getElementById('priceModal');
    modal.classList.remove('hidden');
    modal.classList.add('active');
    
    // Focar no input de preço
    setTimeout(() => {
        document.getElementById('currentPriceInput').focus();
        document.getElementById('currentPriceInput').select();
    }, 300);
}

function closePriceModal() {
    const modal = document.getElementById('priceModal');
    modal.classList.remove('active');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
    
    currentCartProduct = null;
    currentCartPrice = null;
    currentCartOldPrice = null;
}

function calculateVariation() {
    const oldPrice = parseFloat(currentCartOldPrice) || 0;
    const currentPriceInput = document.getElementById('currentPriceInput');
    const currentPrice = parseFloat(currentPriceInput.value) || 0;
    
    const variation = currentPrice - oldPrice;
    const percent = oldPrice > 0 ? ((variation / oldPrice) * 100).toFixed(1) : 0;
    
    const variationDisplay = document.getElementById('variationDisplay');
    
    if (variation < 0) {
        variationDisplay.innerHTML = `
            <span class="variation-value variation-negative">▼ R$ ${Math.abs(variation).toFixed(2)}</span>
            <span class="variation-percent variation-negative">(${Math.abs(percent)}%)</span>
        `;
    } else if (variation > 0) {
        variationDisplay.innerHTML = `
            <span class="variation-value variation-positive">▲ R$ ${variation.toFixed(2)}</span>
            <span class="variation-percent variation-positive">(${percent}%)</span>
        `;
    } else {
        variationDisplay.innerHTML = `
            <span class="variation-value">R$ 0,00</span>
            <span class="variation-percent">(0%)</span>
        `;
    }
    
    currentCartPrice = currentPrice;
}

// ========== ADICIONAR AO CARRINHO COM PREÇO EDITADO ==========
async function addToCartWithCurrentPrice() {
    if (!currentCartProduct || !currentCartPrice) {
        showAlert('Preço inválido', 'error');
        return;
    }
    
    const oldPrice = parseFloat(currentCartOldPrice) || 0;
    const currentPrice = parseFloat(currentCartPrice) || 0;
    
    if (currentPrice <= 0) {
        showAlert('Digite um preço válido maior que zero', 'warning');
        return;
    }
    
    try {
        updateStatus('Adicionando ao carrinho...', 'scanning');
        
        // Preparar dados para a API
        const params = new URLSearchParams({
            operation: 'addToCart',
            ean: currentCartProduct.ean,
            preco_atual: currentPrice.toString(),
            preco_antigo: oldPrice.toString()
        });
        
        // Adicionar campos extras se disponíveis
        if (currentCartProduct.nome || currentCartProduct.name) {
            params.append('nome', currentCartProduct.nome || currentCartProduct.name);
        }
        if (currentCartProduct.marca || currentCartProduct.brand) {
            params.append('marca', currentCartProduct.marca || currentCartProduct.brand);
        }
        if (currentCartProduct.imagem || currentCartProduct.image) {
            params.append('imagem', currentCartProduct.imagem || currentCartProduct.image);
        }
        
        const url = `${GOOGLE_SHEETS_API}?${params.toString()}`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            updateStatus('✅ Produto adicionado ao carrinho!', 'success');
            showAlert(`"${currentCartProduct.nome || currentCartProduct.name}" adicionado ao carrinho!`, 'success');
            closePriceModal();
            
            // Atualizar contador do carrinho
            updateCartCount();
            
            // Atualizar preço no produto local se necessário
            if (currentCartPrice !== oldPrice) {
                updateProductPriceInResult(currentCartProduct.ean, currentPrice);
            }
        } else {
            updateStatus(`❌ Erro: ${result.message}`, 'error');
            showAlert(`Erro: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Erro ao adicionar ao carrinho:', error);
        updateStatus('Erro ao adicionar ao carrinho', 'error');
        showAlert('Erro de conexão. Tente novamente.', 'error');
    }
}

function updateProductPriceInResult(ean, newPrice) {
    // Atualizar o preço exibido na tela
    const priceElements = document.querySelectorAll('.product-price');
    priceElements.forEach(el => {
        if (el.textContent.includes(ean)) {
            el.innerHTML = `<i class="fas fa-money-bill-wave"></i> R$ ${newPrice.toFixed(2)}`;
        }
    });
}

// ========== VER CARRINHO ==========
async function viewCart() {
    try {
        updateStatus('Carregando carrinho...', 'scanning');
        clearResult();
        
        const resultDiv = document.getElementById('result');
        resultDiv.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <div class="loading" style="margin: 20px auto;"></div>
                <p>Carregando carrinho...</p>
            </div>
        `;
        resultDiv.classList.add('active');
        
        const url = `${GOOGLE_SHEETS_API}?operation=getCart`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            displayCart(result);
            updateStatus(`✅ Carrinho carregado`, 'success');
        } else {
            showEmptyCartMessage();
            updateStatus('Carrinho vazio', 'warning');
        }
    } catch (error) {
        console.error('Erro ao carregar carrinho:', error);
        updateStatus('Erro ao carregar carrinho', 'error');
        showErrorResult('Erro', 'Não foi possível carregar o carrinho.');
    }
}

function displayCart(cartData) {
    const resultDiv = document.getElementById('result');
    
    const subtotal = parseFloat(cartData.subtotal || 0);
    const precoAntigoTotal = parseFloat(cartData.preco_antigo_total || 0);
    const variacaoTotal = parseFloat(cartData.variacao_total || 0);
    const economia = parseFloat(cartData.economia || 0);
    
    let cartHtml = `
        <div class="cart-header">
            <h3><i class="fas fa-shopping-cart"></i> Carrinho de Compras</h3>
            <div>
                <button class="btn btn-small btn-primary" onclick="viewCart()" style="margin-right: 10px;">
                    <i class="fas fa-sync-alt"></i> Atualizar
                </button>
                <button class="btn btn-small btn-danger" onclick="clearCart()">
                    <i class="fas fa-trash"></i> Limpar Carrinho
                </button>
            </div>
        </div>
        
        <div class="cart-summary-grid">
            <div class="cart-summary-card">
                <h4><i class="fas fa-boxes"></i> Total de Itens</h4>
                <div class="cart-summary-value">${cartData.total || 0}</div>
            </div>
            
            <div class="cart-summary-card">
                <h4><i class="fas fa-money-bill-wave"></i> Subtotal Atual</h4>
                <div class="cart-summary-value">R$ ${subtotal.toFixed(2)}</div>
            </div>
            
            <div class="cart-summary-card">
                <h4><i class="fas fa-history"></i> Valor Anterior</h4>
                <div class="cart-summary-value">R$ ${precoAntigoTotal.toFixed(2)}</div>
            </div>
            
            <div class="cart-summary-card">
                <h4><i class="fas fa-chart-line"></i> Variação Total</h4>
                <div class="cart-summary-value ${variacaoTotal < 0 ? 'positive' : variacaoTotal > 0 ? 'negative' : ''}">
                    ${variacaoTotal < 0 ? '▼ -R$ ' : variacaoTotal > 0 ? '▲ +R$ ' : 'R$ '}${Math.abs(variacaoTotal).toFixed(2)}
                </div>
            </div>
            
            ${economia > 0 ? `
            <div class="cart-summary-card">
                <h4><i class="fas fa-piggy-bank"></i> Economia</h4>
                <div class="cart-summary-value economy">R$ ${economia.toFixed(2)}</div>
            </div>
            ` : ''}
        </div>
        
        <div class="products-list-container">
    `;
    
    if (!cartData.items || cartData.items.length === 0) {
        cartHtml += showEmptyCartMessage();
    } else {
        cartData.items.forEach(item => {
            const variacao = parseFloat(item.variacao || 0);
            const variacaoClass = variacao < 0 ? 'variation-down' : variacao > 0 ? 'variation-up' : '';
            
            cartHtml += `
                <div class="product-list-item">
                    <div class="product-list-image-container">
                        ${item.imagem ? 
                            `<img src="${item.imagem}" class="product-list-image" alt="${item.nome}" onerror="handleListImageError(this)">` : 
                            `<div class="product-list-no-image"><i class="fas fa-image"></i></div>`
                        }
                    </div>
                    <div class="product-list-details">
                        <div class="product-list-name">${item.nome}</div>
                        <div class="product-list-ean">EAN: ${item.ean}</div>
                    </div>
                    <div class="product-list-brand">${item.marca || 'Sem marca'}</div>
                    <div class="product-list-price-container">
                        <div class="cart-item-price-details">
                            <div class="cart-item-price">R$ ${parseFloat(item.preco_atual || 0).toFixed(2)}</div>
                            <div class="cart-item-old-price">R$ ${parseFloat(item.preco_antigo || 0).toFixed(2)}</div>
                            <div class="cart-item-variation ${variacaoClass}">
                                ${variacao < 0 ? '▼ -R$ ' : variacao > 0 ? '▲ +R$ ' : 'R$ '}${Math.abs(variacao).toFixed(2)}
                            </div>
                        </div>
                    </div>
                    <div class="product-list-actions">
                        <button class="btn-small btn-danger" onclick="removeFromCart('${item.ean}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        cartHtml += `
            <div class="checkout-section">
                <button class="btn btn-success btn-large" onclick="checkout()">
                    <i class="fas fa-cash-register"></i> Finalizar Compra - R$ ${subtotal.toFixed(2)}
                </button>
                <p style="margin-top: 10px; font-size: 12px; color: var(--gray);">
                    <i class="fas fa-info-circle"></i> Ao finalizar, os itens serão movidos para o histórico e os preços atualizados.
                </p>
            </div>
        `;
    }
    
    cartHtml += `</div>`;
    resultDiv.innerHTML = cartHtml;
    resultDiv.classList.add('active');
}

function showEmptyCartMessage() {
    return `
        <div class="no-results">
            <div class="no-results-icon">
                <i class="fas fa-shopping-cart"></i>
            </div>
            <h3>Carrinho vazio</h3>
            <p>Nenhum produto adicionado ao carrinho.</p>
            <div class="action-buttons">
                <button class="btn btn-primary" onclick="initScanner()">
                    <i class="fas fa-camera"></i> Escanear Produto
                </button>
                <button class="btn btn-secondary" onclick="showAllProducts()">
                    <i class="fas fa-boxes"></i> Ver Produtos
                </button>
            </div>
        </div>
    `;
}

// ========== REMOVER DO CARRINHO ==========
async function removeFromCart(ean) {
    if (!confirm('Tem certeza que deseja remover este item do carrinho?')) {
        return;
    }
    
    try {
        updateStatus('Removendo item...', 'scanning');
        
        const url = `${GOOGLE_SHEETS_API}?operation=removeFromCart&ean=${ean}`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            updateStatus('✅ Item removido do carrinho', 'success');
            setTimeout(() => viewCart(), 500);
            updateCartCount();
        } else {
            updateStatus('❌ Erro ao remover item', 'error');
            showAlert(result.message, 'error');
        }
    } catch (error) {
        console.error('Erro ao remover do carrinho:', error);
        updateStatus('Erro ao remover item', 'error');
    }
}

// ========== LIMPAR CARRINHO ==========
async function clearCart() {
    if (!confirm('Tem certeza que deseja limpar todo o carrinho? Esta ação não pode ser desfeita.')) {
        return;
    }
    
    try {
        updateStatus('Limpando carrinho...', 'scanning');
        
        const url = `${GOOGLE_SHEETS_API}?operation=clearCart`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            updateStatus('✅ Carrinho esvaziado', 'success');
            showAlert('Carrinho limpo com sucesso!', 'success');
            setTimeout(() => viewCart(), 500);
            updateCartCount();
        } else {
            updateStatus('❌ Erro ao limpar carrinho', 'error');
            showAlert(result.message, 'error');
        }
    } catch (error) {
        console.error('Erro ao limpar carrinho:', error);
        updateStatus('Erro ao limpar carrinho', 'error');
    }
}

// ========== FINALIZAR COMPRA (CHECKOUT) ==========
async function checkout() {
    if (!confirm('Finalizar compra e mover itens para o histórico? Os preços serão atualizados nos produtos.')) {
        return;
    }
    
    try {
        updateStatus('Finalizando compra...', 'scanning');
        
        const url = `${GOOGLE_SHEETS_API}?operation=checkout`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            updateStatus('✅ Compra finalizada com sucesso!', 'success');
            
            // Mostrar recibo
            const resultDiv = document.getElementById('result');
            resultDiv.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h3>Compra Finalizada!</h3>
                    <div class="receipt" style="text-align: left; margin: 20px 0; padding: 20px; background: #f9fafb; border-radius: 8px;">
                        <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                        <p><strong>Itens comprados:</strong> ${result.resumo.total_itens}</p>
                        <p><strong>Valor total:</strong> R$ ${result.resumo.total_valor}</p>
                        <p><strong>Variação total:</strong> R$ ${result.resumo.total_variacao}</p>
                        ${result.resumo.economia > 0 ? 
                            `<p><strong>Economia:</strong> R$ ${result.resumo.economia}</p>` : ''}
                        <p style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                            <i class="fas fa-info-circle"></i> Os itens foram movidos para o histórico e os preços atualizados.
                        </p>
                    </div>
                    <div class="action-buttons">
                        <button class="btn btn-primary" onclick="viewCart()">
                            <i class="fas fa-shopping-cart"></i> Ver Carrinho
                        </button>
                        <button class="btn btn-secondary" onclick="viewPurchaseHistory()">
                            <i class="fas fa-history"></i> Ver Histórico
                        </button>
                    </div>
                </div>
            `;
            
            updateCartCount();
        } else {
            updateStatus('❌ Erro ao finalizar compra', 'error');
            showAlert(result.message, 'error');
        }
    } catch (error) {
        console.error('Erro no checkout:', error);
        updateStatus('Erro ao finalizar compra', 'error');
    }
}

// ========== ATUALIZAR CONTADOR DO CARRINHO ==========
async function updateCartCount() {
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=getCart`;
        const response = await fetch(url);
        const result = await response.json();
        
        const cartCount = document.getElementById('cartCount');
        if (cartCount && result.success) {
            cartCount.textContent = result.total || 0;
        }
    } catch (error) {
        console.error('Erro ao atualizar contador do carrinho:', error);
    }
}

// ========== HISTÓRICO DE COMPRAS ==========
async function viewPurchaseHistory() {
    try {
        updateStatus('Carregando histórico...', 'scanning');
        clearResult();
        
        const resultDiv = document.getElementById('result');
        resultDiv.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <div class="loading" style="margin: 20px auto;"></div>
                <p>Carregando histórico de compras...</p>
            </div>
        `;
        resultDiv.classList.add('active');
        
        const url = `${GOOGLE_SHEETS_API}?operation=getHistorico`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            displayPurchaseHistory(result);
            updateStatus('✅ Histórico carregado', 'success');
        } else {
            showNoHistoryMessage();
            updateStatus('Nenhum histórico encontrado', 'warning');
        }
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        updateStatus('Erro ao carregar histórico', 'error');
        showErrorResult('Erro', 'Não foi possível carregar o histórico.');
    }
}

function displayPurchaseHistory(historyData) {
    const resultDiv = document.getElementById('result');
    
    let historyHtml = `
        <div class="cart-header">
            <h3><i class="fas fa-history"></i> Histórico de Compras</h3>
            <button class="btn btn-small btn-primary" onclick="viewPurchaseHistory()">
                <i class="fas fa-sync-alt"></i> Atualizar
            </button>
        </div>
        
        <p style="margin-bottom: 20px; color: var(--gray);">
            ${historyData.total_datas || 0} datas de compra • ${historyData.total_compras || 0} itens no total
        </p>
    `;
    
    if (!historyData.historico || historyData.historico.length === 0) {
        historyHtml += showNoHistoryMessage();
    } else {
        historyData.historico.forEach((compra, index) => {
            const totalValor = parseFloat(compra.total_valor || 0);
            const totalVariacao = parseFloat(compra.total_variacao || 0);
            
            historyHtml += `
                <div class="history-date-card" onclick="toggleHistoryItems(${index})">
                    <div class="history-date-header">
                        <div class="history-date">
                            <i class="fas fa-calendar-day"></i> ${compra.data}
                        </div>
                        <div class="history-date-total">R$ ${totalValor.toFixed(2)}</div>
                    </div>
                    <div class="history-date-items">${compra.total_itens} itens</div>
                    <div class="history-date-summary">
                        <span><i class="fas fa-box"></i> ${compra.total_itens} itens</span>
                        <span class="${totalVariacao < 0 ? 'variation-down' : totalVariacao > 0 ? 'variation-up' : ''}">
                            <i class="fas fa-chart-line"></i> ${totalVariacao < 0 ? '▼ -R$ ' : totalVariacao > 0 ? '▲ +R$ ' : 'R$ '}${Math.abs(totalVariacao).toFixed(2)}
                        </span>
                    </div>
                    <div class="history-items-container" id="historyItems${index}">
            `;
            
            compra.itens.forEach(item => {
                const variacao = parseFloat(item.variacao || 0);
                const variacaoClass = variacao < 0 ? 'variation-down' : variacao > 0 ? 'variation-up' : '';
                
                historyHtml += `
                    <div class="history-item-card">
                        <div class="history-item-info">
                            <div class="history-item-name">${item.nome}</div>
                            <div class="history-item-ean">EAN: ${item.ean}</div>
                        </div>
                        <div class="history-item-prices">
                            <div class="history-item-current">R$ ${parseFloat(item.preco_atual || 0).toFixed(2)}</div>
                            <div class="history-item-old">R$ ${parseFloat(item.preco_antigo || 0).toFixed(2)}</div>
                            <div class="history-item-variation ${variacaoClass}">
                                ${variacao < 0 ? '▼ -R$ ' : variacao > 0 ? '▲ +R$ ' : 'R$ '}${Math.abs(variacao).toFixed(2)}
                            </div>
                        </div>
                    </div>
                `;
            });
            
            historyHtml += `
                    </div>
                </div>
            `;
        });
    }
    
    resultDiv.innerHTML = historyHtml;
    resultDiv.classList.add('active');
}

function toggleHistoryItems(index) {
    const itemsContainer = document.getElementById(`historyItems${index}`);
    if (itemsContainer) {
        itemsContainer.classList.toggle('active');
    }
}

function showNoHistoryMessage() {
    return `
        <div class="no-results">
            <div class="no-results-icon">
                <i class="fas fa-history"></i>
            </div>
            <h3>Nenhum histórico</h3>
            <p>Nenhuma compra registrada no histórico.</p>
            <div class="action-buttons">
                <button class="btn btn-primary" onclick="initScanner()">
                    <i class="fas fa-camera"></i> Escanear Produto
                </button>
                <button class="btn btn-secondary" onclick="viewCart()">
                    <i class="fas fa-shopping-cart"></i> Ver Carrinho
                </button>
            </div>
        </div>
    `;
}

// ========== FUNÇÕES DE CRUD ==========
async function saveExternalProductToDatabase(code, name, brand, image, price, source) {
    const productData = {
        ean: code,
        nome: decodeURIComponent(name),
        marca: decodeURIComponent(brand),
        imagem: decodeURIComponent(image),
        preco: decodeURIComponent(price),
        fonte: source
    };
    
    updateStatus('Salvando no banco local...', 'scanning');
    
    const result = await saveToGoogleSheets(productData);
    
    if (result.success) {
        updateStatus('✅ Produto salvo no banco local!', 'success');
        setTimeout(() => searchProduct(code), 1000);
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
        
        // Se estava na lista de produtos, recarregar a lista
        if (document.querySelector('.products-list-container')) {
            setTimeout(() => showAllProducts(), 1000);
        } else {
            // Senão, mostrar mensagem
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

// ========== FUNÇÕES AUXILIARES ==========
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

function formatPrice(price) {
    const num = parseFloat(price) || 0;
    return `R$ ${num.toFixed(2).replace('.', ',')}`;
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
    alert(`[${type.toUpperCase()}] ${message}`);
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

// ========== EXPORT FUNCTIONS TO GLOBAL SCOPE ==========
window.searchManual = searchManual;
window.initScanner = initScanner;
window.stopScanner = stopScanner;
window.searchOnline = searchOnline;
window.openEditModal = openEditModal;
window.openEditModalForNewProduct = openEditModalForNewProduct;
window.openManualAddModal = openManualAddModal;
window.closeModal = closeModal;
window.saveEditedProduct = saveEditedProduct;
window.deleteProduct = deleteProduct;
window.saveExternalProductToDatabase = saveExternalProductToDatabase;
window.showAllProducts = showAllProducts;
window.handleImageError = handleImageError;
window.handleListImageError = handleListImageError;
window.openPriceModal = openPriceModal;
window.closePriceModal = closePriceModal;
window.calculateVariation = calculateVariation;
window.addToCartWithCurrentPrice = addToCartWithCurrentPrice;
window.viewCart = viewCart;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.checkout = checkout;
window.viewPurchaseHistory = viewPurchaseHistory;
window.toggleHistoryItems = toggleHistoryItems;
