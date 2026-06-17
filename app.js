const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const app = express();
const bcrypt = require('bcrypt');
const db = require('./db');



// ======================
// Tables
// ======================

db.run(`
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price REAL,
    image TEXT
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    items TEXT,
    total REAL,
    customer_name TEXT
    phone TEXT
    address TEXT
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

// ======================
// Upload images
// ======================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/images'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ storage });

// ======================
// Settings
// ======================
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'secretkey123',
    resave: false,
    saveUninitialized: true
}));

// ======================
// Helpers
// ======================
function getCart(req) {
    if (!req.session.cart) req.session.cart = [];
    return req.session.cart;
}

function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.admin) return res.redirect('/login');
    next();
}

// ======================
// HOME
// ======================
app.get('/', (req, res) => {

    const search = req.query.search || '';

    let sql = "SELECT * FROM products WHERE name LIKE ?";
    let params = ['%' + search + '%'];

    db.all(sql, params, (err, rows) => {

        if (err) return res.send("DB Error");

        res.render('index', {
            title: 'متجر الخضروات',
            products: rows,
            search: search,
            user: req.session.user || null
        });

    });

});

// ======================
// AUTH
// ======================

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', (req, res) => {

    const { username, password } = req.body;

    bcrypt.hash(password, 10, (err, hashedPassword) => {
        db.run(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            [username, hashedPassword],
            (err) => {
                if (err) return res.send("User exists");
            res.redirect('/login');
            }
        );
    });
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {

    const { username, password } = req.body;

    // admin
    if (username === 'admin' && password === '1234') {
        req.session.admin = true;
        req.session.user = { id: 0, username: 'admin' };
        return res.redirect('/admin');
    }

    // user
    db.get(
        "SELECT * FROM users WHERE username=?",
        [username],
        (err, user) => {

            if (!user) return res.send("Login failed ❌");

            bcrypt.compare(password, user.password, (err, result) => {

                if (!result) return res.send("Login failed ❌");

                req.session.user = user;
                res.redirect('/');
            });

        }
    );

});
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// ======================
// ADMIN
// ======================

app.get('/admin', requireAdmin, (req, res) => {

    db.all("SELECT * FROM products", (err, rows) => {
        res.render('admin', { products: rows });
    });
});

// ======================
// PRODUCTS
// ======================

app.get('/add-product', requireAdmin, (req, res) => {
    res.render('add-product');
});

app.post('/add-product', requireAdmin, upload.single('image'), (req, res) => {

    const image = req.file ? '/images/' + req.file.filename : '';

    db.run(
        "INSERT INTO products (name, price, image) VALUES (?, ?, ?)",
        [req.body.name, req.body.price, image],
        () => res.redirect('/admin')
    );
});

app.get('/delete-product/:id', requireAdmin, (req, res) => {

    db.run("DELETE FROM products WHERE id=?", [req.params.id], () => {
        res.redirect('/admin');
    });
});

app.get('/edit-product/:id', requireAdmin, (req, res) => {

    db.get("SELECT * FROM products WHERE id=?", [req.params.id], (err, product) => {
        res.render('edit-product', { product });
    });
});

app.post('/edit-product/:id', requireAdmin, (req, res) => {

    db.run(
        "UPDATE products SET name=?, price=?, image=? WHERE id=?",
        [req.body.name, req.body.price, req.body.image, req.params.id],
        () => res.redirect('/admin')
    );
});

// ======================
// CART
// ======================

app.get('/add-to-cart/:id', requireLogin, (req, res) => {

    const cart = getCart(req);

    db.get("SELECT * FROM products WHERE id=?", [req.params.id], (err, product) => {

        const item = cart.find(i => String(i.id) === String(req.params.id));

        if (item) item.qty++;
        else cart.push({ ...product, qty: 1 });

        res.redirect('/cart');
    });
});

app.get('/cart', requireLogin, (req, res) => {

    const cart = getCart(req);

    let total = 0;
    cart.forEach(i => total += i.price * i.qty);

    res.render('cart', { cart, total });
});

// ======================
// INCREASE / DECREASE (FIXED)
// ======================

app.get('/increase/:id', (req, res) => {

    const cart = getCart(req);

    const item = cart.find(i => String(i.id) === String(req.params.id));

    if (item) item.qty++;

    res.redirect('/cart');
});

app.get('/decrease/:id', (req, res) => {

    const cart = getCart(req);

    const item = cart.find(i => String(i.id) === String(req.params.id));

    if (item) {
        item.qty--;

        if (item.qty <= 0) {
            req.session.cart = cart.filter(i => String(i.id) !== String(req.params.id));
        }
    }

    res.redirect('/cart');
});

// ======================
// CHECKOUT
// ======================

app.get('/checkout', requireLogin, (req, res) => {

    const cart = getCart(req);

    let total = 0;
    cart.forEach(i => total += i.price * i.qty);

    res.render('checkout', { cart, total });
});

// ======================
// CONFIRM ORDER (FIXED FINAL)
// ======================

app.post('/confirm-order', requireLogin, (req, res) => {
 const { customer_name, phone, address } = req.body;
    const cart = getCart(req);

    if (!cart || cart.length === 0) {
        return res.send("السلة فارغة ❌");
    }

    let total = 0;

    for (let item of cart) {
        if (!item.price || !item.qty) {
            return res.send("خطأ في بيانات السلة ❌");
        }
        total += item.price * item.qty;
    }

    const userId = req.session.user?.id || 0;

    db.run(
       `INSERT INTO orders
(items, total, user_id, customer_name, phone, address)
VALUES (?, ?, ?, ?, ?, ?)`,
        [JSON.stringify(cart), total, userId, customer_name, phone, address],
        (err) => {

            if (err) {
                console.log(err);
                return res.send("خطأ في حفظ الطلب ❌");
            }

            req.session.cart = [];
            res.render('success');
        }
    );
});

// ======================
// ORDERS
// ======================

app.get('/orders', requireAdmin, (req, res) => {

    db.all(`
SELECT
orders.*,
users.username
FROM orders
LEFT JOIN users
ON orders.user_id = users.id
ORDER BY orders.id DESC`, (err, rows) => {

        rows.forEach(order => {
            order.items = JSON.parse(order.items);
        });

        res.render('orders', {
            title: 'الطلبات',
            orders: rows
        });

    });

});

// ======================
// DASHBOARD
// ======================

app.get('/dashboard', requireAdmin, (req, res) => {

    db.all("SELECT * FROM products", (err, products) => {

        db.all("SELECT * FROM orders", (err, orders) => {

            let totalSales = 0;
            orders.forEach(o => totalSales += o.total);

            res.render('dashboard', {
                productsCount: products.length,
                ordersCount: orders.length,
                totalSales
            });

        });
    });
});
app.get('/update-order-status/:id/:status', requireAdmin, (req, res) => {

    db.run(
        "UPDATE orders SET status = ? WHERE id = ?",
        [req.params.status, req.params.id],
        (err) => {

            if (err) {
                console.log(err);
                return res.send("Error");
            }

            res.redirect('/orders');
        }
    );

});
app.get('/product/:id', (req, res) => {

    db.get("SELECT * FROM products WHERE id = ?", [req.params.id], (err, product) => {

        if (err || !product) {
            return res.send("Product not found");
        }

        res.render('product', {
            title: product.name,
            product: product
        });

    });

});
app.get('/change-status/:id/:status', requireAdmin, (req, res) => {

    db.run(
        "UPDATE orders SET status = ? WHERE id = ?",
        [req.params.status, req.params.id],
        (err) => {

            if (err) {
                console.log(err);
                return res.send("Error");
            }

            res.redirect('/orders');
        }
    );

});
app.get('/my-orders', requireLogin, (req, res) => {

    db.all(
        "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC",
        [req.session.user.id],
        (err, rows) => {

            if (err) {
                console.log(err);
                return res.send("Error");
            }

            rows.forEach(order => {
                order.items = JSON.parse(order.items);
            });

            res.render('my-orders', {
                title: 'طلباتي',
                orders: rows
            });

        }
    );

});
// ======================
// START SERVER
// ======================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});