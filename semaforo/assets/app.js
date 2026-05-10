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

    const confidencePopoverText = "Minimum confidence score for detected objects. Lower values show more results but may include false positives.";
    const feedbackPopoverText = "State of the traffic light based on camera detections and car node data.";

    document.querySelectorAll('.info-btn.confidence').forEach(img => {
        const popover = img.nextElementSibling;
        img.addEventListener('mouseenter', () => { popover.textContent = confidencePopoverText; popover.style.display = 'block'; });
        img.addEventListener('mouseleave', () => { popover.style.display = 'none'; });
    });

    document.querySelectorAll('.info-btn.feedback').forEach(img => {
        const popover = img.nextElementSibling;
        img.addEventListener('mouseenter', () => { popover.textContent = feedbackPopoverText; popover.style.display = 'block'; });
        img.addEventListener('mouseleave', () => { popover.style.display = 'none'; });
    });
});

function initSocketIO() {
    socket.on('connect', () => {
        if (errorContainer) {
            errorContainer.style.display = 'none';
            errorContainer.textContent = '';
        }
    });

    socket.on('disconnect', () => {
        if (errorContainer) {
            errorContainer.textContent = 'Connection to the board lost. Please check the connection.';
            errorContainer.style.display = 'block';
        }
    });

    socket.on('detection', async (message) => {
        const ALLOWED = ['car', 'person', 'cell phone'];
        if (!ALLOWED.includes(message.content)) {
            return;
        }
        if (message.content === 'cell phone') {
            message.content = 'car';
        }
        printDetection(message);
        renderDetections();
    });

    socket.on('semaforo', (data) => {
        updateSemaforo(data);
        if (data.cotxe_connectat) {
            printMqtt(data);
        }
    });
}

function updateFeedback(detection) {}

function updateSemaforo(data) {
    const COLORS = { rojo: "#e53935", amarillo: "#fdd835", verde: "#43a047" };
    const ICONS = { rojo: "🔴", amarillo: "🟡", verde: "🟢" };
    const color = COLORS[data.estado] || "#ccc";
    const icon = ICONS[data.estado] || "⚪";
    feedbackContentElement.innerHTML = `
        <div style="width:100%; font-family: 'Open Sans', sans-serif;">

            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <span style="font-size:28px;">${icon}</span>
                <span style="font-size:22px; font-weight:bold; color:${color};">
                    ${data.estado.toUpperCase()}
                </span>
                <span style="font-size:13px; color:#5D6A6B;">
                    Score: <b>${data.score}</b>
                </span>
            </div>

            ${data.emergency ? `
            <div style="background:#fff3e0; border-radius:8px; padding:8px 12px; margin-bottom:12px; text-align:center; font-weight:bold; color:#e65100;">
                🚨 EMERGÈNCIA ACTIVA — Via lliure
            </div>` : ''}

            <div style="display:flex; gap:12px; margin-bottom:12px;">
                <div style="flex:1; background:#f5f5f5; border-radius:12px; padding:12px; text-align:center;">
                    <div style="font-size:24px;">🚗</div>
                    <div style="font-size:28px; font-weight:bold; color:#2C353A;">${data.coches}</div>
                    <div style="font-size:11px; color:#5D6A6B;">cotxes</div>
                    <div style="margin-top:8px; font-size:13px; color:#008184;">⏱ ${data.espera_coches}s</div>
                </div>
                <div style="flex:1; background:#f5f5f5; border-radius:12px; padding:12px; text-align:center;">
                    <div style="font-size:24px;">🚶</div>
                    <div style="font-size:28px; font-weight:bold; color:#2C353A;">${data.peatones}</div>
                    <div style="font-size:11px; color:#5D6A6B;">vianants</div>
                    <div style="margin-top:8px; font-size:13px; color:#008184;">⏱ ${data.espera_peatones}s</div>
                </div>
            </div>

            <div style="background:#f0f9f0; border-radius:12px; padding:12px; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:13px; color:#2C353A;">🌱 CO₂ estalviat</span>
                <span style="font-size:16px; font-weight:bold; color:#43a047;">${(data.co2_total * 1000).toFixed(1)} g</span>
            </div>

            <div style="background:#f5f5f5; border-radius:12px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:13px; color:#2C353A;">📡 Node cotxe</span>
                <span style="font-size:13px; font-weight:bold; color:${data.cotxe_connectat ? '#43a047' : '#e53935'};">
                    ${data.cotxe_connectat ? '✅ Connectat' : '❌ Desconnectat'}
                </span>
            </div>

        </div>
    `;
}

function printMqtt(data) {
    const list = document.getElementById('mqttMessages');
    if (!list) return;

    const MAX = 5;
    const row = document.createElement('div');
    row.className = 'scan-cell-container cell-border';

    const priority = data.priority_label || '—';
    const cars = data.cars_stopped_ahead ?? '—';
    const stop_sec = data.ego_stop_sec ?? '—';
    const co2 = data.co2_total ? (data.co2_total * 1000).toFixed(1) + 'g' : '—';
    const time = new Date().toLocaleTimeString('ca-ES');

    row.innerHTML = `
        <span class="scan-content">
            🚗 ${cars} parats | ⏱ ${stop_sec}s | 🌱 ${co2} | ${priority}
        </span>
        <span class="scan-content-time">${time}</span>
    `;

    list.insertBefore(row, list.firstChild);
    while (list.children.length > MAX) {
        list.removeChild(list.lastChild);
    }
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

        const contentText = document.createElement('span');
        contentText.className = 'scan-content';
        const value = scan.confidence;
        const result = Math.floor(value * 1000) / 10;
        contentText.innerHTML = `${result}% - ${scan.content}`;

        const timeText = document.createElement('span');
        timeText.className = 'scan-content-time';
        timeText.textContent = new Date(scan.timestamp).toLocaleString('it-IT').replace(',', ' -');

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