const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Koneksi database sederhana
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'bimbingan_kampus',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// REGISTER
app.post('/register', async (req, res) => {
  const { username, password, role } = req.body;
  
  try {
    const hashedPassword = await bcrypt.hash(password, 8);
    pool.query(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [username, hashedPassword, role || 'mahasiswa'],
      (error, results) => {
        if (error) return res.status(400).send('Username sudah dipakai');
        res.send({ status: 'success', userId: results.insertId });
      }
    );
  } catch (error) {
    res.status(500).send('Server error');
  }
});

// LOGIN
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  pool.query(
    'SELECT * FROM users WHERE username = ?',
    [username],
    async (error, results) => {
      if (error || results.length === 0) {
        return res.status(400).send('Username tidak ditemukan');
      }
      
      const user = results[0];
      const isMatch = await bcrypt.compare(password, user.password);
      
      if (!isMatch) return res.status(400).send('Password salah');
      
      res.send({
        status: 'success',
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
    }
  );
});

// API Jadwal (dengan auth sederhana)
app.post('/jadwal', (req, res) => {
  const { userId, tanggal, waktu_mulai, waktu_selesai } = req.body;
  
  if (!userId || !tanggal || !waktu_mulai || !waktu_selesai) {
    return res.status(400).send('Data tidak lengkap');
  }
  
  pool.query(
    `INSERT INTO jadwal 
    (user_id, tanggal, waktu_mulai, waktu_selesai)
    VALUES (?, ?, ?, ?)`,
    [userId, tanggal, waktu_mulai, waktu_selesai],
    (error, results) => {
      if (error) return res.status(500).send('Gagal simpan jadwal');
      res.send({ status: 'success', jadwalId: results.insertId });
    }
  );
});

app.listen(3000, () => console.log('Server running on port 3000'));