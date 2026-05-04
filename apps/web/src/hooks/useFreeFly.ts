import { useEffect } from "react";
import { type Viewer as CesiumViewer } from "cesium";

const KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ShiftLeft",
  "Space",
]);

/**
 * Adds WASD/QE/Shift/Space free-fly camera controls to the Cesium viewer.
 * - W/S: forward/back
 * - A/D: strafe left/right
 * - Q/E: roll
 * - Space/Shift: up/down
 *
 * Speed scales with current camera height so it feels right from ground to GEO.
 */
export function useFreeFly(viewer: CesiumViewer | null) {
  useEffect(() => {
    if (!viewer) return;
    const pressed = new Set<string>();

    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping()) {
        pressed.clear();
        return;
      }
      if (KEYS.has(e.code)) {
        pressed.add(e.code);
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (KEYS.has(e.code)) pressed.delete(e.code);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let raf = 0;
    const tick = () => {
      const cam = viewer.camera;
      // Speed scales with altitude — fast in deep space, slow near surface
      const height = Math.max(cam.positionCartographic.height, 100);
      const speed = height * 0.01; // m/frame at 60fps
      const rollAmount = 0.02;

      if (pressed.has("KeyW")) cam.moveForward(speed);
      if (pressed.has("KeyS")) cam.moveBackward(speed);
      if (pressed.has("KeyA")) cam.moveLeft(speed);
      if (pressed.has("KeyD")) cam.moveRight(speed);
      if (pressed.has("Space")) cam.moveUp(speed);
      if (pressed.has("ShiftLeft")) cam.moveDown(speed);
      if (pressed.has("KeyQ")) cam.twistLeft(rollAmount);
      if (pressed.has("KeyE")) cam.twistRight(rollAmount);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [viewer]);
}
