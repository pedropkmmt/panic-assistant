require('dotenv').config({ path: './.env' });
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const app = express();


app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', /\.loca\.lt$/, /\.cloudflareaccess\.com$/, /\.ngrok\.io$/, /\.trycloudflare\.com$/],
  credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


app.use((req, res, next) => {
 
  console.log(`${req.method} ${req.path} from ${req.headers.host || 'unknown'}`);
  
  const allowedHosts = [
    'localhost',
    '.loca.lt',
    '.ngrok.io',
    '.trycloudflare.com',
    '.herokuapp.com',
    '.railway.app',
    '.render.com'
  ];
  
  const host = req.headers.host || '';
  const isAllowed = allowedHosts.some(pattern => 
    pattern.startsWith('.') ? host.includes(pattern) : host.includes(pattern)
  );
  
  if (isAllowed || process.env.NODE_ENV === 'development') {
    next();
  } else {
    console.warn(`Blocked request from host: ${host}`);
    next(); 
  }
});

if (process.env.NODE_ENV === 'production' && fs.existsSync(path.join(__dirname, 'build'))) {
  app.use(express.static(path.join(__dirname, 'build')));
  console.log('📦 Serving static files from build directory');
} else if (process.env.NODE_ENV !== 'production') {
  console.log('🔧 Development mode - static files served by React dev server');
} else {
  console.log('📦 Build directory not found - run "npm run build" to create it');
}

// Configuration
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PORT = process.env.PORT || 3000;

const CODEWORDS = [
  "whens the family gathering",
  "are you still single", 
  "can you tell me if auntie is okay",
  "help me",
  "emergency",
  "call police"
];

let emergencyAlerts = [];
const conversationContext = new Map();

const callTelnyxAPI = async (callControlId, action, body = {}) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/${action}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const result = await response.text();
    
    if (!response.ok) {
      console.error(`Telnyx API ${action} failed:`, response.status, result);
      throw new Error(`Telnyx API error: ${response.status}`);
    }
    
    console.log(`Telnyx ${action} success:`, result);
    return response;
  } catch (error) {
    console.error(`Telnyx API ${action} error:`, error);
    throw error;
  }
};

const getGroqResponse = async (message, context = []) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [
          {
            role: "system",
            content: "You are a helpful voice assistant. Keep responses brief and natural for voice conversation. If someone seems distressed, respond calmly and supportively."
          },
          ...context.slice(-3), 
          { role: "user", content: message }
        ],
        max_tokens: 100,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      console.error('Groq API error:', response.status, await response.text());
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Groq API call failed:', error);
    return "I'm having trouble connecting right now. Please try again.";
  }
};

const checkEmergencyCodewords = (text) => {
  const lowerText = text.toLowerCase();
  return CODEWORDS.find(codeword => lowerText.includes(codeword.toLowerCase()));
};


app.post('/test-webhook', (req, res) => {
  console.log('Test webhook received:', req.body);
  res.json({ 
    message: 'Test webhook received successfully',
    body: req.body,
    headers: req.headers
  });
});

