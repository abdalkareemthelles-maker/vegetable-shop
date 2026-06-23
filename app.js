const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcrypt');
const db = require('./db');

const app = express();


// ======================
// DATABASE TABLES
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
    email TEXT UNIQUE,
    phone TEXT,
    gender TEXT,
    birthdate TEXT,
    password TEXT
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    items TEXT,
    total REAL,
    customer_name TEXT,
    phone TEXT,
    address TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);


// ======================
// MIDDLEWARE
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
// CART INIT
// ======================
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

app.use((req, res, next) => {
    if (!req.session.cart) req.session.cart = [];
    res.locals.cartCount = req.session.cart.reduce((s, i) => s + i.qty, 0);
    next();
});


// ======================
// HELPERS
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
    if (!req.session.admin) {
        return res.status(401).json({
            success: false,
            message: "غير مصرح (Admin only)"
        });
    }
    next();
}


// ======================
// HOME
// ======================

app.get('/', (req, res) => {

    const search = req.query.search || '';

    db.all(
        "SELECT * FROM products WHERE name LIKE ?",
        [`%${search}%`],
        (err, rows) => {

            if (err) return res.send("DB Error");

            res.render('index', {
                products: rows,
                search,
                user: req.session.user,
                cart: req.session.cart
            });

        }
    );
});


// ======================
// AUTH (مختصر بدون تغيير كبير)
// =====================            
app.get('/register', (req, res) => {
    res.render('register', {
        error: null,
          title: 'إنشاء حساب جديد في متجر الخضروات'
    });
});
app.post('/register', (req, res) => {

    const {
        username,
        email,
        phone,
        gender,
        birthdate,
        password,
        confirmPassword
    } = req.body;

    if (password !== confirmPassword) {
        return res.render('register', {
            error: 'كلمة المرور غير متطابقة'
        });
    }

    db.get(
        "SELECT * FROM users WHERE username=? OR email=?",
        [username, email],
        (err, user) => {

            if (err) {
                console.log(err);
                return res.send("خطأ في قاعدة البيانات");
            }

            if (user) {
                return res.render('register', {
                    error: 'اسم المستخدم أو الإيميل مستخدم مسبقاً'
                });
            }

            bcrypt.hash(password, 10, (err, hash) => {

                if (err) {
                    console.log(err);
                    return res.send("خطأ في التشفير");
                }

                db.run(
                    `INSERT INTO users
                    (username,email,phone,gender,birthdate,password)
                    VALUES (?,?,?,?,?,?)`,
                    [username, email, phone, gender, birthdate, hash],

                    function(err) {

                        if (err) {
                            console.log("REGISTER ERROR:", err);
                            return res.send("خطأ في التسجيل");
                        }

                        console.log("تم إنشاء المستخدم:", username);

                        res.redirect('/login');
                    }
                );

            });

        }
    );

});

app.get('/login', (req, res) => {
    res.render('login', {
      title: 'أهلاً وسهلاً بكم في متجر الخضروات'

    });
});

app.post('/login', (req, res) => {

    const { username, password } = req.body;

    // admin
    if (username === 'admin' && password === '1234') {
        req.session.admin = true;
        req.session.user = { id: 0, username: 'admin' };
        return res.redirect('/admin');
    }

    db.get("SELECT * FROM users WHERE username=?", [username], (err, user) => {

        if (err) {
            console.log(err);
            return res.send("DB Error");
        }

        if (!user) {
            return res.send("Login failed ❌ (user not found)");
        }

        // 🔥 إذا كلمة المرور قديمة (بدون bcrypt)
        if (!user.password.startsWith('$2b$')) {
            if (user.password === password) {
                req.session.user = user;
                return res.redirect('/');
            } else {
                return res.send("Login failed ❌");
            }
        }

        // 🔥 bcrypt passwords (الجديدة)
        bcrypt.compare(password, user.password, (err, result) => {

            if (err) {
                console.log(err);
                return res.send("Error");
            }

            if (!result) {
                return res.send("Login failed ❌");
            }

            req.session.user = user;
            res.redirect('/');
        });

    });
});
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});


