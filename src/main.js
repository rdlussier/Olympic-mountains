import { start } from './app.js'

async function boot() {
  let trip
  try {
    const response = await fetch('trips/olympic/trip.json')
    if (!response.ok) throw new Error('HTTP ' + response.status)
    trip = await response.json()
  } catch (error) {
    const body = document.getElementById('body')
    if (body) body.innerHTML = '<p><b>Could not load the trip.</b></p><p><small>' + error.message + '. Open the app once with a connection.</small></p>'
  }

  if (trip) queueMicrotask(() => start(trip))

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    let had = !!navigator.serviceWorker.controller
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (had) location.reload()
      had = true
    })
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => {
      r.update()
    })
  }
}

boot()
