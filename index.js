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
  port: 3306,
  waitForConnections: true
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

// Jadwal
app.post('/jadwal', (req, res) => {
  const { 
    userId, 
    tanggal, 
    waktu_mulai, 
    waktu_selesai, 
    penyelenggaraan, 
    deskripsi, 
    komentar_mahasiswa, 
    supervisor_id 
  } = req.body;

  // Langkah 1: Cek Role Mahasiswa
  pool.query('SELECT role FROM users WHERE id = ?', [userId], (err, results) => {
    if (err || !results[0] || results[0].role !== 'mahasiswa') {
      return res.status(403).send('Hanya mahasiswa yang bisa membuat jadwal'); // PASTIKAN ADA RETURN
    }

    // Langkah 2: Validasi Field Wajib
    if (!tanggal || !waktu_mulai || !waktu_selesai || !deskripsi || !penyelenggaraan || !supervisor_id) {
      return res.status(400).send('Data tidak lengkap'); // RETURN
    }

    // Langkah 3: Validasi Waktu
    if (waktu_mulai >= waktu_selesai) {
      return res.status(400).send('Waktu mulai harus sebelum waktu selesai'); // RETURN
    }

    // Langkah 4: Cek Konflik Jadwal
    const cekKonflikQuery = `
      SELECT COUNT(*) AS total 
      FROM jadwal 
      WHERE 
        (user_id = ? OR supervisor_id = ?) AND 
        tanggal = ? AND 
        (
          (waktu_mulai <= ? AND waktu_selesai >= ?) OR
          (waktu_mulai <= ? AND waktu_selesai >= ?) OR
          (waktu_mulai >= ? AND waktu_selesai <= ?)
        )
    `;
    pool.query(
      cekKonflikQuery,
      [
        userId,
        supervisor_id,
        tanggal,
        waktu_mulai, waktu_mulai,
        waktu_selesai, waktu_selesai,
        waktu_mulai, waktu_selesai
      ],
      (err, results) => {
        if (err) return res.status(500).send('DB error'); // RETURN
        if (results[0].total > 0) {
          return res.status(400).send('Jadwal bertabrakan dengan jadwal lain'); // RETURN
        }

        // Langkah 5: Simpan ke Database
        pool.query(
          `INSERT INTO jadwal 
          (user_id, tanggal, waktu_mulai, waktu_selesai, penyelenggaraan, deskripsi, komentar_mahasiswa, supervisor_id, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Sedang Verifikasi')`,
          [userId, tanggal, waktu_mulai, waktu_selesai, penyelenggaraan, deskripsi, komentar_mahasiswa, supervisor_id],
          (error, results) => {
            if (error) return res.status(500).send('Gagal simpan jadwal'); // RETURN
            res.send({ status: 'success', jadwalId: results.insertId }); // RESPONSE TERAKHIR
          }
        );
      }
    );
  });
});

// GET /jadwal?userId=123
app.get('/jadwal', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).send('userId required');

  pool.query(
    `SELECT j.*, 
     u.username AS mahasiswa,
     d.username AS dosen_nama 
     FROM jadwal j
     JOIN users u ON j.user_id = u.id
     JOIN users d ON j.supervisor_id = d.id
     WHERE j.user_id = ?
     ORDER BY tanggal ASC, waktu_mulai ASC`,
    [userId],
    (err, results) => {
      if (err) return res.status(500).send('DB error');
      res.send(results);
    }
  );
});

// GET /verifikasi?dosenId=10
app.get('/verifikasi', (req, res) => {
  const dosenId = req.query.dosenId;
  
  pool.query(
    `SELECT j.*, u.username AS mahasiswa 
     FROM jadwal j
     JOIN users u ON u.id = j.user_id
     WHERE j.supervisor_id = ? 
       AND j.status = 'Sedang Verifikasi'
     ORDER BY j.tanggal ASC, j.waktu_mulai ASC`,
    [dosenId],
    (err, results) => {
      if (err) return res.status(500).send('DB error');
      res.send(results);
    }
  );
});

