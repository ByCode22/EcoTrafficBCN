#include <Arduino_RouterBridge.h>
#include <Wire.h>
#include <Arduino_Modulino.h>

ModulinoPixels pixels;

void clear_all() {
    for (int i = 0; i < 8; i++) {
        pixels.set(i, 0, 0, 0);
    }
    pixels.show();
}

void set_rojo() {
    clear_all();
    for (int i = 0; i < 8; i++) pixels.set(i, 255, 0, 0);
    pixels.show();
}

void set_amarillo() {
    clear_all();
    for (int i = 0; i < 8; i++) pixels.set(i, 255, 150, 0);
    pixels.show();
}

void set_verde() {
    clear_all();
    for (int i = 0; i < 8; i++) pixels.set(i, 0, 255, 0);
    pixels.show();
}

void setup() {
    Modulino.begin();
    pixels.begin();
    Bridge.begin();
    Bridge.provide("set_rojo", set_rojo);
    Bridge.provide("set_amarillo", set_amarillo);
    Bridge.provide("set_verde", set_verde);
    set_rojo();
}

void loop() {}