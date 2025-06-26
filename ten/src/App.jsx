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
    sipUsername: '',
    sipPassword: '',
    destinationNumber: ''
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

  // Check for emergency codewords
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
      
      // Auto-clear emergency alert after 15 seconds
      setTimeout(() => setEmergencyTriggered(null), 15000);
      
      // Send emergency notification to backend
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

  // Browser Speech Recognition
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

        // Check for emergency
        const isEmergency = await checkForEmergency(spokenText);
        
        if (!apiConfigured) {
          speakText("Please configure your API key first.");
          return;
        }

        // Get AI response
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
          
          // Speak the response
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
        // Restart recognition if call is still active
        setTimeout(() => {
          if (isCallActive && recognition.current) {
            recognition.current.start();
          }
        }, 100);
      }
    };

    recognition.current.start();
  };

  // Text-to-Speech function
  const speakText = (text) => {
    const synth = window.speechSynthesis;
    // Cancel any ongoing speech
    synth.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    
    // Use a female voice if available
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

// Fixed Telnyx WebRTC functions - Version compatible approach
const startTelnyxCall = async () => {
  if (!telnyxConfig.sipUsername || !telnyxConfig.sipPassword) {
    alert('Please configure your Telnyx SIP credentials first.');
    setShowTelnyxConfig(true);
    return;
  }

  try {
    // Dynamically import Telnyx WebRTC
    const { TelnyxRTC } = await import('@telnyx/webrtc');
    
    setTelnyxCallStatus('connecting');
    
    const client = new TelnyxRTC({
      login: telnyxConfig.sipUsername,
      password: telnyxConfig.sipPassword,
      audio: true,
      video: false
    });

    telnyxClientRef.current = client;

    // Handle all events at the client level
    client.on('telnyx.ready', () => {
      console.log('Telnyx client ready');
      
      try {
        // Create and connect the call
        const call = client.newCall({ 
          destinationNumber: telnyxConfig.destinationNumber || telnyxConfig.sipUsername 
        });
        
        telnyxCallRef.current = call;
        
        // Try different connection methods based on available methods
        if (typeof call.connect === 'function') {
          call.connect();
          console.log('Call connection initiated with connect()');
        } else if (typeof call.start === 'function') {
          call.start();
          console.log('Call connection initiated with start()');
        } else if (typeof call.dial === 'function') {
          call.dial();
          console.log('Call connection initiated with dial()');
        } else {
          console.error('No connect method found on call object');
          console.log('Available call methods:', Object.getOwnPropertyNames(call));
          setTelnyxCallStatus('error');
          return;
        }
        
      } catch (callError) {
        console.error('Error creating/connecting call:', callError);
        setTelnyxCallStatus('error');
        alert(`Failed to create call: ${callError.message}`);
      }
    });

    // Handle all call state changes through client notifications
    client.on('telnyx.notification', (notification) => {
      console.log('Telnyx notification:', notification);
      
      // Handle call state changes
      if (notification.call) {
        const callState = notification.call.state;
        console.log('Call state changed to:', callState);
        
        switch (callState) {
          case 'new':
            setTelnyxCallStatus('connecting');
            break;
          case 'ringing':
            setTelnyxCallStatus('ringing');
            break;
          case 'active':
            setTelnyxCallStatus('active');
            break;
          case 'hangup':
          case 'destroy':
          case 'purge':
            setTelnyxCallStatus('idle');
            break;
          default:
            console.log('Unknown call state:', callState);
        }
      }
    });

    // Handle client-level errors
    client.on('telnyx.error', (error) => {
      console.error('Telnyx client error:', error);
      setTelnyxCallStatus('error');
      alert(`Telnyx error: ${error.message || 'Connection failed'}`);
    });

    client.on('telnyx.socket.error', (error) => {
      console.error('Telnyx socket error:', error);
      setTelnyxCallStatus('error');
    });

    client.on('telnyx.socket.close', () => {
      console.log('Telnyx socket closed');
      setTelnyxCallStatus('idle');
    });

    // Connect the client
    client.connect();
    
  } catch (error) {
    console.error('Failed to initialize Telnyx WebRTC:', error);
    setTelnyxCallStatus('error');
    alert('Failed to load Telnyx WebRTC. Make sure the library is installed.');
  }
};

const endTelnyxCall = () => {
  try {
    if (telnyxCallRef.current) {
      telnyxCallRef.current.hangup();
      telnyxCallRef.current = null;
    }
    if (telnyxClientRef.current) {
      telnyxClientRef.current.disconnect();
      telnyxClientRef.current = null;
    }
  } catch (error) {
    console.error('Error ending call:', error);
  } finally {
    setTelnyxCallStatus('idle');
  }
};

// Simplified alternative using client.dial directly
const startTelnyxCallSimple = async () => {
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
      console.log('Telnyx client ready, attempting to dial...');
      
      try {
        // Try direct dial method
        if (typeof client.dial === 'function') {
          const call = client.dial(telnyxConfig.destinationNumber || telnyxConfig.sipUsername);
          telnyxCallRef.current = call;
          console.log('Dial initiated');
        } else {
          console.error('client.dial method not available');
          console.log('Available client methods:', Object.getOwnPropertyNames(client));
        }
        
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

    // Connect the client
    await client.connect();
    
  } catch (error) {
    console.error('Failed to initialize Telnyx:', error);
    setTelnyxCallStatus('error');
    alert(`Initialization error: ${error.message}`);
  }
};

  // End any active call
  const endCall = () => {
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

  // Start call based on mode
  const startCall = () => {
    if (callMode === 'browser') {
      startBrowserVoiceCall();
    } else {
      startTelnyxCall();
    }
  };

  // Send text message
  const sendMessage = async () => {
    if (!currentMessage.trim()) return;

    const userMsg = { 
      id: Date.now(), 
      text: currentMessage, 
      sender: "user", 
      timestamp: new Date() 
    };
    setChatMessages(prev => [...prev, userMsg]);

    // Check for emergency
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

  // Toggle codeword active status
  const toggleCodeword = (id) => {
    setCodewords(prev => prev.map(cw => 
      cw.id === id ? { ...cw, active: !cw.active } : cw
    ));
  };

  const isAnyCallActive = isCallActive || telnyxCallStatus === 'active';

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {/* Emergency Alert */}
      {emergencyTriggered && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-red-100 border border-red-600 p-4 rounded-lg mb-4 animate-pulse">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <h4 className="text-red-800 font-bold">🚨 EMERGENCY TRIGGERED 🚨</h4>
          </div>
          <p className="text-red-700">Codeword: "{emergencyTriggered.codeword}"</p>
          <p className="text-red-700">{emergencyTriggered.location.address}</p>
          <p className="text-red-600 text-sm">Time: {emergencyTriggered.timestamp.toLocaleString()}</p>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Voice Assistant</h1>
        <div className="flex gap-2 items-center">
          {isAnyCallActive && (
            <span className="text-green-600 font-semibold flex items-center gap-1">
              <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
              {callMode === 'browser' ? 'Listening' : `Telnyx: ${telnyxCallStatus}`}
            </span>
          )}
          <Bell className="text-gray-600 w-5 h-5" />
        </div>
      </div>

      {/* API Configuration */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Key className="w-5 h-5" />
          API Configuration
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Groq API Key</label>
            <div className="flex gap-2">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your Groq API key"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="px-3 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`text-sm ${apiConfigured ? 'text-green-600' : 'text-red-600'}`}>
                {apiConfigured ? '✓ Configured' : '✗ Not configured'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Call Mode Selection */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <h3 className="text-lg font-semibold mb-3">Call Mode</h3>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              value="browser"
              checked={callMode === 'browser'}
              onChange={(e) => setCallMode(e.target.value)}
              className="text-blue-600"
            />
            <span>Browser Voice (Speech Recognition)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              value="telnyx"
              checked={callMode === 'telnyx'}
              onChange={(e) => setCallMode(e.target.value)}
              className="text-blue-600"
            />
            <span>Telnyx WebRTC</span>
          </label>
        </div>
      </div>

      {/* Telnyx Configuration */}
      {callMode === 'telnyx' && (
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold">Telnyx Configuration</h3>
            <button
              onClick={() => setShowTelnyxConfig(!showTelnyxConfig)}
              className="text-blue-600 hover:text-blue-800"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
          {showTelnyxConfig && (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="SIP Username"
                value={telnyxConfig.sipUsername}
                onChange={(e) => setTelnyxConfig(prev => ({ ...prev, sipUsername: e.target.value }))}
                className="w-full px-4 py-2 border rounded-lg"
              />
              <input
                type="password"
                placeholder="SIP Password"
                value={telnyxConfig.sipPassword}
                onChange={(e) => setTelnyxConfig(prev => ({ ...prev, sipPassword: e.target.value }))}
                className="w-full px-4 py-2 border rounded-lg"
              />
              <input
                type="text"
                placeholder="Destination Number (optional)"
                value={telnyxConfig.destinationNumber}
                onChange={(e) => setTelnyxConfig(prev => ({ ...prev, destinationNumber: e.target.value }))}
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
          )}
        </div>
      )}

      {/* Voice Controls */}
      <div className="flex gap-4 mb-6">
        {!isAnyCallActive ? (
          <button
            onClick={startCall}
            disabled={!apiConfigured}
            className="bg-green-600 text-white px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Phone className="w-5 h-5" />
            Start {callMode === 'browser' ? 'Voice Chat' : 'Telnyx Call'}
          </button>
        ) : (
          <button
            onClick={endCall}
            className="bg-red-600 text-white px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-red-700"
          >
            <PhoneOff className="w-5 h-5" />
            End Call
          </button>
        )}
      </div>

      {/* Live Transcript */}
      {transcript && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
          <p className="text-sm text-blue-800">
            <strong>You said:</strong> {transcript}
          </p>
        </div>
      )}
      {/* Chat Interface */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <h3 className="text-lg font-semibold mb-4">Chat History</h3>
        <div className="max-h-96 overflow-y-auto space-y-3 mb-4">
          {chatMessages.map(msg => (
            <div key={msg.id} className={`p-3 rounded-lg ${
              msg.sender === 'user' 
                ? 'bg-blue-100 ml-8 text-right' 
                : 'bg-gray-100 mr-8 text-left'
            }`}>
              <p className="text-sm">{msg.text}</p>
              <p className="text-xs text-gray-500 mt-1">
                {msg.timestamp.toLocaleTimeString()}
              </p>
            </div>
          ))}
          {isLoadingResponse && (
            <div className="bg-gray-100 mr-8 p-3 rounded-lg">
              <p className="text-sm text-gray-600">AI is thinking...</p>
            </div>
          )}
        </div>
        
        {/* Text Input */}
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Type your message..."
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoadingResponse}
          />
          <button
            onClick={sendMessage}
            disabled={isLoadingResponse || !currentMessage.trim()}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoiceAssistantApp;


