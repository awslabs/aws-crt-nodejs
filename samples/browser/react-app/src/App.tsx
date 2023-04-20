import React, { useEffect, useRef } from 'react';
import { PubSubInstance } from './PubSub';
import { mqtt } from "aws-crt";

function App() {

  const [reactStateQoS, setReactStateQoS] = React.useState(mqtt.QoS.AtMostOnce)
  // We use useRef here to persist the connection across React State changes.
  const instance : any = useRef(null);
  // uncomment the following to see what happens if you do NOT use React State changes:
  // let instance = new PubSubInstance()
  // Then change all instances of `instance.current.<stuff>` to just `instance.<stuff>`
  // In particular. notice how changing QoS while connected leads to the client being disconnected
  // due to the React state re-rendering and resetting the connection. React does this automatically
  // with variables unless you use useRef.

  useEffect(() => {
    instance.current = new PubSubInstance();
  },[]);

  function changeReactStateQoS()
  {
    if (reactStateQoS == mqtt.QoS.AtMostOnce) {
      setReactStateQoS(mqtt.QoS.AtLeastOnce)
      instance.current.logToPage("Changed QoS to at least once (1)")
    }
    else {
      setReactStateQoS(mqtt.QoS.AtMostOnce)
      instance.current.logToPage("Changed QoS to at most once (0)")
    }
    instance.current.logToPage("Is the client setup: " + instance.current.clientSetup)
  }

  function onConnectClick()
  {
    instance.current.connect(reactStateQoS);
  }
  function onDisconnectClick()
  {
    instance.current.disconnect();
  }
  function onPublishClick()
  {
    instance.current.publish(reactStateQoS);
  }

  return (
    <div>
      <button onClick={changeReactStateQoS}>
        Change QoS
      </button>
      <button onClick={onConnectClick}>
        Connect
      </button>
      <button onClick={onDisconnectClick}>
        Disconnect
      </button>
      <button onClick={onPublishClick}>
        Publish
      </button>
    </div>
  );
}

export default App;
