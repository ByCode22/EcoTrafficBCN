const recentDetectionsElement = document.getElementById('recentDetections');
const feedbackContentElement = document.getElementById('feedback-content');
const MAX_RECENT_SCANS = 5;
let scans = [];
const socket = io(`http://${window.location.host}`);
let errorContainer = document.getElementById('error-container');

document.addEventListener('DOMContentLoaded', () => {
    initSocketIO();
    initializeConfidenceSlider();
    updateFeedback(null);
    renderDetections();
    injectZeroWaveUI();
});

function injectZeroWaveUI() {
    const rightCol = document.querySelector('.right-column');
    if (!rightCol) return;

    const zwPanel = document.createElement('div');
    zwPanel.className = 'container container-right';
    zwPanel.innerHTML = `
        <div style="padding:4px">
            <h2 style="font-size:14px;margin-bottom:12px;color:#333">🚗 ZeroWave — Vista del Vehículo</h2>

            <div style="background:#f0f4ff;border-radius:8px;padding:12px;margin-bottom:12px">
                <div style="font-size:11px;color:#555;margin-bottom:8px;font-weight:bold">MI VEHÍCULO</div>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                    <div id="ego-light" style="width:40px;height:40px;border-radius:50%;background:#ccc;transition:background .4s;flex-shrink:0"></div>
                    <div>
                        <div id="ego-status" style="font-size:13px;font-weight:bold;color:#333">—</div>
                        <div id="ego-lights-passed" style="font-size:11px;color:#888">Semáforos pasados: —</div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
                    <div style="background:white;border-radius:6px;padding:8px;text-align:center">
                        <div style="font-size:9px;color:#888">Parado ahora</div>
                        <div id="ego-current-stop" style="font-size:18px;font-weight:bold;color:#333">0s</div>
                    </div>
                    <div style="background:white;border-radius:6px;padding:8px;text-align:center">
                        <div style="font-size:9px;color:#888">Total parado</div>
                        <div id="ego-total-stop" style="font-size:18px;font-weight:bold;color:#e65100">0s</div>
                    </div>
                    <div style="background:white;border-radius:6px;padding:8px;text-align:center">
                        <div style="font-size:9px;color:#888">Paradas</div>
                        <div id="ego-stops-count" style="font-size:18px;font-weight:bold;color:#1565c0">0</div>
                    </div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px">
                <div style="background:#fff3e0;border-radius:6px;padding:8px;text-align:center">
                    <div style="font-size:9px;color:#888">Cola delante</div>
                    <div id="zw-queue" style="font-size:20px;font-weight:bold;color:#e65100">—</div>
                    <div style="font-size:9px;color:#888">coches</div>
                </div>
                <div style="background:#fce4ec;border-radius:6px;padding:8px;text-align:center">
                    <div style="font-size:9px;color:#888">Parados</div>
                    <div id="zw-stopped" style="font-size:20px;font-weight:bold;color:#c62828">—</div>
                    <div style="font-size:9px;color:#888">delante</div>
                </div>
                <div style="background:#e8f5e9;border-radius:6px;padding:8px;text-align:center">
                    <div style="font-size:9px;color:#888">Peatones</div>
                    <div id="zw-pedestrians" style="font-size:20px;font-weight:bold;color:#2e7d32">—</div>
                    <div style="font-size:9px;color:#888">detectados</div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px">
                <div style="background:#f5f5f5;border-radius:6px;padding:8px;text-align:center">
                    <div style="font-size:9px;color:#888">CO₂ ahorrado</div>
                    <div id="zw-co2" style="font-size:16px;font-weight:bold;color:#2e7d32">0 kg</div>
                </div>
                <div style="background:#f5f5f5;border-radius:6px;padding:8px;text-align:center">
                    <div style="font-size:9px;color:#888">Tiempo en ruta</div>
                    <div id="zw-elapsed" style="font-size:16px;font-weight:bold;color:#333">0s</div>
                </div>
            </div>

            <div id="congestion-alert" style="
                display:none;background:#fff3cd;border:1px solid #ffc107;
                border-radius:6px;padding:8px;font-size:11px;
                color:#856404;text-align:center;margin-bottom:10px
            ">⚠️ Congestión detectada delante</div>

            <div style="font-size:10px;color:#888;margin-bottom:6px">Densidad últimos 20s</div>
            <canvas id="density-chart" height="40" style="width:100%;border-radius:4px;background:#f5f5f5;margin-bottom:10px"></canvas>

            <div style="font-size:10px;color:#888;margin-bottom:6px">Cola de coches delante (orden)</div>
            <div id="cars-queue" style="max-height:160px;overflow-y:auto"></div>
        </div>
    `;
    rightCol.insertBefore(zwPanel, rightCol.firstChild);
}

