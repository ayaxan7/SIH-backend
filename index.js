const express = require('express');
const admin = require('firebase-admin');
const WebSocket = require('ws');  // Import the ws library

const app = express();
app.use(express.json());

// Initialize Firebase
const serviceAccount = require('./service.json'); // Path to your Firebase Admin SDK service account key
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://deleted-project-6d75e-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();  // Initialize Firebase Realtime Database

// Create an HTTP server using Express
const server = require('http').createServer(app);

// Initialize a WebSocket server instance
const wss = new WebSocket.Server({ server });

// Middleware to verify Firebase Auth token
async function verifyToken(req, res, next) {
  const token = req.headers['authorization']; // Expect token in the Authorization header

  if (!token) {
    return res.status(401).send({ success: false, error: 'No token provided' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token.replace('Bearer ', ''));
    req.user = decodedToken; // Add the decoded token to the request object
    next(); // Proceed to the next middleware/route handler
  } catch (error) {
    return res.status(403).send({ success: false, error: 'Failed to authenticate token' });
  }
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('New client connected');

  // Send a welcome message to the client
  ws.send(JSON.stringify({ message: 'Welcome to the real-time data server!' }));

  // Handle messages from the client
  ws.on('message', (message) => {
    console.log('Received message from client:', message);
  });

  // Handle client disconnects
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Endpoint to receive data - Protect this route with token authentication
app.post('/api/data', verifyToken, async (req, res) => {
  const { longitude, latitude, time, name, phoneNo } = req.body;  // Destructure the data from the request body

  // Validate that all required fields are present
  if (
    typeof longitude === 'undefined' ||
    typeof latitude === 'undefined' ||
    typeof time === 'undefined' ||
    typeof name === 'undefined' ||
    typeof phoneNo === 'undefined'
  ) {
    return res.status(400).send({ success: false, error: 'Missing required data fields: longitude, latitude, time, name, or phoneNo' });
  }

  try {
    // Reference the "data" node in Firebase Realtime Database
    const ref = db.ref('data');

    // Push the data to Firebase
    await ref.push({ longitude, latitude, time });

    // Broadcast the new data to all connected WebSocket clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ longitude, latitude, time, name, phoneNo }));
      }
    });

    res.status(200).send({ success: true });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
});

// Endpoint to get data - Protect this route with token authentication
app.get('/api/data', verifyToken, async (_req, res) => {
  try {
    const ref = db.ref('data');  // Reference the "data" node
    ref.once('value', (snapshot) => {
      const data = snapshot.val();
      res.json(data);
    });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
});

// Endpoint to get site status (no authentication required)
app.get('/', (_req, res) => {
  res.send('site deployed');
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
