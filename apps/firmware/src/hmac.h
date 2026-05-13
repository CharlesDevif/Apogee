#ifndef APOGEE_HMAC_H
#define APOGEE_HMAC_H

/* HMAC-SHA-256 — RFC 2104. Static allocation only. */

#include <stddef.h>
#include <stdint.h>

/* Compute the full 32-byte HMAC-SHA-256 of `data` using `key`. */
void hmac_sha256(const uint8_t *key, size_t key_len,
                 const uint8_t *data, size_t data_len,
                 uint8_t out[32]);

#endif /* APOGEE_HMAC_H */
