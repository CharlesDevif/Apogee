#ifndef APOGEE_TELEMETRY_H
#define APOGEE_TELEMETRY_H

#include <stdint.h>

#define APOGEE_TM_MAGIC   0xAB1Eu
#define APOGEE_TM_VERSION 0x01u

typedef enum {
    APOGEE_MODE_SAFE    = 0,
    APOGEE_MODE_NOMINAL = 1,
    APOGEE_MODE_COMMS   = 2,
    APOGEE_MODE_FAULT   = 3,
    APOGEE_MODE_BOOT    = 4,
} ApogeeMode;

/* On-the-wire layout — little-endian, 40 bytes total.
 * The CRC field covers all bytes preceding it. */
typedef struct __attribute__((packed)) {
    uint16_t magic;          /* 0xAB1E                      offset  0  size 2 */
    uint8_t  version;        /* 0x01                                3       1 */
    uint8_t  mode;           /* ApogeeMode                          4       1 */
    uint32_t tick_count;     /* ticks since boot                    8       4 */
    uint64_t timestamp_us;   /* unix microseconds                  16       8 */
    int32_t  lat_e7;         /* latitude  * 1e7                    20       4 */
    int32_t  lon_e7;         /* longitude * 1e7                    24       4 */
    uint32_t alt_m;          /* altitude in meters                 28       4 */
    uint16_t battery_mv;     /* battery voltage in mV              30       2 */
    int16_t  attitude_deg[3];/* roll, pitch, yaw  *10°             36       6 */
    uint8_t  reserved[2];    /*                                    38       2 */
    uint16_t crc16;          /* CRC over offsets 0..37             40       2 */
} TelemetryPacket;

_Static_assert(sizeof(TelemetryPacket) == 40,
               "TelemetryPacket must be exactly 40 bytes");

/* Compose a fully-populated telemetry packet, including timestamp + CRC. */
void telemetry_compose(TelemetryPacket *out,
                       ApogeeMode mode,
                       uint32_t tick_count,
                       int32_t lat_e7,
                       int32_t lon_e7,
                       uint32_t alt_m,
                       uint16_t battery_mv,
                       int16_t roll10,
                       int16_t pitch10,
                       int16_t yaw10);

#endif /* APOGEE_TELEMETRY_H */
