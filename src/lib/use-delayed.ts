import { useEffect, useState } from "react";

// True once `on` has stayed true for `ms`, so a loading notice never flashes for a fast load
export function useDelayed(on: boolean, ms: number = 300): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!on) {
      return undefined;
    }
    const timer = setTimeout(() => setShown(true), ms);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [on, ms]);
  return on && shown;
}
