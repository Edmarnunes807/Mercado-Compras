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

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('manualCode').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchManual();
    });
    checkAPIStatus();
});

// ========== FUNÇÕES DO SCANNER ==========
async function initScanner() {
    if (isScanning) return;
    
    try {
        updateStatus('Iniciando câmera...', 'scanning');
        
        const scannerContainer = document.getElementById('scannerContainer');
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const closeScannerBtn = document.getElementById('closeScannerBtn');
        const cameraInfo = document.getElementById('cameraInfo');
        
        scannerContainer.style.display = 'block';
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        closeScannerBtn.classList.remove('hidden');
        cameraInfo.classList.remove('hidden');
        
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
        
        html5QrCode = new Html5Qrcode("reader");
        
        // Tentar câmera traseira
        const rearCameraId = await findRearCamera();
        
        if (rearCameraId) {
            currentCameraId = rearCameraId;
            await html5QrCode.start(
                rearCameraId,
                config,
                onScanSuccess,
                onScanError
            );
        } else {
            // Fallback
            await html5QrCode.start(
                { facingMode: "environment" },
                config,
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
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        const rearCamera = videoDevices.find(device => {
            if (!device.label) return false;
            const label = device.label.toLowerCase();
            return label.includes("back") || 
                   label.includes("rear") || 
                   label.includes("traseira") ||
                   label.includes("environment");
        });
        
        return rearCamera ? rearCamera.deviceId : null;
    } catch (error) {
        return null;
    }
}

function onScanError(error) {
    console.log('Erro de scan:', error);
}

function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    const code = decodedText.trim();
    
    if (!isValidBarcode(code)) return;
    if (code === lastScanned && (now - lastScanTime) < 2000) return;
    
    lastScanned = code;
    lastScanTime = now;
    
    updateStatus(`📷 Código detectado: ${code}`, 'success');
    document.getElementById('manualCode').value = code;
    searchProduct(code);
}

async function stopScanner() {
    if (html5QrCode && isScanning) {
        try {
            await html5QrCode.stop();
            html5QrCode.clear();
        } catch (error) {
            console.log('Erro ao parar scanner:', error);
        }
    }
    
    isScanning = false;
    html5QrCode = null;
    currentCameraId = null;
    
    document.getElementById('scannerContainer').style.display = 'none';
    document.getElementById('startBtn').style.display = 'inline-block';
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('closeScannerBtn').classList.add('hidden');
    document.getElementById('cameraInfo').classList.add('hidden');
    
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
            showProductInfo(localResult.product, true);
            updateStatus(`✅ Encontrado no banco local`, 'success');
            switchTab('resultado');
            return;
        }
        
        // 2º PASSO: Open Food Facts
        updateStatus('Não encontrado localmente. Buscando no Open Food Facts...', 'scanning');
        const openFoodProduct = await searchOpenFoodFacts(code);
        
        if (openFoodProduct && openFoodProduct.name) {
            showProductInfo({
                ean: code,
                nome: openFoodProduct.name,
                marca: openFoodProduct.brand,
                imagem: openFoodProduct.image,
                preco: openFoodProduct.price,
                fonte: 'Open Food Facts'
            }, false);
            updateStatus(`✅ Encontrado no Open Food Facts`, 'success');
            switchTab('resultado');
            return;
        }
        
        // 3º PASSO: Bluesoft
        updateStatus('Não encontrado no Open Food Facts. Buscando no Bluesoft...', 'scanning');
        const bluesoftProduct = await searchBluesoftCosmos(code);
        
        if (bluesoftProduct && bluesoftProduct.name) {
            showProductInfo({
                ean: code,
                nome: bluesoftProduct.name,
                marca: bluesoftProduct.brand,
                imagem: bluesoftProduct.image,
                preco: bluesoftProduct.price,
                fonte: 'Bluesoft Cosmos'
            }, false);
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
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=search&ean=${encodeURIComponent(ean)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
                name: data.product.product_name || data.product.product_name_pt || 'Produto',
                brand: data.product.brands || data.product.brand || '',
                image: data.product.image_front_url || data.product.image_url || null,
                price: data.product.product_quantity || ''
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
            brand: data.brand?.name || data.brand_name || '',
            image: data.thumbnail || data.image || null,
            price: data.price || data.average_price || ''
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

// ========== RENDERIZAÇÃO DE RESULTADOS ==========
function showProductInfo(product, isFromDatabase = true) {
    const resultDiv = document.getElementById('result');
    
    let imageHtml = product.imagem ? 
        `<div class="product-image-container">
            <img src="${product.imagem}" class="product-image" alt="${product.nome}" onerror="handleImageError(this)">
        </div>` :
        `<div class="product-image-container">
            <div style="padding: 40px; text-align: center; color: #6b7280;">📷 Sem imagem</div>
        </div>`;
    
    let sourceBadge = isFromDatabase ? 
        '<span class="db-badge">BANCO LOCAL</span>' : 
        '<span class="db-missing">EXTERNO</span>';
    
    let priceHtml = product.preco ? 
        `<div style="margin-top: 10px; color: #10b981; font-weight: bold; font-size: 16px;">💰 R$ ${product.preco}</div>` : '';
    
    let editBtn = isFromDatabase ? 
        `<button class="btn btn-warning" onclick="openEditModal('${product.ean}', '${encodeURIComponent(product.nome)}', '${encodeURIComponent(product.marca || '')}', '${encodeURIComponent(product.imagem || '')}', '${encodeURIComponent(product.preco || '')}', '${product.linha || ''}', '${encodeURIComponent(product.preco_antigo || product.preco || '')}')">✏️ Editar</button>` :
        `<button class="btn btn-warning" onclick="openEditModal('${product.ean}', '${encodeURIComponent(product.nome)}', '${encodeURIComponent(product.marca || '')}', '${encodeURIComponent(product.imagem || '')}', '${encodeURIComponent(product.preco || '')}', '', '${encodeURIComponent(product.preco || '')}')">✏️ Editar antes de Salvar</button>`;
    
    let saveBtn = isFromDatabase ? 
        `<button class="btn btn-danger" onclick="deleteProduct('${product.ean}', '${product.linha || ''}')">🗑️ Excluir</button>` :
        `<button class="btn btn-success" onclick="saveExternalProduct('${product.ean}', '${encodeURIComponent(product.nome)}', '${encodeURIComponent(product.marca || '')}', '${encodeURIComponent(product.imagem || '')}', '${encodeURIComponent(product.preco || '')}', '${product.fonte || 'Externo'}')">💾 Salvar no Banco</button>`;
    
    resultDiv.innerHTML = `
        <div class="product-card">
            ${imageHtml}
            
            <div class="product-details">
                <div class="product-code">📦 EAN: ${product.ean}</div>
                <div class="product-title">${product.nome}</div>
                ${product.marca ? `<div class="product-brand">🏭 ${product.marca}</div>` : ''}
                ${priceHtml}
                ${product.cadastro ? `<div style="margin-top: 5px; font-size: 12px; color: #6b7280;">📅 Cadastro: ${product.cadastro}</div>` : ''}
                <div class="source-badge">${sourceBadge}</div>
            </div>
        </div>
        
        <div class="api-actions">
            ${editBtn}
            ${saveBtn}
            <button class="btn" onclick="searchOnline('${product.ean}', '${encodeURIComponent(product.nome)}')">🌐 Pesquisar Online</button>
        </div>
        
        <div class="product-actions-compras">
            <button class="btn btn-carrinho" onclick="openAddToCartModal('${product.ean}', '${encodeURIComponent(product.nome)}', '${product.preco || ''}', '${product.preco_antigo || product.preco || ''}')">🛒 Adicionar ao Carrinho</button>
            <button class="btn btn-success" onclick="switchTab('compras')">📋 Ver Carrinho</button>
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
                <button class="btn btn-success" onclick="openEditModal('${code}', '', '', '', '', '', '')">✏️ Cadastrar Manualmente</button>
                <button class="btn" onclick="searchOnline('${code}')" style="margin-top: 10px;">🌐 Pesquisar na Web</button>
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
            <button class="btn" onclick="searchManual()" style="margin-top: 20px;">🔄 Tentar novamente</button>
        </div>
    `;
    
    resultDiv.classList.add('active');
}

function clearResult() {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = '';
    resultDiv.classList.remove('active');
}

// ========== MODAL FUNCTIONS ==========
function openEditModal(ean, nome, marca, imagem, preco, linha, precoAntigo = '') {
    currentProduct = { 
        ean, 
        linha, 
        precoAntigo: precoAntigo || preco,
        nome: decodeURIComponent(nome),
        isNew: !linha
    };
    
    const modalBody = document.getElementById('modalBody');
    const modalTitle = document.getElementById('modalTitle');
    const modalActionBtn = document.getElementById('modalActionBtn');
    
    let precoAntigoHtml = '';
    if (precoAntigo && precoAntigo !== preco) {
        precoAntigoHtml = `
            <div class="form-group">
                <label><i class="fas fa-history"></i> Preço Antigo (R$)</label>
                <input type="text" id="editPrecoAntigo" value="${decodeURIComponent(precoAntigo)}" readonly style="background:#f3f4f6;">
            </div>
        `;
    }
    
    modalBody.innerHTML = `
        <div style="margin-bottom: 15px; padding: 10px; background: #f3f4f6; border-radius: var(--radius-sm);">
            <strong>${decodeURIComponent(nome) || 'Novo Produto'}</strong><br>
            <small>EAN: ${ean}</small>
        </div>
        
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
            <label><i class="fas fa-money-bill-wave"></i> Preço (R$) *</label>
            <input type="text" id="editPreco" placeholder="Ex: 6.90" value="${decodeURIComponent(preco)}" required>
        </div>
    `;
    
    if (currentProduct.isNew) {
        modalTitle.innerHTML = '<i class="fas fa-plus"></i> Cadastrar Produto';
        modalActionBtn.innerHTML = '<i class="fas fa-save"></i> Salvar no Banco';
        modalActionBtn.onclick = saveProductToDatabase;
    } else {
        modalTitle.innerHTML = '<i class="fas fa-edit"></i> Editar Produto';
        modalActionBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Alterações';
        modalActionBtn.onclick = saveEditedProduct;
    }
    
    document.getElementById('mainModal').classList.add('active');
}

function openAddToCartModal(ean, nome, precoAtual, precoAntigo = '') {
    currentProduct = { 
        ean, 
        nome: decodeURIComponent(nome),
        precoAtual,
        precoAntigo: precoAntigo || precoAtual
    };
    
    const modalBody = document.getElementById('modalBody');
    const modalTitle = document.getElementById('modalTitle');
    const modalActionBtn = document.getElementById('modalActionBtn');
    
    modalBody.innerHTML = `
        <div style="margin-bottom: 15px; padding: 10px; background: #f3f4f6; border-radius: var(--radius-sm);">
            <strong>${decodeURIComponent(nome)}</strong><br>
            <small>EAN: ${ean}</small>
        </div>
        
        <div class="form-group">
            <label><i class="fas fa-money-bill-wave"></i> Preço Atual (R$) *</label>
            <input type="text" id="cartPrecoAtual" placeholder="Ex: 10.59" value="${precoAtual}" required>
        </div>
        
        <div class="form-group">
            <label><i class="fas fa-history"></i> Preço Anterior (R$)</label>
            <input type="text" id="cartPrecoAntigo" placeholder="Ex: 11.50" value="${precoAntigo}">
        </div>
    `;
    
    modalTitle.innerHTML = '<i class="fas fa-cart-plus"></i> Adicionar ao Carrinho';
    modalActionBtn.innerHTML = '<i class="fas fa-cart-plus"></i> Adicionar ao Carrinho';
    modalActionBtn.onclick = addToCartFromModal;
    
    document.getElementById('mainModal').classList.add('active');
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
        fonte: 'Editado'
    };
    
    if (currentProduct.linha) {
        productData.linha = currentProduct.linha;
    }
    
    updateStatus('Salvando produto...', 'scanning');
    
    const result = currentProduct.linha ? 
        await updateInGoogleSheets(productData) : 
        await saveToGoogleSheets(productData);
    
    if (result.success) {
        closeMainModal();
        updateStatus('✅ Produto atualizado!', 'success');
        
        // Atualizar a visualização
        setTimeout(() => {
            searchProduct(currentProduct.ean);
        }, 500);
        
        carregarTodosProdutos();
    } else {
        updateStatus(`❌ Erro ao salvar: ${result.error || result.message}`, 'error');
    }
}

async function saveProductToDatabase() {
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
        fonte: 'Manual'
    };
    
    updateStatus('Salvando produto...', 'scanning');
    
    const result = await saveToGoogleSheets(productData);
    
    if (result.success) {
        closeMainModal();
        updateStatus('✅ Produto salvo no banco!', 'success');
        
        // Atualizar a visualização
        setTimeout(() => {
            searchProduct(currentProduct.ean);
        }, 500);
        
        carregarTodosProdutos();
    } else {
        updateStatus(`❌ Erro ao salvar: ${result.error || result.message}`, 'error');
    }
}

async function saveExternalProduct(ean, nome, marca, imagem, preco, fonte) {
    // Abrir modal de edição
    openEditModal(ean, nome, marca, imagem, preco, '', preco);
    
    // Configurar para salvar como externo
    const modalActionBtn = document.getElementById('modalActionBtn');
    modalActionBtn.innerHTML = '<i class="fas fa-save"></i> Salvar no Banco';
    modalActionBtn.onclick = async function() {
        await saveExternalProductConfirmed(ean, fonte);
    };
}

async function saveExternalProductConfirmed(ean, fonte) {
    const nome = document.getElementById('editNome').value.trim();
    const marca = document.getElementById('editMarca').value.trim();
    const imagem = document.getElementById('editImagem').value.trim();
    const preco = document.getElementById('editPreco').value.trim();
    
    if (!nome) {
        showAlert('Por favor, informe o nome do produto', 'warning');
        return;
    }
    
    const productData = {
        ean: ean,
        nome: nome,
        marca: marca,
        imagem: imagem,
        preco: preco,
        fonte: fonte
    };
    
    updateStatus('Salvando no banco local...', 'scanning');
    
    const result = await saveToGoogleSheets(productData);
    
    if (result.success) {
        closeMainModal();
        updateStatus('✅ Produto salvo no banco local!', 'success');
        setTimeout(() => searchProduct(ean), 1000);
        carregarTodosProdutos();
    } else {
        updateStatus(`❌ Erro ao salvar: ${result.error || result.message}`, 'error');
    }
}

async function addToCartFromModal() {
    const precoAtual = document.getElementById('cartPrecoAtual').value;
    const precoAntigo = document.getElementById('cartPrecoAntigo').value;
    
    if (!precoAtual) {
        showAlert('Informe o preço atual do produto', 'warning');
        return;
    }
    
    if (!currentProduct) return;
    
    const produtoData = {
        ean: currentProduct.ean,
        nome: currentProduct.nome,
        preco: precoAtual,
        preco_antigo: precoAntigo || precoAtual
    };
    
    updateStatus('Adicionando ao carrinho...', 'scanning');
    
    try {
        const result = await adicionarAoCarrinho(produtoData, precoAtual, precoAntigo || precoAtual);
        
        if (result && result.success) {
            closeMainModal();
            updateStatus('✅ Produto adicionado ao carrinho!', 'success');
            switchTab('compras');
        } else {
            updateStatus('❌ Erro ao adicionar ao carrinho', 'error');
        }
    } catch (error) {
        console.error('Erro ao adicionar ao carrinho:', error);
        updateStatus('❌ Erro ao adicionar ao carrinho', 'error');
    }
}

function closeMainModal() {
    document.getElementById('mainModal').classList.remove('active');
    currentProduct = null;
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
        resumo.innerHTML = `💰 <strong>Economia total:</strong> R$ ${economia.toFixed(2)}`;
        carrinhoItens.appendChild(resumo);
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

// ========== FUNÇÕES DE TAB ==========
function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(section => {
        section.classList.remove('active');
        section.classList.add('hidden');
    });
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => {
        if (t.textContent.toLowerCase().includes(tab)) {
            t.classList.add('active');
        }
    });
    
    const sectionId = `${tab}Section`;
    const section = document.getElementById(sectionId);
    
    if (section) {
        section.classList.remove('hidden');
        section.classList.add('active');
    }
    
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
    return true;
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
window.openEditModal = openEditModal;
window.openAddToCartModal = openAddToCartModal;
window.closeMainModal = closeMainModal;
window.saveEditedProduct = saveEditedProduct;
window.saveExternalProduct = saveExternalProduct;
window.handleImageError = handleImageError;
window.switchTab = switchTab;
window.carregarCarrinho = carregarCarrinho;
window.limparCarrinho = limparCarrinho;
window.finalizarCompra = finalizarCompra;
window.removerDoCarrinho = removerDoCarrinho;
