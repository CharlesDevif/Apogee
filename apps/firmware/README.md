# Apogée firmware (placeholder)

Le firmware C arrive en **Phase 2** (V1).

Ce dossier sera rempli par :

- `src/main.c` — entry point + main loop 10 Hz
- `src/state_machine.c/.h` — états BOOT, SAFE, NOMINAL, COMMS, FAULT
- `src/telemetry.c/.h` — composition et envoi UDP des paquets binaires (40 octets)
- `src/commands.c/.h` — parsing PING / SET_MODE / REBOOT
- `src/physics.c/.h` — modèle batterie + orbite képlérienne + attitude
- `src/crc16.c/.h` — CRC-16-CCITT
- `src/hmac.c/.h` — HMAC-SHA256 tronqué (Phase 3)
- `src/net.c/.h` — wrapper UDP

Contraintes : C11, allocation statique uniquement, aucune récursion, aucune dépendance hors libc + POSIX. Build via `make` simple.

Voir `docs/APOGEE_BRIEF.md` section 5 pour les spécifications complètes.
