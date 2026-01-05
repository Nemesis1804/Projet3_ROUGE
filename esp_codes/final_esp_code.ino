#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_PCF8574.h>
#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Servo.h>
#include <time.h>
#include <SoftwareSerial.h>
#include "HUSKYLENS.h"

HUSKYLENS husky;

// === Wi-Fi ===
const char *ssid = "Galaxy S23";
const char *password = "Florouge_1804/1804";

// === WebSocket ===
WebSocketsClient webSocket;
const char *ws_host = "192.168.190.114";
const uint16_t ws_port = 8080;
const char *ws_path = "/";

// === ESP8266 pins ===
#define I2C_SDA D2
#define I2C_SCL D1
#define BUZZER_PIN D7
#define SERVO_PIN D6

// === I2C devices ===
#define LCD_ADDR 0x27
#define PCF8574_ADDR 0x21
// HuskyLens I2C = 0x32 (fixed)

// === PCF8574 input ===
#define PIN_REED 0

// === System ===
#define AUTH_DURATION 10000
#define BUZZER_FREQ 1000

// Servo
const int SERVO_CLOSED = 90;
const int SERVO_OPEN = 50;

// WS events
const char *EVT_OPEN = "door_opened";
const char *EVT_CLOSE = "door_closed";

// --- AUTHORIZED USERS ---
struct User {
  int id;
  const char *name;
};
const User USERS[] = {{1, "Alice"}, {2, "Bob"}};

LiquidCrystal_I2C lcd(LCD_ADDR, 16, 2);
Adafruit_PCF8574 pcf;
Servo servo;

bool authorized = false;
unsigned long authorizationStart = 0;
bool lastBreachState = false;
bool doorOpened = false;

bool lastDoorOpenState = false;
bool doorStateInitialized = false;

int lastRecognizedId = -1;
unsigned long lastRecognizedAt = 0;
const unsigned long RECOOL_MS = 3000;

// ---------- Helpers LCD ----------
void lcdMsg(const char* l1, const char* l2 = "") {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(l1);
  lcd.setCursor(0, 1);
  lcd.print(l2);
}

void lcdDots(const char* base, uint8_t dotCount) {
  // Montre "base" sur L1, et des points qui tournent sur L2
  static const char* dots[] = {"", ".", "..", "..."};
  lcd.setCursor(0, 0);
  lcd.print(base);
  int pad = 16 - (int)strlen(base);
  while (pad-- > 0) lcd.print(" ");
  lcd.setCursor(0, 1);
  lcd.print(dots[dotCount % 4]);
  // Efface le reste de la ligne
  int rest = 16 - (int)strlen(dots[dotCount % 4]);
  while (rest-- > 0) lcd.print(" ");
}

void lcdToast(const char* l1, const char* l2 = "", uint16_t ms = 800) {
  lcdMsg(l1, l2);
  delay(ms);
}

// --------- Utils ---------
uint64_t nowEpochMs() {
  time_t s = time(nullptr);
  if (s < 1700000000) return 0ULL;
  return (uint64_t)s * 1000ULL;
}

void sendEvent(const char *status) {
  StaticJsonDocument<128> ev;
  ev["type"] = "event";
  ev["status"] = status;
  uint64_t e = nowEpochMs();
  if (e) ev["epoch"] = e;
  String out;
  serializeJson(ev, out);
  webSocket.sendTXT(out);
}

void sendLog(const String &status) {
  StaticJsonDocument<192> doc;
  doc["type"] = "log";
  doc["id"] = (int)random(100000);
  doc["timestamp"] = (unsigned long)millis();
  uint64_t e = nowEpochMs();
  if (e) doc["epoch"] = e;
  doc["status"] = status;
  String out;
  serializeJson(doc, out);
  webSocket.sendTXT(out);
  Serial.println("📤 WS: " + out);
}

void openDoor() {
  authorized = true;
  authorizationStart = millis();
  servo.write(SERVO_OPEN);
  doorOpened = true;
  Serial.println("🚪 Door opened");
  lcdToast("Door OPEN", "by action", 700);
  sendEvent(EVT_OPEN);
  sendLog("Door opened");
}

void closeDoor() {
  authorized = false;
  servo.write(SERVO_CLOSED);
  doorOpened = false;
  Serial.println("🚪 Door closed");
  lcdToast("Door CLOSED", "", 700);
  sendEvent(EVT_CLOSE);
  sendLog("Door closed");
}

