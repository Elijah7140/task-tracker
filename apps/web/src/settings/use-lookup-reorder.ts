import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runs one lookup reorder at a time. Each reorder is computed from the rows
 * on screen, so a second request is ignored until the first has failed or
 * its saved order has arrived as new `rows`. A double-click therefore moves
 * a row once, never twice from a stale order.
 */
export function useLookupReorder<Row>(rows: ReadonlyArray<Row>) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const latestRowsRef = useRef(rows);
  latestRowsRef.current = rows;
  const awaitedRowsRef = useRef<ReadonlyArray<Row> | null>(null);

  const finish = useCallback(() => {
    busyRef.current = false;
    awaitedRowsRef.current = null;
    setBusy(false);
  }, []);

  useEffect(() => {
    if (awaitedRowsRef.current !== null && rows !== awaitedRowsRef.current) {
      finish();
    }
  }, [rows, finish]);

  /** Runs `reorder` unless one is running. It resolves true when it saved a new order. */
  const run = async (reorder: (rows: ReadonlyArray<Row>) => Promise<boolean>) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const startRows = latestRowsRef.current;
    const saved = await reorder(startRows);
    if (!saved || latestRowsRef.current !== startRows) {
      finish();
      return;
    }
    awaitedRowsRef.current = startRows;
  };

  return { busy, run };
}
