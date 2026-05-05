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
  const isSelected = useMissionStore((s) => s.selectedCubesat === "APOGEE-1");
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
    const outlineColor = isSelected ? ALERT : PHOSPHOR;
    const outlineWidth = isSelected ? 4 : 3;
    const pixelSize = isSelected ? 20 : 16;
    const labelText = isSelected
      ? `▶ APOGÉE-1 · ${cubesat.mode} · TARGETED`
      : `APOGÉE-1 · ${cubesat.mode}`;

    if (!entityRef.current) {
      entityRef.current = viewer.entities.add({
        id: CUBESAT_ID,
        position: new ConstantPositionProperty(cart),
        point: {
          pixelSize,
          color,
          outlineColor,
          outlineWidth,
        },
        label: {
          text: labelText,
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
        (e.point.outlineColor as ConstantProperty).setValue(outlineColor);
        (e.point.outlineWidth as ConstantProperty).setValue(outlineWidth);
        (e.point.pixelSize as ConstantProperty).setValue(pixelSize);
      }
      if (e.label) {
        (e.label.text as ConstantProperty).setValue(labelText);
      }
    }
  }, [viewer, cubesat, isSelected]);

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
