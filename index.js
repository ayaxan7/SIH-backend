const express = require('express');
const admin = require('firebase-admin');
const WebSocket = require('ws');  // Import the ws library
const rateLimit = require('express-rate-limit');  // Import rate limit library

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

let frontends = [];  // List to maintain connected WebSocket clients
let currentIndex = 0;  // Index for round-robin distribution

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

// Apply rate limiting to POST /api/data endpoint (limit to 5 minutes per IP)
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,  // 5 minutes window
  max: 100,  // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 5 minutes'
  }
});

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('New client connected');
  frontends.push(ws);  // Add the new client to the list of frontends

  // Send a welcome message to the client
  ws.send(JSON.stringify({ message: 'Welcome to the real-time data server!' }));

  // Handle messages from the client
  ws.on('message', (message) => {
    console.log('Received message from client:', message);
  });

  // Handle client disconnects
  ws.on('close', () => {
    console.log('Client disconnected');
    frontends = frontends.filter(client => client !== ws);  // Remove the client from the list

    // Adjust the currentIndex to prevent out-of-bound errors
    if (currentIndex >= frontends.length) {
      currentIndex = 0;
    }
  });
});

// Function to distribute data to WebSocket clients using round-robin
function distributeData(data) {
  // Only proceed if there are connected clients
  if (frontends.length > 0) {
    // Get the current client using round-robin
    const frontend = frontends[currentIndex];

    // Check if the current client is still open
    if (frontend.readyState === WebSocket.OPEN) {
      frontend.send(JSON.stringify(data));
    }

    // Move to the next client in round-robin fashion
    currentIndex = (currentIndex + 1) % frontends.length;
  }
}

// Route for data submission with rate limiting and authentication
app.post('/api/data', verifyToken, apiLimiter, async (req, res) => {
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

    // Distribute the new data to all connected WebSocket clients
    distributeData({ longitude, latitude, time, name, phoneNo });

    res.status(200).send({ success: true });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
});

// Route for direct data submission without authentication or rate limiting (admit route)
app.post('/api/admit', async (req, res) => {
  const { longitude, latitude, time, name, phoneNo } = req.body;

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

    // Distribute the new data to all connected WebSocket clients
    distributeData({ longitude, latitude, time, name, phoneNo });

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
