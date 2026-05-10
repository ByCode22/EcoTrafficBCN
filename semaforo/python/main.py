from arduino.app_utils import App, Bridge
from arduino.app_bricks.web_ui import WebUI
from arduino.app_bricks.video_objectdetection import VideoObjectDetection
from datetime import datetime, UTC
import time
import json
import threading
import paho.mqtt.client as mqtt

ui = WebUI()
detection_stream = VideoObjectDetection(confidence=0.7, debounce_sec=1.0)

BROKER_IP = "broker.hivemq.com"
BROKER_PORT = 1883
TOPIC_COTXE = "ecoflow/cotxe"

TEMPS_VERD_MIN = 10
TEMPS_GROC = 3

CLASSES_INTERES = {"car", "person", "cell phone"}
current_counts = {"coche": 0, "peaton": 0}
wait_since = {"coche": None, "peaton": None}
estado_actual = "rojo"
last_change = time.time()
last_ui_update = 0
co2_total = 0.0
car_edge_data = {}
emergency_active = False
transitioning = False

def on_mqtt_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"[MQTT] ✅ Connectat al broker {BROKER_IP}:{BROKER_PORT}")
        client.subscribe(TOPIC_COTXE)
    else:
        print(f"[MQTT] ❌ Error connexió: codi {rc}")

def on_mqtt_message(client, userdata, msg):
    global car_edge_data, co2_total
    try:
        car_edge_data = json.loads(msg.payload.decode())
        co2_total += car_edge_data.get("co2_saved_kg", 0)
        print(f"[MQTT] Rebut: priority={car_edge_data.get('priority',{}).get('label','—')}")
        max_priority = car_edge_data.get("priority", {}).get("max_level", 1)
        if max_priority >= 5:
            activar_emergencia()
    except Exception as e:
        print(f"[MQTT] Error: {e}")

def activar_emergencia():
    global emergency_active
    if emergency_active:
        return
    emergency_active = True
    print("[SEMAFORO] 🚨 EMERGÈNCIA — verd immediat")
    set_semaforo("verde", force=True)
    threading.Timer(10.0, end_emergency).start()

def end_emergency():
    global emergency_active
    emergency_active = False
    print("[SEMAFORO] Emergència acabada")

mqtt_client = mqtt.Client()
mqtt_client.on_connect = on_mqtt_connect
mqtt_client.on_message = on_mqtt_message
try:
    mqtt_client.connect(BROKER_IP, BROKER_PORT, 60)
    print(f"[MQTT] Connectant a {BROKER_IP}...")
except Exception as e:
    print(f"[MQTT] ❌ No s'ha pogut connectar: {e}")
mqtt_client.loop_start()

def get_wait_time(key):
    if wait_since[key] is None:
        return 0
    return round(time.time() - wait_since[key], 1)

def set_semaforo(estado, force=False):
    global estado_actual, last_change, transitioning
    if transitioning and not force:
        return
    if estado == estado_actual and not force:
        return
    if estado == "rojo" and estado_actual == "verde" and not force:
        iniciar_transicio_groc()
        return

    estado_actual = estado
    last_change = time.time()
    Bridge.call(f"set_{estado}")
    print(f"[SEMAFORO] {estado.upper()}")

def iniciar_transicio_groc():
    global transitioning
    if transitioning:
        return
    transitioning = True
    set_semaforo("amarillo", force=True)
    threading.Timer(TEMPS_GROC, fi_transicio_groc).start()

def fi_transicio_groc():
    global transitioning
    transitioning = False
    set_semaforo("rojo", force=True)

def decidir_estat():
    if emergency_active:
        return "verde"
    if current_counts["coche"] == 0:
        return "rojo"
    return "verde"

def on_detections(detections: dict):
    global last_ui_update
    detections = {k: v for k, v in detections.items() if k in CLASSES_INTERES}

    now = time.time()
    if now - last_ui_update < 1.0:
        return
    last_ui_update = now

    new_coches = len(detections.get("car", [])) + len(detections.get("cell phone", []))
    new_peatones = len(detections.get("person", []))

    if new_coches > 0 and wait_since["coche"] is None:
        wait_since["coche"] = now
    elif new_coches == 0:
        wait_since["coche"] = None

    if new_peatones > 0 and wait_since["peaton"] is None:
        wait_since["peaton"] = now
    elif new_peatones == 0:
        wait_since["peaton"] = None

    current_counts["coche"] = new_coches
    current_counts["peaton"] = new_peatones

    temps_en_estat = time.time() - last_change
    if estado_actual == "verde" and temps_en_estat < TEMPS_VERD_MIN:
        nou_estat = None
    else:
        nou_estat = decidir_estat()

    if nou_estat:
        set_semaforo(nou_estat)

    score = new_coches * 2 + new_peatones * 3 + get_wait_time("coche") * 0.5
    if car_edge_data:
        score += car_edge_data.get("cars_stopped_ahead", 0) * 1.5
        score += car_edge_data.get("ego_vehicle", {}).get("current_stop_sec", 0) * 0.3
        if car_edge_data.get("congestion_alert", False):
            score += 5

    ui.send_message("semaforo", {
        "estado": estado_actual,
        "coches": current_counts["coche"],
        "peatones": current_counts["peaton"],
        "espera_coches": get_wait_time("coche"),
        "espera_peatones": get_wait_time("peaton"),
        "score": round(score, 1),
        "co2_total": round(co2_total, 4),
        "cotxe_connectat": bool(car_edge_data),
        "priority_label": car_edge_data.get("priority", {}).get("label", "—") if car_edge_data else "—",
        "cars_stopped_ahead": car_edge_data.get("cars_stopped_ahead", 0) if car_edge_data else 0,
        "ego_stop_sec": car_edge_data.get("ego_vehicle", {}).get("current_stop_sec", 0) if car_edge_data else 0,
        "emergency": emergency_active,
        "timestamp": datetime.now(UTC).isoformat()
    })

    print(f"[DETECCION] Coches: {new_coches} | Peatones: {new_peatones} | Estat: {estado_actual} | Emergency: {emergency_active}")

ui.on_message("override_th", lambda sid, threshold: detection_stream.override_threshold(threshold))
detection_stream.on_detect_all(on_detections)

Bridge.call("set_rojo")
App.run()