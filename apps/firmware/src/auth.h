#ifndef APOGEE_AUTH_H
#define APOGEE_AUTH_H

/* Pre-shared key + HMAC truncation policy for telecommand authentication.
 *
 * The MAC is HMAC-SHA-256 truncated to 16 bytes (128-bit security level).
 * That follows the common practice for short-payload command channels — the
 * full 32-byte digest would waste half the packet.
 *
 * The PSK is compiled into the firmware. The backend must use the same key
 * (configured via APOGEE_HMAC_KEY in apps/server/.env). Demo default below
 * is generated once for the project and committed; change it for production. */

#include <stddef.h>
#include <stdint.h>

#define APOGEE_PSK_LEN     32u
#define APOGEE_TC_MAC_LEN  16u

/* Default demo key — 32 random bytes, hex-encoded. KEEP IN SYNC WITH .env. */
#ifndef APOGEE_PSK_HEX
#define APOGEE_PSK_HEX \
    "8f4a2d6e9c1b73f50a82d7e3b9c64f1a" \
    "5d3b8e7c029f4a16d8b2c5e7f9a14380"
#endif

/* Returns the 32-byte PSK (decoded once at boot from APOGEE_PSK_HEX). */
const uint8_t *auth_psk(void);

/* Compute the 16-byte MAC over [data..data+len) using the PSK.
 * Writes APOGEE_TC_MAC_LEN bytes to `out`. */
void auth_mac(const uint8_t *data, size_t len, uint8_t out[APOGEE_TC_MAC_LEN]);

/* Constant-time compare of two MACs. */
int auth_mac_equal(const uint8_t *a, const uint8_t *b);

#endif /* APOGEE_AUTH_H */