// ======================
// ADMIN
// ======================

app.get('/admin', requireAdmin, (req, res) => {

    db.all("SELECT * FROM products", (err, products) => {
        res.render('admin', { products });
    });
});


// ======================
// PRODUCTS
// ======================

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/images'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ storage });

app.get('/add-product', requireAdmin, (req, res) => {
    res.render('add-product');
});
app.post('/add-product-ajax', requireAdmin, upload.single('image'), (req, res) => {

    console.log("BODY:", req.body);
    console.log("FILE:", req.file);

    const image = req.file ? '/images/' + req.file.filename : '';

    db.run(
        "INSERT INTO products (name,price,image) VALUES (?,?,?)",
        [req.body.name, req.body.price, image],
        function(err) {

            if (err) {
                console.log("DB ERROR:", err);
                return res.json({ success: false, error: err.message });
            }

            res.json({ success: true, id: this.lastID });
        }
    );
});
app.delete('/delete-product/:id', requireAdmin, (req, res) => {

    db.run("DELETE FROM products WHERE id=?", [req.params.id], (err) => {
        if (err) return res.json({ success: false });

        res.json({ success: true, id: req.params.id });
    });
});
app.post('/edit-product-ajax/:id', requireAdmin, (req, res) => {

    db.run(
        "UPDATE products SET name=?, price=? WHERE id=?",
        [req.body.name, req.body.price, req.params.id],
        (err) => {
            if (err) return res.json({ success: false });

            res.json({
                success: true,
                id: req.params.id,
                name: req.body.name,
                price: req.body.price
            });
        }
    );
});


// ======================
// CART (FIXED AJAX)
// ======================

app.get('/add-to-cart/:id', requireLogin, (req, res) => {

  console.log("INCREASE HIT");

  const cart = getCart(req);

  db.get("SELECT * FROM products WHERE id=?", [req.params.id], (err, product) => {

    let item = cart.find(i => String(i.id) === String(req.params.id));

    if (item) {
      item.qty++;
    } else {
      item = { ...product, qty: 1 };
      cart.push(item);
    }

    req.session.cart = cart;

    res.json({
      success: true,
      qty: item.qty,
      total: item.price * item.qty, // ✔ صار آمن
      cartCount: cart.reduce((s, i) => s + i.qty, 0)
    });

  });
});
app.get('/increase/:id', requireLogin, (req, res) => {

  const cart = getCart(req);

  const item = cart.find(i => String(i.id) === String(req.params.id));

  if (!item) {
    return
     res.json({ 
        success: false,
         qty: 0,
         cartCount: cart.reduce((s,i)=>s+i.qty,0)
        });
  }

  item.qty++;

  req.session.cart = cart;

  res.json({
    success: true,
    qty: item.qty,
    total: item ? item.price * item.qty : 0,   
    cartCount: cart.reduce((s, i) => s + i.qty, 0)
  });
});

app.get('/decrease/:id', requireLogin, (req, res) => {
  const cart = getCart(req);

  const item = cart.find(i => String(i.id) === String(req.params.id));

  if (!item) {
    return
     res.json({ 
        success: false,
         qty: 0, 
          cartCount: cart.reduce((s,i)=>s+i.qty,0)

         });
  }

  item.qty--;

  if (item.qty <= 0) {
    req.session.cart = cart.filter(i =>
      String(i.id) !== String(req.params.id)
    );

    const newCart = req.session.cart;

    return res.json({
      success: true,
      qty: 0,
      cartCount: newCart.reduce((s, i) => s + i.qty, 0)
    });
  }

  req.session.cart = cart;

  res.json({
    success: true,
    qty: item.qty,
      total: item.price * item.qty,
    cartCount: cart.reduce((s, i) => s + i.qty, 0)
  });
});

app.get('/delete-from-cart/:id', requireLogin, (req, res) => {
  const cart = getCart(req);

  req.session.cart = cart.filter(i =>
    String(i.id) !== String(req.params.id)
  );

  res.json({
    success: true,
    cartCount: req.session.cart.reduce((s, i) => s + i.qty, 0)
  });
});


