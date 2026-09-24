import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from './errors';

export interface RequestState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  // Runs the request again, for a refresh button or after a mutation.
  reload: () => Promise<void>;
  setError: (message: string | null) => void;
}

// Loads something once and again on demand, holding the three pieces of state
// every panel in this console needs: the value, a readable error, and whether a
// request is in flight.
//
// `fetcher` is called with no arguments and must be stable, so wrap it in
// useCallback where it closes over anything that changes. Passing it through
// the dependency list is what makes a filter change refetch.
export function useRequest<T>(fetcher: () => Promise<T>): RequestState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetcher());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setError };
}

// Runs a mutation, reporting failure the same way and tracking which row is
// busy so a list can disable just the button that was pressed. `key` is
// whatever identifies the row; pass true when a page has only one action.
export function useMutation(onError: (message: string | null) => void) {
  const [busyKey, setBusyKey] = useState<string | true | null>(null);

  const run = useCallback(
    async (key: string | true, action: () => Promise<unknown>) => {
      setBusyKey(key);
      onError(null);
      try {
        await action();
        return true;
      } catch (e) {
        onError(errorMessage(e));
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [onError],
  );

  return { busyKey, run, isBusy: (key: string | true) => busyKey === key };
}
