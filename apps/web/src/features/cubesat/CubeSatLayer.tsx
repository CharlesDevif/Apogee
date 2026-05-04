import { useEffect, useRef } from "react";
import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  HorizontalOrigin,
  LabelStyle,
  VerticalOrigin,
  type Viewer as CesiumViewer,
  type Entity,
} from "cesium";
import { useMissionStore } from "../../store/mission";

const PHOSPHOR = Color.fromCssColorString("#ffb700");
const ALERT = Color.fromCssColorString("#ff4d3d");

const CUBESAT_ID = "apogee-cubesat";

function modeColor(mode: string): Color {
  switch (mode) {
    case "FAULT":
      return ALERT;
    case "SAFE":
      return Color.fromCssColorString("#7dffb1");
    case "BOOT":
      return Color.fromCssColorString("#43576a");
    default:
      return PHOSPHOR;
  }
}

export function CubeSatLayer({ viewer }: { viewer: CesiumViewer | null }) {
  const cubesat = useMissionStore((s) => s.cubesat);
  const entityRef = useRef<Entity | null>(null);

  useEffect(() => {
    if (!viewer) return;

    if (!cubesat) {
      if (entityRef.current) {
        viewer.entities.remove(entityRef.current);
        entityRef.current = null;
      }
      return;
    }

    const cart = Cartesian3.fromDegrees(cubesat.lon, cubesat.lat, cubesat.alt_m);
    const color = modeColor(cubesat.mode);

    if (!entityRef.current) {
      entityRef.current = viewer.entities.add({
        id: CUBESAT_ID,
        position: new ConstantPositionProperty(cart),
        point: {
          pixelSize: 16,
          color,
          outlineColor: PHOSPHOR,
          outlineWidth: 3,
        },
        label: {
          text: `APOGÉE-1 · ${cubesat.mode}`,
          font: '11px "Major Mono Display", monospace',
          fillColor: PHOSPHOR,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: HorizontalOrigin.LEFT,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(12, -10),
          showBackground: true,
          backgroundColor: Color.fromCssColorString("#0d1419").withAlpha(0.85),
          backgroundPadding: new Cartesian2(6, 4),
        },
      });
    } else {
      const e = entityRef.current;
      (e.position as ConstantPositionProperty).setValue(cart);
      if (e.point) {
        (e.point.color as ConstantProperty).setValue(color);
      }
      if (e.label) {
        (e.label.text as ConstantProperty).setValue(
          `APOGÉE-1 · ${cubesat.mode}`,
        );
      }
    }
  }, [viewer, cubesat]);

  useEffect(() => {
    return () => {
      if (viewer && entityRef.current) {
        viewer.entities.remove(entityRef.current);
        entityRef.current = null;
      }
    };
  }, [viewer]);

  return null;
}
