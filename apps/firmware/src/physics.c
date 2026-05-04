#include "physics.h"

#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

/* Orbit constants — ISS-like LEO, simplified. */
#define ORBIT_PERIOD_S    5520.0   /* 92 min */
#define ORBIT_INC_DEG       51.6
#define ORBIT_ALT_M     400000u
#define EARTH_DAY_S      86400.0

#define BATT_FULL_MV      8200u
#define BATT_NOMINAL_MV   7400u
#define BATT_LOW_MV       6800u
#define BATT_DECAY_MV_S      0.05  /* mV/s in NOMINAL */
#define BATT_CHARGE_MV_S     0.10  /* mV/s in COMMS (sun-pointing) */

#define DEG_TO_RAD (M_PI / 180.0)
#define RAD_TO_DEG (180.0 / M_PI)

void physics_init(PhysicsState *p) {
    p->battery_mv  = BATT_NOMINAL_MV;
    p->orbit_t_sec = 0.0;
    p->lat_e7      = 0;
    p->lon_e7      = 0;
    p->alt_m       = ORBIT_ALT_M;
    p->roll10 = 0;
    p->pitch10 = 0;
    p->yaw10 = 0;
}

static double clamp(double v, double lo, double hi) {
    return v < lo ? lo : v > hi ? hi : v;
}

static void update_battery(PhysicsState *p, ApogeeMode mode, double dt_sec) {
    double mv = (double)p->battery_mv;
    switch (mode) {
        case APOGEE_MODE_NOMINAL:
            mv -= BATT_DECAY_MV_S * dt_sec;
            break;
        case APOGEE_MODE_COMMS:
            mv += BATT_CHARGE_MV_S * dt_sec;
            break;
        case APOGEE_MODE_FAULT:
            mv -= BATT_DECAY_MV_S * 2.0 * dt_sec;
            break;
        case APOGEE_MODE_SAFE:
        case APOGEE_MODE_BOOT:
        default:
            /* Idle drain */
            mv -= BATT_DECAY_MV_S * 0.2 * dt_sec;
            break;
    }
    mv = clamp(mv, (double)BATT_LOW_MV, (double)BATT_FULL_MV);
    p->battery_mv = (uint16_t)mv;
}

static void update_orbit(PhysicsState *p) {
    /* Mean anomaly along orbit, fraction of period. */
    double u = 2.0 * M_PI * (p->orbit_t_sec / ORBIT_PERIOD_S);

    /* Latitude: circular orbit at given inclination, simplified projection. */
    double lat_deg = ORBIT_INC_DEG * sin(u);

    /* Longitude in inertial frame advances linearly with orbit. */
    double lon_inertial = (360.0 * p->orbit_t_sec / ORBIT_PERIOD_S);

    /* Earth rotates 360°/day under the orbit. */
    double earth_rot = (360.0 * p->orbit_t_sec / EARTH_DAY_S);

    double lon_deg = lon_inertial - earth_rot;
    /* Wrap to [-180, 180]. */
    lon_deg = fmod(lon_deg + 540.0, 360.0) - 180.0;

    p->lat_e7 = (int32_t)(lat_deg * 1e7);
    p->lon_e7 = (int32_t)(lon_deg * 1e7);
    p->alt_m  = ORBIT_ALT_M;

    /* Attitude: slow precession-like wobble (purely visual). */
    p->roll10  = (int16_t)(50.0 * sin(u * 1.3));
    p->pitch10 = (int16_t)(30.0 * sin(u * 0.7));
    p->yaw10   = (int16_t)(900.0 * fmod(p->orbit_t_sec / 60.0, 1.0) - 450.0);

    (void)RAD_TO_DEG;
    (void)DEG_TO_RAD;
}

void physics_tick(PhysicsState *p, ApogeeMode mode, double dt_sec) {
    p->orbit_t_sec += dt_sec;
    update_orbit(p);
    update_battery(p, mode, dt_sec);
}
