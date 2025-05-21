const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const path = require('path');

require('dotenv').config()

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }))

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Setup session (kata deepseek ga rekomen tapi bomat)
app.use(session({
	secret: 'gataurahasialalallala', // apa aj bisa sih keknya
	resave: false,
	saveUninitialized: true,
	cookie: { secure: false } // set true jika menggunakan HTTPS
}));


// Koneksi database sederhana
const pool = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASS,
	database: process.env.DB_NAME,
	port: process.env.DB_PORT,
	waitForConnections: true,
});


app.get('/auth', (req, res) => {
	// kalo ada data langsung ke dashboard
	if (req.session.user) {
		if (req.session.user.role === 'mahasiswa') {
			return res.redirect('/mahasiswa/dashboard');
		} else if (req.session.user.role === 'dosen') {
			return res.redirect('/dosen/bimbingan');
		}
	}

	res.render('auth', {
		username: req.query.uname || '',
		activeTab: req.query.activeTab || 'login',
		error: req.query.error || null,
        success: null,
    });
});

app.get('/', (req, res) => {
	return res.redirect('/auth');
});

app.get('/login', (req, res) => {
	return res.redirect('/auth');
});

app.get('/register', (req, res) => {
	return res.redirect('/auth');
});


// REGISTER
app.post('/register', async (req, res) => {
	const { username, password, role } = req.body;

	try {
		const hashedPassword = await bcrypt.hash(password, 8);
		await pool.query(
			'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
			[username, hashedPassword, role || 'mahasiswa']
		);

		res.render('auth', {
			activeTab: 'login',
			success: 'Registrasi berhasil. Silakan login',
		});

	} catch (error) {
		if (error.code === 'ER_DUP_ENTRY') {
			return res.redirect('/auth?error=Username sudah digunakan&activeTab=register');
		}

		console.error('Error saat register:', error);
		return res.status(500).send('Server error');
	}
});


// LOGIN
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
		
		// cek user ada apa enggk
        const [users] = await pool.query(
            'SELECT * FROM users WHERE username = ?', 
            [username]
        );

        if (users.length === 0) {
			return res.redirect('/auth?error=Username tidak ditemukan&activeTab=login');
        }

        const user = users[0];

        // 2. Bandingin pw
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
			return res.redirect(`/auth?error=Password salah&activeTab=login&uname=${encodeURIComponent(username)}`);
        }

        // 3. Set session
        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role, // Make sure this matches your DB column name
        };

        // 4. Redirect sesuai role
        if (user.role === 'mahasiswa') {
            return res.redirect('/mahasiswa/dashboard');
        } else if (user.role === 'dosen') {
            return res.redirect('/dosen/dashboard');
        }

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send('Terjadi kesalahan server');
    }
});


app.get('/logout', (req, res) => {
	req.session.destroy((err) => {
		if (err) {
			console.error('Gagal logout:', err);
			return res.status(500).json({ error: 'Gagal logout' });
		}
		res.clearCookie('connect.sid');
		return res.redirect('/auth');
	});
});



// Need auth
const { isAuthenticated } = require('./middleware/auth');

app.get('/mahasiswa/dashboard', isAuthenticated, async (req, res) => {
	res.render('mahasiswa/dashboard', {
		initialData: JSON.stringify({
			currentUser: req.session.user,
		})
	});
});

app.get('/mahasiswa/jadwal', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        if (!userId) {
            return res.status(400).send('User ID required');
        }

        const [jadwals] = await pool.query(
            `SELECT j.*, 
            u.username AS mahasiswa,
            d.username AS dosen_nama 
            FROM jadwal j
            JOIN users u ON j.user_id = u.id
            JOIN users d ON j.supervisor_id = d.id
            WHERE j.user_id = ?
            ORDER BY tanggal ASC, waktu_mulai ASC`,
            [userId]
        );

		const [dosens] = await pool.query(
		"SELECT id, username FROM users WHERE role = 'dosen'");

		res.render('mahasiswa/jadwal', {
			initialData: JSON.stringify({
				jadwalList: jadwals || [],
				listDosen: dosens || [],
				currentUser: req.session.user,
            })
        });

    } catch (error) {
        console.error('Error fetching jadwal:', error);
        res.status(500).render('error', { 
            message: 'Gagal memuat jadwal',
            error
        });
    }
});


