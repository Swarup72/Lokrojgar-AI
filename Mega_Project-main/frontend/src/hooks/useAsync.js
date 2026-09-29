import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeError } from "../api/client";

/**
 * Generic {data, error, loading, run} wrapper around a promise-returning
 * function, so pages don't hand-roll the same loading/error state machine
 * repeatedly.
 *
 * @param {(...args:any[]) => Promise<any>} asyncFn
 * @param {{immediate?: boolean, deps?: any[]}} [options] `immediate` (default
 *   true) runs `asyncFn` on mount and whenever `deps` changes - set to false
 *   for actions (mutations) that should only run when `run()` is called
 *   explicitly (e.g. a submit handler).
 */
export function useAsync(asyncFn, { immediate = true, deps = [] } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const asyncFnRef = useRef(asyncFn);
  asyncFnRef.current = asyncFn;

  const run = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const result = await asyncFnRef.current(...args);
      setData(result);
      return result;
    } catch (err) {
      const normalized = err && "isNetworkError" in err ? err : normalizeError(err);
      setError(normalized);
      throw normalized;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (immediate) {
      run().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, immediate]);

  return { data, error, loading, run };
}