function updateZeroWaveUI(data) {
    if (!document.getElementById('ego-light')) return;

    const ego = data.ego_vehicle || {};

    // Estado del vehículo propio
    const egoLight = document.getElementById('ego-light');
    const egoStatus = document.getElementById('ego-status');
    const egoLightsPassed = document.getElementById('ego-lights-passed');

    if (ego.is_stopped) {
        egoLight.style.background = '#f44336';
        egoLight.style.boxShadow = '0 0 14px #f4433688';
        egoStatus.textContent = '🛑 Parado en semáforo';
        egoStatus.style.color = '#c62828';
    } else {
        egoLight.style.background = '#4caf50';
        egoLight.style.boxShadow = '0 0 14px #4caf5088';
        egoStatus.textContent = '🚗 En movimiento';
        egoStatus.style.color = '#2e7d32';
    }

    egoLightsPassed.textContent = `Semáforos pasados: ${ego.traffic_lights_passed ?? 0}`;
    document.getElementById('ego-current-stop').textContent = (ego.current_stop_sec ?? 0) + 's';
    document.getElementById('ego-current-stop').style.color = ego.is_stopped ? '#f44336' : '#333';
    document.getElementById('ego-total-stop').textContent = (ego.total_stop_sec ?? 0) + 's';
    document.getElementById('ego-stops-count').textContent = ego.stops_count ?? 0;

    // Cola y peatones
    document.getElementById('zw-queue').textContent = data.queue_length ?? 0;
    document.getElementById('zw-stopped').textContent = data.cars_stopped_ahead ?? 0;
    document.getElementById('zw-pedestrians').textContent = data.pedestrians_detected ?? 0;
    document.getElementById('zw-co2').textContent = (data.co2_saved_kg ?? 0) + ' kg';
    document.getElementById('zw-elapsed').textContent = (data.elapsed_sec ?? 0) + 's';

    // Alerta
    document.getElementById('congestion-alert').style.display =
        data.congestion_alert ? 'block' : 'none';

    // Cola de coches ordenada
    const queueEl = document.getElementById('cars-queue');
    if (data.cars && data.cars.length > 0) {
        queueEl.innerHTML = data.cars.map((c, i) => {
            const stopColor = c.is_stopped ? '#f44336' : '#4caf50';
            const icon = c.is_stopped ? '🛑' : '🚗';
            return `
            <div style="
                display:flex;align-items:center;gap:8px;
                background:${c.is_stopped ? '#fff3f3' : '#f9fff9'};
                border:1px solid ${c.is_stopped ? '#ffcdd2' : '#c8e6c9'};
                border-radius:6px;padding:8px;margin-bottom:4px;font-size:11px
            ">
                <div style="
                    width:22px;height:22px;border-radius:50%;
                    background:#eee;display:flex;align-items:center;
                    justify-content:center;font-size:10px;font-weight:bold;
                    color:#555;flex-shrink:0
                ">${i + 1}</div>
                <div style="flex:1">
                    <div style="font-weight:bold">${icon} ${c.class} #${c.id}</div>
                    <div style="color:#aaa;font-size:10px">conf: ${c.confidence}</div>
                </div>
                <div style="text-align:right">
                    <div style="color:${stopColor};font-weight:bold">${c.current_stop_sec}s ahora</div>
                    <div style="color:#e65100;font-size:10px">total: ${c.total_stop_sec}s</div>
                    <div style="color:#1565c0;font-size:10px">${c.stops_count} paradas</div>
                </div>
            </div>
        `}).join('');
    } else {
        queueEl.innerHTML = '<div style="color:#aaa;text-align:center;padding:8px;font-size:11px">Sin coches delante</div>';
    }

    drawDensityChart(data.density_history || []);
}

function drawDensityChart(history) {
    const canvas = document.getElementById('density-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 200;
    const H = 40;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, W, H);
    if (history.length < 2) return;
    const colors = ['#4caf50', '#8bc34a', '#ff9800', '#f44336'];
    const barW = W / history.length;
    history.forEach((level, i) => {
        const barH = ((level + 1) / 4) * H;
        ctx.fillStyle = colors[Math.min(level, 3)] || '#ccc';
        ctx.fillRect(i * barW, H - barH, barW - 1, barH);
    });
}

function initSocketIO() {
    socket.on('connect', () => {
        if (errorContainer) {
            errorContainer.style.display = 'none';
            errorContainer.textContent = '';
        }
    });
    socket.on('disconnect', () => {
        if (errorContainer) {
            errorContainer.textContent = 'Connection to the board lost.';
            errorContainer.style.display = 'block';
        }
    });
    socket.on('detection', async (message) => {
        printDetection(message);
        renderDetections();
        updateFeedback(message);
        updateZeroWaveUI(message);
    });
}

