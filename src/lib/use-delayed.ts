import { useEffect, useState } from "react";

// True once `on` has stayed true for 300 ms, so a loading notice never flashes for a fast load
export function useDelayed(on: boolean): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!on) {
      return undefined;
    }
    const timer = setTimeout(() => setShown(true), 300);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [on]);
  return on && shown;
}