// ======================
// CART PAGE
// ======================

app.get('/cart', requireLogin, (req, res) => {

    const cart = getCart(req);

    let total = 0;
    cart.forEach(i => total += i.price * i.qty);

    res.render('cart', { cart, total });
});
app.get('/checkout', requireLogin, (req, res) => {

    const cart = getCart(req);

    let total = 0;
    cart.forEach(i => total += i.price * i.qty);

    res.render('checkout', { cart, total });
});
app.post('/confirm-order', requireLogin, (req, res) => {

    const { customer_name, phone, address } = req.body;
    const cart = getCart(req);

    if (!cart || cart.length === 0) {
        return res.send("السلة فارغة ❌");
    }

    let total = 0;
    cart.forEach(i => total += i.price * i.qty);

    db.run(
        `INSERT INTO orders (items, total, user_id, customer_name, phone, address)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            JSON.stringify(cart),
            total,
            req.session.user.id,
            customer_name,
            phone,
            address
        ],
        (err) => {

            if (err) {
                console.log(err);
                return res.send("خطأ في حفظ الطلب ❌");
            }

            // تفريغ السلة بعد الطلب
            req.session.cart = [];

            res.render('success');
        }
    );
});
app.get('/my-orders', requireLogin, (req, res) => {

    db.all(
        "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC",
        [req.session.user.id],
        (err, orders) => {

            if (err) {
                console.log(err);
                return res.send("Error");
            }

            orders.forEach(o => {
                o.items = JSON.parse(o.items);
            });

            res.render('my-orders', {
                orders
            });
        }
    );
});
app.get('/debug-users', (req, res) => {

    db.all("SELECT * FROM users", [], (err, rows) => {

        if (err) return res.send(err);

        res.json(rows);
    });

});
app.get('/debug-users', (req, res) => {

    db.all("SELECT * FROM users", [], (err, rows) => {

        if (err) {
            return res.send(err);
        }

        res.json(rows);
    });

});
app.get('/users-structure', (req, res) => {
    db.all("PRAGMA table_info(users)", [], (err, rows) => {
        res.json(rows);
    });
});
app.get('/orders', requireAdmin, (req, res) => {

    db.all(
        "SELECT * FROM orders ORDER BY id DESC",
        (err, orders) => {

            if (err) {
                console.log(err);
                return res.send("DB Error");
            }

            orders.forEach(order => {
                order.items = JSON.parse(order.items);
            });

            res.render('orders', {
                orders
            });
        }
    );

});
app.get('/dashboard', requireAdmin, (req, res) => {

    db.get("SELECT COUNT(*) AS totalProducts FROM products", (err, products) => {

        db.get("SELECT COUNT(*) AS totalUsers FROM users", (err, users) => {

            db.get("SELECT COUNT(*) AS totalOrders FROM orders", (err, orders) => {

                db.get("SELECT SUM(total) AS totalSales FROM orders", (err, sales) => {

                    res.render('dashboard', {
                        totalProducts: products.totalProducts,
                        totalUsers: users.totalUsers,
                        totalOrders: orders.totalOrders,
                        totalSales: sales.totalSales || 0
                    });

                });

            });

        });

    });

});
app.get('/change-status/:id/:status', requireAdmin, (req, res) => {

    db.run(
        "UPDATE orders SET status=? WHERE id=?",
        [req.params.status, req.params.id],
        (err) => {

            if (err) {
                console.log(err);
                return res.send("DB Error");
            }

            res.redirect('/orders');
        }
    );

});
app.post('/change-status-ajax/:id', requireAdmin, (req, res) => {

    db.run(
        "UPDATE orders SET status=? WHERE id=?",
        [req.body.status, req.params.id],
        (err) => {

            if (err) {
                console.log(err);
                return res.json({ success: false });
            }

            res.json({
                success: true,
                status: req.body.status
            });
        }
    );

});
// ======================
// SERVER
// ======================

app.listen(3100, () => {
    console.log("Server running on http://localhost:3100");
});