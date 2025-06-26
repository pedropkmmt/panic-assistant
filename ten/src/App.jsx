
import React, { useState, useEffect, useRef } from 'react';
import {
  Phone, AlertTriangle, Bell, Key, Eye, EyeOff, PhoneOff, Settings, Send, Bot, User
} from 'lucide-react';

const VoiceAssistantApp = () => {
  const [chatMessages, setChatMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiConfigured, setApiConfigured] = useState(false);
  const [codewords, setCodewords] = useState([
    { id: 1, phrase: "When is the family gathering?", active: true },
    { id: 2, phrase: "Are you still single?", active: true },
    { id: 3, phrase: "Can you tell me if auntie is okay?", active: true }
  ]);
  const [emergencyTriggered, setEmergencyTriggered] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [callMode, setCallMode] = useState('browser'); 
  
  const [telnyxCallStatus, setTelnyxCallStatus] = useState('idle');
  const [telnyxApiKey, setTelnyxApiKey] = useState('');
  const [showTelnyxApiKey, setShowTelnyxApiKey] = useState(false);
  const [telnyxApiConfigured, setTelnyxApiConfigured] = useState(false);
  const [telnyxConfig, setTelnyxConfig] = useState({
    sipUsername: 'userpedromuttenda12144',
    sipPassword: '',
    destinationNumber: 'sip:userpedromuttenda12144@sip.telnyx.com'
  });
  const [showTelnyxConfig, setShowTelnyxConfig] = useState(false);
  
  const recognition = useRef(null);
  const telnyxClientRef = useRef(null);
  const telnyxCallRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    setApiConfigured(apiKey.trim().length > 0);
  }, [apiKey]);

  useEffect(() => {
    setTelnyxApiConfigured(telnyxApiKey.trim().length > 0);
  }, [telnyxApiKey]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

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
    if (!telnyxApiConfigured) {
      alert('Please configure your Telnyx API key first.');
      return;
    }

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
        password: telnyxConfig.sipPassword,
        api_key: telnyxApiKey
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

  const endCall = () => {
    if (callMode === 'browser') {
      if (recognition.current) {
        recognition.current.stop();
      }
      setIsCallActive(false);
      setTranscript('');
    } else {
      if (telnyxCallRef.current) {
        telnyxCallRef.current.hangup();
      }
      if (telnyxClientRef.current) {
        telnyxClientRef.current.disconnect();
      }
      setTelnyxCallStatus('idle');
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

  const isAnyCallActive = isCallActive || telnyxCallStatus === 'active';
  const canStartCall = callMode === 'browser' ? apiConfigured : (apiConfigured && telnyxApiConfigured);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f5f5',
      padding: '20px',
      fontFamily: 'Arial, sans-serif'
    }}>
      
      {emergencyTriggered && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          right: '20px',
          zIndex: 1000,
          background: '#ff4444',
          color: 'white',
          padding: '20px',
          border: '2px solid #cc0000',
          borderRadius: '8px',
          boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <AlertTriangle size={28} />
            <h3 style={{ margin: 0, fontSize: '18px' }}>🚨 EMERGENCY TRIGGERED 🚨</h3>
          </div>
          <p style={{ margin: '8px 0' }}>Codeword: "{emergencyTriggered.codeword}"</p>
          <p style={{ margin: '8px 0' }}>{emergencyTriggered.location.address}</p>
          <p style={{ margin: '8px 0' }}>Calling Police</p>
          <p style={{ margin: '8px 0' }}>Texting Emergency Contact </p>
          <p style={{ margin: '8px 0', fontSize: '12px' }}>
            Time: {emergencyTriggered.timestamp.toLocaleString()}
          </p>
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '30px',
        padding: '20px',
        background: '#333',
        color: 'white',
        borderRadius: '8px'
      }}>
        <h1 style={{ margin: 0, fontSize: '24px' }}>Silent Guardian</h1>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          {isAnyCallActive && (
            <div style={{
              color: '#4CAF50',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(76, 175, 80, 0.2)',
              padding: '8px 16px',
              borderRadius: '20px'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                backgroundColor: '#4CAF50',
                borderRadius: '50%'
              }}></div>
              {callMode === 'browser' ? 'Listening' : `Telnyx: ${telnyxCallStatus}`}
            </div>
          )}
          <Bell size={24} />
        </div>
      </div>

     
      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '20px',
        border: '1px solid #ddd'
      }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Key size={20} />
          API Configuration
        </h3>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Groq API Key
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{
                flex: 1,
                padding: '10px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '14px'
              }}
              placeholder="Enter your Groq API key"
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              style={{
                padding: '10px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div style={{ marginTop: '8px' }}>
            <span style={{ 
              fontSize: '14px', 
              color: apiConfigured ? '#28a745' : '#dc3545',
              fontWeight: 'bold'
            }}>
              {apiConfigured ? '✓ Configured' : '✗ Not configured'}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Telnyx API Key
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type={showTelnyxApiKey ? "text" : "password"}
              value={telnyxApiKey}
              onChange={(e) => setTelnyxApiKey(e.target.value)}
              style={{
                flex: 1,
                padding: '10px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '14px'
              }}
              placeholder="Enter your Telnyx API key"
            />
            <button
              onClick={() => setShowTelnyxApiKey(!showTelnyxApiKey)}
              style={{
                padding: '10px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {showTelnyxApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div style={{ marginTop: '8px' }}>
            <span style={{ 
              fontSize: '14px', 
              color: telnyxApiConfigured ? '#28a745' : '#dc3545',
              fontWeight: 'bold'
            }}>
              {telnyxApiConfigured ? '✓ Configured' : '✗ Not configured'}
            </span>
          </div>
        </div>
      </div>

     
      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '20px',
        border: '1px solid #ddd'
      }}>
        <h3 style={{ margin: '0 0 16px 0' }}>Call Mode</h3>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            padding: '10px',
            borderRadius: '4px',
            background: callMode === 'browser' ? '#e3f2fd' : '#f8f9fa'
          }}>
            <input
              type="radio"
              value="browser"
              checked={callMode === 'browser'}
              onChange={(e) => setCallMode(e.target.value)}
            />
            <span>Speech Recognition</span>
          </label>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            padding: '10px',
            borderRadius: '4px',
            background: callMode === 'telnyx' ? '#e3f2fd' : '#f8f9fa'
          }}>
            <input
              type="radio"
              value="telnyx"
              checked={callMode === 'telnyx'}
              onChange={(e) => setCallMode(e.target.value)}
            />
            <span>Telnyx WebRTC</span>
          </label>
        </div>
      </div>

      
      {callMode === 'telnyx' && (
        <div style={{
          background: 'white',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px',
          border: '1px solid #ddd'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Telnyx SIP Configuration</h3>
            <button
              onClick={() => setShowTelnyxConfig(!showTelnyxConfig)}
              style={{
                padding: '8px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <Settings size={16} />
            </button>
          </div>
          {showTelnyxConfig && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input
                type="text"
                placeholder="SIP Username"
                value={telnyxConfig.sipUsername}
                onChange={(e) => setTelnyxConfig(prev => ({ ...prev, sipUsername: e.target.value }))}
                style={{
                  padding: '10px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
              <input
                type="password"
                placeholder="SIP Password"
                value={telnyxConfig.sipPassword}
                onChange={(e) => setTelnyxConfig(prev => ({ ...prev, sipPassword: e.target.value }))}
                style={{
                  padding: '10px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
              <input
                type="text"
                placeholder="Destination Number"
                value={telnyxConfig.destinationNumber}
                onChange={(e) => setTelnyxConfig(prev => ({ ...prev, destinationNumber: e.target.value }))}
                style={{
                  padding: '10px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>
          )}
        </div>
      )}

      
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', justifyContent: 'center' }}>
        {!isAnyCallActive ? (
          <button
            onClick={startCall}
            disabled={!canStartCall}
            style={{
              padding: '16px 32px',
              background: canStartCall ? '#28a745' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: canStartCall ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            <Phone size={20} />
            Start {callMode === 'browser' ? 'Voice Chat' : 'Telnyx Call'}
          </button>
        ) : (
          <button
            onClick={endCall}
            style={{
              padding: '16px 32px',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            <PhoneOff size={20} />
            End Call
          </button>
        )}
      </div>

      
      {transcript && (
        <div style={{
          background: '#e3f2fd',
          border: '2px solid #2196f3',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          <p style={{ fontSize: '14px', color: '#1976d2', margin: 0 }}>
            <strong>You said:</strong> {transcript}
          </p>
        </div>
      )}

      
      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '20px',
        border: '1px solid #ddd'
      }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bot size={20} />
          Chat History
        </h3>
        
        <div style={{
          height: '400px',
          overflowY: 'auto',
          border: '1px solid #eee',
          borderRadius: '4px',
          padding: '16px',
          marginBottom: '16px',
          background: '#fafafa'
        }}>
          {chatMessages.length === 0 && (
            <div style={{ 
              textAlign: 'center', 
              color: '#666', 
              padding: '40px 20px'
            }}>
              <Bot size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
              <p>Start a conversation by typing a message or starting a voice call!</p>
            </div>
          )}
          
          {chatMessages.map(msg => (
            <div 
              key={msg.id} 
              style={{
                marginBottom: '16px',
                padding: '12px',
                borderRadius: '8px',
                maxWidth: '80%',
                marginLeft: msg.sender === 'user' ? 'auto' : '0',
                marginRight: msg.sender === 'user' ? '0' : 'auto',
                background: msg.sender === 'user' ? '#007bff' : '#f8f9fa',
                color: msg.sender === 'user' ? 'white' : '#333',
                border: msg.sender === 'user' ? 'none' : '1px solid #dee2e6'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                {msg.sender === 'ai' && (
                  <Bot size={16} style={{ marginTop: '2px', opacity: 0.7 }} />
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px 0', fontSize: '14px', lineHeight: '1.4' }}>
                    {msg.text}
                  </p>
                  <p style={{ margin: 0, fontSize: '11px', opacity: 0.7 }}>
                    {msg.timestamp.toLocaleTimeString()}
                  </p>
                </div>
                {msg.sender === 'user' && (
                  <User size={16} style={{ marginTop: '2px', opacity: 0.7 }} />
                )}
              </div>
            </div>
          ))}
          
          {isLoadingResponse && (
            <div style={{
              marginBottom: '16px',
              padding: '12px',
              borderRadius: '8px',
              maxWidth: '80%',
              background: '#f8f9fa',
              border: '1px solid #dee2e6'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <Bot size={16} style={{ marginTop: '2px', opacity: 0.7 }} />
                <div>
                  <span style={{ fontSize: '14px' }}>AI is thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            placeholder="Type your message..."
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            style={{
              flex: 1,
              padding: '12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '14px'
            }}
            disabled={isLoadingResponse}
          />
          <button
            onClick={sendMessage}
            disabled={isLoadingResponse || !currentMessage.trim()}
            style={{
              padding: '12px 16px',
              background: (isLoadingResponse || !currentMessage.trim()) ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (isLoadingResponse || !currentMessage.trim()) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoiceAssistantApp;