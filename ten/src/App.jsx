import React, { useState, useEffect, useRef } from 'react';
import {
  Phone, AlertTriangle, Bell, Key, Eye, EyeOff, PhoneOff, Mic, MicOff, Settings, Send, Bot, User
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
  const [telnyxConfig, setTelnyxConfig] = useState({
    sipUsername: '',
    sipPassword: '',
    destinationNumber: ''
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

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'grey',
      padding: '20px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    },
    emergencyAlert: {
      position: 'fixed',
      top: '20px',
      left: '20px',
      right: '20px',
      zIndex: 1000,
      background: 'linear-gradient(135deg, #ff6b6b, #ee5a52)',
      color: 'white',
      padding: '20px',
      borderRadius: '16px',
      boxShadow: '0 10px 30px rgba(255, 107, 107, 0.3)',
      animation: 'pulse 2s infinite, slideDown 0.5s ease-out',
      border: '2px solid rgba(255, 255, 255, 0.2)'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '30px',
      padding: '0 10px'
    },
    title: {
      fontSize: '32px',
      fontWeight: '700',
      color: 'white',
      textShadow: '0 2px 4px rgba(0,0,0,0.3)',
      letterSpacing: '-0.5px'
    },
    statusContainer: {
      display: 'flex',
      gap: '15px',
      alignItems: 'center'
    },
    activeStatus: {
      color: '#4ade80',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      background: 'rgba(74, 222, 128, 0.1)',
      padding: '8px 16px',
      borderRadius: '20px',
      backdropFilter: 'blur(10px)'
    },
    pulsingDot: {
      width: '10px',
      height: '10px',
      backgroundColor: '#4ade80',
      borderRadius: '50%',
      animation: 'pulse 2s infinite'
    },
    card: {
      background: 'rgba(255, 255, 255, 0.95)',
      borderRadius: '20px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
      padding: '24px',
      marginBottom: '24px',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease'
    },
    cardHover: {
      transform: 'translateY(-2px)',
      boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15)'
    },
    cardTitle: {
      fontSize: '20px',
      fontWeight: '600',
      marginBottom: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      color: '#1f2937'
    },
    input: {
      width: '100%',
      padding: '12px 16px',
      border: '2px solid #e5e7eb',
      borderRadius: '12px',
      fontSize: '14px',
      transition: 'all 0.2s ease',
      background: 'rgba(255, 255, 255, 0.8)',
      outline: 'none'
    },
    inputFocus: {
      borderColor: '#667eea',
      boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.1)',
      background: 'white'
    },
    button: {
      padding: '12px 24px',
      borderRadius: '12px',
      border: 'none',
      fontWeight: '600',
      fontSize: '14px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      position: 'relative',
      outline: 'none'
    },
    primaryButton: {
      background: 'linear-gradient(135deg, #667eea, #764ba2)',
      color: 'white',
      boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)'
    },
    primaryButtonHover: {
      transform: 'translateY(-1px)',
      boxShadow: '0 6px 20px rgba(102, 126, 234, 0.4)'
    },
    successButton: {
      background: 'linear-gradient(135deg, #10b981, #059669)',
      color: 'white',
      boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)'
    },
    dangerButton: {
      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
      color: 'white',
      boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)'
    },
    chatContainer: {
      height: '500px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      marginBottom: '20px',
      padding: '10px',
      scrollbarWidth: 'thin',
      scrollbarColor: '#cbd5e1 transparent'
    },
    messageUser: {
      alignSelf: 'flex-end',
      maxWidth: '80%',
      background: 'linear-gradient(135deg, #667eea, #764ba2)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '18px 18px 4px 18px',
      boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
      animation: 'slideInRight 0.3s ease-out'
    },
    messageAI: {
      alignSelf: 'flex-start',
      maxWidth: '80%',
      background: 'rgba(248, 250, 252, 0.9)',
      color: '#1f2937',
      padding: '12px 16px',
      borderRadius: '18px 18px 18px 4px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      border: '1px solid rgba(226, 232, 240, 0.5)',
      animation: 'slideInLeft 0.3s ease-out'
    },
    messageText: {
      fontSize: '14px',
      lineHeight: '1.5',
      margin: '0'
    },
    timestamp: {
      fontSize: '11px',
      opacity: 0.7,
      marginTop: '4px'
    },
    inputContainer: {
      display: 'flex',
      gap: '12px',
      alignItems: 'flex-end'
    },
    transcriptBox: {
      background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
      border: '2px solid #3b82f6',
      borderRadius: '12px',
      padding: '16px',
      marginBottom: '20px',
      animation: 'fadeIn 0.3s ease-out'
    },
    loadingDots: {
      display: 'flex',
      gap: '4px',
      alignItems: 'center'
    },
    dot: {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      backgroundColor: '#9ca3af',
      animation: 'bounce 1.4s infinite ease-in-out'
    },
    radioGroup: {
      display: 'flex',
      gap: '20px',
      flexWrap: 'wrap'
    },
    radioLabel: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      cursor: 'pointer',
      padding: '10px 16px',
      borderRadius: '10px',
      transition: 'background-color 0.2s ease',
      background: 'rgba(248, 250, 252, 0.5)'
    },
    radioLabelActive: {
      background: 'rgba(102, 126, 234, 0.1)',
      color: '#667eea'
    }
  };

  const keyframes = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @keyframes slideDown {
      from { transform: translateY(-100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes slideInRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideInLeft {
      from { transform: translateX(-100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }
    .dot:nth-child(1) { animation-delay: -0.32s; }
    .dot:nth-child(2) { animation-delay: -0.16s; }
    .dot:nth-child(3) { animation-delay: 0s; }
  `;

  return (
    <div style={styles.container}>
      <style>{keyframes}</style>
      
      {emergencyTriggered && (
        <div style={styles.emergencyAlert}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <AlertTriangle size={28} />
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>🚨 EMERGENCY TRIGGERED 🚨</h3>
          </div>
          <p style={{ margin: '8px 0', fontSize: '16px' }}>Codeword: "{emergencyTriggered.codeword}"</p>
          <p style={{ margin: '8px 0', fontSize: '14px' }}>{emergencyTriggered.location.address}</p>
          <p style={{ margin: '8px 0', fontSize: '12px', opacity: 0.9 }}>
            Time: {emergencyTriggered.timestamp.toLocaleString()}
          </p>
        </div>
      )}

      <div style={styles.header}>
        <h1 style={styles.title}>Silent Guardian</h1>
        <div style={styles.statusContainer}>
          {isAnyCallActive && (
            <div style={styles.activeStatus}>
              <div style={styles.pulsingDot}></div>
              {callMode === 'browser' ? 'Listening' : `Telnyx: ${telnyxCallStatus}`}
            </div>
          )}
          <Bell size={24} color="white" style={{ opacity: 0.8 }} />
        </div>
      </div>

      {/* API Configuration */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>
          <Key size={20} />
          API Configuration
        </h3>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: '#374151' }}>
            Groq API Key
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={styles.input}
              placeholder="Enter your Groq API key"
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              style={{...styles.button, ...styles.primaryButton, minWidth: '48px', justifyContent: 'center'}}
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ 
              fontSize: '14px', 
              color: apiConfigured ? '#10b981' : '#ef4444',
              fontWeight: '500'
            }}>
              {apiConfigured ? '✓ Configured' : '✗ Not configured'}
            </span>
          </div>
        </div>
      </div>

     
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Call Mode</h3>
        <div style={styles.radioGroup}>
          <label style={{
            ...styles.radioLabel,
            ...(callMode === 'browser' ? styles.radioLabelActive : {})
          }}>
            <input
              type="radio"
              value="browser"
              checked={callMode === 'browser'}
              onChange={(e) => setCallMode(e.target.value)}
              style={{ accentColor: '#667eea' }}
            />
            <span style={{ fontWeight: '500' }}>Browser Voice (Speech Recognition)</span>
          </label>
          <label style={{
            ...styles.radioLabel,
            ...(callMode === 'telnyx' ? styles.radioLabelActive : {})
          }}>
            <input
              type="radio"
              value="telnyx"
              checked={callMode === 'telnyx'}
              onChange={(e) => setCallMode(e.target.value)}
              style={{ accentColor: '#667eea' }}
            />
            <span style={{ fontWeight: '500' }}>Telnyx WebRTC</span>
          </label>
        </div>
      </div>


      {callMode === 'telnyx' && (
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={styles.cardTitle}>Telnyx Configuration</h3>
            <button
              onClick={() => setShowTelnyxConfig(!showTelnyxConfig)}
              style={{...styles.button, ...styles.primaryButton, minWidth: '48px', justifyContent: 'center'}}
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
                style={styles.input}
              />
              <input
                type="password"
                placeholder="SIP Password"
                value={telnyxConfig.sipPassword}
                onChange={(e) => setTelnyxConfig(prev => ({ ...prev, sipPassword: e.target.value }))}
                style={styles.input}
              />
              <input
                type="text"
                placeholder="Destination Number (optional)"
                value={telnyxConfig.destinationNumber}
                onChange={(e) => setTelnyxConfig(prev => ({ ...prev, destinationNumber: e.target.value }))}
                style={styles.input}
              />
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', justifyContent: 'center' }}>
        {!isAnyCallActive ? (
          <button
            onClick={startCall}
            disabled={!apiConfigured}
            style={{
              ...styles.button,
              ...styles.successButton,
              ...(apiConfigured ? {} : { opacity: 0.5, cursor: 'not-allowed' }),
              fontSize: '16px',
              padding: '16px 32px'
            }}
          >
            <Phone size={20} />
            Start {callMode === 'browser' ? 'Voice Chat' : 'Telnyx Call'}
          </button>
        ) : (
          <button
            onClick={endCall}
            style={{
              ...styles.button,
              ...styles.dangerButton,
              fontSize: '16px',
              padding: '16px 32px'
            }}
          >
            <PhoneOff size={20} />
            End Call
          </button>
        )}
      </div>
      {transcript && (
        <div style={styles.transcriptBox}>
          <p style={{ fontSize: '14px', color: '#1e40af', margin: 0 }}>
            <strong>You said:</strong> {transcript}
          </p>
        </div>
      )}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>
          <Bot size={20} />
          Chat History
        </h3>
        
        <div style={styles.chatContainer}>
          {chatMessages.length === 0 && (
            <div style={{ 
              textAlign: 'center', 
              color: '#6b7280', 
              padding: '40px 20px',
              fontSize: '16px'
            }}>
              <Bot size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
              <p>Start a conversation by typing a message or starting a voice call!</p>
            </div>
          )}
          
          {chatMessages.map(msg => (
            <div 
              key={msg.id} 
              style={msg.sender === 'user' ? styles.messageUser : styles.messageAI}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                {msg.sender === 'ai' && (
                  <Bot size={16} style={{ marginTop: '2px', opacity: 0.7 }} />
                )}
                <div style={{ flex: 1 }}>
                  <p style={styles.messageText}>{msg.text}</p>
                  <p style={styles.timestamp}>
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
            <div style={styles.messageAI}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <Bot size={16} style={{ marginTop: '2px', opacity: 0.7 }} />
                <div style={{ flex: 1 }}>
                  <div style={styles.loadingDots}>
                    <span>AI is thinking</span>
                    <div className="dot" style={styles.dot}></div>
                    <div className="dot" style={styles.dot}></div>
                    <div className="dot" style={styles.dot}></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        
        <div style={styles.inputContainer}>
          <input
            type="text"
            placeholder="Type your message..."
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            style={{
              ...styles.input,
              margin: 0,
              minHeight: '48px'
            }}
            disabled={isLoadingResponse}
          />
          <button
            onClick={sendMessage}
            disabled={isLoadingResponse || !currentMessage.trim()}
            style={{
              ...styles.button,
              ...styles.primaryButton,
              minHeight: '48px',
              minWidth: '48px',
              justifyContent: 'center',
              ...(isLoadingResponse || !currentMessage.trim() ? { opacity: 0.5, cursor: 'not-allowed' } : {})
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