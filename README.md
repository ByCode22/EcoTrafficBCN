---

## Tecnología

| Componente | Tecnología |
|---|---|
| Hardware | Arduino UNO Q, webcam USB Brio 105 |
| EdgeAI | VideoObjectDetection (modelo COCO preentrenado) |
| Comunicación | MQTT (paho-mqtt) |
| Backend | Python con Arduino App Lab |
| Frontend | HTML / JS con WebSocket en tiempo real |
| Visualización | Dashboard web con gráficas en tiempo real |

---

## Sistema de alertas inteligentes

El vehículo solo envía alertas al semáforo cuando detecta situaciones que requieren intervención. Los umbrales se ajustan automáticamente según si es hora punta o no.

| Caso | Condición | Cooldown |
|---|---|---|
| 🚨 Emergencia (nivel 5) | Ambulancia, policía, bomberos | Sin cooldown |
| 🚌 Prioridad alta (nivel 4) | Bus, camión especial | 3s |
| ⏱️ Parado en semáforo | +20s fuera hora punta / +45s hora punta | 10s |
| ⏱️ Acumulado en ruta | +90s fuera hora punta / +180s hora punta | 10s |
| 🔴 Ruta penalizada | +4 paradas Y +60s acumulado | 10s |
| 🟡 Sin tráfico cruzando | +10s parado, 0 coches pasando | 10s |
| 📈 Cola creciendo | +3 coches en 5 segundos | 10s |
| ⚠️ Congestión sostenida | 10s seguidos con densidad alta | 10s |
| 📉 Eficiencia muy mala | <20% del tiempo en movimiento | 10s |

---

## JSON enviado por MQTT

Cuando se detecta una anomalía, el vehículo publica en el topic `ecoflow/cotxe`:

```json
