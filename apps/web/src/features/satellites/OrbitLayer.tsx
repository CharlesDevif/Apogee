import { useEffect, useRef } from "react";
import {
  Cartesian3,
  Color,
  PolylineDashMaterialProperty,
  type Viewer as CesiumViewer,
  type Entity,
} from "cesium";
import { useMissionStore } from "../../store/mission";

const PHOSPHOR = Color.fromCssColorString("#ffb700");

export function OrbitLayer({ viewer }: { viewer: CesiumViewer | null }) {
  const orbit = useMissionStore((s) => s.selectedOrbit);
  const entityRef = useRef<Entity | null>(null);

  useEffect(() => {
    if (!viewer) return;

    // Drop the previous trail
    if (entityRef.current) {
      viewer.entities.remove(entityRef.current);
      entityRef.current = null;
    }

    if (!orbit || orbit.points.length < 2) return;

    const positions: Cartesian3[] = orbit.points.map((p) =>
      Cartesian3.fromDegrees(p.lon, p.lat, p.alt),
    );

    entityRef.current = viewer.entities.add({
      id: `orbit-${orbit.noradId}`,
      polyline: {
        positions,
        width: 1.5,
        material: new PolylineDashMaterialProperty({
          color: PHOSPHOR.withAlpha(0.85),
          dashLength: 16,
        }),
        clampToGround: false,
        arcType: 0, // ArcType.NONE — straight lines in 3D space, no geodesic
      },
    });

    return () => {
      if (entityRef.current) {
        viewer.entities.remove(entityRef.current);
        entityRef.current = null;
      }
    };
  }, [viewer, orbit]);

  return null;
}
