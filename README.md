# 🚦 EcoTraffic BCN

**EdgeAI Smart Traffic System** — Interhack BCN 2026 · Qualcomm EdgeAI Challenge · BCN Clima

EcoTraffic és una solució tecnològica que optimitza la mobilitat urbana i redueix l'impacte mediambiental a Barcelona mitjançant nodes Edge AI Vision que gestionen el trànsit en temps real, sense dependre del cloud.

---

## El problema

Els semàfors actuals funcionen amb cicles fixos, completament desconnectats de la realitat del trànsit. Això genera ones verdes trencades, semàfors en vermell sense cap vehicle creuant, cues innecessàries i emissions de CO₂ evitables per ralentí prolongat.

---

## La solució

EcoTraffic combina tres nodes intel·ligents que es comuniquen entre ells via MQTT:

El Node Cotxe detecta vehicles i calcula temps d'espera des de la perspectiva del vehicle. El Node Semàfor rep alertes i decideix quan canviar el cicle per optimitzar el flux. El Dashboard visualitza tot en temps real amb mapes, mètriques i CO₂ estalviat.

Tota la intel·ligència corre localment als dispositius Arduino UNO Q, sense dependre del cloud, amb latència mínima i cost d'infraestructura zero.

---

## Tecnologia

| Component | Tecnologia |
|---|---|
| Hardware | Arduino UNO Q (Qualcomm QRB2210 NPU), webcam USB Brio 105 |
| EdgeAI Cotxe | VideoObjectDetection model COCO preentrenat |
| EdgeAI Semàfor | FOMO MobileNetV2 0.1 — 9ms latència, 72.2% F1 Score |
| Comunicació | MQTT (paho-mqtt, broker Mosquitto) |
| Backend | Python 3.13 amb Arduino App Lab |
| Frontend | HTML5, CSS3, JavaScript ES6, Leaflet.js |

---

## Arquitectura del sistema

Node Cotxe (Arduino UNO Q + webcam) detecta vehicles amb EdgeAI, fa tracking per posició entre frames, calcula temps d'espera individuals i acumulats, i envia alertes MQTT només quan hi ha una anomalia.

El broker MQTT (172.20.10.3:1883) rep les alertes al topic ecoflow/cotxe i les distribueix.

El Node Semàfor (Arduino UNO Q + webcam) rep les alertes, detecta vehicles i vianants localment amb FOMO, calcula un score de demanda dinàmic, gestiona prioritats per emergències i controla els LEDs RGB.

El Dashboard web visualitza l'estat de tots els nodes en temps real amb mapa interactiu, mètriques globals i CO₂ estalviat.

---

## Node Cotxe — Sistema d'alertes intel·ligents

El vehicle només envia alertes al semàfor quan detecta situacions que requereixen intervenció. Els llindars s'ajusten automàticament segons si és hora punta o no.

| Cas | Condició | Cooldown |
|---|---|---|
| 🚨 Emergència nivell 5 | Ambulància, policia, bombers | Sense cooldown |
| 🚌 Prioritat alta nivell 4 | Bus, camió especial | 3s |
| ⏱️ Aturat al semàfor | +20s fora hora punta / +45s hora punta | 10s |
| ⏱️ Acumulat a la ruta | +90s fora hora punta / +180s hora punta | 10s |
| 🔴 Ruta penalitzada | +4 parades i +60s acumulat | 10s |
| 🟡 Sense trànsit creuant | +10s aturat, 0 cotxes passant | 10s |
| 📈 Cua creixent | +3 cotxes en 5 segons | 10s |
| ⚠️ Congestió sostinguda | 10s seguits amb densitat alta | 10s |
| 📉 Eficiència molt baixa | Menys del 20% del temps en moviment | 10s |

---

## Node Semàfor — Lògica de decisió

Score de demanda: cotxes x2 + vianants x3 + temps espera x0.5 + cotxes aturats davant x1.5 + temps aturat ego x0.3 + congestió +5

| Tipus vehicle | Nivell | Comportament |
|---|---|---|
| Emergència / Ambulància | 5 o més | VERD immediat 10s |
| Policia | 4 | Score +4 |
| Bus | 3 | Score +3 |
| Turisme | 1-2 | Score normal |
| Cap cotxe | 0 | VERMELL |

---

## Topics MQTT

| Topic | Qui publica | Contingut |
|---|---|---|
| ecoflow/cotxe | Node Cotxe | Alertes amb dades de trànsit |
| ecoflow/semaforo | Node Semàfor | Estat del semàfor |

---

## Hores punta configurades

| Franja | Descripció |
|---|---|
| 08:00 - 09:59 | Matí — anada a la feina |
| 14:00 - 15:59 | Migdia — sortida a dinar |
| 18:00 - 20:59 | Tarda — tornada a casa |

---

## Nodes al Dashboard

| Node | Ubicació | IP |
|---|---|---|
| Node 01 | Casp / Pau Claris | 10.63.0.136 |
| Node 02 | Casp / Llúria | Per assignar |
| Node 03 | Casp / Bruc | Per assignar |

---

## Estructura del repositori

- coche/main.py — detecció EdgeAI, tracking, alertes MQTT
- coche/assets/app.js — frontend WebSocket del node cotxe
- coche/assets/index.html — vista en temps real del node cotxe
- semaforo/main.py — lògica green wave, gestió de prioritats, LEDs
- semaforo/assets/app.js — frontend WebSocket del node semàfor
- semaforo/assets/index.html — vista en temps real del node semàfor
- dashboard/index.html — pàgina principal amb mapa i mètriques globals
- dashboard/app.js — lògica de connexió i visualització del dashboard

---

## Instal·lació

pip install paho-mqtt

El frontend de cada node és accessible a http://IP_UNO_Q:7000

---

## Impacte potencial

- Reducció del 30% en temps d'espera per vehicle
- Reducció del 18% en emissions de partícules contaminants als nodes monitoritzats
- Reducció prevista del 25% d'emissions contaminants per al 2030 amb implementació a escala urbana
- Menys de 50€ de cost per node
- Sense infraestructura centralitzada — cada node és autònom
- Privacitat by design — les imatges mai surten del dispositiu
- Edge computing — zero latència cloud, funciona sense internet

---

## Equip

Desenvolupat en 24 hores durant Interhack BCN 2026 — Qualcomm EdgeAI Challenge · BCN Clima.

| Rol | Descripció |
|---|---|
| Edge Cotxe | Detecció EdgeAI, tracking, alertes MQTT |
| Edge Semàfor | Lògica green wave, gestió de prioritats, LEDs |
| Dashboard | Visualització web, mapa interactiu, mètriques globals |
| Coordinació | Arquitectura, integració, pitch |