import React, { useState, useEffect, useRef } from 'react';
import {
  Phone, AlertTriangle, Bell, Key, Eye, EyeOff, PhoneOff, Mic, MicOff, Settings
} from 'lucide-react';


const VoiceAssistantApp = () => {
  const [chatMessages, setChatMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiConfigured, setApiConfigured] = useState(false);
  const [codewords, setCodewords] = useState([
    { id: 1, phrase: "Whens the family gathering?", active: true },
    { id: 2, phrase: "Are you still single?", active: true },
    { id: 3, phrase: "Can you tell me if auntie is okay?", active: false }
  ]);
  const [emergencyTriggered, setEmergencyTriggered] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [callMode, setCallMode] = useState('browser'); 
  
  const [telnyxCallStatus, setTelnyxCallStatus] = useState('idle');
  const [telnyxConfig, setTelnyxConfig] = useState({
    sipUsername: 'userpedromuttenda45174',
    sipPassword: '',
    destinationNumber: 'sip:userpedromuttenda45174@sip.telnyx.com'
  });
  const [showTelnyxConfig, setShowTelnyxConfig] = useState(false);
  
  const recognition = useRef(null);
  const telnyxClientRef = useRef(null);
  const telnyxCallRef = useRef(null);

  useEffect(() => {
    setApiConfigured(apiKey.trim().length > 0);
  }, [apiKey]);

  const callGroq = async (message, messages = []) => {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful voice assistant. Keep responses concise and natural for voice interaction. If a message contains distress language or seems urgent, respond calmly and offer support.'
            },
            ...messages.slice(-5).map(msg => ({
              role: msg.sender === 'user' ? 'user' : 'assistant',
              content: msg.text
            })),
            { role: 'user', content: message }
          ],
          max_tokens: 150,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Groq API Error:', error);
      return "I'm sorry, I'm having trouble connecting right now. Please try again.";
    }
  };

  const getCurrentLocation = () => {
    return new Promise((resolve) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            address: `Location: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`
          }),
          (error) => {
            console.error('Location error:', error);
            resolve({ lat: 0, lng: 0, address: "Location unavailable" });
          }
        );
      } else {
        resolve({ lat: 0, lng: 0, address: "Location unavailable" });
      }
    });
  };

  const checkForEmergency = async (text) => {
    const triggered = codewords.find(cw =>
      cw.active && text.toLowerCase().includes(cw.phrase.toLowerCase())
    );
    
    if (triggered) {
      const loc = await getCurrentLocation();
      setEmergencyTriggered({ 
        codeword: triggered.phrase, 
        location: loc, 
        timestamp: new Date() 
      });
      
      setTimeout(() => setEmergencyTriggered(null), 15000);
      
      try {
        await fetch('/api/emergency', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codeword: triggered.phrase,
            location: loc,
            timestamp: new Date().toISOString()
          })
        });
      } catch (error) {
        console.error('Failed to send emergency notification:', error);
      }
      
      return true;
    }
    return false;
  };

  const startBrowserVoiceCall = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    recognition.current = new SpeechRecognition();
    recognition.current.lang = 'en-US';
    recognition.current.interimResults = false;
    recognition.current.continuous = true;
    recognition.current.maxAlternatives = 1;

    setIsCallActive(true);
    setTranscript('');

    recognition.current.onstart = () => {
      console.log('Speech recognition started');
    };

    recognition.current.onresult = async (event) => {
      const lastResult = event.results[event.results.length - 1];
      if (lastResult.isFinal) {
        const spokenText = lastResult[0].transcript;
        setTranscript(spokenText);

        const userMsg = { 
          id: Date.now(), 
          text: spokenText, 
          sender: "user", 
          timestamp: new Date() 
        };
        setChatMessages(prev => [...prev, userMsg]);

        const isEmergency = await checkForEmergency(spokenText);
        
        if (!apiConfigured) {
          speakText("Please configure your API key first.");
          return;
        }

        setIsLoadingResponse(true);
        try {
          const reply = await callGroq(spokenText, chatMessages);
          const aiMsg = { 
            id: Date.now() + Math.random(), 
            text: reply, 
            sender: "ai", 
            timestamp: new Date() 
          };
          setChatMessages(prev => [...prev, aiMsg]);
          
          speakText(reply);
        } catch (error) {
          console.error('Error getting AI response:', error);
          speakText("Sorry, I couldn't process that. Please try again.");
        } finally {
          setIsLoadingResponse(false);
        }
      }
    };

    recognition.current.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === 'no-speech') {
        console.log('No speech detected, continuing...');
      } else {
        setIsCallActive(false);
        alert(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.current.onend = () => {
      if (isCallActive) {
        setTimeout(() => {
          if (isCallActive && recognition.current) {
            recognition.current.start();
          }
        }, 100);
      }
    };

    recognition.current.start();
  };

  const speakText = (text) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    
    const voices = synth.getVoices();
    const femaleVoice = voices.find(voice => 
      voice.name.includes('Female') || 
      voice.name.includes('Samantha') || 
      voice.name.includes('Karen')
    );
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }
    
    synth.speak(utterance);
  };



 const startTelnyxCall = async () => {
    if (!telnyxConfig.sipUsername || !telnyxConfig.sipPassword) {
      alert('Please configure your Telnyx SIP credentials first.');
      setShowTelnyxConfig(true);
      return;
    }

    try {
      const { TelnyxRTC } = await import('@telnyx/webrtc');

      setTelnyxCallStatus('connecting');

      const client = new TelnyxRTC({
        login: telnyxConfig.sipUsername,
        password: telnyxConfig.sipPassword
      });

      telnyxClientRef.current = client;

      client.on('telnyx.ready', () => {
        console.log('Telnyx client ready, attempting to dial AI assistant...');

        try {
          const call = client.newCall({
          destinationNumber: telnyxConfig.destinationNumber
          }); 

telnyxCallRef.current = call;
console.log('Dial to AI Assistant initiated');

          telnyxCallRef.current = call;
          console.log('Dial to AI Assistant initiated');
        } catch (dialError) {
          console.error('Error dialing:', dialError);
          setTelnyxCallStatus('error');
          alert(`Failed to dial: ${dialError.message}`);
        }
      });

      client.on('telnyx.notification', (notification) => {
        console.log('Notification received:', notification);

        if (notification.call && notification.call.state) {
          const state = notification.call.state;
          console.log('Call state:', state);

          switch (state) {
            case 'ringing':
              setTelnyxCallStatus('ringing');
              break;
            case 'active':
              setTelnyxCallStatus('active');
              break;
            case 'hangup':
            case 'destroy':
              setTelnyxCallStatus('idle');
              break;
          }
        }
      });

      client.on('telnyx.error', (error) => {
        console.error('Telnyx error:', error);
        setTelnyxCallStatus('error');
        alert(`Telnyx error: ${error.message || 'Connection failed'}`);
      });

      await client.connect();

    } catch (error) {
      console.error('Failed to initialize Telnyx:', error);
      setTelnyxCallStatus('error');
      alert(`Initialization error: ${error.message}`);
    }
  };


  const endTelnyxCall = () => {
    if (callMode === 'browser') {
      if (recognition.current) {
        recognition.current.stop();
      }
      setIsCallActive(false);
      setTranscript('');
    } else {
      endTelnyxCall();
    }
  };
  const startCall = () => {
    if (callMode === 'browser') {
      startBrowserVoiceCall();
    } else {
      startTelnyxCall();
    }
  };

  const sendMessage = async () => {
    if (!currentMessage.trim()) return;

    const userMsg = { 
      id: Date.now(), 
      text: currentMessage, 
      sender: "user", 
      timestamp: new Date() 
    };
    setChatMessages(prev => [...prev, userMsg]);

    await checkForEmergency(currentMessage);

    const messageToSend = currentMessage;
    setCurrentMessage('');

    if (!apiConfigured) {
      setChatMessages(prev => [...prev, {
        id: Date.now() + Math.random(),
        text: "Please configure your Groq API key first.",
        sender: "ai",
        timestamp: new Date()
      }]);
      return;
    }

    setIsLoadingResponse(true);
    try {
      const reply = await callGroq(messageToSend, chatMessages);
      const aiMsg = { 
        id: Date.now() + Math.random(), 
        text: reply, 
        sender: "ai", 
        timestamp: new Date() 
      };
      setChatMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      console.error('Error sending message:', error);
      setChatMessages(prev => [...prev, {
        id: Date.now() + Math.random(),
        text: "Sorry, I'm having trouble responding right now. Please check your API key and try again.",
        sender: "ai", 
        timestamp: new Date()
      }]);
    } finally {
      setIsLoadingResponse(false);
    }
  };

  const toggleCodeword = (id) => {
    setCodewords(prev => prev.map(cw => 
      cw.id === id ? { ...cw, active: !cw.active } : cw
    ));
  };

  const isAnyCallActive = isCallActive || telnyxCallStatus === 'active';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', padding: '16px' }}>
      {emergencyTriggered && (
        <div style={{
          position: 'fixed',
          top: '16px',
          left: '16px',
          right: '16px',
          zIndex: 50,
          backgroundColor: '#fef2f2',
          border: '1px solid #dc2626',
          padding: '16px',
          borderRadius: '8px',
          marginBottom: '16px',
          animation: 'pulse 2s infinite'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle style={{ width: '24px', height: '24px', color: '#dc2626' }} />
            <h4 style={{ color: '#991b1b', fontWeight: 'bold' }}>🚨 EMERGENCY TRIGGERED 🚨</h4>
          </div>
          <p style={{ color: '#b91c1c' }}>Codeword: "{emergencyTriggered.codeword}"</p>
          <p style={{ color: '#b91c1c' }}>{emergencyTriggered.location.address}</p>
          <p style={{ color: '#dc2626', fontSize: '14px' }}>Time: {emergencyTriggered.timestamp.toLocaleString()}</p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#374151' }}>Voice Assistant</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isAnyCallActive && (
            <span style={{ color: '#059669', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', backgroundColor: '#059669', borderRadius: '50%', animation: 'pulse 2s infinite' }}></div>
              {callMode === 'browser' ? 'Listening' : `Telnyx: ${telnyxCallStatus}`}
            </span>
          )}
          <Bell style={{ color: '#6b7280', width: '20px', height: '20px' }} />
        </div>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Key style={{ width: '20px', height: '20px' }} />
          API Configuration
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>Groq API Key</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  outline: 'none'
                }}
                placeholder="Enter your Groq API key"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                style={{
                  padding: '8px 12px',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  backgroundColor: 'white',
                  cursor: 'pointer'
                }}
              >
                {showApiKey ? <EyeOff style={{ width: '16px', height: '16px' }} /> : <Eye style={{ width: '16px', height: '16px' }} />}
              </button>
            </div>
            <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', color: apiConfigured ? '#059669' : '#dc2626' }}>
                {apiConfigured ? '✓ Configured' : '✗ Not configured'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>Call Mode</h3>
        <div style={{ display: 'flex', gap: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="radio"
              value="browser"
              checked={callMode === 'browser'}
              onChange={(e) => setCallMode(e.target.value)}
              style={{ color: '#2563eb' }}
            />
            <span>Browser Voice (Speech Recognition)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="radio"
              value="telnyx"
              checked={callMode === 'telnyx'}
              onChange={(e) => setCallMode(e.target.value)}
              style={{ color: '#2563eb' }}
            />
            <span>Telnyx WebRTC</span>
          </label>
        </div>
      </div>

      {callMode === 'telnyx' && (
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600' }}>Telnyx Configuration</h3>
            <button
              onClick={() => setShowTelnyxConfig(!showTelnyxConfig)}
              style={{ color: '#2563eb', backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <Settings style={{ width: '20px', height: '20px' }} />
            </button>
          </div>
          {showTelnyxConfig && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                placeholder="SIP Username"
                value={telnyxConfig.sipUsername}
                onChange={(e) => setTelnyxConfig(prev => ({ ...prev, sipUsername: e.target.value }))}
                style={{ width: '100%', padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '8px' }}
              />
              <input
                type="password"
                placeholder="SIP Password"
                value={telnyxConfig.sipPassword}
                onChange={(e) => setTelnyxConfig(prev => ({ ...prev, sipPassword: e.target.value }))}
                style={{ width: '100%', padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '8px' }}
              />
              <input
                type="text"
                placeholder="Destination Number (optional)"
                value={telnyxConfig.destinationNumber}
                onChange={(e) => setTelnyxConfig(prev => ({ ...prev, destinationNumber: e.target.value }))}
                style={{ width: '100%', padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '8px' }}
              />
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        {!isAnyCallActive ? (
          <button
            onClick={startCall}
            disabled={!apiConfigured}
            style={{
              backgroundColor: '#059669',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              border: 'none',
              cursor: apiConfigured ? 'pointer' : 'not-allowed',
              opacity: apiConfigured ? 1 : 0.5
            }}
          >
            <Phone style={{ width: '20px', height: '20px' }} />
            Start {callMode === 'browser' ? 'Voice Chat' : 'Telnyx Call'}
          </button>
        ) : (
          <button
            onClick={endTelnyxCall}
            style={{
              backgroundColor: '#dc2626',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <PhoneOff style={{ width: '20px', height: '20px' }} />
            End Call
          </button>
        )}
      </div>

      {transcript && (
        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #3b82f6', borderRadius: '8px', padding: '12px', marginBottom: '24px' }}>
          <p style={{ fontSize: '14px', color: '#1e40af' }}>
            <strong>You said:</strong> {transcript}
          </p>
        </div>
      )}

      <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Chat History</h3>
        <div style={{ maxHeight: '384px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          {chatMessages.map(msg => (
            <div key={msg.id} style={{
              padding: '12px',
              borderRadius: '8px',
              ...(msg.sender === 'user' 
                ? { backgroundColor: '#dbeafe', marginLeft: '32px', textAlign: 'right' } 
                : { backgroundColor: '#f3f4f6', marginRight: '32px', textAlign: 'left' })
            }}>
              <p style={{ fontSize: '14px' }}>{msg.text}</p>
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                {msg.timestamp.toLocaleTimeString()}
              </p>
            </div>
          ))}
          {isLoadingResponse && (
            <div style={{ backgroundColor: '#f3f4f6', marginRight: '32px', padding: '12px', borderRadius: '8px' }}>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>AI is thinking...</p>
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            placeholder="Type your message..."
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            style={{
              flex: 1,
              padding: '8px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              outline: 'none'
            }}
            disabled={isLoadingResponse}
          />
          <button
            onClick={sendMessage}
            disabled={isLoadingResponse || !currentMessage.trim()}
            style={{
              backgroundColor: '#2563eb',
              color: 'white',
              padding: '8px 24px',
              borderRadius: '8px',
              border: 'none',
              cursor: (isLoadingResponse || !currentMessage.trim()) ? 'not-allowed' : 'pointer',
              opacity: (isLoadingResponse || !currentMessage.trim()) ? 0.5 : 1
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoiceAssistantApp;