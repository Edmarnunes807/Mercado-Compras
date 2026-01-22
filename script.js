// ========== CONFIGURAÇÕES ==========
const GOOGLE_SHEETS_API = "https://script.google.com/macros/s/AKfycbwOF2ebfAxK_LS-HZrbVzYXnYxquCSDsJpH10ZAn_99qpj8I0EOi9zct5ZoMZ1kAMmFDQ/exec";
const BLUESOFT_API_KEY = "7tF33vAL9xZs7ZRoSMBitg";

// ========== VARIÁVEIS GLOBAIS ==========
let html5QrCode = null;
let currentCameraId = null;
let isScanning = false;
let lastScanned = '';
let lastScanTime = 0;
let currentProduct = null;
let carrinho = [];
let historico = [];
let todosProdutos = [];
let paginaAtual = 1;
let itensPorPagina = 10;

const REAR_CAMERA_KEYWORDS = ["back", "rear", "environment", "traseira", "camera 0"];

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('manualCode').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchManual();
    });
    
    // Configurar botão de salvar no modal
    document.getElementById('saveEditBtn').onclick = saveEditedProduct;
    
    // Verificar status da API
    checkAPIStatus();
});

// ========== FUNÇÕES DO SCANNER ==========
async function initScanner() {
    if (isScanning) return;
    
    try {
        updateStatus('Iniciando câmera...', 'scanning');
        
        // Mostrar interface do scanner
        const scannerContainer = document.getElementById('scannerContainer');
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const closeScannerBtn = document.getElementById('closeScannerBtn');
        const cameraInfo = document.getElementById('cameraInfo');
        
        if (scannerContainer) scannerContainer.style.display = 'block';
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'inline-block';
        if (closeScannerBtn) closeScannerBtn.classList.remove('hidden');
        if (cameraInfo) cameraInfo.classList.remove('hidden');
        
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
            
            await html5Qrcode.start(
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
    const stopBtn = document.getElementById('stopBtn');
    const closeScannerBtn = document.getElementById('closeScannerBtn');
    const scannerContainer = document.getElementById('scannerContainer');
    const cameraInfo = document.getElementById('cameraInfo');
    
    if (startBtn) startBtn.style.display = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (closeScannerBtn) closeScannerBtn.classList.add('hidden');
    if (scannerContainer) scannerContainer.style.display = 'none';
    if (cameraInfo) cameraInfo.classList.add('hidden');
    
    if (error.message && error.message.includes('permission')) {
        updateStatus('Permissão da câmera negada. Permita o acesso à câmera nas configurações do navegador.', 'error');
    } else if (error.message && error.message.includes('NotFoundError')) {
        updateStatus('Nenhuma câmera encontrada no dispositivo.', 'error');
    } else if (error.message && error.message.includes('NotSupportedError')) {
        updateStatus('Dispositivo não suporta scanner de câmera.', 'error');
    } else if (error.message && error.message.includes('NotAllowedError')) {
        updateStatus('Acesso à câmera não permitido.', 'error');
    } else if (error.message && error.message.includes('OverconstrainedError')) {
        updateStatus('Tentando modo simplificado...', 'warning');
        setTimeout(() => initScannerSimple(), 1000);
        return;
    } else {
        updateStatus('Erro ao iniciar o scanner: ' + (error.message || 'Erro desconhecido'), 'error');
    }
}

async function initScannerSimple() {
    try {
        updateStatus('Iniciando modo simplificado...', 'scanning');
        
        const simpleConfig = {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.CODE_128
            ]
        };
        
        html5QrCode = new Html5Qrcode("reader");
        
        await html5QrCode.start(
            { facingMode: "environment" },
            simpleConfig,
            onScanSuccess,
            onScanError
        );
        
        updateStatus('Scanner ativo (modo simplificado)!', 'success');
        isScanning = true;
        currentCameraId = "environment";
        
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const closeScannerBtn = document.getElementById('closeScannerBtn');
        const scannerContainer = document.getElementById('scannerContainer');
        const cameraInfo = document.getElementById('cameraInfo');
        
        if (scannerContainer) scannerContainer.style.display = 'block';
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'inline-block';
        if (closeScannerBtn) closeScannerBtn.classList.remove('hidden');
        if (cameraInfo) cameraInfo.classList.remove('hidden');
        
    } catch (error) {
        console.error('Erro no modo simplificado:', error);
        updateStatus('Falha ao iniciar scanner em qualquer modo.', 'error');
        
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const closeScannerBtn = document.getElementById('closeScannerBtn');
        if (startBtn) startBtn.style.display = 'inline-block';
        if (stopBtn) stopBtn.style.display = 'none';
        if (closeScannerBtn) closeScannerBtn.classList.add('hidden');
    }
}

function onScanError(error) {
    if (!error || typeof error !== 'string' || !error.includes("No MultiFormat Readers")) {
        console.log('Erro de scan:', error);
    }
}

function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    const code = decodedText.trim();
    
    if (!isValidBarcode(code)) return;
    if (code === lastScanned && (now - lastScanTime) < 2000) return;
    
    lastScanned = code;
    lastScanTime = now;
    
    updateStatus(`📷 Código detectado: ${code}`, 'success');
    
    // NÃO PAUSAR O SCANNER - Deixar aberto para múltiplos scans
    // if (html5QrCode) html5QrCode.pause();
    
    document.getElementById('manualCode').value = code;
    searchProduct(code);
    
    // NÃO retomar automaticamente - scanner fica aberto
    // setTimeout(() => {
    //     if (html5QrCode && isScanning) {
    //         html5QrCode.resume();
    //         updateStatus('Pronto para escanear novamente...', 'scanning');
    //     }
    // }, 3000);
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
    const stopBtn = document.getElementById('stopBtn');
    const closeScannerBtn = document.getElementById('closeScannerBtn');
    const cameraInfo = document.getElementById('cameraInfo');
    
    if (scannerContainer) scannerContainer.style.display = 'none';
    if (startBtn) startBtn.style.display = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (closeScannerBtn) closeScannerBtn.classList.add('hidden');
    if (cameraInfo) cameraInfo.classList.add('hidden');
    
    updateStatus('Scanner parado. Clique em "Abrir Scanner" para iniciar novamente.', 'default');
}

