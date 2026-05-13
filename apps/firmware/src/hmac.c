#include "hmac.h"
#include "sha256.h"

#include <string.h>

#define BLOCK_SIZE 64u

void hmac_sha256(const uint8_t *key, size_t key_len,
                 const uint8_t *data, size_t data_len,
                 uint8_t out[32]) {
    uint8_t k0[BLOCK_SIZE];
    memset(k0, 0, sizeof k0);

    if (key_len > BLOCK_SIZE) {
        sha256(key, key_len, k0);
        /* k0 now contains 32 bytes of hash, rest is already zeroed. */
    } else {
        memcpy(k0, key, key_len);
    }

    uint8_t ipad[BLOCK_SIZE];
    uint8_t opad[BLOCK_SIZE];
    for (unsigned i = 0; i < BLOCK_SIZE; i++) {
        ipad[i] = k0[i] ^ 0x36;
        opad[i] = k0[i] ^ 0x5c;
    }

    /* inner = SHA256(ipad || data) */
    uint8_t inner[32];
    Sha256Ctx ctx;
    sha256_init(&ctx);
    sha256_update(&ctx, ipad, BLOCK_SIZE);
    sha256_update(&ctx, data, data_len);
    sha256_final(&ctx, inner);

    /* out = SHA256(opad || inner) */
    sha256_init(&ctx);
    sha256_update(&ctx, opad, BLOCK_SIZE);
    sha256_update(&ctx, inner, sizeof inner);
    sha256_final(&ctx, out);
}
