import { useSyncExternalStore } from 'react'

/**
 * Modern React 19 hook for RxJS / WatermelonDB observables
 */
export function useObservable<T>(observable$: any, initialValue: T): T {
  return useSyncExternalStore(
    (onStoreChange) => {
      const subscription = observable$.subscribe(() => {
        onStoreChange()
      })
      return () => subscription.unsubscribe()
    },
    () => {
      return observable$.value !== undefined ? observable$.value : initialValue
    }
  )
}
