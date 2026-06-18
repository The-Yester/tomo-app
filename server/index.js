const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Basic health check for the TOMO backend
app.get('/api/health', (req, res) => {
    res.json({ status: 'TOMO Backend is running', timestamp: new Date().toISOString() });
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