// --------- HuskyLens ---------
bool isAllowedUser(int id, const char **outName) {
  for (auto &u : USERS)
    if (u.id == id) {
      if (outName) *outName = u.name;
      return true;
    }
  return false;
}

void handleRecognizedUser(int id) {
  const char *name = nullptr;
  if (!isAllowedUser(id, &name)) return;

  unsigned long now = millis();
  if (lastRecognizedId == id && (now - lastRecognizedAt) < RECOOL_MS) return;

  lastRecognizedId = id;
  lastRecognizedAt = now;

  String msg = "Access granted: ";
  msg += name;
  msg += " (ID=";
  msg += id;
  msg += ")";
  lcdToast("Access granted", name, 800);
  sendLog(msg);
  openDoor();
}

void pollHusky() {
  if (!husky.request()) return;
  while (husky.available()) {
    HUSKYLENSResult r = husky.read();
    if (r.ID > 0) handleRecognizedUser(r.ID);
  }
}

// --------- WebSocket ----------
String fromBuf(const uint8_t *buf, size_t len) {
  String s;
  s.reserve(len + 1);
  for (size_t i = 0; i < len; i++) s += (char)buf[i];
  return s;
}

void onWsEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
  case WStype_CONNECTED:
    Serial.printf("✅ WS CONNECTED ws://%s:%u%s\n", ws_host, ws_port, ws_path);
    lcdToast("WS Connected", ws_host, 700);
    webSocket.sendTXT("{\"type\":\"hello\",\"device\":\"esp8266\"}");
    if (doorStateInitialized) {
      sendEvent(lastDoorOpenState ? EVT_OPEN : EVT_CLOSE);
      sendLog(lastDoorOpenState ? "Current state: Door opened" : "Current state: Door closed");
    }
    break;

  case WStype_DISCONNECTED:
    Serial.println("⚠️  WS DISCONNECTED");
    lcdToast("WS Disconnected", "", 700);
    break;

  case WStype_TEXT: {
    String s = fromBuf(payload, length);
    Serial.printf("📨 WS received: %s\n", s.c_str());

    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, s);
    if (err) {
      Serial.printf("❌ JSON parse error: %s\n", err.c_str());
      lcdToast("WS JSON error", "", 700);
      break;
    }

    const char *t = doc["type"] | "";
    const char *action = doc["action"] | "";

    if (strcmp(t, "command") == 0) {
      if (strcmp(action, "getState") == 0) {
        lcdToast("Cmd:getState", "", 400);
        bool curOpen = pcf.digitalRead(PIN_REED);
        sendEvent(curOpen ? EVT_OPEN : EVT_CLOSE);
        sendLog(curOpen ? "Current state: Door opened" : "Current state: Door closed");
      } else if (strcmp(action, "openDoor") == 0) {
        lcdToast("Cmd: openDoor", "", 400);
        openDoor();
      } else if (strcmp(action, "closeDoor") == 0) {
        lcdToast("Cmd: closeDoor", "", 400);
        closeDoor();
      } else if (strcmp(action, "authorize10s") == 0) {
        lcdToast("Cmd: auth 10s", "", 400);
        authorized = true;
        authorizationStart = millis();
        sendLog("Command: authorization 10s");
      }
    }
  } break;

  default:
    break;
  }
}

