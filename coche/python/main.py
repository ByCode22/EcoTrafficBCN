from arduino.app_utils import App
from arduino.app_bricks.web_ui import WebUI
from arduino.app_bricks.video_objectdetection import VideoObjectDetection
from datetime import datetime, UTC
import time, math, socket as sock, json, threading
import paho.mqtt.client as mqtt

ui = WebUI()
detection_stream = VideoObjectDetection(confidence=0.5, debounce_sec=0.0)

# ── MQTT ────────────────────────────────────────────────
MQTT_BROKER    = "172.20.10.3"
MQTT_PORT      = 1883
MQTT_TOPIC_SUB = "ecoflow/cotxe"
MQTT_TOPIC_PUB = "ecoflow/cotxe"

mqtt_priorities = {}
mqtt_lock       = threading.Lock()

def on_connect(client, userdata, flags, rc):
    print(f"✅ MQTT conectado (rc={rc})")
    client.subscribe(MQTT_TOPIC_SUB)

def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload.decode())
        vid  = data.get("vehicle_id", "unknown")
        pri  = int(data.get("priority", 2))
        with mqtt_lock:
            mqtt_priorities[vid] = pri
        print(f"📡 MQTT recibido: {vid} → prioridad {pri}")
    except Exception as e:
        print(f"❌ MQTT error: {e}")

mqtt_client = mqtt.Client()
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

def start_mqtt():
    try:
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
        mqtt_client.loop_forever()
    except Exception as e:
        print(f"❌ No se pudo conectar al broker MQTT: {e}")

threading.Thread(target=start_mqtt, daemon=True).start()

# ── PRIORIDADES ─────────────────────────────────────────
PRIORITY_LABELS = {
    5: "emergencia",
    4: "transporte",
    3: "vulnerable",
    2: "normal",
    1: "desconocido"
}

def get_max_priority():
    with mqtt_lock:
        if not mqtt_priorities:
            return 2, "normal"
        max_pri = max(mqtt_priorities.values())
        return max_pri, PRIORITY_LABELS.get(max_pri, "normal")

# ── CLASES ──────────────────────────────────────────────
CAR_CLASSES     = ["car", "truck", "bus", "motorcycle"]
ALLOWED_CLASSES = CAR_CLASSES

# ── TRACKER ─────────────────────────────────────────────
trackers       = {}
next_id        = 0
MAX_DIST       = 50
MAX_LOST       = 3.0
STOP_THRESHOLD = 12
STOP_MIN_SEC   = 2.0

ego_vehicle = {
    "is_stopped":            False,
    "stop_since":            None,
    "current_stop_sec":      0.0,
    "total_stop_sec":        0.0,
    "stops_count":           0,
    "traffic_lights_passed": 0
}

session_start        = time.time()
co2_saved            = 0.0
density_history      = []
queue_history        = []
QUEUE_HISTORY_MAX    = 10
QUEUE_GROWTH_THRESH  = 3

# ── COOLDOWNS ───────────────────────────────────────────
ALERT_COOLDOWN_SEC  = 10
ALERT_COOLDOWN_HIGH = 3
last_alert_time     = 0

# ── HORA PUNTA ──────────────────────────────────────────
def is_rush_hour():
    hour = datetime.now().hour
    return (8 <= hour < 10) or (14 <= hour < 16) or (18 <= hour < 21)

def get_thresholds():
    if is_rush_hour():
        return {
            "stop_sec":         45,
            "no_traffic_sec":   20,
            "total_stop_sec":   180,
            "stops_count":      7,
            "stops_time_combo": 120
        }
    else:
        return {
            "stop_sec":         20,
            "no_traffic_sec":   10,
            "total_stop_sec":   90,
            "stops_count":      4,
            "stops_time_combo": 60
        }

# ── EFICIENCIA DE RUTA ───────────────────────────────────
def get_route_efficiency(total_stop_sec, elapsed_sec):
    if elapsed_sec == 0:
        return 1.0
    efficiency = 1 - (total_stop_sec / elapsed_sec)
    return round(max(0.0, min(1.0, efficiency)), 2)

def get_efficiency_label(efficiency):
    if efficiency >= 0.8: return "óptima"
    if efficiency >= 0.6: return "buena"
    if efficiency >= 0.4: return "regular"
    if efficiency >= 0.2: return "mala"
    return "muy mala"

def get_node_id():
    try:
        return sock.gethostbyname(sock.gethostname())
    except:
        return "vehicle_01"

def distance(a, b):
    return math.sqrt((a["cx"] - b["cx"])**2 + (a["cy"] - b["cy"])**2)