function closeScanner() {
    stopScanner();
    updateStatus('Scanner fechado manualmente.', 'default');
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
        // 1º PASSO: Buscar no Banco Local
        const localResult = await searchInGoogleSheets(code);
        
        if (localResult && localResult.success && localResult.found) {
            currentProduct = localResult.product;
            // Garantir que linha está disponível
            if (!currentProduct.linha && localResult.product) {
                currentProduct.linha = localResult.product.linha;
            }
            showProductInfo(localResult.product, true);
            updateStatus(`✅ Encontrado no banco local`, 'success');
            switchTab('resultado');
            return;
        }
        
        // 2º PASSO: Open Food Facts
        updateStatus('Não encontrado localmente. Buscando no Open Food Facts...', 'scanning');
        const openFoodProduct = await searchOpenFoodFacts(code);
        
        if (openFoodProduct && openFoodProduct.name) {
            showExternalProductInfo(openFoodProduct, code, 'Open Food Facts');
            updateStatus(`✅ Encontrado no Open Food Facts`, 'success');
            switchTab('resultado');
            return;
        }
        
        // 3º PASSO: Bluesoft
        updateStatus('Não encontrado no Open Food Facts. Buscando no Bluesoft...', 'scanning');
        const bluesoftProduct = await searchBluesoftCosmos(code);
        
        if (bluesoftProduct && bluesoftProduct.name) {
            showExternalProductInfo(bluesoftProduct, code, 'Bluesoft Cosmos');
            updateStatus(`✅ Encontrado no Bluesoft Cosmos`, 'success');
            switchTab('resultado');
            return;
        }
        
        // 4º PASSO: Cadastrar manualmente
        updateStatus('❌ Produto não encontrado em nenhuma fonte', 'error');
        showAddToDatabaseForm(code);
        switchTab('resultado');
        
    } catch (error) {
        console.error('Erro no fluxo de busca:', error);
        updateStatus('Erro na busca. Tente novamente.', 'error');
        showErrorResult('Erro na busca', 'Ocorreu um erro ao buscar o produto.');
        switchTab('resultado');
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

// ========== SISTEMA DE COMPRAS ==========
async function adicionarAoCarrinho(produto, precoAtual, precoAntigo) {
    try {
        const params = new URLSearchParams({
            operation: 'addToCart',
            ean: produto.ean,
            preco_atual: precoAtual,
            preco_antigo: precoAntigo || produto.preco_antigo || produto.preco || '0'
        });
        
        const url = `${GOOGLE_SHEETS_API}?${params.toString()}`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (result.success) {
            updateStatus('✅ Adicionado ao carrinho!', 'success');
            carregarCarrinho();
            return result;
        } else {
            throw new Error(result.message || 'Erro ao adicionar ao carrinho');
        }
    } catch (error) {
        console.error('Erro ao adicionar ao carrinho:', error);
        updateStatus('❌ Erro ao adicionar ao carrinho', 'error');
        return null;
    }
}

async function carregarCarrinho() {
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=getCart`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (result.success) {
            carrinho = result.items || [];
            atualizarInterfaceCarrinho();
            return result;
        }
        return { success: false };
    } catch (error) {
        console.error('Erro ao carregar carrinho:', error);
        return { success: false, error: error.message };
    }
}

async function limparCarrinho() {
    if (!carrinho.length) return;
    
    if (!confirm(`Tem certeza que deseja limpar o carrinho com ${carrinho.length} itens?`)) {
        return;
    }
    
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=clearCart`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (result.success) {
            updateStatus('✅ Carrinho esvaziado!', 'success');
            carrinho = [];
            atualizarInterfaceCarrinho();
        }
    } catch (error) {
        console.error('Erro ao limpar carrinho:', error);
        updateStatus('❌ Erro ao limpar carrinho', 'error');
    }
}

async function finalizarCompra() {
    if (!carrinho.length) {
        showAlert('O carrinho está vazio!', 'warning');
        return;
    }
    
    const total = carrinho.reduce((sum, item) => sum + (parseFloat(item.preco_atual) || 0), 0);
    
    if (!confirm(`Finalizar compra com ${carrinho.length} itens por R$ ${total.toFixed(2)}?`)) {
        return;
    }
    
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=checkout`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (result.success) {
            updateStatus(`✅ Compra finalizada! ${result.resumo.total_itens} itens`, 'success');
            showAlert(`Compra realizada com sucesso!\n\nTotal: R$ ${result.resumo.total_valor}\nEconomia: R$ ${result.resumo.economia || '0.00'}`, 'success');
            carrinho = [];
            atualizarInterfaceCarrinho();
            carregarHistorico();
            carregarEstatisticas();
        } else {
            throw new Error(result.message || 'Erro ao finalizar compra');
        }
    } catch (error) {
        console.error('Erro ao finalizar compra:', error);
        updateStatus('❌ Erro ao finalizar compra', 'error');
    }
}

async function removerDoCarrinho(ean) {
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=removeFromCart&ean=${ean}`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (result.success) {
            updateStatus('✅ Item removido do carrinho', 'success');
            carregarCarrinho();
        }
    } catch (error) {
        console.error('Erro ao remover do carrinho:', error);
        updateStatus('❌ Erro ao remover item', 'error');
    }
}

