# AWS IOT Service Worker minimal repro

## Setup
1. `yarn`
2. `yarn dev`, open another terminal and run `yarn vite -c vite.config.sw.ts build --watch` which will build the service worker in watch mode
3. Load [localhost:3030](http://localhost:3030)
4. Open browser's DevTools/console to see message(s)

### Important Note On Testing Service Workers
ServiceWorkers are designed to live for a long time and be available offline.  As such, the caching policies around them are very aggressive, by design.  To help with development it is highly recommended to enable "Update on reload" in Chrome dev tools.

1. Open DevTools
2. Navigate to the _Application_ tab
3. On the left navigation within Application click _Service workers_
4. Toggle "Update on reload"
