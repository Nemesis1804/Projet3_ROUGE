#include <lmic.h>
#include <hal/hal.h>
#include <SPI.h>

// --- CLÉS FOURNIES PAR L'UTILISATEUR ---

static const u1_t PROGMEM DEVEUI[8] = { 0xFA, 0xF5, 0x64, 0x0C, 0x51, 0x3E, 0xD1, 0xF1 };
void os_getDevEui (u1_t* buf) { memcpy_P(buf, DEVEUI, 8); }

static const u1_t PROGMEM APPEUI[8] = { 0x0F, 0x51, 0xF7, 0xEF, 0xD9, 0xC4, 0x09, 0x4B };
void os_getArtEui (u1_t* buf) { memcpy_P(buf, APPEUI, 8); }

static const u1_t PROGMEM APPKEY[16] = { 0x8E, 0xC7, 0x1B, 0x78, 0xD3, 0xFD, 0x08, 0xEC,
                                         0x21, 0x5B, 0xEB, 0xD5, 0x7A, 0x22, 0xEF, 0x4E };
void os_getDevKey (u1_t* buf) { memcpy_P(buf, APPKEY, 16); }

// --- CONFIGURATION MATÉRIELLE (Pin Mapping) ---
const lmic_pinmap lmic_pins = {
  .nss = 10,
  .rxtx = LMIC_UNUSED_PIN,
  .rst = 9,
  .dio = {2, 6, 7},
};

static osjob_t sendjob;
const unsigned TX_INTERVAL = 60; // secondes

// =====================================================
//  BUFFER RX (ESP -> UNO) + FILE D'ATTENTE (QUEUE)
//  - ESP envoie des lignes terminées par '\n' sur UNO RX0
//  - UNO bufferise et envoie 1 message / minute via LoRaWAN
// =====================================================
static const uint8_t QUEUE_SIZE = 8;
static const uint8_t MSG_MAXLEN = 51;  // safe LoRaWAN payload (dépend du DR, mais ok pour un buffer simple)

static char queueBuf[QUEUE_SIZE][MSG_MAXLEN + 1];
static uint8_t qHead = 0, qTail = 0, qCount = 0;

static const uint8_t RX_LINE_MAX = 96;
static char rxLine[RX_LINE_MAX];
static uint8_t rxIdx = 0;

bool queuePush(const char* s) {
  if (qCount >= QUEUE_SIZE) return false;

  uint8_t i = 0;
  while (s[i] && i < MSG_MAXLEN) {
    queueBuf[qTail][i] = s[i];
    i++;
  }
  queueBuf[qTail][i] = '\0';

  qTail = (qTail + 1) % QUEUE_SIZE;
  qCount++;
  return true;
}

bool queuePop(char* out) {
  if (qCount == 0) return false;
  strcpy(out, queueBuf[qHead]);
  qHead = (qHead + 1) % QUEUE_SIZE;
  qCount--;
  return true;
}

void pollSerialAndBuffer() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();

    if (c == '\r') continue;

    if (c == '\n') {
      rxLine[rxIdx] = '\0';

      if (rxIdx > 0) {
        // Affiche TOUJOURS le message reçu de l'ESP
        Serial.print(F("📨 RX ESP: "));
        Serial.println(rxLine);

        bool ok = queuePush(rxLine);
        if (ok) {
          Serial.print(F("📥 Buffer +1 (en attente="));
          Serial.print(qCount);
          Serial.println(F(")"));
        } else {
          Serial.println(F("⚠️ Buffer plein: message ignoré."));
        }
      }

      rxIdx = 0;
      continue;
    }

    if (rxIdx < (RX_LINE_MAX - 1)) {
      rxLine[rxIdx++] = c;
    } else {
      // ligne trop longue: on tronque jusqu'au '\n'
    }
  }
}

// =====================================================
//  LMIC Events
// =====================================================
void onEvent (ev_t ev) {
  switch(ev) {
    case EV_JOINING:
      Serial.println(F("EV_JOINING: Tentative de connexion..."));
      break;

    case EV_JOINED:
      Serial.println(F("EV_JOINED: Connexion réussie à la gateway !"));
      LMIC_setLinkCheckMode(0);

      // Premier slot d'envoi dans 1s
      os_setTimedCallback(&sendjob, os_getTime() + sec2osticks(1), do_send);
      break;

    case EV_JOIN_FAILED:
      Serial.println(F("EV_JOIN_FAILED: La connexion a échoué."));
      break;

    case EV_TXCOMPLETE:
      Serial.println(F("EV_TXCOMPLETE: Transmission terminée."));
      os_setTimedCallback(&sendjob, os_getTime() + sec2osticks(TX_INTERVAL), do_send);
      break;

    default:
      break;
  }
}

// =====================================================
//  Envoi : 1 message / minute max
// =====================================================
void do_send(osjob_t* j){
  if (LMIC.opmode & OP_TXRXPEND) {
    Serial.println(F("Transmission en cours, report de l'envoi..."));
    return;
  }

  if (qCount == 0) {
    Serial.println(F("Aucun message en buffer, pas d'envoi."));
    // Important: comme on n'envoie rien, EV_TXCOMPLETE ne viendra pas.
    // Donc on re-planifie manuellement.
    os_setTimedCallback(&sendjob, os_getTime() + sec2osticks(TX_INTERVAL), do_send);
    return;
  }

  char payload[MSG_MAXLEN + 1];
  if (!queuePop(payload)) {
    os_setTimedCallback(&sendjob, os_getTime() + sec2osticks(TX_INTERVAL), do_send);
    return;
  }

  LMIC_setTxData2(1, (uint8_t*)payload, strlen(payload), 0);

  Serial.print(F("📤 LoRa send: "));
  Serial.print(payload);
  Serial.print(F(" (reste="));
  Serial.print(qCount);
  Serial.println(F(")"));
}

void setup() {
  // Même baud que l'ESP
  Serial.begin(9600);
  Serial.println(F("Initialisation du module LoRa..."));

  os_init();
  LMIC_reset();

  // Join (remplace l'ancien do_send hello)
  LMIC_startJoining();
}

void loop() {
  // Lire les messages venant de l'ESP et bufferiser
  pollSerialAndBuffer();

  // Boucle LMIC
  os_runloop_once();
}
