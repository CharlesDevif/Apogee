#ifndef APOGEE_NET_H
#define APOGEE_NET_H

#include <stddef.h>

/* Initialize the UDP socket and resolve the backend endpoint.
 * Returns 0 on success, -1 on error (errno set, message logged). */
int net_init(const char *host, int port);

/* Send a datagram to the configured backend. Returns 0 on success. */
int net_send(const void *data, size_t len);

/* Close the socket. Idempotent. */
void net_close(void);

#endif /* APOGEE_NET_H */