function updateFeedback(detection) {
    if (!detection) {
        feedbackContentElement.innerHTML = `
            <img src="img/stars.svg" alt="Stars">
            <p class="feedback-text">System response will appear here</p>
        `;
        return;
    }
    const ego = detection.ego_vehicle || {};
    const stopped = ego.is_stopped;
    const color = stopped ? '#f44336' : '#4caf50';
    feedbackContentElement.innerHTML = `
        <div style="text-align:center;padding:10px">
            <div style="font-size:36px">${stopped ? '🛑' : '🚗'}</div>
            <div style="font-size:16px;font-weight:bold;color:${color};margin:4px 0">
                ${stopped ? 'Parado' : 'En movimiento'}
            </div>
            <div style="font-size:12px;color:#888">${detection.cars_ahead ?? 0} coches delante</div>
            <div style="font-size:12px;color:#888">${detection.pedestrians_detected ?? 0} peatones</div>
            <div style="font-size:11px;color:#aaa;margin-top:4px">CO₂: ${detection.co2_saved_kg ?? 0} kg</div>
        </div>
    `;
}

function printDetection(newDetection) {
    scans.unshift(newDetection);
    if (scans.length > MAX_RECENT_SCANS) { scans.pop(); }
}

function renderDetections() {
    recentDetectionsElement.innerHTML = '';
    if (scans.length === 0) {
        recentDetectionsElement.innerHTML = `
            <div class="no-recent-scans">
                <img src="./img/no-face.svg">
                No object detected yet
            </div>
        `;
        return;
    }
    scans.forEach((scan) => {
        const row = document.createElement('div');
        row.className = 'scan-container';
        const cellContainer = document.createElement('span');
        cellContainer.className = 'scan-cell-container cell-border';
        const ego = scan.ego_vehicle || {};
        const stopped = ego.is_stopped;
        const color = stopped ? '#f44336' : '#4caf50';
        const contentText = document.createElement('span');
        contentText.className = 'scan-content';
        contentText.innerHTML = `
            <span style="color:${color};font-weight:bold">${stopped ? '🛑 PARADO' : '🚗 MOVIMIENTO'}</span>
            — ${scan.cars_ahead ?? 0} coches delante
            — parado: ${ego.current_stop_sec ?? 0}s
        `;
        const timeText = document.createElement('span');
        timeText.className = 'scan-content-time';
        timeText.textContent = new Date(scan.timestamp).toLocaleTimeString('es-ES');
        cellContainer.appendChild(contentText);
        cellContainer.appendChild(timeText);
        row.appendChild(cellContainer);
        recentDetectionsElement.appendChild(row);
    });
}

function initializeConfidenceSlider() {
    const confidenceSlider = document.getElementById('confidenceSlider');
    const confidenceInput = document.getElementById('confidenceInput');
    const confidenceResetButton = document.getElementById('confidenceResetButton');
    confidenceSlider.addEventListener('input', updateConfidenceDisplay);
    confidenceInput.addEventListener('input', handleConfidenceInputChange);
    confidenceInput.addEventListener('blur', validateConfidenceInput);
    updateConfidenceDisplay();
    confidenceResetButton.addEventListener('click', (e) => {
        if (e.target.classList.contains('reset-icon') || e.target.closest('.reset-icon')) {
            resetConfidence();
        }
    });
}

function handleConfidenceInputChange() {
    const confidenceInput = document.getElementById('confidenceInput');
    const confidenceSlider = document.getElementById('confidenceSlider');
    let value = parseFloat(confidenceInput.value);
    if (isNaN(value)) value = 0.5;
    if (value < 0) value = 0;
    if (value > 1) value = 1;
    confidenceSlider.value = value;
    updateConfidenceDisplay();
}

function validateConfidenceInput() {
    const confidenceInput = document.getElementById('confidenceInput');
    let value = parseFloat(confidenceInput.value);
    if (isNaN(value)) value = 0.5;
    if (value < 0) value = 0;
    if (value > 1) value = 1;
    confidenceInput.value = value.toFixed(2);
    handleConfidenceInputChange();
}

function updateConfidenceDisplay() {
    const confidenceSlider = document.getElementById('confidenceSlider');
    const confidenceInput = document.getElementById('confidenceInput');
    const confidenceValueDisplay = document.getElementById('confidenceValueDisplay');
    const sliderProgress = document.getElementById('sliderProgress');
    const value = parseFloat(confidenceSlider.value);
    socket.emit('override_th', value);
    const percentage = (value - confidenceSlider.min) / (confidenceSlider.max - confidenceSlider.min) * 100;
    const displayValue = value.toFixed(2);
    confidenceValueDisplay.textContent = displayValue;
    if (document.activeElement !== confidenceInput) {
        confidenceInput.value = displayValue;
    }
    sliderProgress.style.width = percentage + '%';
    confidenceValueDisplay.style.left = percentage + '%';
}

function resetConfidence() {
    const confidenceSlider = document.getElementById('confidenceSlider');
    const confidenceInput = document.getElementById('confidenceInput');
    confidenceSlider.value = '0.5';
    confidenceInput.value = '0.50';
    updateConfidenceDisplay();
}