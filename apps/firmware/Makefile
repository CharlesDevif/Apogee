# Apogée firmware — flight software simulé en C11.
# Build sans warning. Allocation statique uniquement. Aucune dépendance hors libc + POSIX.

CC      ?= gcc
CFLAGS  := -std=c11 -Wall -Wextra -Werror -Wpedantic -O2 \
           -D_POSIX_C_SOURCE=200809L \
           -Iinclude -Isrc
LDFLAGS :=

SRC_DIR  := src
BUILD_DIR := build
SRCS     := $(wildcard $(SRC_DIR)/*.c)
OBJS     := $(patsubst $(SRC_DIR)/%.c,$(BUILD_DIR)/%.o,$(SRCS))
TARGET   := $(BUILD_DIR)/apogee_fw

.PHONY: all clean run

all: $(TARGET)

$(TARGET): $(OBJS)
	@mkdir -p $(BUILD_DIR)
	$(CC) $(OBJS) -o $@ $(LDFLAGS)

$(BUILD_DIR)/%.o: $(SRC_DIR)/%.c
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

run: $(TARGET)
	./$(TARGET)

clean:
	rm -rf $(BUILD_DIR)
