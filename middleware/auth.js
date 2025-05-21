// middleware/auth.js
const isAuthenticated = (req, res, next) => {
    if (req.session?.user) return next();
    // res.redirect('/login');
    return res.redirect('/auth?error=Silakan login terlebih dahulu');
};

// Ekspor sebagai named export
module.exports = { isAuthenticated };