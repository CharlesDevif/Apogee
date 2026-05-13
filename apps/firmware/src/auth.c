#include "auth.h"
#include "hmac.h"

#include <stdbool.h>
#include <stddef.h>

static uint8_t g_psk[APOGEE_PSK_LEN];
static bool    g_psk_ready = false;

static int hex_nibble(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static void decode_psk(void) {
    const char *hex = APOGEE_PSK_HEX;
    for (size_t i = 0; i < APOGEE_PSK_LEN; i++) {
        int hi = hex_nibble(hex[i * 2]);
        int lo = hex_nibble(hex[i * 2 + 1]);
        /* If the literal is malformed at compile time, fall back to a zeroed
         * key — the firmware will then refuse every TC, which is the safe
         * failure mode. */
        if (hi < 0 || lo < 0) {
            for (size_t j = 0; j < APOGEE_PSK_LEN; j++) g_psk[j] = 0;
            return;
        }
        g_psk[i] = (uint8_t)((hi << 4) | lo);
    }
}

const uint8_t *auth_psk(void) {
    if (!g_psk_ready) {
        decode_psk();
        g_psk_ready = true;
    }
    return g_psk;
}

void auth_mac(const uint8_t *data, size_t len, uint8_t out[APOGEE_TC_MAC_LEN]) {
    uint8_t full[32];
    hmac_sha256(auth_psk(), APOGEE_PSK_LEN, data, len, full);
    for (size_t i = 0; i < APOGEE_TC_MAC_LEN; i++) out[i] = full[i];
}

int auth_mac_equal(const uint8_t *a, const uint8_t *b) {
    /* Constant-time: never short-circuit on first mismatch. */
    uint8_t diff = 0;
    for (size_t i = 0; i < APOGEE_TC_MAC_LEN; i++) {
        diff |= (uint8_t)(a[i] ^ b[i]);
    }
    return diff == 0;
}