def match_or_create(cx, cy, cls, now):
    global next_id
    best_id   = None
    best_dist = MAX_DIST

    for tid, t in trackers.items():
        if t["class"] != cls:
            continue
        d = distance({"cx": cx, "cy": cy}, t)
        if d < best_dist:
            best_dist = d
            best_id   = tid

    if best_id is not None:
        t     = trackers[best_id]
        moved = distance({"cx": cx, "cy": cy}, t)
        if moved < STOP_THRESHOLD:
            if t["stop_since"] is None:
                t["stop_since"] = now
        else:
            if t["stop_since"] is not None:
                duration = now - t["stop_since"]
                if duration >= STOP_MIN_SEC:
                    t["total_stop_sec"] += duration
                    t["stops_count"]    += 1
                t["stop_since"] = None
        t["cx"]        = cx
        t["cy"]        = cy
        t["last_seen"] = now
        return best_id
    else:
        new_id = next_id
        next_id += 1
        trackers[new_id] = {
            "cx":             cx,
            "cy":             cy,
            "class":          cls,
            "first_seen":     now,
            "last_seen":      now,
            "stop_since":     None,
            "total_stop_sec": 0.0,
            "stops_count":    0
        }
        return new_id

def cleanup_lost(now):
    lost = [tid for tid, t in trackers.items()
            if now - t["last_seen"] > MAX_LOST]
    for tid in lost:
        del trackers[tid]

def update_ego_vehicle(stopped_cars, now):
    ego_stopped = len(stopped_cars) > 0
    if ego_stopped:
        if ego_vehicle["stop_since"] is None:
            ego_vehicle["stop_since"] = now
            ego_vehicle["is_stopped"] = True
        ego_vehicle["current_stop_sec"] = round(now - ego_vehicle["stop_since"], 1)
    else:
        if ego_vehicle["stop_since"] is not None:
            duration = now - ego_vehicle["stop_since"]
            if duration >= STOP_MIN_SEC:
                ego_vehicle["total_stop_sec"]        += duration
                ego_vehicle["stops_count"]           += 1
                ego_vehicle["traffic_lights_passed"] += 1
            ego_vehicle["stop_since"]       = None
            ego_vehicle["current_stop_sec"] = 0.0
            ego_vehicle["is_stopped"]       = False

def get_queue_position(cars):
    return sorted(cars, key=lambda c: c["cy"], reverse=True)

def check_queue_growth():
    if len(queue_history) < QUEUE_HISTORY_MAX:
        return False
    return (queue_history[-1] - queue_history[0]) >= QUEUE_GROWTH_THRESH

def should_send_alert(payload, now):
    global last_alert_time

    ego        = payload.get("ego_vehicle", {})
    priority   = payload.get("priority", {})
    level      = priority.get("max_level", 0)
    thresholds = get_thresholds()
    rush       = is_rush_hour()

    current_stop = ego.get("current_stop_sec", 0)
    total_stop   = ego.get("total_stop_sec", 0)
    stops_count  = ego.get("stops_count", 0)
    moving_ahead = payload.get("cars_moving_ahead", 0)
    queue_length = payload.get("queue_length", 0)
    elapsed_sec  = payload.get("elapsed_sec", 1)
    efficiency   = get_route_efficiency(total_stop, elapsed_sec)

    # ── NIVEL 5: EMERGENCIA ABSOLUTA ────────────────────
    # Sin cooldown, alerta inmediata siempre
    if level >= 5:
        last_alert_time = now
        return True, f"🚨 EMERGENCIA — {priority.get('label')} en cola"

    # ── NIVEL 4: PRIORIDAD ALTA ──────────────────────────
    # Cooldown reducido a 3s
    if level >= 4:
        if now - last_alert_time >= ALERT_COOLDOWN_HIGH:
            last_alert_time = now
            return True, f"🚌 vehículo prioritario: {priority.get('label')}"

    # ── COOLDOWN NORMAL ──────────────────────────────────
    if now - last_alert_time < ALERT_COOLDOWN_SEC:
        return False, None

    # ── CASO 1: Parado mucho tiempo en semáforo actual ───
    if current_stop >= thresholds["stop_sec"]:
        rush_label = " (hora punta)" if rush else ""
        return True, f"⏱️ parado {current_stop}s en semáforo{rush_label}"

    # ── CASO 2: Acumulado alto en toda la ruta ───────────
    if total_stop >= thresholds["total_stop_sec"]:
        return True, f"⏱️ acumulado {total_stop}s parado en ruta"

    # ── CASO 3: Ruta muy penalizada ──────────────────────
    if (stops_count >= thresholds["stops_count"] and
            total_stop >= thresholds["stops_time_combo"]):
        return True, f"🔴 ruta penalizada: {stops_count} paradas, {total_stop}s acumulado"

    # ── CASO 4: Parado sin tráfico cruzando ─────────────
    if current_stop >= thresholds["no_traffic_sec"] and moving_ahead == 0:
        return True, f"🟡 parado {current_stop}s sin tráfico cruzando"

    # ── CASO 5: Cola creciendo rápidamente ───────────────
    if check_queue_growth():
        return True, f"📈 cola creciendo rápido: {queue_length} coches"

    # ── CASO 6: Congestión sostenida ────────────────────
    if payload.get("congestion_alert", False):
        rush_label = " (hora punta)" if rush else ""
        return True, f"⚠️ congestión sostenida{rush_label}"

    # ── CASO 7: Eficiencia de ruta muy mala ─────────────
    if efficiency < 0.2 and elapsed_sec > 60:
        return True, f"📉 eficiencia de ruta muy mala: {int(efficiency * 100)}%"

    return False, None