// POST /verifikasi
app.post('/verifikasi', (req, res) => {
  const { jadwalId, approved, komentar_dosen, dosenId } = req.body;

  pool.query(
    `UPDATE jadwal 
     SET status = ?, komentar_dosen = ? 
     WHERE id = ? AND supervisor_id = ?`,
    [approved ? 'Setuju' : 'Batal', komentar_dosen, jadwalId, dosenId],
    (err, results) => {
      if (err) return res.status(500).send('DB error');
      
      // Cek apakah ada baris yang terupdate
      if (results.affectedRows === 0) {
        return res.status(403).send('Anda tidak memiliki akses ke jadwal ini');
      }
      
      res.send({ status: 'success' });
    }
  );
});

// GET /jadwal/bimbingan
app.get('/jadwal/bimbingan', (req, res) => {
  const dosenId = req.query.dosenId;
  
  pool.query(
    `SELECT j.*, u.username AS mahasiswa 
     FROM jadwal j
     JOIN users u ON j.user_id = u.id
     WHERE j.supervisor_id = ?  -- Filter berdasarkan dosen
     ORDER BY j.tanggal ASC, j.waktu_mulai ASC`,
    [dosenId], // Gunakan dosenId dari parameter
    (err, results) => {
      if (err) return res.status(500).send('DB error');
      res.send(results);
    }
  );
});

// GET /dosen
app.get('/dosen', (req, res) => {
    pool.query(
        "SELECT id, username FROM users WHERE role = 'dosen'",
        (err, results) => {
            if(err) return res.status(500).send('DB error');
            res.send(results);
        }
    );
});

app.put('/jadwal/:id', (req, res) => {
  const jadwalId = req.params.id;
  const { userId, ...updateData } = req.body;

  const allowedFields = [
    'tanggal', 
    'waktu_mulai', 
    'waktu_selesai', 
    'penyelenggaraan',
    'deskripsi',
    'komentar_mahasiswa',
    'supervisor_id'
  ];

  const filteredUpdate = Object.keys(updateData)
    .filter(key => allowedFields.includes(key))
    .reduce((obj, key) => {
      obj[key] = updateData[key];
      return obj;
    }, {});

  pool.query(
    `SELECT user_id, status FROM jadwal WHERE id = ?`,
    [jadwalId],
    (err, results) => {
      if (err) return res.status(500).send('DB error');
      if (results.length === 0) return res.status(404).send('Jadwal tidak ditemukan');
      
      const jadwal = results[0];
      
      if (jadwal.user_id !== userId) {
        return res.status(403).send('Akses ditolak');
      }
      
      if (jadwal.status !== 'Sedang Verifikasi') {
        return res.status(400).send('Jadwal sudah diverifikasi');
      }

      pool.query(
        'SELECT role FROM users WHERE id = ?',
        [filteredUpdate.supervisor_id],
        (err, results) => {
          if (err || !results[0] || results[0].role !== 'dosen') {
            return res.status(400).send('Dosen tidak valid');
          }

          const fields = [];
          const values = [];
          
          for (const [key, value] of Object.entries(filteredUpdate)) {
            fields.push(`${key} = ?`);
            values.push(value);
          }
          values.push(jadwalId);
          
          pool.query(
            `UPDATE jadwal SET ${fields.join(', ')} WHERE id = ?`,
            values,
            (error) => {
              if (error) return res.status(500).send('Gagal update');
              res.send({ status: 'success' });
            }
          );
        }
      );
    }
  );
});

app.delete('/jadwal/:id', (req, res) => {
  const { userId } = req.body;
  const jadwalId = req.params.id;

  pool.query(
    `DELETE FROM jadwal 
     WHERE id = ? 
       AND user_id = ?
       AND status = 'Sedang Verifikasi'`,
    [jadwalId, userId],
    (err, results) => {
      if (err) return res.status(500).send('DB error');
      if (results.affectedRows === 0) {
        return res.status(403).send('Tidak bisa dihapus');
      }
      res.send({ status: 'success' });
    }
  );
});

app.listen(3000, () => console.log('Server running on port 3000'));