// ========== HISTÓRICO ==========
async function carregarHistorico() {
    try {
        const filtro = document.getElementById('historicoFiltro')?.value || '7';
        let url = `${GOOGLE_SHEETS_API}?operation=getHistorico`;
        
        if (filtro !== 'all') {
            url += `&limit=${filtro}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (result.success) {
            historico = result.historico || [];
            atualizarInterfaceHistorico();
            return result;
        }
        return { success: false };
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        return { success: false, error: error.message };
    }
}

// ========== LISTA DE PRODUTOS ==========
async function carregarTodosProdutos() {
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=list&limit=1000`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (result.success) {
            todosProdutos = result.produtos || [];
            paginaAtual = 1;
            atualizarInterfaceListaProdutos();
            return result;
        }
        return { success: false };
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        return { success: false, error: error.message };
    }
}

function filtrarProdutos() {
    const busca = document.getElementById('buscaProdutos')?.value.toLowerCase() || '';
    
    if (!busca) {
        atualizarInterfaceListaProdutos();
        return;
    }
    
    const filtrados = todosProdutos.filter(produto => 
        produto.nome.toLowerCase().includes(busca) ||
        (produto.marca && produto.marca.toLowerCase().includes(busca)) ||
        produto.ean.toString().includes(busca)
    );
    
    renderizarProdutos(filtrados);
}

function proximaPagina() {
    const totalPaginas = Math.ceil(todosProdutos.length / itensPorPagina);
    if (paginaAtual < totalPaginas) {
        paginaAtual++;
        atualizarInterfaceListaProdutos();
    }
}

function paginaAnterior() {
    if (paginaAtual > 1) {
        paginaAtual--;
        atualizarInterfaceListaProdutos();
    }
}

// ========== ESTATÍSTICAS ==========
async function carregarEstatisticas() {
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=stats`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (result.success) {
            atualizarInterfaceEstatisticas(result.estatisticas);
            return result;
        }
        return { success: false };
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
        return { success: false, error: error.message };
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
                <div style="padding: 40px; text-align: center; color: #6b7280;">
                    📷 Sem imagem
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
            <div style="margin-top: 10px; color: #10b981; font-weight: bold; font-size: 16px;">
                💰 R$ ${product.preco}
            </div>
        `;
    }
    
    // Verificar se há preço antigo para mostrar comparação
    let comparacaoHtml = '';
    if (product.preco_antigo && product.preco_antigo !== product.preco) {
        const precoAntigo = parseFloat(product.preco_antigo);
        const precoAtual = parseFloat(product.preco);
        const variacao = precoAtual - precoAntigo;
        const porcentagem = ((variacao / precoAntigo) * 100).toFixed(1);
        
        comparacaoHtml = `
            <div class="variacao-container ${variacao < 0 ? 'economia' : 'aumento'}">
                <div class="variacao-header">
                    <strong>${variacao < 0 ? '💰 Economia' : '📈 Aumento'}</strong>
                    <span class="variacao-valor ${variacao < 0 ? 'economia' : 'aumento'}">
                        ${variacao < 0 ? '▼' : '▲'} R$ ${Math.abs(variacao).toFixed(2)} (${porcentagem}%)
                    </span>
                </div>
                <div class="variacao-detalhes">
                    <span>Antigo: R$ ${precoAntigo.toFixed(2)}</span>
                    <span>Atual: R$ ${precoAtual.toFixed(2)}</span>
                </div>
            </div>
        `;
    }
    
    resultDiv.innerHTML = `
        <div class="product-card">
            ${imageHtml}
            
            <div class="product-details">
                <div class="product-code">📦 EAN: ${product.ean}</div>
                
                <div class="product-title">${product.nome}</div>
                
                ${product.marca ? `
                <div class="product-brand">🏭 ${product.marca}</div>
                ` : ''}
                
                ${priceHtml}
                
                ${product.cadastro ? `
                <div style="margin-top: 5px; font-size: 12px; color: #6b7280;">
                    📅 Cadastro: ${product.cadastro}
                </div>
                ` : ''}
                
                <div class="source-badge">${sourceBadge}</div>
            </div>
        </div>
        
        ${comparacaoHtml}
        
        <div class="api-actions">
            ${isFromDatabase ? `
            <button class="btn btn-warning" onclick="openEditModalCompleto('${product.ean}', '${encodeURIComponent(product.nome)}', '${encodeURIComponent(product.marca || '')}', '${encodeURIComponent(product.imagem || '')}', '${encodeURIComponent(product.preco || '')}', '${product.linha || ''}', '${encodeURIComponent(product.preco_antigo || product.preco || '')}')">
                ✏️ Editar Preço
            </button>
            <button class="btn btn-danger" onclick="deleteProduct('${product.ean}', '${product.linha || ''}')">
                🗑️ Excluir
            </button>
            ` : `
            <button class="btn btn-success" onclick="saveExternalProductToDatabase('${product.ean}', '${encodeURIComponent(product.nome)}', '${encodeURIComponent(product.marca || '')}', '${encodeURIComponent(product.imagem || '')}', '${encodeURIComponent(product.preco || '')}', 'Banco Local')">
                💾 Salvar no Banco
            </button>
            `}
            <button class="btn" onclick="searchOnline('${product.ean}', '${encodeURIComponent(product.nome)}')">
                🌐 Pesquisar Online
            </button>
        </div>
        
        <div class="product-actions-compras">
            <button class="btn btn-carrinho" onclick="adicionarComVariacaoDireto('${product.ean}', '${encodeURIComponent(product.nome)}', '${product.preco || ''}', '${product.preco_antigo || product.preco || ''}')">
                🛒 Adicionar ao Carrinho
            </button>
            <button class="btn btn-success" onclick="switchTab('compras')">
                📋 Ver Carrinho
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
                <div style="padding: 40px; text-align: center; color: #6b7280;">
                    📷 Sem imagem
                </div>
            </div>
        `;
    }
    
    let priceHtml = '';
    if (product.price) {
        priceHtml = `
            <div style="margin-top: 10px; color: #10b981; font-weight: bold; font-size: 16px;">
                💰 ${product.price}
            </div>
        `;
    }
    
    resultDiv.innerHTML = `
        <div class="product-card">
            ${imageHtml}
            
            <div class="product-details">
                <div class="product-code">📦 EAN: ${code}</div>
                
                <div class="product-title">${product.name}</div>
                
                ${product.brand ? `
                <div class="product-brand">🏭 ${product.brand}</div>
                ` : ''}
                
                ${priceHtml}
                
                <div class="source-badge">Fonte: ${source} <span class="db-missing">EXTERNO</span></div>
            </div>
        </div>
        
        <div class="api-actions">
            <button class="btn btn-success" onclick="saveExternalProductToDatabase('${code}', '${encodeURIComponent(product.name)}', '${encodeURIComponent(product.brand || '')}', '${encodeURIComponent(product.image || '')}', '${encodeURIComponent(product.price || '')}', '${source}')">
                💾 Salvar no Banco
            </button>
            <button class="btn btn-warning" onclick="editExternalProduct('${code}', '${encodeURIComponent(product.name)}', '${encodeURIComponent(product.brand || '')}', '${encodeURIComponent(product.image || '')}', '${encodeURIComponent(product.price || '')}', '${source}')">
                ✏️ Editar antes de Salvar
            </button>
            <button class="btn" onclick="searchOnline('${code}', '${encodeURIComponent(product.name)}')">
                🌐 Pesquisar Online
            </button>
        </div>
        
        <div class="product-actions-compras">
            <button class="btn btn-carrinho" onclick="openCarrinhoModal('${code}', '${encodeURIComponent(product.name)}', '${product.price || ''}')">
                🛒 Adicionar ao Carrinho
            </button>
            <button class="btn btn-success" onclick="switchTab('compras')">
                📋 Ver Carrinho
            </button>
        </div>
    `;
    
    resultDiv.classList.add('active');
}

