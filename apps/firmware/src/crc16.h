#ifndef APOGEE_CRC16_H
#define APOGEE_CRC16_H

#include <stddef.h>
#include <stdint.h>

/* CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflect, no xor-out.
 * Same variant the backend recomputes on receive. */
uint16_t crc16_ccitt(const uint8_t *data, size_t len);

#endif /* APOGEE_CRC16_H */
