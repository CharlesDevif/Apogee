#ifndef APOGEE_SHA256_H
#define APOGEE_SHA256_H

/* SHA-256 — FIPS 180-4. Standalone, no allocation, no dependencies.
 * Portable as-is to STM32 / bare-metal MCUs. */

#include <stddef.h>
#include <stdint.h>

#define SHA256_DIGEST_SIZE 32u
#define SHA256_BLOCK_SIZE  64u

typedef struct {
    uint32_t state[8];
    uint64_t bit_len;
    uint8_t  buf[SHA256_BLOCK_SIZE];
    size_t   buf_len;
} Sha256Ctx;

void sha256_init(Sha256Ctx *ctx);
void sha256_update(Sha256Ctx *ctx, const void *data, size_t len);
void sha256_final(Sha256Ctx *ctx, uint8_t out[SHA256_DIGEST_SIZE]);

/* Convenience one-shot. */
void sha256(const void *data, size_t len, uint8_t out[SHA256_DIGEST_SIZE]);

#endif /* APOGEE_SHA256_H */
