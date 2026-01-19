#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_PCF8574.h>
#include <Servo.h>
#include "HUSKYLENS.h"

HUSKYLENS husky;

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

// Event strings
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

void lcdToast(const char* l1, const char* l2 = "", uint16_t ms = 800) {
  lcdMsg(l1, l2);
  delay(ms);
}

// ============================
//  ESP -> UNO via TX0 (Serial)
//  Format lignes finissant par '\n':
//   EVENT;<status>
//   LOG;<message>
//   BREACH;0|1
// ============================
void unoSendEvent(const char *status) {
  Serial.print("EVENT;");
  Serial.print(status);
  Serial.print('\n');
}

void unoSendLog(const String &msg) {
  Serial.print("LOG;");
  Serial.print(msg);
  Serial.print('\n');
}

void unoSendBreach(bool active) {
  Serial.print("BREACH;");
  Serial.print(active ? "1" : "0");
  Serial.print('\n');
}

// --------- Door ----------
void openDoor() {
  authorized = true;
  authorizationStart = millis();
  servo.write(SERVO_OPEN);
  doorOpened = true;

  lcdToast("Door OPEN", "by action", 700);

  unoSendEvent(EVT_OPEN);
  unoSendLog("Door opened");
}

void closeDoor() {
  authorized = false;
  servo.write(SERVO_CLOSED);
  doorOpened = false;

  lcdToast("Door CLOSED", "", 700);

  unoSendEvent(EVT_CLOSE);
  unoSendLog("Door closed");
}

// --------- HuskyLens ---------
bool isAllowedUser(int id, const char **outName) {
  for (auto &u : USERS) {
    if (u.id == id) {
      if (outName) *outName = u.name;
      return true;
    }
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

  lcdToast("Access granted", name, 800);

  String msg = "Access granted: ";
  msg += name;
  msg += " (ID=";
  msg += id;
  msg += ")";
  unoSendLog(msg);

  openDoor();
}

void pollHusky() {
  if (!husky.request()) return;
  while (husky.available()) {
    HUSKYLENSResult r = husky.read();
    if (r.ID > 0) handleRecognizedUser(r.ID);
  }
}

// --------- Local routines ---------
void handleAuthorization() {
  unsigned long now = millis();
  if (authorized && (now - authorizationStart >= AUTH_DURATION)) {
    authorized = false;
    unoSendLog("Authorization expired");

    if (doorOpened) {
      servo.write(SERVO_CLOSED);
      doorOpened = false;
      lcdToast("Door CLOSED", "auth expired", 600);
      unoSendEvent(EVT_CLOSE);
      unoSendLog("Door closed (auth expired)");
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

// --------- Setup / Loop ----------
void setup() {
  // TX0 (GPIO1) -> UNO RX0
  Serial.begin(9600);

  Wire.begin(I2C_SDA, I2C_SCL);
  lcd.begin(16, 2);
  lcd.backlight();
  lcdMsg("Booting...", "Init I2C/LCD");

  // PCF8574
  lcdMsg("PCF8574 init", "addr 0x21");
  if (!pcf.begin(PCF8574_ADDR, &Wire)) {
    lcdMsg("PCF8574 FAIL", "check wiring");
    while (1);
  }
  pcf.pinMode(PIN_REED, INPUT_PULLUP);
  lcdMsg("PCF8574 OK", "");

  // Buzzer + Servo
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  lcdMsg("Servo attach", "");
  servo.attach(SERVO_PIN);
  servo.write(SERVO_CLOSED);
  lcdMsg("Servo OK", "closed");
  delay(300);

  // HuskyLens
  lcdMsg("Husky init", "I2C 0x32");
  while (!husky.begin(Wire)) {
    lcdMsg("Husky FAIL", "check wiring");
    delay(1000);
  }
  lcdMsg("Husky OK", "");

  // Etat initial porte
  bool initDoorOpen = pcf.digitalRead(PIN_REED);
  lastDoorOpenState = initDoorOpen;
  doorStateInitialized = true;

  unoSendEvent(initDoorOpen ? EVT_OPEN : EVT_CLOSE);
  unoSendLog(initDoorOpen ? "Initial state: Door opened" : "Initial state: Door closed");

  lcdMsg("System Ready!", initDoorOpen ? "DOOR OPEN" : "DOOR CLOSED");
  delay(800);
  lcd.clear();
}

void loop() {
  pollHusky();
  handleAuthorization();
  updateDisplay();

  bool doorOpen = pcf.digitalRead(PIN_REED);

  // Door state change (reed)
  if (doorStateInitialized && doorOpen != lastDoorOpenState) {
    lastDoorOpenState = doorOpen;
    unoSendEvent(doorOpen ? EVT_OPEN : EVT_CLOSE);
    unoSendLog(doorOpen ? "Door opened (reed)" : "Door closed (reed)");
    lcdToast(doorOpen ? "Door OPEN" : "Door CLOSED", "", 500);
  }

  // Breach detection
  bool breach = doorOpen && !authorized;
  if (breach != lastBreachState) {
    lastBreachState = breach;
    unoSendLog(breach ? "BREACH detected!" : "Breach ended");
    lcdToast(breach ? "BREACH !" : "Breach ended", "", 600);
    unoSendBreach(breach);
  }

  handleBuzzer(breach);
  delay(50);
}
