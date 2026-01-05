#include <lmic.h>
#include <hal/hal.h>
#include <SPI.h>

// ======================================================
// OTAA KEYS
// JoinEUI (LSB)
static const u1_t PROGMEM APPEUI[8] = {
  0x9F, 0xF3, 0x82, 0x8F,
  0x8D, 0xA5, 0xA8, 0xCB
};

// DevEUI (LSB)
static const u1_t PROGMEM DEVEUI[8] = {
  0x35, 0x3D, 0x60, 0x00,
  0x17, 0xFA, 0xCA, 0x40
};

// AppKey (MSB)
static const u1_t PROGMEM APPKEY[16] = {
  0xF6, 0x6E, 0xFB, 0xB0,
  0xE8, 0x42, 0xEE, 0x89,
  0xFB, 0xED, 0x1D, 0x04,
  0x7D, 0xF4, 0xFB, 0xED
};

void os_getArtEui (u1_t* buf) { memcpy_P(buf, APPEUI, 8); }
void os_getDevEui (u1_t* buf) { memcpy_P(buf, DEVEUI, 8); }
void os_getDevKey (u1_t* buf) { memcpy_P(buf, APPKEY, 16); }

// ======================================================
// PINMAP Dragino LoRa Shield v1.4 (UNO)
// ======================================================
const lmic_pinmap lmic_pins = {
  .nss  = 10,
  .rxtx = LMIC_UNUSED_PIN,
  .rst  = 9,
  .dio  = {2, 6, 7},   // DIO0, DIO1, DIO2
};

// ======================================================
// TX job
// ======================================================
static osjob_t sendjob;
const unsigned TX_INTERVAL = 60; // secondes

void do_send(osjob_t* j) {
  if (LMIC.opmode & OP_TXRXPEND) {
    Serial.println(F("OP_TXRXPEND, wait"));
  } else {
    // Payload ASCII : "hello"
    static const uint8_t helloPayload[] = { 'h', 'e', 'l', 'l', 'o' };

    LMIC_setTxData2(
      1,                    // FPort
      helloPayload,         // payload
      sizeof(helloPayload), // longueur = 5
      0                     // unconfirmed
    );

    Serial.println(F("Queued uplink: hello"));
  }

  // Replanifie dans 60 secondes
  os_setTimedCallback(&sendjob, os_getTime() + sec2osticks(TX_INTERVAL), do_send);
}

// ======================================================
// Events LMIC
// ======================================================
void onEvent(ev_t ev) {
  Serial.print(os_getTime());
  Serial.print(F(": "));

  switch (ev) {
    case EV_JOINING:
      Serial.println(F("EV_JOINING"));
      break;

    case EV_JOINED:
      Serial.println(F("EV_JOINED"));
      LMIC_setLinkCheckMode(0); // recommandé
      break;

    case EV_JOIN_FAILED:
      Serial.println(F("EV_JOIN_FAILED"));
      break;

    case EV_TXCOMPLETE:
      Serial.println(F("EV_TXCOMPLETE"));
      if (LMIC.txrxFlags & TXRX_ACK) Serial.println(F("ACK reçu"));
      if (LMIC.dataLen) {
        Serial.print(F("Downlink "));
        Serial.print(LMIC.dataLen);
        Serial.println(F(" bytes"));
      }
      break;

    default:
      Serial.print(F("Event "));
      Serial.println((unsigned)ev);
      break;
  }
}

// ======================================================
// Setup/Loop
// ======================================================
void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println(F("LMIC OTAA - Dragino LoRa Shield v1.4 - send 'hello' every 60s"));

  os_init();
  LMIC_reset();

  // EU868: garde seulement les 3 canaux “standards”
  for (uint8_t ch = 3; ch < 9; ch++) LMIC_disableChannel(ch);
  LMIC_enableChannel(0); // 868.1
  LMIC_enableChannel(1); // 868.3
  LMIC_enableChannel(2); // 868.5

  // Puissance + data rate
  LMIC_setDrTxpow(DR_SF7, 14);

  // Lance le join puis l’envoi
  do_send(&sendjob);
}

void loop() {
  os_runloop_once();
}
