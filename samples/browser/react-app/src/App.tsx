import './mqtt-patch';
import React, { useEffect } from 'react';
import PubSub from './PubSub';

function App() {
  useEffect(() => {
    PubSub();//first execution
  },[]);

  return (
    <div></div>
  );
}

export default App;