app.get('/mahasiswa/buat', isAuthenticated, async (req, res) => {
	const [dosens] = await pool.query(
	"SELECT id, username FROM users WHERE role = 'dosen'");
	
	res.render('mahasiswa/buat', {
		initialData: JSON.stringify({
			listDosen: dosens || [],
			currentUser: req.session.user,
		})
	});
});


app.get('/dosen/dashboard', isAuthenticated, async (req, res) => {
	res.render('dosen/dashboard', {
		initialData: JSON.stringify({
			currentUser: req.session.user,
		})
	});
});


app.get('/dosen/bimbingan', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        if (!userId) {
            return res.status(400).send('User ID required');
        }

		const [bimbingans] = await pool.query(
			`SELECT j.*, u.username AS mahasiswa 
				FROM jadwal j
				JOIN users u ON j.user_id = u.id
				WHERE j.supervisor_id = ?  -- Filter berdasarkan dosen
				ORDER BY j.tanggal ASC, j.waktu_mulai ASC`,
			[userId],
		);

		res.render('dosen/bimbingan', {
			initialData: JSON.stringify({
				bimbinganList: bimbingans || [],
				currentUser: req.session.user,
            })
        });

    } catch (error) {
        console.error('Error fetching bimbingan:', error);
        res.status(500).render('error', { 
            message: 'Gagal memuat bimbingan',
            error
        });
    }
});

app.get('/dosen/verifikasi', isAuthenticated, async (req, res) => {
	try {
        const userId = req.session.user.id;
	
		const [sedangVerifikasis] = await pool.query(
			`SELECT j.*, u.username AS mahasiswa 
		 FROM jadwal j
		 JOIN users u ON u.id = j.user_id
		 WHERE j.supervisor_id = ? 
		   AND j.status = 'Sedang Verifikasi'
		 ORDER BY j.tanggal ASC, j.waktu_mulai ASC`,
			[userId],
		);
		
		res.render('dosen/verifikasi', {
			initialData: JSON.stringify({
				verifList: sedangVerifikasis || [],
				currentUser: req.session.user,
            })
        });
	} catch (error) {
        res.status(500).render('error', {
            message: 'Gagal memuat list verifikasi',
            error
        });
	}
});


