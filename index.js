const express = require('express');
const admin = require('firebase-admin');
const app = express();
app.use(express.json());

// Initialize Firebase
const serviceAccount = require('./service.json'); // Path to your Firebase Admin SDK service account key
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://deleted-project-6d75e-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();  // Initialize Firebase Realtime Database

// Endpoint to receive data
app.post('/api/data', async (req, res) => {
  const { longitude, latitude, time } = req.body;  // Destructure the data from the request body

  // Validate that all required fields are present
  if (typeof longitude === 'undefined' || typeof latitude === 'undefined' || typeof time === 'undefined') {
    return res.status(400).send({ success: false, error: 'Missing required data fields: longitude, latitude, or time' });
  }

  try {
    // Reference the "data" node in Firebase Realtime Database
    const ref = db.ref('data');
    console.log('data added')

    // Push the data to Firebase
    await ref.push({ longitude, latitude, time });

    res.status(200).send({ success: true });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
});

// Endpoint to get data
app.get('/api/data', async (_req, res) => {
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

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
