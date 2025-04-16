-- Minimal database schema for the form structure generator

-- Forms table (main form metadata)
CREATE TABLE forms (
    form_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    form_json TEXT NOT NULL  -- Store the entire form structure as JSON for MVP
);

-- If you want to expand to separate tables for sections and questions later:

-- Sections table
CREATE TABLE form_sections (
    section_id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    order_index INTEGER NOT NULL,
    FOREIGN KEY (form_id) REFERENCES forms (form_id) ON DELETE CASCADE
);

-- Questions table
CREATE TABLE questions (
    question_id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    is_required BOOLEAN DEFAULT 0,
    order_index INTEGER NOT NULL,
    placeholder TEXT,
    help_text TEXT,
    options_json TEXT,  -- For multiple choice questions, store options as JSON
    FOREIGN KEY (section_id) REFERENCES form_sections (section_id) ON DELETE CASCADE
);

CREATE TABLE otp_verifications (
    verification_id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,  -- Phone/email
    otp_hash TEXT NOT NULL,    -- Store hashed OTP, not plaintext
    session_id TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT 0,
    verification_time TEXT
);

CREATE INDEX idx_otp_identifier ON otp_verifications (identifier);
CREATE INDEX idx_otp_expires ON otp_verifications (expires_at);
-- Indexes for faster queries
CREATE INDEX idx_form_sections_form_id ON form_sections (form_id);
CREATE INDEX idx_questions_section_id ON questions (section_id);