def send_detections_to_ui(detections: dict):
    global co2_saved, density_history, last_alert_time
    now       = time.time()
    cars_data = []

    for class_name, values in detections.items():
        if class_name not in ALLOWED_CLASSES:
            continue
        for value in values:
            x1, y1, x2, y2 = value.get("bounding_box_xyxy", (0, 0, 0, 0))
            cx   = (x1 + x2) / 2
            cy   = (y1 + y2) / 2
            conf = round(value.get("confidence", 0), 2)

            tid = match_or_create(cx, cy, class_name, now)
            t   = trackers[tid]

            current_stop = 0.0
            is_stopped   = False
            if t["stop_since"] is not None:
                current_stop = round(now - t["stop_since"], 1)
                is_stopped   = current_stop >= STOP_MIN_SEC

            total_stop = round(
                t["total_stop_sec"] + (current_stop if is_stopped else 0), 1
            )

            cars_data.append({
                "id":                tid,
                "class":             class_name,
                "confidence":        conf,
                "cx":                round(cx, 1),
                "cy":                round(cy, 1),
                "is_stopped":        is_stopped,
                "current_stop_sec":  current_stop if is_stopped else 0,
                "total_stop_sec":    total_stop,
                "stops_count":       t["stops_count"],
                "time_in_frame_sec": round(now - t["first_seen"], 1)
            })

    cleanup_lost(now)

    cars_in_queue = get_queue_position(cars_data)
    stopped_cars  = [c for c in cars_data if c["is_stopped"]]
    moving_cars   = [c for c in cars_data if not c["is_stopped"]]

    update_ego_vehicle(stopped_cars, now)

    max_priority, priority_label = get_max_priority()

    co2_rate   = 0.004 if ego_vehicle["is_stopped"] else 0.0008
    co2_saved += co2_rate

    level = min(len(cars_data), 3)
    density_history.append(level)
    if len(density_history) > 60:
        density_history.pop(0)

    queue_history.append(len(cars_in_queue))
    if len(queue_history) > QUEUE_HISTORY_MAX:
        queue_history.pop(0)

    congestion_alert = (
        len(density_history) >= 10 and
        all(d >= 2 for d in density_history[-10:])
    )

    elapsed_sec = round(now - session_start)
    total_stop  = round(ego_vehicle["total_stop_sec"], 1)
    efficiency  = get_route_efficiency(total_stop, elapsed_sec)

    with mqtt_lock:
        active_priorities = dict(mqtt_priorities)

    payload = {
        "node_id":     get_node_id(),
        "timestamp":   datetime.now(UTC).isoformat(),
        "elapsed_sec": elapsed_sec,
        "rush_hour":   is_rush_hour(),

        "ego_vehicle": {
            "is_stopped":            ego_vehicle["is_stopped"],
            "current_stop_sec":      ego_vehicle["current_stop_sec"],
            "total_stop_sec":        total_stop,
            "stops_count":           ego_vehicle["stops_count"],
            "traffic_lights_passed": ego_vehicle["traffic_lights_passed"]
        },

        "route_efficiency": {
            "score":   efficiency,
            "label":   get_efficiency_label(efficiency),
            "percent": int(efficiency * 100)
        },

        "priority": {
            "max_level":       max_priority,
            "label":           priority_label,
            "active_vehicles": active_priorities
        },

        "cars_ahead":         len(cars_data),
        "cars_stopped_ahead": len(stopped_cars),
        "cars_moving_ahead":  len(moving_cars),
        "queue_length":       len(cars_in_queue),
        "cars":               cars_in_queue,

        "co2_saved_kg":     round(co2_saved, 4),
        "density_history":  density_history[-20:],
        "congestion_alert": congestion_alert
    }

    # Enviar al frontend siempre
    ui.send_message("detection", message=payload)

    # Publicar por MQTT solo si hay anomalía
    should_alert, reason = should_send_alert(payload, now)
    if should_alert:
        last_alert_time = now
        alert_payload   = {**payload, "alert_reason": reason}
        try:
            mqtt_client.publish(
                MQTT_TOPIC_PUB,
                json.dumps(alert_payload)
            )
            print(f"🚨 Alerta MQTT enviada: {reason}")
        except Exception as e:
            print(f"❌ Error publicando MQTT: {e}")

detection_stream.on_detect_all(send_detections_to_ui)
App.run()