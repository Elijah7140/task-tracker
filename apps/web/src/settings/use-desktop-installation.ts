import { useEffect, useState } from "react";
import {
  type DesktopInstallationInfo,
  readDesktopInstallation,
} from "../native/desktop-installation.js";

/**
 * The desktop shell's version and installed-build state, read once per mount.
 * Undefined while it loads and outside Electron.
 */
export function useDesktopInstallation(): DesktopInstallationInfo | undefined {
  const [installation, setInstallation] = useState<DesktopInstallationInfo>();
  useEffect(() => {
    let current = true;
    void readDesktopInstallation().then((info) => {
      if (current) {
        setInstallation(info);
      }
    });
    return () => {
      current = false;
    };
  }, []);
  return installation;
}
