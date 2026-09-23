/** A bounded, single-flight clock pass for background cup advancement. */
export function makeCupPass({ name, limitMs = 120_000, onStall = () => {} }) {
  let running = null
  return {
    get inflight() { return running },
    run(fn) {
      if (running) return running
      let bell
      const timeout = new Promise((_, reject) => {
        bell = setTimeout(() => {
          const error = new Error(`${name}: advancement stalled after ${limitMs} ms`)
          error.stalled = true
          reject(error)
        }, limitMs)
        bell.unref?.()
      })
      const pass = Promise.resolve().then(fn)
      const guarded = Promise.race([pass, timeout])
      running = guarded
      void guarded.then(
        () => { clearTimeout(bell); if (running === guarded) running = null },
        (error) => {
          clearTimeout(bell)
          if (running === guarded) running = null
          if (error?.stalled) onStall(error)
        },
      )
      return guarded
    },
  }
}
