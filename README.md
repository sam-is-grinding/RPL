# Sistem Bimbingan Kampus

Repositori ini berisi aplikasi full-stack sederhana menggunakan **Node.js**, **Express**, dan **MySQL** (MySQL Workbench / Valentina Studio).

---

## 📋 Daftar Isi

1. [Prasyarat](#-prasyarat)  
2. [Setup Database](#1-setup-database)  
3. [Sesuaikan Kode](#2-sesuaikan-kode)  
4. [Install Dependencies](#3-install-dependencies)  
5. [Jalankan Aplikasi](#4-jalankan-aplikasi)  


---

## 🔧 Prasyarat

- Node.js ≥ v18  
- MySQL server (dapat menggunakan MySQL Workbench atau Valentina Studio)  
- Live Server extension (pada VSCode atau editor lain)  

---

## 1. Setup Database

1. Buka **MySQL Workbench** atau **Valentina Studio**.  
2. Buat database baru, misalnya `bimbingan_kampus`.  
3. Import **DDL** berikut ke dalam database tersebut:  

   ```sql
   -- Tabel user sederhana
   CREATE TABLE IF NOT EXISTS users (
       id INT PRIMARY KEY AUTO_INCREMENT,
       username VARCHAR(50) UNIQUE,
       password VARCHAR(255),
       role ENUM('mahasiswa', 'dosen') DEFAULT 'mahasiswa'
   );

   -- Tabel jadwal (modifikasi dari sebelumnya)
   CREATE TABLE IF NOT EXISTS jadwal (
     id INT PRIMARY KEY AUTO_INCREMENT,
     user_id INT,
     tanggal DATE,
     waktu_mulai TIME,
     waktu_selesai TIME,
     status VARCHAR(20) DEFAULT 'Sedang Verifikasi',
     penyelenggaraan ENUM('Online','Offline') NOT NULL,
     deskripsi TEXT NOT NULL,
     komentar_mahasiswa TEXT NULL,
     komentar_dosen TEXT NULL,
     supervisor_id INT,
     FOREIGN KEY (user_id) REFERENCES users(id),
     FOREIGN KEY (supervisor_id) REFERENCES users(id)
   );

   SET GLOBAL event_scheduler = ON;

  -- Event untuk menghapus jadwal kadaluarsa
  CREATE EVENT IF NOT EXISTS hapus_jadwal_kadaluarsa
  ON SCHEDULE EVERY 1 DAY
  STARTS CURRENT_TIMESTAMP + INTERVAL 1 DAY
  DO
  BEGIN
    DELETE FROM jadwal WHERE tanggal < CURDATE();
  END;

## 2. Sesuaikan Kode
Buka file index.js dan atur konfigurasi koneksi database sesuai host/user/password/database:

```javascript
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',            // Ganti jika berbeda
  password: 'root',        // Ganti jika berbeda
  database: 'bimbingan_kampus', // Ganti jika berbeda
  port: 3306, // Ganti jika berbeda
  waitForConnections: true
});

```
## 3. Install Dependencies
Di terminal VScode projek run `npm install axios bcrypt cors express mysql2 dotenv`

## 4. Jalankan Aplikasi
DI terminal VScode projek run `node index.js` lalu jika sudah menginstall Live Server, pada bawah kanan VScode klik `Go Live`
