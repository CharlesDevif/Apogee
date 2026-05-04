#include "net.h"

#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>

static int sock_fd = -1;
static struct sockaddr_in backend_addr;

int net_init(const char *host, int port) {
    sock_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock_fd < 0) {
        perror("[NET] socket");
        return -1;
    }
    memset(&backend_addr, 0, sizeof backend_addr);
    backend_addr.sin_family = AF_INET;
    backend_addr.sin_port = htons((uint16_t)port);
    if (inet_pton(AF_INET, host, &backend_addr.sin_addr) <= 0) {
        perror("[NET] inet_pton");
        close(sock_fd);
        sock_fd = -1;
        return -1;
    }
    return 0;
}

int net_send(const void *data, size_t len) {
    if (sock_fd < 0) return -1;
    ssize_t sent = sendto(sock_fd, data, len, 0,
                          (const struct sockaddr *)&backend_addr,
                          sizeof backend_addr);
    if (sent < 0) {
        perror("[NET] sendto");
        return -1;
    }
    return 0;
}

void net_close(void) {
    if (sock_fd >= 0) {
        close(sock_fd);
        sock_fd = -1;
    }
}