// --------- Setup / Loop ----------
void setup() {
  Serial.begin(115200);

  // I2C + LCD
  Wire.begin(I2C_SDA, I2C_SCL);
  lcd.begin(16, 2);
  lcd.backlight();
  lcdMsg("Booting...", "Init I2C/LCD");

  // Wi-Fi
  lcdMsg("WiFi connect", ssid);
  WiFi.begin(ssid, password);
  Serial.print("WiFi...");
  uint8_t dot = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    lcdDots("WiFi connect", dot++);
  }
  Serial.printf("\n✅ WiFi OK  IP=%s\n", WiFi.localIP().toString().c_str());
  lcdMsg("WiFi OK", WiFi.localIP().toString().c_str());
  delay(500);

  // NTP
  lcdMsg("NTP sync", "pool.ntp.org");
  configTime(0, 0, "pool.ntp.org", "time.google.com", "time.nist.gov");
  Serial.print("Sync NTP");
  time_t tnow = 0;
  int tries = 0; dot = 0;
  while ((tnow = time(nullptr)) < 1700000000 && tries < 60) {
    delay(500);
    Serial.print(".");
    tries++;
    lcdDots("NTP sync", dot++);
  }
  lcdMsg((tnow >= 1700000000) ? "NTP OK" : "NTP WARN", "");
  Serial.println(tnow >= 1700000000 ? " ✅" : " ⚠️");
  delay(400);

  // WebSocket
  lcdMsg("WS begin", ws_host);
  webSocket.begin(ws_host, ws_port, ws_path);
  webSocket.onEvent(onWsEvent);
  webSocket.setReconnectInterval(5000);
  webSocket.enableHeartbeat(15000, 3000, 2);

  // PCF8574 + LCD + Servo
  lcdMsg("PCF8574 init", "addr 0x21");
  if (!pcf.begin(PCF8574_ADDR, &Wire)) {
    Serial.println("PCF8574 missing!");
    lcdMsg("PCF8574 FAIL", "check wiring");
    while (1) ; // logique conservée
  }
  pcf.pinMode(PIN_REED, INPUT_PULLUP);
  lcdMsg("PCF8574 OK", "");

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  lcdMsg("Servo attach", "");
  servo.attach(SERVO_PIN);
  servo.write(SERVO_CLOSED);
  lcdMsg("Servo OK", "closed");
  delay(300);

  lcdMsg("Display ready", "");
  delay(200);

  // HuskyLens
  int hTry = 0;
  lcdMsg("Husky init", "I2C 0x32");
  while (!husky.begin(Wire)) {
    Serial.println("Husky I2C init failed, retry...");
    hTry++;
    char b1[17]; snprintf(b1, sizeof(b1), "Husky retry %d", hTry);
    lcdMsg(b1, "check cable/Vcc");
    delay(1000);
  }
  Serial.println("HuskyLens OK (I2C)");
  lcdMsg("Husky OK", "");

  // Etat initial porte
  bool initDoorOpen = pcf.digitalRead(PIN_REED);
  lastDoorOpenState = initDoorOpen;
  doorStateInitialized = true;
  sendEvent(initDoorOpen ? EVT_OPEN : EVT_CLOSE);
  sendLog(initDoorOpen ? "Initial state: Door opened" : "Initial state: Door closed");

  // Prêt
  lcdMsg("System Ready!", initDoorOpen ? "DOOR OPEN" : "DOOR CLOSED");
  delay(800);
  lcd.clear();
}

void loop() {
  webSocket.loop();
  pollHusky();
  handleAuthorization();
  updateDisplay();

  bool doorOpen = pcf.digitalRead(PIN_REED);
  if (doorStateInitialized && doorOpen != lastDoorOpenState) {
    lastDoorOpenState = doorOpen;
    sendEvent(doorOpen ? EVT_OPEN : EVT_CLOSE);
    sendLog(doorOpen ? "Door opened (reed)" : "Door closed (reed)");
    lcdToast(doorOpen ? "Door OPEN" : "Door CLOSED", "", 500);
  }

  bool breach = doorOpen && !authorized;
  if (breach != lastBreachState) {
    lastBreachState = breach;
    sendLog(breach ? "BREACH detected!" : "Breach ended");
    lcdToast(breach ? "BREACH !" : "Breach ended", "", 600);
  }

  handleBuzzer(breach);
  delay(50);
}

// --------- Local routines ---------
void handleAuthorization() {
  unsigned long now = millis();
  if (authorized && (now - authorizationStart >= AUTH_DURATION)) {
    authorized = false;
    sendLog("Authorization expired");
    if (doorOpened) {
      servo.write(SERVO_CLOSED);
      doorOpened = false;
      lcdToast("Door CLOSED", "auth expired", 600);
    }
  }
}

void updateDisplay() {
  bool doorOpen = pcf.digitalRead(PIN_REED);
  lcd.setCursor(0, 0);
  lcd.print(doorOpen ? "DOOR OPEN    " : "DOOR CLOSED  ");
  lcd.setCursor(0, 1);
  if (authorized) lcd.print("Access granted");
  else            lcd.print("System OK     ");
}

void handleBuzzer(bool breachActive) {
  static bool buzzerOn = false;
  static unsigned long lastChange = 0;
  const unsigned long onMs = 2000, offMs = 500;

  unsigned long now = millis();
  if (breachActive) {
    if (buzzerOn && now - lastChange >= onMs) {
      noTone(BUZZER_PIN);
      buzzerOn = false;
      lastChange = now;
    }
    if (!buzzerOn && now - lastChange >= offMs) {
      tone(BUZZER_PIN, BUZZER_FREQ);
      buzzerOn = true;
      lastChange = now;
    }
  } else if (buzzerOn) {
    noTone(BUZZER_PIN);
    buzzerOn = false;
  }
}