app.post('/webhook/telnyx', async (req, res) => {
  try {
    console.log('Received webhook:', JSON.stringify(req.body, null, 2));
    
    const event = req.body.data?.payload;
    if (!event) {
      console.error('No payload in webhook');
      return res.status(400).send('No payload');
    }

    const callId = event.call_control_id;
    const eventType = event.event_type;

    console.log(`Processing event: ${eventType} for call: ${callId}`);

    switch (eventType) {
      case 'call.initiated':
        console.log('Call initiated, answering...');
        await callTelnyxAPI(callId, 'answer');
        break;

      case 'call.answered':
        console.log('Call answered, starting conversation...');
        
        conversationContext.set(callId, []);
        
        await callTelnyxAPI(callId, 'speak', {
          payload: 'Hello! You are connected to your AI voice assistant. I can help you with questions or just chat. What would you like to talk about?',
          voice: 'female',
          language: 'en-US'
        });
        
        await callTelnyxAPI(callId, 'gather', {
          input_type: 'speech',
          language: 'en-US',
          timeout: 30,
          max_length: 200,
          speech_end_silence_timeout: 2000
        });
        break;

      case 'gather.ended':
        console.log('Gather ended, processing speech...');
        
        const spokenText = event.result || '';
        const confidence = event.confidence || 0;
        
        console.log(`User said: "${spokenText}" (confidence: ${confidence})`);
        
        if (!spokenText) {
          await callTelnyxAPI(callId, 'speak', {
            payload: "I didn't catch that. Could you please repeat?",
            voice: 'female',
            language: 'en-US'
          });
          
          await callTelnyxAPI(callId, 'gather', {
            input_type: 'speech',
            language: 'en-US',
            timeout: 30,
            max_length: 200,
            speech_end_silence_timeout: 2000
          });
          break;
        }

        const context = conversationContext.get(callId) || [];
        
        const emergencyCodeword = checkEmergencyCodewords(spokenText);
        let aiResponse;
        
        if (emergencyCodeword) {
          console.log(`EMERGENCY DETECTED: "${emergencyCodeword}"`);
          
          const emergencyAlert = {
            id: Date.now(),
            callId: callId,
            codeword: emergencyCodeword,
            message: spokenText,
            timestamp: new Date().toISOString(),
            handled: false
          };
          emergencyAlerts.push(emergencyAlert);
          
          aiResponse = "I understand you may need help. Emergency services have been notified. Please stay on the line. Are you in immediate danger?";
          
        } else {
          aiResponse = await getGroqResponse(spokenText, context);
        }
        
        context.push({ role: 'user', content: spokenText });
        context.push({ role: 'assistant', content: aiResponse });
        conversationContext.set(callId, context.slice(-6)); // Keep last 6 messages
        
        await callTelnyxAPI(callId, 'speak', {
          payload: aiResponse,
          voice: 'female',
          language: 'en-US'
        });
        
        setTimeout(async () => {
          try {
            await callTelnyxAPI(callId, 'gather', {
              input_type: 'speech',
              language: 'en-US',
              timeout: 30,
              max_length: 200,
              speech_end_silence_timeout: 2000
            });
          } catch (error) {
            console.error('Error continuing conversation:', error);
          }
        }, 1000);
        break;

      case 'call.hangup':
        console.log(`Call ${callId} ended`);
        conversationContext.delete(callId);
        break;

      case 'call.machine.detection.ended':
        console.log('Machine detection ended');
        break;

      case 'gather.started':
        console.log('Gather started - listening for speech');
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/api/emergency', (req, res) => {
  try {
    const { codeword, location, timestamp } = req.body;
    
    const emergencyAlert = {
      id: Date.now(),
      source: 'frontend',
      codeword,
      location,
      timestamp: timestamp || new Date().toISOString(),
      handled: false
    };
    
    emergencyAlerts.push(emergencyAlert);
    console.log('Emergency alert received from frontend:', emergencyAlert);

    res.json({ success: true, alertId: emergencyAlert.id });
  } catch (error) {
    console.error('Emergency API error:', error);
    res.status(500).json({ error: 'Failed to process emergency alert' });
  }
});

app.get('/api/emergency/alerts', (req, res) => {
  try {
    res.json(emergencyAlerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

app.put('/api/emergency/alerts/:id/handled', (req, res) => {
  try {
    const alertId = parseInt(req.params.id);
    const alert = emergencyAlerts.find(a => a.id === alertId);
    
    if (alert) {
      alert.handled = true;
      alert.handledAt = new Date().toISOString();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Alert not found' });
    }
  } catch (error) {
    console.error('Error updating alert:', error);
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    activeConversations: conversationContext.size,
    emergencyAlerts: emergencyAlerts.length,
    host: req.headers.host,
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('*', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    const buildPath = path.join(__dirname, 'build', 'index.html');
    if (fs.existsSync(buildPath)) {
      res.sendFile(buildPath);
    } else {
      res.status(404).json({ 
        error: 'Build not found', 
        message: 'Run "npm run build" to create the production build' 
      });
    }
  } else {
    res.status(404).json({ 
      error: 'Not found',
      message: 'API endpoint not found. Frontend is served by React dev server on port 3001.'
    });
  }
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Webhook URL: http://localhost:${PORT}/webhook/telnyx`);
  console.log(`🧪 Test webhook: http://localhost:${PORT}/test-webhook`);
  console.log(`🔑 Telnyx API Key: ${TELNYX_API_KEY ? 'Set' : 'Missing'}`);
  console.log(`🤖 Groq API Key: ${GROQ_API_KEY ? 'Set' : 'Missing'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});


process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});