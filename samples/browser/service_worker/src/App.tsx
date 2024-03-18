import { useEffect } from "react";

function App() {
  useEffect(() => {
    let registration: ServiceWorkerRegistration | undefined;
    async function registerServiceWorker() {
      // Register service worker
      navigator.serviceWorker.register("/service-worker.js");

      // Get registration
      registration = await navigator.serviceWorker.ready;
      const worker = registration.active;
      if (worker) {
        worker.postMessage(
          "This message will trigger the 'message' in the service worker"
        );
      }
    }

    registerServiceWorker();

    return () => {
      registration?.unregister();
    };
  }, []);

  return (
    <>
      <div>The UI is not actually used</div>
    </>
  );
}

export default App;
