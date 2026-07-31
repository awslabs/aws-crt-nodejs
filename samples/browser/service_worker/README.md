# Service Worker

The sample is a quick demonstration for setup service worker with aws-crt library. The sample would setup an mqtt5 client on service worker installed, and publish a message on service worker "message" event.
The sample would not be maintained until aws-crt claim full support for service worker.

## Setup
0. Install SDK, then change folder to `./samples/browser/service_worker`
1. run `yarn`
2. run `yarn dev`, open another terminal and run `yarn vite -c vite.config.sw.ts build --watch` which will build the service worker in watch mode
3. Load [localhost:3030](http://localhost:3030)
4. Open browser's DevTools/console to track client messages

### Important Note On Testing Service Workers
ServiceWorkers are designed to live for a long time and be available offline.  As such, the caching policies around them are very aggressive, by design.  To help with development it is highly recommended to enable "Update on reload" in Chrome dev tools.

1. Open DevTools
2. Navigate to the _Application_ tab
3. On the left navigation within Application click _Service workers_
4. Toggle "Update on reload"
