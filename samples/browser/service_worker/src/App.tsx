import { useEffect } from "react";

function App() {
  useEffect(() => {
    let registration: ServiceWorkerRegistration | undefined;
    async function registerServiceWorker() {
      // Register service worker
      navigator.serviceWorker.register("./service-worker.js");

      // Get registration
      registration = await navigator.serviceWorker.ready;
      const worker = registration.active;
      if (worker) {
        worker.postMessage(
          "This message will trigger the 'message' in the service worker"
        );
      }
    }
    // Clean up the service worker before register the new one
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const registration of registrations) {
          registration.unregister();
      }
     });
    registerServiceWorker();

    return () => {
      registration?.unregister();
    };
  }, []);

  return (
    <>
      <div>Please checkout the "Developer Tools" for console messages.</div>
    </>
  );
}

export default App;
