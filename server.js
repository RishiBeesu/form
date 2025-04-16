// server.js - Express API for form structure storage and OTP verification
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new sqlite3.Database('./forms.db', (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to the SQLite database');
        createTables();
    }
});

// Create database tables
function createTables() {
    // Forms table
    db.run(`CREATE TABLE IF NOT EXISTS forms (
        form_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'draft',
        created_at TEXT,
        updated_at TEXT,
        form_json TEXT NOT NULL
    )`);

    // OTP verification table
    db.run(`CREATE TABLE IF NOT EXISTS otp_verifications (
        verification_id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        otp_code TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        is_verified INTEGER DEFAULT 0
    )`);

    db.run(`CREATE INDEX IF NOT EXISTS idx_otp_identifier ON otp_verifications (identifier)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications (expires_at)`);
}

// FORM API ROUTES

// Get all forms
app.get('/api/forms', (req, res) => {
    db.all(`SELECT form_id, title, description, status, created_at, updated_at FROM forms`, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get a specific form
app.get('/api/forms/:id', (req, res) => {
    db.get(`SELECT * FROM forms WHERE form_id = ?`, [req.params.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (!row) {
            res.status(404).json({ error: 'Form not found' });
            return;
        }
        // Parse the JSON structure
        row.form_structure = JSON.parse(row.form_json);
        // Remove the raw JSON from the response
        delete row.form_json;
        res.json(row);
    });
});

// Create a new form
app.post('/api/forms', (req, res) => {
    const { form_id, title, description, status = 'draft', created_at, updated_at } = req.body;
    const form_json = JSON.stringify(req.body);

    if (!form_id || !title) {
        res.status(400).json({ error: 'Form ID and title are required' });
        return;
    }

    const sql = `INSERT INTO forms (form_id, title, description, status, created_at, updated_at, form_json) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`;

    db.run(sql, [form_id, title, description, status, created_at, updated_at, form_json], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.status(201).json({
            success: true,
            message: 'Form created successfully',
            form_id: form_id
        });
    });
});

// Update an existing form
app.put('/api/forms/:id', (req, res) => {
    const form_id = req.params.id;
    const { title, description, status, updated_at } = req.body;
    const form_json = JSON.stringify(req.body);

    const sql = `UPDATE forms SET 
                title = ?, 
                description = ?, 
                status = ?, 
                updated_at = ?, 
                form_json = ? 
                WHERE form_id = ?`;

    db.run(sql, [title, description, status, updated_at, form_json, form_id], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({ error: 'Form not found' });
            return;
        }
        res.json({
            success: true,
            message: 'Form updated successfully',
            form_id: form_id
        });
    });
});

// Delete a form
app.delete('/api/forms/:id', (req, res) => {
    db.run(`DELETE FROM forms WHERE form_id = ?`, [req.params.id], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({ error: 'Form not found' });
            return;
        }
        res.json({
            success: true,
            message: 'Form deleted successfully'
        });
    });
});

// SIMPLIFIED OTP API ROUTES

// Generate OTP endpoint
app.post('/api/generate-otp', (req, res) => {
    const { identifier, length = 6, type = 'numeric', expiry_seconds = 300 } = req.body;

    if (!identifier) {
        return res.status(400).json({
            success: false,
            message: 'Phone number or email identifier is required'
        });
    }

    // Generate OTP
    const otp = generateOTP(length, type);

    // Create verification record
    const verificationId = 'otp_' + Date.now();
    const expiryTime = new Date(Date.now() + expiry_seconds * 1000);
    const now = new Date().toISOString();

    // Delete any existing OTPs for this identifier first
    db.run(`DELETE FROM otp_verifications WHERE identifier = ?`, [identifier], function (err) {
        if (err) {
            console.error('Error deleting old OTPs:', err);
        }

        // Store new OTP in database
        const sql = `INSERT INTO otp_verifications 
                    (verification_id, identifier, otp_code, expires_at, created_at)
                    VALUES (?, ?, ?, ?, ?)`;

        db.run(sql, [
            verificationId,
            identifier,
            otp,
            expiryTime.toISOString(),
            now
        ], function (err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to generate OTP'
                });
            }

            // In production, you would send OTP via SMS/email here
            console.log(`SIMULATION: OTP ${otp} generated for ${identifier}`);

            // For demo purposes, we'll include the OTP in the response
            // In production, NEVER return the actual OTP to the client
            res.json({
                success: true,
                verification_id: verificationId,
                expires_at: expiryTime,
                message: `OTP sent to ${identifier}`,
                otp: otp // For testing only - REMOVE in production!
            });
        });
    });
});

// Verify OTP endpoint
app.post('/api/verify-otp', (req, res) => {
    const { identifier, otp } = req.body;

    if (!identifier || !otp) {
        return res.status(400).json({
            success: false,
            message: 'Identifier and OTP are required'
        });
    }

    // Find the most recent non-expired OTP for this identifier
    const now = new Date().toISOString();

    db.get(`SELECT * FROM otp_verifications 
            WHERE identifier = ? 
            AND expires_at > ? 
            AND is_verified = 0
            ORDER BY created_at DESC LIMIT 1`,
        [identifier, now], function (err, row) {

            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Error verifying OTP'
                });
            }

            if (!row) {
                return res.status(400).json({
                    success: false,
                    message: 'OTP not found or expired'
                });
            }

            // Verify OTP
            if (row.otp_code === otp) {
                // Mark as verified
                db.run(`UPDATE otp_verifications SET is_verified = 1 WHERE verification_id = ?`,
                    [row.verification_id], function (err) {
                        if (err) {
                            console.error('Error marking OTP as verified:', err);
                        }
                    });

                return res.json({
                    success: true,
                    message: 'OTP verified successfully'
                });
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid OTP'
                });
            }
        });
});

// OTP generation helper function
function generateOTP(length = 6, type = 'numeric') {
    let chars = '0123456789';
    if (type === 'alphanumeric') {
        chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }

    let otp = '';
    for (let i = 0; i < length; i++) {
        otp += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return otp;
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Proper shutdown handling
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Database connection closed');
        process.exit(0);
    });
});