function showAddToDatabaseForm(code) {
    const resultDiv = document.getElementById('result');
    
    resultDiv.innerHTML = `
        <div class="no-results">
            <div class="no-results-icon">➕</div>
            <h3 style="color: #6b7280; margin-bottom: 10px;">Produto não encontrado</h3>
            <p style="color: #9ca3af; font-size: 14px; margin-bottom: 20px;">
                Código: <strong>${code}</strong><br>
                O produto não foi encontrado em nenhuma fonte.
            </p>
            
            <div style="margin-top: 20px;">
                <button class="btn btn-success" onclick="openManualAddModal('${code}')">
                    ✏️ Cadastrar Manualmente
                </button>
                <button class="btn" onclick="searchOnline('${code}')" style="margin-top: 10px;">
                    🌐 Pesquisar na Web
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
            <div class="no-results-icon">⚠️</div>
            <h3 style="color: #6b7280; margin-bottom: 10px;">${title}</h3>
            <p style="color: #9ca3af; font-size: 14px;">${message}</p>
            <button class="btn" onclick="searchManual()" style="margin-top: 20px;">
                🔄 Tentar novamente
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

// ========== INTERFACES DAS ABAS ==========
function atualizarInterfaceCarrinho() {
    const carrinhoItens = document.getElementById('carrinhoItens');
    const carrinhoCount = document.getElementById('carrinhoCount');
    const carrinhoTotal = document.getElementById('carrinhoTotal');
    
    if (!carrinhoItens) return;
    
    if (carrinho.length === 0) {
        carrinhoItens.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">🛒</div>
                <h3>Carrinho vazio</h3>
                <p>Adicione produtos ao carrinho para começar</p>
            </div>
        `;
        if (carrinhoCount) carrinhoCount.textContent = '0 itens';
        if (carrinhoTotal) carrinhoTotal.textContent = 'R$ 0,00';
        return;
    }
    
    let html = '';
    let total = 0;
    let precoAntigoTotal = 0;
    
    carrinho.forEach(item => {
        const precoAtual = parseFloat(item.preco_atual) || 0;
        const precoAntigo = parseFloat(item.preco_antigo) || 0;
        const variacao = item.variacao || precoAtual - precoAntigo;
        
        total += precoAtual;
        precoAntigoTotal += precoAntigo;
        
        html += `
            <div class="carrinho-item">
                <div class="carrinho-item-info">
                    <strong>${item.nome}</strong><br>
                    <small>${item.ean}</small>
                </div>
                <div class="carrinho-item-precos">
                    ${precoAntigo > 0 ? `<div class="preco-antigo">R$ ${precoAntigo.toFixed(2)}</div>` : ''}
                    <div class="preco-atual">R$ ${precoAtual.toFixed(2)}</div>
                    ${variacao != 0 ? `
                    <div class="variacao ${variacao < 0 ? 'negativa' : 'positiva'}">
                        ${variacao < 0 ? '▼' : '▲'} R$ ${Math.abs(variacao).toFixed(2)}
                    </div>
                    ` : ''}
                    <button class="btn btn-small btn-danger" onclick="removerDoCarrinho('${item.ean}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    carrinhoItens.innerHTML = html;
    
    if (carrinhoCount) {
        carrinhoCount.textContent = `${carrinho.length} ${carrinho.length === 1 ? 'item' : 'itens'}`;
    }
    
    if (carrinhoTotal) {
        carrinhoTotal.textContent = `R$ ${total.toFixed(2)}`;
    }
    
    // Adicionar resumo de economia
    const economia = precoAntigoTotal - total;
    if (economia > 0) {
        const resumo = document.createElement('div');
        resumo.className = 'carrinho-resumo';
        resumo.innerHTML = `
            💰 <strong>Economia total:</strong> R$ ${economia.toFixed(2)}
        `;
        carrinhoItens.appendChild(resumo);
    }
}

function atualizarInterfaceHistorico() {
    const historicoLista = document.getElementById('historicoLista');
    if (!historicoLista) return;
    
    if (historico.length === 0) {
        historicoLista.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">📊</div>
                <h3>Nenhum histórico de compras</h3>
                <p>Finalize uma compra para começar o histórico</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    historico.forEach(compra => {
        html += `
            <div class="historico-item">
                <div class="historico-data">
                    <span>${compra.data}</span>
                    <span class="historico-total">
                        ${compra.total_itens} itens • R$ ${parseFloat(compra.total_valor).toFixed(2)}
                    </span>
                </div>
                <div class="historico-produtos">
        `;
        
        compra.itens.slice(0, 3).forEach(item => {
            html += `
                <div class="historico-produto">
                    <span>${item.nome}</span>
                    <span>R$ ${parseFloat(item.preco_atual).toFixed(2)}</span>
                </div>
            `;
        });
        
        if (compra.itens.length > 3) {
            html += `<div style="text-align: center; padding: 10px; color: var(--gray);">+ ${compra.itens.length - 3} itens</div>`;
        }
        
        html += `
                </div>
            </div>
        `;
    });
    
    historicoLista.innerHTML = html;
}

function atualizarInterfaceListaProdutos() {
    const listaProdutos = document.getElementById('listaProdutos');
    const paginaAtualSpan = document.getElementById('paginaAtual');
    const btnAnterior = document.getElementById('btnAnterior');
    const btnProximo = document.getElementById('btnProximo');
    
    if (!listaProdutos) return;
    
    if (todosProdutos.length === 0) {
        listaProdutos.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">📦</div>
                <h3>Nenhum produto cadastrado</h3>
                <p>Comece escaneando ou cadastrando produtos</p>
            </div>
        `;
        return;
    }
    
    const inicio = (paginaAtual - 1) * itensPorPagina;
    const fim = inicio + itensPorPagina;
    const produtosPagina = todosProdutos.slice(inicio, fim);
    
    renderizarProdutos(produtosPagina);
    
    if (paginaAtualSpan) {
        paginaAtualSpan.textContent = `Página ${paginaAtual} de ${Math.ceil(todosProdutos.length / itensPorPagina)}`;
    }
    
    if (btnAnterior) {
        btnAnterior.disabled = paginaAtual === 1;
    }
    
    if (btnProximo) {
        btnProximo.disabled = paginaAtual === Math.ceil(todosProdutos.length / itensPorPagina);
    }
}

