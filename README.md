# 🚦 EcoTraffic BCN

**EdgeAI Smart Traffic System** — Interhack BCN 2026 · Qualcomm EdgeAI Challenge · BCN Clima

EcoTraffic is a technological solution that optimizes urban mobility and reduces environmental impact in Barcelona through Edge AI Vision nodes that manage traffic in real time — without relying on the cloud.

> Built in **24 hours** at Interhack BCN 2026 — Qualcomm EdgeAI Challenge · BCN Clima track.

---

## The Problem

Current traffic lights operate on fixed cycles, completely disconnected from real traffic conditions. This causes broken green waves, red lights with no vehicles crossing, unnecessary queues, and avoidable CO₂ emissions from prolonged idling.

---

## The Solution

EcoTraffic combines three intelligent nodes that communicate via MQTT:

- **Vehicle Node** detects vehicles and calculates waiting times from the vehicle's perspective.
- **Traffic Light Node** receives alerts and decides when to change the cycle to optimize flow.
- **Dashboard** visualizes everything in real time — interactive map, global metrics, and CO₂ saved.

All intelligence runs locally on Arduino UNO Q devices. No cloud dependency, minimum latency, zero infrastructure cost.

---

## Tech Stack

| Component | Technology |
|---|---|
| Hardware | Arduino UNO Q (Qualcomm QRB2210 NPU), USB Webcam Brio 105 |
| EdgeAI (Vehicle) | YoloX-Nano (COCO dataset, 80 classes) |
| EdgeAI (Traffic Light) | YoloX-Nano (COCO dataset, 80 classes) |
| Communication | MQTT (paho-mqtt, Mosquitto broker) |
| Backend | Python 3.13 with Arduino App Lab |
| Frontend | HTML5, CSS3, JavaScript ES6, Leaflet.js |

---

## System Architecture

```
[Vehicle Node]          [Traffic Light Node]
Arduino UNO Q           Arduino UNO Q
+ Webcam                + Webcam
+ YoloX-Nano            + YoloX-Nano (FOMO)
+ Tracking              + Demand score
+ MQTT alerts    ──→    + Priority logic
                        + RGB LED control
         ↓                      ↓
              [MQTT Broker]
              Mosquitto @ 172.20.10.3:1883
                        ↓
              [Web Dashboard]
              Real-time map + metrics + CO₂ saved
```

The Vehicle Node detects vehicles via EdgeAI, tracks them by position between frames, calculates individual and cumulative waiting times, and sends MQTT alerts only when an anomaly is detected.

The Traffic Light Node receives alerts, detects vehicles and pedestrians locally with FOMO, calculates a dynamic demand score, handles emergency priorities, and controls the RGB LEDs.

---

## Vehicle Node — Smart Alert System

Alerts are only sent when the situation requires intervention. Thresholds adjust automatically based on peak hours.

| Case | Condition | Cooldown |
|---|---|---|
| 🚨 Emergency level 5 | Ambulance, police, fire truck | No cooldown |
| 🚌 High priority level 4 | Bus, special vehicle | 3s |
| ⏱️ Stopped at light | +20s off-peak / +45s peak hour | 10s |
| ⏱️ Accumulated route delay | +90s off-peak / +180s peak hour | 10s |
| 🔴 Penalized route | +4 stops and +60s accumulated | 10s |
| 🟡 No crossing traffic | +10s stopped, 0 cars passing | 10s |
| 📈 Growing queue | +3 cars in 5 seconds | 10s |
| ⚠️ Sustained congestion | 10s with high density | 10s |
| 📉 Very low efficiency | Less than 20% of time moving | 10s |

---

## Traffic Light Node — Decision Logic

**Demand score:** `cars×2 + pedestrians×3 + wait_time×0.5 + stopped_cars×1.5 + ego_wait×0.3 + congestion+5`

| Vehicle type | Level | Behavior |
|---|---|---|
| Emergency / Ambulance | 5+ | Immediate GREEN for 10s |
| Police | 4 | Score +4 |
| Bus | 3 | Score +3 |
| Car | 1–2 | Normal score |
| No vehicles | 0 | RED |

---

## MQTT Topics

| Topic | Publisher | Content |
|---|---|---|
| `ecoflow/cotxe` | Vehicle Node | Traffic alerts with data |
| `ecoflow/semaforo` | Traffic Light Node | Traffic light state |

---

## Peak Hours Configuration

| Time slot | Description |
|---|---|
| 08:00 – 09:59 | Morning commute |
| 14:00 – 15:59 | Lunch break |
| 18:00 – 20:59 | Evening commute |

---

## Repository Structure

```
├── coche/
│   ├── main.py              # EdgeAI detection, tracking, MQTT alerts
│   └── assets/
│       ├── app.js           # Vehicle node WebSocket frontend
│       └── index.html       # Vehicle node real-time view
├── semaforo/
│   ├── main.py              # Green wave logic, priority management, LEDs
│   └── assets/
│       ├── app.js           # Traffic light node WebSocket frontend
│       └── index.html       # Traffic light node real-time view
└── dashboard/
    ├── index.html           # Main dashboard with interactive map
    └── app.js               # Connection logic and global metrics visualization
```

---

## Setup

```bash
pip install paho-mqtt
```

Each node's frontend is accessible at `http://<UNO_Q_IP>:7000`

---

## Potential Impact

- **30% reduction** in average vehicle waiting time
- **18% reduction** in particulate emissions at monitored nodes
- **25% projected reduction** in pollutant emissions by 2030 at urban scale
- **Under €50** per node
- No centralized infrastructure — each node is autonomous
- **Privacy by design** — images never leave the device
- **Edge computing** — zero cloud latency, works without internet

---

## Team

Developed in 24 hours at Interhack BCN 2026.

| Role | Description |
|---|---|
| Edge Vehicle | EdgeAI detection, tracking, MQTT alerts |
| Edge Traffic Light | Green wave logic, priority management, LEDs |
| Dashboard | Web visualization, interactive map, global metrics |
| Coordination | Architecture, integration, pitch |
