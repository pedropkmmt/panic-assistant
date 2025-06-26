import React, { useState, useRef } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';
import { Phone, PhoneOff } from 'lucide-react';

const TelnyxVoiceAssistant = () => {
  const [callStatus, setCallStatus] = useState('idle');
  const clientRef = useRef(null);
  const callRef = useRef(null);

  const SIP_USERNAME = 'YOUR_SIP_USERNAME';
  const SIP_PASSWORD = 'YOUR_SIP_PASSWORD';
  const SIP_URI = `sip:${SIP_USERNAME}@sip.telnyx.com`;

  const startCall = () => {
    setCallStatus('connecting');
    const client = new TelnyxRTC({
      login: SIP_USERNAME,
      password: SIP_PASSWORD,
      audio: true
    });

    clientRef.current = client;

    client.on('telnyx.ready', () => {
      const call = client.newCall({ destinationNumber: SIP_URI });
      call.connect();
      callRef.current = call;
    });

    client.on('telnyx.notification', ({ call }) => {
      if (call.state === 'active') {
        setCallStatus('active');
      }
      if (call.state === 'hangup') {
        setCallStatus('idle');
      }
    });

    client.on('telnyx.error', (err) => {
      console.error('Telnyx error:', err);
      setCallStatus('error');
    });
  };

  const endCall = () => {
    if (callRef.current) {
      callRef.current.hangup();
    }
    setCallStatus('idle');
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-2">AI Voice Assistant</h2>
      <p>Status: <strong>{callStatus}</strong></p>

      {callStatus === 'idle' && (
        <button
          onClick={startCall}
          className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2 mt-3"
        >
          <Phone className="w-5 h-5" /> Call AI
        </button>
      )}

      {callStatus === 'active' && (
        <button
          onClick={endCall}
          className="bg-red-600 text-white px-4 py-2 rounded flex items-center gap-2 mt-3"
        >
          <PhoneOff className="w-5 h-5" /> End Call
        </button>
      )}
    </div>
  );
};

export default TelnyxVoiceAssistant;