app.post('/jadwal', async (req, res) => {
    try {
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

        // 1. Validasi Input Dasar
        if (!userId || !tanggal || !waktu_mulai || !waktu_selesai || 
            !penyelenggaraan || !deskripsi || !supervisor_id) {
            return res.status(400).json({ error: 'Semua field wajib diisi' });
        }

        // 2. Validasi Format Tanggal dan Waktu
		if (waktu_mulai >= waktu_selesai) {
			return res.status(400).send('Waktu mulai harus sebelum waktu selesai'); // RETURN
		}

        // 3. Cek Role Mahasiswa
        const [user] = await pool.query('SELECT role FROM users WHERE id = ?', [userId]);
        if (!user[0] || user[0].role !== 'mahasiswa') {
            return res.status(403).json({ error: 'Hanya mahasiswa yang bisa membuat jadwal' });
        }

        // 4. Validasi Dosen Pembimbing
        const [dosen] = await pool.query('SELECT role FROM users WHERE id = ?', [supervisor_id]);
        if (!dosen[0] || dosen[0].role !== 'dosen') {
            return res.status(400).json({ error: 'Dosen pembimbing tidak valid' });
        }

        // 5. Cek Konflik Jadwal
        const [konflik] = await pool.query(`
            SELECT COUNT(*) AS total 
            FROM jadwal 
            WHERE 
                (user_id = ? OR supervisor_id = ?) AND 
                tanggal = ? AND 
                (
                    (waktu_mulai < ? AND waktu_selesai > ?) OR
                    (waktu_mulai < ? AND waktu_selesai > ?) OR
                    (waktu_mulai >= ? AND waktu_selesai <= ?)
                )
        `, [
            userId, supervisor_id, tanggal,
            waktu_mulai, waktu_mulai,
            waktu_selesai, waktu_selesai,
            waktu_mulai, waktu_selesai
        ]);

        if (konflik[0].total > 0) {
            return res.status(400).json({ error: 'Jadwal bertabrakan dengan jadwal lain' });
        }

        // 6. Simpan ke Database
        const [result] = await pool.query(`
            INSERT INTO jadwal 
            (user_id, tanggal, waktu_mulai, waktu_selesai, penyelenggaraan, 
             deskripsi, komentar_mahasiswa, supervisor_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Sedang Verifikasi')
        `, [
            userId, tanggal, waktu_mulai, waktu_selesai, 
            penyelenggaraan, deskripsi, komentar_mahasiswa, supervisor_id
        ]);

        // 7. Response Sukses
        res.status(201).json({ 
            success: true, 
            jadwalId: result.insertId,
            message: 'Jadwal berhasil dibuat'
        });

    } catch (error) {
        console.error('Error membuat jadwal:', error);
        res.status(500).json({ 
            error: 'Terjadi kesalahan server',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});


app.get('/jadwal', async (req, res) => {
    try {
        const { userId, sort = 'tanggal_asc' } = req.query;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }

        // Base query
        let query = `
            SELECT j.*, 
                   u.username AS mahasiswa,
                   d.username AS dosen_nama 
            FROM jadwal j
            JOIN users u ON j.user_id = u.id
            JOIN users d ON j.supervisor_id = d.id
            WHERE j.user_id = ?
        `;

        // Tambahkan sorting berdasarkan parameter (ga dipake sih hehe, tapi gapapa supaya keren)
        const sortOptions = {
            'tanggal_asc': 'ORDER BY tanggal ASC, waktu_mulai ASC',
            'tanggal_desc': 'ORDER BY tanggal DESC, waktu_mulai DESC',
            'status': 'ORDER BY status ASC, tanggal ASC'
        };

        query += sortOptions[sort] || sortOptions['tanggal_asc'];

        const [results] = await pool.query(query, [userId]);
        
        res.json(results);

    } catch (error) {
        console.error('Error fetching jadwal:', error);
        res.status(500).json({ error: 'Database error' });
    }
});


app.put('/jadwal/:id', async (req, res) => {
    const jadwalId = req.params.id;
    const { userId, ...updateData } = req.body;

    try {
        // 1. Validasi input
        if (!userId) {
            return res.status(400).send('User ID diperlukan');
        }

        // 2. Filter field yang diizinkan
        const allowedFields = [
            'tanggal', 'waktu_mulai', 'waktu_selesai', 
            'penyelenggaraan', 'deskripsi', 
            'komentar_mahasiswa', 'supervisor_id'
        ];

        const filteredUpdate = Object.keys(updateData)
            .filter(key => allowedFields.includes(key))
            .reduce((obj, key) => {
                obj[key] = updateData[key];
                return obj;
            }, {});

        // 3. Cek kepemilikan jadwal
        const [jadwalRows] = await pool.query(
            `SELECT user_id, status FROM jadwal WHERE id = ?`, 
            [jadwalId]
        );

        if (jadwalRows.length === 0) {
            return res.status(404).send('Jadwal tidak ditemukan');
        }

        const jadwal = jadwalRows[0];

        if (jadwal.user_id !== userId) {
            return res.status(403).send('Akses ditolak');
        }

        if (jadwal.status !== 'Sedang Verifikasi') {
            return res.status(400).send('Jadwal sudah diverifikasi');
        }

        // 4. Validasi dosen
        if (filteredUpdate.supervisor_id) {
            const [dosenRows] = await pool.query(
                `SELECT role FROM users WHERE id = ?`, 
                [filteredUpdate.supervisor_id]
            );

            if (dosenRows.length === 0 || dosenRows[0].role !== 'dosen') {
                return res.status(400).send('Dosen tidak valid');
            }
        }

        // 5. Build query update
        const fields = Object.keys(filteredUpdate)
            .map(key => `${key} = ?`).join(', ');
        
        const values = [
            ...Object.values(filteredUpdate),
            jadwalId
        ];

        // 6. Eksekusi update
        await pool.query(
            `UPDATE jadwal SET ${fields} WHERE id = ?`,
            values
        );

        res.json({ 
            status: 'success',
            message: 'Jadwal berhasil diperbarui'
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Terjadi kesalahan server');
    }
});


app.delete('/jadwal/:id', async (req, res) => {
    try {
        const { userId } = req.body;
        const jadwalId = req.params.id;

        // 1. Validasi input
        if (!userId || !jadwalId) {
            return res.status(400).json({ 
                error: 'userId dan jadwalId diperlukan' 
            });
        }

        // 2. Cek kepemilikan dan status jadwal
        const [existingJadwal] = await pool.query(
            `SELECT user_id, status FROM jadwal WHERE id = ?`,
            [jadwalId]
        );

        if (!existingJadwal[0]) {
            return res.status(404).json({ error: 'Jadwal tidak ditemukan' });
        }

        if (existingJadwal[0].user_id !== userId) {
            return res.status(403).json({ error: 'Anda tidak memiliki akses' });
        }

        if (existingJadwal[0].status !== 'Sedang Verifikasi') {
            return res.status(400).json({ 
                error: 'Hanya jadwal dengan status "Sedang Verifikasi" yang bisa dihapus' 
            });
        }

        // 3. Eksekusi penghapusan
        const [result] = await pool.query(
            `DELETE FROM jadwal WHERE id = ?`,
            [jadwalId]
        );

        if (result.affectedRows === 0) {
            return res.status(500).json({ error: 'Gagal menghapus jadwal' });
        }

        // // 4. Response sukses
        // res.json({ 
        //     success: true,
        //     message: 'Jadwal berhasil dihapus'
        // });

    } catch (error) {
        console.error('Error deleting jadwal:', error);
        res.status(500).json({ 
            error: 'Terjadi kesalahan server',
        });
    }
});



// GET /verifikasi
app.get('/verifikasi', async (req, res) => {
	try {
        const { userId = 'tanggal_asc' } = req.query;

		// Base query
		let query = `
		SELECT j.*, u.username AS mahasiswa 
		FROM jadwal j
		JOIN users u ON u.id = j.user_id
		WHERE j.supervisor_id = ? 
		AND j.status = 'Sedang Verifikasi'
		ORDER BY j.tanggal ASC, j.waktu_mulai ASC`;

        const [results] = await pool.query(query, [userId]);

        res.json(results);
	} catch (error) {
        res.status(500).render('error', {
            message: 'Gagal memuat list verifikasi',
            error
		});
	}
});

// POST /verifikasi
app.post('/verifikasi', async (req, res) => {
	try {
		const { jadwalId, approved, komentar_dosen, dosenId } = req.body;
	
		const result = await pool.query(
			`UPDATE jadwal 
		 SET status = ?, komentar_dosen = ? 
		 WHERE id = ? AND supervisor_id = ?`,
			[approved ? 'Setuju' : 'Batal', komentar_dosen, jadwalId, dosenId],
		);

		// ga kepake, tapi kalo gaada gabisa, gatau kenapa.., kan anj
        res.status(201).json({ 
            success: true, 
            jadwalId: result.insertId,
            message: 'Jadwal berhasil dibuat'
        });

	} catch (error) {
        res.status(500).render('error', {
            message: 'Gagal meng-update status verifikasi',
            error
		});
	}
});





// GET /jadwal/bimbingan
// app.get('/jadwal/bimbingan', (req, res) => {
// 	const dosenId = req.query.dosenId;

// 	pool.query(
// 		`SELECT j.*, u.username AS mahasiswa 
//      FROM jadwal j
//      JOIN users u ON j.user_id = u.id
//      WHERE j.supervisor_id = ?  -- Filter berdasarkan dosen
//      ORDER BY j.tanggal ASC, j.waktu_mulai ASC`,
// 		[dosenId], // Gunakan dosenId dari parameter
// 		(err, results) => {
// 			if (err) return res.status(500).send('DB error');
// 			res.send(results);
// 		}
// 	);
// });

// // GET /dosen
// app.get('/dosen', (req, res) => {
// 	pool.query(
// 		"SELECT id, username FROM users WHERE role = 'dosen'",
// 		(err, results) => {
// 			if (err) return res.status(500).send('DB error');
// 			res.send(results);
// 		}
// 	);
// });


const PORT = 3000//process.env.DB_PORT
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));