function renderizarProdutos(produtos) {
    const listaProdutos = document.getElementById('listaProdutos');
    if (!listaProdutos) return;
    
    let html = '';
    
    produtos.forEach(produto => {
        html += `
            <div class="produto-card-mini" onclick="searchProduct('${produto.ean}')">
                <h4>${produto.nome}</h4>
                <div><small>${produto.ean}</small></div>
                ${produto.marca ? `<div><small>${produto.marca}</small></div>` : ''}
                <div class="preco">R$ ${produto.preco || '0.00'}</div>
                <div class="produto-actions">
                    <button class="btn btn-small" onclick="event.stopPropagation(); adicionarComVariacaoDireto('${produto.ean}', '${encodeURIComponent(produto.nome)}', '${produto.preco || ''}', '${produto.preco || ''}')">
                        <i class="fas fa-cart-plus"></i>
                    </button>
                    <button class="btn btn-small btn-warning" onclick="event.stopPropagation(); openEditModalCompleto('${produto.ean}', '${encodeURIComponent(produto.nome)}', '${encodeURIComponent(produto.marca || '')}', '${encodeURIComponent(produto.imagem || '')}', '${encodeURIComponent(produto.preco || '')}', '${produto.linha || ''}', '${encodeURIComponent(produto.preco || '')}')">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    listaProdutos.innerHTML = html;
}

function atualizarInterfaceEstatisticas(estatisticas) {
    const estatisticasConteudo = document.getElementById('estatisticasConteudo');
    if (!estatisticasConteudo) return;
    
    const html = `
        <div class="stats-content">
            <div class="stat-card">
                <div class="label">Total de Produtos</div>
                <div class="value">${estatisticas.total_produtos || 0}</div>
            </div>
            
            <div class="stat-card">
                <div class="label">Itens no Carrinho</div>
                <div class="value">${estatisticas.carrinho || 0}</div>
            </div>
            
            <div class="stat-card">
                <div class="label">Histórico de Compras</div>
                <div class="value">${estatisticas.historico_compras || 0}</div>
            </div>
            
            <div class="stat-card">
                <div class="label">Valor em Estoque</div>
                <div class="value">R$ ${estatisticas.valor_estoque || '0.00'}</div>
            </div>
            
            ${estatisticas.compras_ultimos_6_meses ? `
            <div class="stat-card" style="grid-column: span 2;">
                <div class="label">Compras nos Últimos 6 Meses</div>
                <div style="margin-top: 10px;">
                    ${Object.entries(estatisticas.compras_ultimos_6_meses).map(([mes, qtd]) => `
                        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
                            <span>${mes}</span>
                            <span style="font-weight: bold;">${qtd}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        </div>
    `;
    
    estatisticasConteudo.innerHTML = html;
}

// ========== FUNÇÕES DE TAB ==========
function switchTab(tab) {
    // Esconder todas as seções
    document.querySelectorAll('.tab-content').forEach(section => {
        section.classList.remove('active');
        section.classList.add('hidden');
    });
    
    // Atualizar tabs
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => {
        if (t.textContent.toLowerCase().includes(tab)) {
            t.classList.add('active');
        }
    });
    
    // Mostrar seção correspondente
    const sectionId = `${tab}Section`;
    const section = document.getElementById(sectionId);
    
    if (section) {
        section.classList.remove('hidden');
        section.classList.add('active');
    }
    
    // Carregar dados específicos da tab
    switch(tab) {
        case 'compras':
            carregarCarrinho();
            break;
        case 'historico':
            carregarHistorico();
            break;
        case 'produtos':
            if (todosProdutos.length === 0) carregarTodosProdutos();
            break;
        case 'estatisticas':
            carregarEstatisticas();
            break;
    }
}

// ========== MODAL FUNCTIONS ==========
function openEditModalCompleto(ean, nome, marca, imagem, preco, linha, precoAntigo = '') {
    currentProduct = { 
        ean, 
        linha, 
        precoAntigo: precoAntigo || preco,
        nome: decodeURIComponent(nome)
    };
    
    const modalBody = document.getElementById('editModalBody');
    
    // Mostrar preço antigo se disponível
    let precoAntigoHtml = '';
    let variacaoHtml = '';
    
    if (precoAntigo && precoAntigo !== preco) {
        const precoAntigoNum = parseFloat(decodeURIComponent(precoAntigo).replace(',', '.'));
        const precoAtualNum = parseFloat(decodeURIComponent(preco).replace(',', '.'));
        const variacao = precoAtualNum - precoAntigoNum;
        const porcentagem = ((variacao / precoAntigoNum) * 100).toFixed(1);
        
        precoAntigoHtml = `
            <div class="form-group">
                <label><i class="fas fa-history"></i> Preço Antigo (R$)</label>
                <input type="text" id="editPrecoAntigo" value="${decodeURIComponent(precoAntigo)}" readonly style="background:#f3f4f6;">
                <small style="color:#6b7280; font-size:12px;">Preço anterior registrado no banco</small>
            </div>
        `;
        
        variacaoHtml = `
            <div id="variacaoAtual" style="padding:10px; margin:10px 0; border-radius:var(--radius-sm); background:${variacao < 0 ? '#d1fae5' : '#fef3c7'}; border:1px solid ${variacao < 0 ? '#10b981' : '#f59e0b'};">
                <strong>Variação atual:</strong> 
                <span style="color:${variacao < 0 ? '#065f46' : '#92400e'}; font-weight:bold;">
                    ${variacao < 0 ? '▼' : '▲'} R$ ${Math.abs(variacao).toFixed(2)} (${porcentagem}%)
                </span>
            </div>
        `;
    }
    
    modalBody.innerHTML = `
        <div class="form-group">
            <label><i class="fas fa-tag"></i> Nome do Produto *</label>
            <input type="text" id="editNome" placeholder="Ex: Leite Integral 1L" value="${decodeURIComponent(nome)}" required>
        </div>
        <div class="form-group">
            <label><i class="fas fa-industry"></i> Marca</label>
            <input type="text" id="editMarca" placeholder="Ex: Itambé" value="${decodeURIComponent(marca)}">
        </div>
        <div class="form-group">
            <label><i class="fas fa-image"></i> URL da Imagem</label>
            <input type="text" id="editImagem" placeholder="https://exemplo.com/imagem.jpg" value="${decodeURIComponent(imagem)}">
        </div>
        ${precoAntigoHtml}
        <div class="form-group">
            <label><i class="fas fa-money-bill-wave"></i> Novo Preço (R$) *</label>
            <input type="text" id="editPreco" placeholder="Ex: 6.90" value="${decodeURIComponent(preco)}" required>
            <small style="color:#6b7280; font-size:12px;">Digite o novo preço atual</small>
        </div>
        ${variacaoHtml}
        <div id="novaVariacaoInfo" style="display:none; padding:10px; margin-top:10px; border-radius:var(--radius-sm);">
            <strong>Nova variação:</strong> <span id="novaVariacaoValor" style="font-weight:bold;"></span>
        </div>
    `;
    
    // Adicionar evento para calcular variação em tempo real
    document.getElementById('editPreco').addEventListener('input', function() {
        calcularNovaVariacao();
    });
    
    document.getElementById('editModal').classList.add('active');
    
    // Calcular inicialmente
    calcularNovaVariacao();
}

function calcularNovaVariacao() {
    const precoAntigoInput = document.getElementById('editPrecoAntigo');
    const novoPrecoInput = document.getElementById('editPreco');
    const novaVariacaoDiv = document.getElementById('novaVariacaoInfo');
    const novaVariacaoValor = document.getElementById('novaVariacaoValor');
    
    if (precoAntigoInput && novoPrecoInput.value) {
        const antigo = parseFloat(precoAntigoInput.value.replace(',', '.'));
        const novo = parseFloat(novoPrecoInput.value.replace(',', '.'));
        
        if (!isNaN(antigo) && !isNaN(novo)) {
            const variacao = novo - antigo;
            const porcentagem = ((variacao / antigo) * 100).toFixed(1);
            
            novaVariacaoDiv.style.display = 'block';
            
            if (variacao > 0) {
                novaVariacaoValor.textContent = `↑ R$ ${variacao.toFixed(2)} (${porcentagem}% de aumento)`;
                novaVariacaoDiv.style.background = '#fef3c7';
                novaVariacaoDiv.style.border = '1px solid #f59e0b';
                novaVariacaoValor.style.color = '#92400e';
            } else if (variacao < 0) {
                novaVariacaoValor.textContent = `↓ R$ ${Math.abs(variacao).toFixed(2)} (${porcentagem}% de economia)`;
                novaVariacaoDiv.style.background = '#d1fae5';
                novaVariacaoDiv.style.border = '1px solid #10b981';
                novaVariacaoValor.style.color = '#065f46';
            } else {
                novaVariacaoValor.textContent = `R$ 0.00 (Sem alteração)`;
                novaVariacaoDiv.style.background = '#f3f4f6';
                novaVariacaoDiv.style.border = '1px solid #6b7280';
                novaVariacaoValor.style.color = '#6b7280';
            }
        }
    }
}

function openManualAddModal(code) {
    currentProduct = { ean: code };
    
    const modalBody = document.getElementById('editModalBody');
    modalBody.innerHTML = `
        <div class="form-group">
            <label><i class="fas fa-tag"></i> Nome do Produto *</label>
            <input type="text" id="editNome" placeholder="Ex: Leite Integral 1L" required>
        </div>
        <div class="form-group">
            <label><i class="fas fa-industry"></i> Marca</label>
            <input type="text" id="editMarca" placeholder="Ex: Itambé">
        </div>
        <div class="form-group">
            <label><i class="fas fa-image"></i> URL da Imagem</label>
            <input type="text" id="editImagem" placeholder="https://exemplo.com/imagem.jpg">
        </div>
        <div class="form-group">
            <label><i class="fas fa-money-bill-wave"></i> Preço (R$) *</label>
            <input type="text" id="editPreco" placeholder="Ex: 6.90" required>
        </div>
    `;
    
    document.getElementById('editModal').classList.add('active');
}

function closeModal() {
    document.getElementById('editModal').classList.remove('active');
    document.getElementById('carrinhoModal').classList.remove('active');
    currentProduct = null;
}

async function saveEditedProduct() {
    const nome = document.getElementById('editNome').value.trim();
    const marca = document.getElementById('editMarca').value.trim();
    const imagem = document.getElementById('editImagem').value.trim();
    const novoPreco = document.getElementById('editPreco').value.trim();
    const precoAntigoInput = document.getElementById('editPrecoAntigo');
    const precoAntigo = precoAntigoInput ? precoAntigoInput.value.trim() : currentProduct.precoAntigo || '';
    
    if (!nome) {
        showAlert('Por favor, informe o nome do produto', 'warning');
        return;
    }
    
    if (!novoPreco) {
        showAlert('Por favor, informe o preço do produto', 'warning');
        return;
    }
    
    if (!currentProduct) return;
    
    const productData = {
        ean: currentProduct.ean,
        nome: nome,
        marca: marca,
        imagem: imagem,
        preco: novoPreco,
        fonte: currentProduct.linha ? 'Editado' : 'Manual'
    };
    
    if (currentProduct.linha) {
        productData.linha = currentProduct.linha;
    }
    
    updateStatus('Salvando produto...', 'scanning');
    
    const result = currentProduct.linha ? 
        await updateInGoogleSheets(productData) : 
        await saveToGoogleSheets(productData);
    
    if (result.success) {
        updateStatus('✅ Produto atualizado!', 'success');
        closeModal();
        
        // Aguardar um momento e mostrar produto atualizado com comparação
        setTimeout(() => {
            mostrarProdutoAtualizadoComComparacao(currentProduct.ean, novoPreco, precoAntigo);
        }, 800);
        
        carregarTodosProdutos();
    } else {
        updateStatus(`❌ Erro ao salvar: ${result.error || result.message}`, 'error');
    }
}

function mostrarProdutoAtualizadoComComparacao(ean, novoPreco, precoAntigo) {
    // Rebuscar produto atualizado
    searchProduct(ean).then(() => {
        // Buscar o produto novamente para mostrar
        searchInGoogleSheets(ean).then(result => {
            if (result && result.success && result.found) {
                showProductInfo(result.product, true);
                
                // Adicionar botão de adicionar ao carrinho com a nova variação
                const resultDiv = document.getElementById('result');
                const existingHtml = resultDiv.innerHTML;
                
                const precoAntigoNum = parseFloat(precoAntigo.replace(',', '.'));
                const novoPrecoNum = parseFloat(novoPreco.replace(',', '.'));
                const variacao = novoPrecoNum - precoAntigoNum;
                
                if (!isNaN(variacao) && precoAntigo && variacao !== 0) {
                    const variacaoHtml = `
                        <div style="margin-top: 15px; padding: 15px; background: ${variacao < 0 ? '#d1fae5' : '#fef3c7'}; border-radius: var(--radius-sm); border: 1px solid ${variacao < 0 ? '#10b981' : '#f59e0b'};">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <div>
                                    <strong>${variacao < 0 ? '💰 Economia Detectada' : '📈 Aumento Detectado'}</strong><br>
                                    <small>Preço anterior: R$ ${precoAntigoNum.toFixed(2)}</small>
                                </div>
                                <div style="text-align: right;">
                                    <span style="font-size: 18px; font-weight: bold; color: ${variacao < 0 ? '#065f46' : '#92400e'}">
                                        ${variacao < 0 ? '▼' : '▲'} R$ ${Math.abs(variacao).toFixed(2)}
                                    </span><br>
                                    <small>${variacao < 0 ? 'Economia por unidade' : 'Aumento por unidade'}</small>
                                </div>
                            </div>
                            <button class="btn btn-success" style="width: 100%;" 
                                    onclick="adicionarComVariacaoEspecifica('${ean}', '${novoPreco}', '${precoAntigo}')">
                                <i class="fas fa-cart-plus"></i> Adicionar ao Carrinho com esta Variação
                            </button>
                        </div>
                    `;
                    
                    // Inserir antes do product-actions-compras
                    const actionsIndex = existingHtml.indexOf('product-actions-compras');
                    if (actionsIndex !== -1) {
                        const newHtml = existingHtml.substring(0, actionsIndex) + 
                                      variacaoHtml + 
                                      existingHtml.substring(actionsIndex);
                        resultDiv.innerHTML = newHtml;
                    }
                }
            }
        });
    });
}

async function adicionarComVariacaoEspecifica(ean, precoAtual, precoAntigo) {
    // Buscar produto para obter nome
    const produtoResult = await searchInGoogleSheets(ean);
    if (produtoResult && produtoResult.success && produtoResult.found) {
        const produto = produtoResult.product;
        
        // Adicionar diretamente ao carrinho com variação específica
        const result = await adicionarAoCarrinho(produto, precoAtual, precoAntigo);
        
        if (result && result.success) {
            showAlert('✅ Produto adicionado ao carrinho com a variação de preço!', 'success');
            switchTab('compras');
        } else {
            showAlert('❌ Erro ao adicionar ao carrinho', 'error');
        }
    }
}

async function adicionarComVariacaoDireto(ean, nome, precoAtual, precoAntigo) {
    const produto = {
        ean: ean,
        nome: decodeURIComponent(nome),
        preco: precoAtual,
        preco_antigo: precoAntigo
    };
    
    // Usar o modal de edição para confirmar preços
    currentProduct = { ean: ean, nome: decodeURIComponent(nome) };
    
    const modalBody = document.getElementById('editModalBody');
    modalBody.innerHTML = `
        <div style="padding: 10px; background: var(--light); border-radius: var(--radius-sm); margin-bottom: 15px;">
            <strong>${decodeURIComponent(nome)}</strong><br>
            <small>EAN: ${ean}</small>
        </div>
        <div class="form-group">
            <label><i class="fas fa-money-bill-wave"></i> Preço Atual (R$)</label>
            <input type="text" id="carrinhoPrecoAtual" placeholder="Ex: 6.90" value="${precoAtual}" required>
        </div>
        <div class="form-group">
            <label><i class="fas fa-history"></i> Preço Anterior (R$)</label>
            <input type="text" id="carrinhoPrecoAntigo" placeholder="Ex: 7.50" value="${precoAntigo}">
            <small style="color:#6b7280; font-size:12px;">Deixe em branco se não houver preço anterior</small>
        </div>
        <div id="variacaoCarrinhoInfo" style="display:none; padding:10px; margin-top:10px; border-radius:var(--radius-sm);">
            <strong>Variação:</strong> <span id="variacaoCarrinhoValor" style="font-weight:bold;"></span>
        </div>
    `;
    
    // Adicionar eventos para calcular variação
    document.getElementById('carrinhoPrecoAtual').addEventListener('input', calcularVariacaoCarrinho);
    document.getElementById('carrinhoPrecoAntigo').addEventListener('input', calcularVariacaoCarrinho);
    
    // Mudar título do modal
    document.querySelector('#editModal .modal-header h3').innerHTML = '<i class="fas fa-cart-plus"></i> Adicionar ao Carrinho';
    
    // Mudar ação do botão salvar
    const saveBtn = document.getElementById('saveEditBtn');
    saveBtn.innerHTML = '<i class="fas fa-cart-plus"></i> Adicionar ao Carrinho';
    saveBtn.onclick = confirmarAdicionarCarrinhoModal;
    
    document.getElementById('editModal').classList.add('active');
    
    // Calcular variação inicial
    calcularVariacaoCarrinho();
}

function calcularVariacaoCarrinho() {
    const precoAtualInput = document.getElementById('carrinhoPrecoAtual');
    const precoAntigoInput = document.getElementById('carrinhoPrecoAntigo');
    const variacaoDiv = document.getElementById('variacaoCarrinhoInfo');
    const variacaoValor = document.getElementById('variacaoCarrinhoValor');
    
    if (precoAtualInput.value && precoAntigoInput.value) {
        const atual = parseFloat(precoAtualInput.value.replace(',', '.'));
        const antigo = parseFloat(precoAntigoInput.value.replace(',', '.'));
        
        if (!isNaN(atual) && !isNaN(antigo)) {
            const variacao = atual - antigo;
            const porcentagem = ((variacao / antigo) * 100).toFixed(1);
            
            variacaoDiv.style.display = 'block';
            
            if (variacao > 0) {
                variacaoValor.textContent = `↑ R$ ${variacao.toFixed(2)} (${porcentagem}% de aumento)`;
                variacaoDiv.style.background = '#fef3c7';
                variacaoDiv.style.border = '1px solid #f59e0b';
                variacaoValor.style.color = '#92400e';
            } else if (variacao < 0) {
                variacaoValor.textContent = `↓ R$ ${Math.abs(variacao).toFixed(2)} (${porcentagem}% de economia)`;
                variacaoDiv.style.background = '#d1fae5';
                variacaoDiv.style.border = '1px solid #10b981';
                variacaoValor.style.color = '#065f46';
            } else {
                variacaoValor.textContent = `R$ 0.00 (Sem alteração)`;
                variacaoDiv.style.background = '#f3f4f6';
                variacaoDiv.style.border = '1px solid #6b7280';
                variacaoValor.style.color = '#6b7280';
            }
        }
    } else {
        variacaoDiv.style.display = 'none';
    }
}

async function confirmarAdicionarCarrinhoModal() {
    const precoAtual = document.getElementById('carrinhoPrecoAtual').value;
    const precoAntigo = document.getElementById('carrinhoPrecoAntigo').value;
    
    if (!precoAtual) {
        showAlert('Informe o preço atual do produto', 'warning');
        return;
    }
    
    if (!currentProduct) return;
    
    const produtoData = {
        ean: currentProduct.ean,
        nome: currentProduct.nome || 'Produto',
        preco: precoAtual,
        preco_antigo: precoAntigo || precoAtual
    };
    
    const result = await adicionarAoCarrinho(produtoData, precoAtual, precoAntigo || precoAtual);
    
    if (result && result.success) {
        closeModal();
        showAlert('✅ Produto adicionado ao carrinho!', 'success');
        switchTab('compras');
    } else {
        showAlert('❌ Erro ao adicionar ao carrinho', 'error');
    }
}

function editExternalProduct(code, name, brand, image, price, source) {
    currentProduct = { ean: code, source };
    
    const modalBody = document.getElementById('editModalBody');
    modalBody.innerHTML = `
        <div class="form-group">
            <label><i class="fas fa-tag"></i> Nome do Produto *</label>
            <input type="text" id="editNome" placeholder="Ex: Leite Integral 1L" value="${decodeURIComponent(name)}" required>
        </div>
        <div class="form-group">
            <label><i class="fas fa-industry"></i> Marca</label>
            <input type="text" id="editMarca" placeholder="Ex: Itambé" value="${decodeURIComponent(brand)}">
        </div>
        <div class="form-group">
            <label><i class="fas fa-image"></i> URL da Imagem</label>
            <input type="text" id="editImagem" placeholder="https://exemplo.com/imagem.jpg" value="${decodeURIComponent(image)}">
        </div>
        <div class="form-group">
            <label><i class="fas fa-money-bill-wave"></i> Preço (R$)</label>
            <input type="text" id="editPreco" placeholder="Ex: 6.90" value="${decodeURIComponent(price)}">
        </div>
    `;
    
    document.getElementById('editModal').classList.add('active');
}

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
        carregarTodosProdutos();
    } else {
        updateStatus(`❌ Erro ao salvar: ${result.error || result.message}`, 'error');
    }
}

// ========== MODAL DO CARRINHO (ANTIGO - MANTIDO PARA COMPATIBILIDADE) ==========
function openCarrinhoModal(ean, nome, preco) {
    document.getElementById('carrinhoProdutoInfo').innerHTML = `
        <div style="padding: 10px; background: var(--light); border-radius: var(--radius-sm); margin-bottom: 15px;">
            <strong>${decodeURIComponent(nome)}</strong><br>
            <small>EAN: ${ean}</small>
        </div>
    `;
    
    document.getElementById('carrinhoPrecoAtual').value = preco || '';
    document.getElementById('carrinhoPrecoAntigo').value = '';
    
    currentProduct = { ean: ean, nome: decodeURIComponent(nome) };
    document.getElementById('carrinhoModal').classList.add('active');
}

function fecharCarrinhoModal() {
    document.getElementById('carrinhoModal').classList.remove('active');
    currentProduct = null;
}

async function confirmarAdicionarCarrinho() {
    const precoAtual = document.getElementById('carrinhoPrecoAtual').value;
    const precoAntigo = document.getElementById('carrinhoPrecoAntigo').value;
    
    if (!precoAtual || parseFloat(precoAtual) <= 0) {
        showAlert('Informe um preço atual válido', 'warning');
        return;
    }
    
    if (!currentProduct) return;
    
    const produtoData = {
        ean: currentProduct.ean,
        nome: currentProduct.nome,
        preco_atual: precoAtual,
        preco_antigo: precoAntigo || precoAtual
    };
    
    const result = await adicionarAoCarrinho(produtoData, precoAtual, precoAntigo || precoAtual);
    
    if (result && result.success) {
        fecharCarrinhoModal();
        switchTab('compras');
    }
}

// ========== FUNÇÕES DE CRUD ==========
async function deleteProduct(ean, linha) {
    if (!confirm(`Tem certeza que deseja excluir o produto ${ean}?`)) {
        return;
    }
    
    updateStatus('Excluindo produto...', 'scanning');
    
    const result = await deleteFromGoogleSheets(ean, linha);
    
    if (result.success) {
        updateStatus('✅ Produto excluído do banco local!', 'success');
        
        const resultDiv = document.getElementById('result');
        resultDiv.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">🗑️</div>
                <h3 style="color: #6b7280; margin-bottom: 10px;">Produto excluído</h3>
                <p style="color: #9ca3af; font-size: 14px;">
                    Código: <strong>${ean}</strong>
                </p>
            </div>
        `;
        
        carregarTodosProdutos();
    } else {
        updateStatus(`❌ Erro ao excluir: ${result.error || result.message}`, 'error');
    }
}

// ========== FUNÇÕES AUXILIARES ==========
function updateStatus(message, type = 'default') {
    const statusDiv = document.getElementById('status');
    
    let icon = '';
    switch(type) {
        case 'success': icon = '✅'; break;
        case 'error': icon = '❌'; break;
        case 'warning': icon = '⚠️'; break;
        case 'scanning': icon = '<div class="loading"></div>'; break;
        default: icon = 'ℹ️';
    }
    
    statusDiv.innerHTML = `${icon} ${message}`;
    statusDiv.className = `status ${type}`;
}

function isValidBarcode(code) {
    if (!/^\d+$/.test(code)) return false;
    if (code.length < 8 || code.length > 13) return false;
    if (code.length === 13) return validateEAN13(code);
    if (code.length === 8) return validateEAN8(code);
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

function validateEAN8(code) {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
        const digit = parseInt(code[i]);
        sum += digit * (i % 2 === 0 ? 3 : 1);
    }
    const checksum = (10 - (sum % 10)) % 10;
    return checksum === parseInt(code[7]);
}

function handleImageError(img) {
    img.onerror = null;
    img.parentElement.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #6b7280;">
            📷 Imagem não carregada
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
    if (!GOOGLE_SHEETS_API) {
        console.warn("URL do Google Sheets não configurada");
        updateStatus('⚠️ Configure a URL do Google Sheets API!', 'warning');
    }
}

// ========== EXPORT FUNCTIONS TO GLOBAL SCOPE ==========
window.searchManual = searchManual;
window.initScanner = initScanner;
window.stopScanner = stopScanner;
window.closeScanner = closeScanner;
window.searchOnline = searchOnline;
window.openEditModalCompleto = openEditModalCompleto;
window.openManualAddModal = openManualAddModal;
window.closeModal = closeModal;
window.saveEditedProduct = saveEditedProduct;
window.deleteProduct = deleteProduct;
window.saveExternalProductToDatabase = saveExternalProductToDatabase;
window.editExternalProduct = editExternalProduct;
window.handleImageError = handleImageError;
window.switchTab = switchTab;
window.carregarCarrinho = carregarCarrinho;
window.limparCarrinho = limparCarrinho;
window.finalizarCompra = finalizarCompra;
window.carregarHistorico = carregarHistorico;
window.carregarTodosProdutos = carregarTodosProdutos;
window.filtrarProdutos = filtrarProdutos;
window.proximaPagina = proximaPagina;
window.paginaAnterior = paginaAnterior;
window.openCarrinhoModal = openCarrinhoModal;
window.fecharCarrinhoModal = fecharCarrinhoModal;
window.confirmarAdicionarCarrinho = confirmarAdicionarCarrinho;
window.confirmarAdicionarCarrinhoModal = confirmarAdicionarCarrinhoModal;
window.removerDoCarrinho = removerDoCarrinho;
window.carregarEstatisticas = carregarEstatisticas;
window.adicionarComVariacaoDireto = adicionarComVariacaoDireto;
window.adicionarComVariacaoEspecifica = adicionarComVariacaoEspecifica;
