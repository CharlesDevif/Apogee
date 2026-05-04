import { useEffect, useRef } from "react";
import {
  Cartesian3,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  HeightReference,
  LabelStyle,
  VerticalOrigin,
  HorizontalOrigin,
  Cartesian2,
  ScreenSpaceEventType,
  type Viewer as CesiumViewer,
  type Entity,
} from "cesium";
import { useMissionStore } from "../../store/mission";

const ISS_NORAD_ID = 25544;

const PHOSPHOR = Color.fromCssColorString("#ffb700");
const JADE = Color.fromCssColorString("#7dffb1");
const ALERT = Color.fromCssColorString("#ff4d3d");

function colorFor(noradId: number, isSelected: boolean): Color {
  if (isSelected) return ALERT;
  if (noradId === ISS_NORAD_ID) return PHOSPHOR;
  return JADE.withAlpha(0.85);
}

export function SatelliteLayer({
  viewer,
}: {
  viewer: CesiumViewer | null;
}) {
  const positions = useMissionStore((s) => s.positions);
  const selected = useMissionStore((s) => s.selectedNoradId);
  const selectSat = useMissionStore((s) => s.selectSat);
  const entitiesRef = useRef<Map<number, Entity>>(new Map());

  useEffect(() => {
    if (!viewer) return;
    const handler = viewer.screenSpaceEventHandler;
    const action = (event: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(event.position);
      if (picked && picked.id && typeof picked.id.id === "string") {
        const id = picked.id.id as string;
        if (id.startsWith("sat-")) {
          const noradId = Number(id.replace("sat-", ""));
          if (Number.isFinite(noradId)) {
            selectSat(noradId);
            return;
          }
        }
      }
      selectSat(null);
      viewer.trackedEntity = undefined;
    };
    handler.setInputAction(action, ScreenSpaceEventType.LEFT_CLICK);
    return () => {
      handler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
    };
  }, [viewer, selectSat]);

  useEffect(() => {
    if (!viewer) return;
    const map = entitiesRef.current;
    const seen = new Set<number>();

    for (const [noradId, p] of positions) {
      seen.add(noradId);
      const cart = Cartesian3.fromDegrees(p.lon, p.lat, p.alt);
      const isSelected = selected === noradId;
      const color = colorFor(noradId, isSelected);
      const existing = map.get(noradId);

      if (!existing) {
        const entity = viewer.entities.add({
          id: `sat-${noradId}`,
          position: new ConstantPositionProperty(cart),
          point: {
            pixelSize: noradId === ISS_NORAD_ID ? 14 : 9,
            color,
            outlineColor: PHOSPHOR.withAlpha(0.5),
            outlineWidth: 2,
            heightReference: HeightReference.NONE,
          },
          label: {
            text: p.name,
            font: '10px "JetBrains Mono", monospace',
            fillColor: PHOSPHOR.withAlpha(0.85),
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.BOTTOM,
            horizontalOrigin: HorizontalOrigin.LEFT,
            pixelOffset: new Cartesian2(8, -8),
            showBackground: false,
            scale: noradId === ISS_NORAD_ID ? 1.1 : 0.85,
          },
        });
        map.set(noradId, entity);
      } else {
        (existing.position as ConstantPositionProperty).setValue(cart);
        if (existing.point) {
          (existing.point.color as ConstantProperty).setValue(color);
        }
      }
    }

    for (const [noradId, entity] of map) {
      if (!seen.has(noradId)) {
        viewer.entities.remove(entity);
        map.delete(noradId);
      }
    }
  }, [viewer, positions, selected]);

  useEffect(() => {
    return () => {
      if (!viewer) return;
      for (const e of entitiesRef.current.values()) viewer.entities.remove(e);
      entitiesRef.current.clear();
    };
  }, [viewer]);

  return null;
}
