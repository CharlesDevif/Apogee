#ifndef APOGEE_PHYSICS_H
#define APOGEE_PHYSICS_H

#include "telemetry.h"

#include <stdint.h>

/* Simplified physics state — just enough to make telemetry believable.
 * Real flight software would integrate force models; we just parametrize. */

typedef struct {
    /* Battery */
    uint16_t battery_mv;

    /* Orbit (parametric circular ground track, ISS-like) */
    double  orbit_t_sec;        /* time-since-boot in seconds */
    int32_t lat_e7;
    int32_t lon_e7;
    uint32_t alt_m;

    /* Attitude (1/10°) */
    int16_t roll10;
    int16_t pitch10;
    int16_t yaw10;
} PhysicsState;

void physics_init(PhysicsState *p);

/* Advance the model by `dt_sec`. `mode` drives battery behaviour. */
void physics_tick(PhysicsState *p, ApogeeMode mode, double dt_sec);

#endif /* APOGEE_PHYSICS_H */
