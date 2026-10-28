import { useCallback, useState } from "react";

/**
 * Thin promise wrapper around navigator.geolocation, used by the Jobs page's
 * "near me" mode (GET /jobs/nearby needs real longitude/latitude).
 */
export function useGeolocation() {
  const [status, setStatus] = useState("idle"); // idle | requesting | granted | denied | unsupported

  const requestLocation = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        setStatus("unsupported");
        reject(new Error("Geolocation is not supported by this browser."));
        return;
      }
      setStatus("requesting");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setStatus("granted");
          resolve({ longitude: position.coords.longitude, latitude: position.coords.latitude });
        },
        () => {
          setStatus("denied");
          reject(new Error("Location permission was denied."));
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    });
  }, []);

  return { status, requestLocation };
}
