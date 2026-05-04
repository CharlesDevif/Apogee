#ifndef APOGEE_TELEMETRY_H
#define APOGEE_TELEMETRY_H

#include "ccsds.h"

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* Apogée operational modes. Wire value matches the byte we put in HK reports. */
typedef enum {
    APOGEE_MODE_SAFE    = 0,
    APOGEE_MODE_NOMINAL = 1,
    APOGEE_MODE_COMMS   = 2,
    APOGEE_MODE_FAULT   = 3,
    APOGEE_MODE_BOOT    = 4,
} ApogeeMode;

/* Housekeeping payload (Service 3 / Subtype 25), big-endian, 25 bytes:
 *   offset  size  field
 *        0    1   mode
 *        1    2   battery_mv
 *        3    4   lat_e7  (int32)
 *        7    4   lon_e7  (int32)
 *       11    4   alt_m   (uint32)
 *       15    2   roll10  (int16, deg * 10)
 *       17    2   pitch10 (int16)
 *       19    2   yaw10   (int16)
 *       21    4   tick_count (uint32, since boot)
 */
#define APOGEE_HK_PAYLOAD_SIZE 25u

/* Full HK packet: primary header (6) + PUS TM secondary (7) + payload (25)
 * + CRC trailer (2) = 40 bytes. */
#define APOGEE_HK_PACKET_SIZE \
    (CCSDS_PRIMARY_HEADER_SIZE + CCSDS_PUS_TM_SEC_HDR_SIZE + \
     APOGEE_HK_PAYLOAD_SIZE + CCSDS_CRC_SIZE)

/* Compose a complete CCSDS Space Packet carrying a PUS 3/25 HK report.
 * Returns the total packet size on success, 0 on buffer overflow. */
size_t telemetry_compose_hk(uint8_t *buf, size_t buf_len,
                            ApogeeMode mode,
                            uint32_t tick_count,
                            int32_t lat_e7,
                            int32_t lon_e7,
                            uint32_t alt_m,
                            uint16_t battery_mv,
                            int16_t roll10,
                            int16_t pitch10,
                            int16_t yaw10);

/* TC verification report (Service 1).
 *  - subtype 1 (acceptance success) — payload = 4B (TC packet ID + TC seq ctl)
 *  - subtype 2 (acceptance failure) — payload = 5B (above + failure_code)
 * APID = APOGEE_APID_ACK. Returns total packet size or 0 on overflow. */
#define APOGEE_ACK_OK_SIZE \
    (CCSDS_PRIMARY_HEADER_SIZE + CCSDS_PUS_TM_SEC_HDR_SIZE + 4u + CCSDS_CRC_SIZE)
#define APOGEE_ACK_FAIL_SIZE \
    (CCSDS_PRIMARY_HEADER_SIZE + CCSDS_PUS_TM_SEC_HDR_SIZE + 5u + CCSDS_CRC_SIZE)

size_t telemetry_compose_ack(uint8_t *buf, size_t buf_len,
                             bool success, uint8_t failure_code,
                             uint16_t tc_apid, uint16_t tc_seq);

#endif /* APOGEE_TELEMETRY_H */
