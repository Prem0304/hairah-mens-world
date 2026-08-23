import sqlite3
import json
import hashlib
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

DB_PATH = 'hairah.db'

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    return generate_password_hash(password)

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Users Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            email TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('customer', 'admin')),
            chest TEXT,
            waist TEXT,
            fit TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 2. Products Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            category_label TEXT NOT NULL,
            price REAL NOT NULL,
            image TEXT NOT NULL,
            description TEXT,
            features TEXT,  -- JSON string
            sizes TEXT,     -- JSON string
            colors TEXT,    -- JSON string
            in_stock INTEGER DEFAULT 1, -- 1 = In Stock, 0 = Out of Stock
            is_visible INTEGER DEFAULT 1 -- 1 = Visible, 0 = Hidden
        )
    ''')
    
    # 3. Orders Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            customer_email TEXT NOT NULL,
            date TEXT NOT NULL,
            total REAL NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('Processing', 'Shipped', 'Delivered')),
            recipient_name TEXT NOT NULL,
            address TEXT NOT NULL,
            city TEXT NOT NULL,
            phone TEXT NOT NULL,
            payment_id TEXT,
            payment_method TEXT DEFAULT 'Card',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 4. Order Items Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS order_items (
            order_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            title TEXT NOT NULL,
            qty INTEGER NOT NULL,
            price REAL NOT NULL,
            size TEXT NOT NULL,
            color TEXT NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )
    ''')
    
    # 5. Wishlists Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS wishlists (
            email TEXT NOT NULL,
            product_id TEXT NOT NULL,
            PRIMARY KEY (email, product_id),
            FOREIGN KEY (email) REFERENCES users(email),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    ''')
    
    # 6. Reviews Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id TEXT NOT NULL,
            author TEXT NOT NULL,
            rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
            date TEXT NOT NULL,
            content TEXT NOT NULL,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    ''')
    
    conn.commit()

    # Database Migration: add is_visible column to products table if it doesn't exist
    try:
        cursor.execute("SELECT is_visible FROM products LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE products ADD COLUMN is_visible INTEGER DEFAULT 1")
        conn.commit()

    # Create Product Sizes Stock Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS product_sizes_stock (
            product_id TEXT NOT NULL,
            size TEXT NOT NULL,
            stock INTEGER DEFAULT 10,
            PRIMARY KEY (product_id, size),
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
    ''')
    conn.commit()

    # 7. Merchant Payment Settings Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS merchant_payment_settings (
            id TEXT PRIMARY KEY,
            upi_id TEXT NOT NULL,
            account_holder TEXT NOT NULL,
            bank_name TEXT NOT NULL,
            account_number TEXT NOT NULL,
            gateway_type TEXT DEFAULT 'Simulated',
            razorpay_key_id TEXT,
            razorpay_key_secret TEXT,
            stripe_publishable_key TEXT,
            stripe_secret_key TEXT
        )
    ''')
    conn.commit()

    # 8. Coupons Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS coupons (
            code TEXT PRIMARY KEY,
            discount_type TEXT NOT NULL, -- 'percent' or 'flat'
            value REAL NOT NULL,
            is_active INTEGER DEFAULT 1
        )
    ''')
    conn.commit()

    # Database Migration: add gateway_type, razorpay_key_id, razorpay_key_secret to merchant_payment_settings
    try:
        cursor.execute("SELECT gateway_type FROM merchant_payment_settings LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE merchant_payment_settings ADD COLUMN gateway_type TEXT DEFAULT 'Simulated'")
        cursor.execute("ALTER TABLE merchant_payment_settings ADD COLUMN razorpay_key_id TEXT")
        cursor.execute("ALTER TABLE merchant_payment_settings ADD COLUMN razorpay_key_secret TEXT")
        conn.commit()

    # Database Migration: add stripe keys to merchant_payment_settings
    try:
        cursor.execute("SELECT stripe_publishable_key FROM merchant_payment_settings LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE merchant_payment_settings ADD COLUMN stripe_publishable_key TEXT")
        cursor.execute("ALTER TABLE merchant_payment_settings ADD COLUMN stripe_secret_key TEXT")
        conn.commit()
    
    # Database Migration: Update numeric sizes to S, M, L, XL
    cursor.execute('SELECT id, sizes FROM products')
    products_rows = cursor.fetchall()
    for p in products_rows:
        p_id = p['id']
        try:
            sizes = json.loads(p['sizes'])
            needs_update = False
            for s in sizes:
                if s not in ["S", "M", "L", "XL"]:
                    needs_update = True
                    break
            
            if needs_update:
                new_sizes = ["S", "M", "L", "XL"]
                cursor.execute('UPDATE products SET sizes = ? WHERE id = ?', (json.dumps(new_sizes), p_id))
                # Reset sizes stock for this product
                cursor.execute('DELETE FROM product_sizes_stock WHERE product_id = ?', (p_id,))
                for ns in new_sizes:
                    cursor.execute('''
                        INSERT INTO product_sizes_stock (product_id, size, stock)
                        VALUES (?, ?, 10)
                    ''', (p_id, ns))
        except Exception:
            pass
    conn.commit()

    # Database Migration: Update category labels
    cursor.execute("UPDATE products SET category_label = 'Shirts' WHERE category = 'shirts'")
    cursor.execute("UPDATE products SET category_label = 'Pants' WHERE category = 'pants'")
    cursor.execute("UPDATE products SET category_label = 'T-Shirts' WHERE category = 'tshirts'")
    conn.commit()

    # Database Migration: Add payment fields to orders table
    try:
        cursor.execute("SELECT payment_id FROM orders LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE orders ADD COLUMN payment_id TEXT")
        cursor.execute("ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'Card'")
        conn.commit()

    # Seed size stock if empty
    cursor.execute('SELECT COUNT(*) FROM product_sizes_stock')
    if cursor.fetchone()[0] == 0:
        cursor.execute('SELECT id, sizes FROM products')
        products_rows = cursor.fetchall()
        for p in products_rows:
            p_id = p['id']
            try:
                sizes = json.loads(p['sizes'])
                for s in sizes:
                    cursor.execute('''
                        INSERT OR IGNORE INTO product_sizes_stock (product_id, size, stock)
                        VALUES (?, ?, 10)
                    ''', (p_id, s))
            except Exception:
                pass
        conn.commit()

    # Seed default merchant settings if empty
    cursor.execute('SELECT COUNT(*) FROM merchant_payment_settings')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
            INSERT INTO merchant_payment_settings (id, upi_id, account_holder, bank_name, account_number)
            VALUES (?, ?, ?, ?, ?)
        ''', ('merchant_config', 'hairah@upi', 'HAIRAH MEN\'S WORLD', 'Bespoke Sartorial Bank', '9876543210'))
        conn.commit()

    # --- Populate Initial Data ---
    
    # Register default users if empty
    cursor.execute('SELECT COUNT(*) FROM users')
    if cursor.fetchone()[0] == 0:
        # Admin Account
        cursor.execute('''
            INSERT INTO users (email, password_hash, name, role)
            VALUES (?, ?, ?, ?)
        ''', ('admin@hairah.com', hash_password('admin123'), 'Store Director', 'admin'))
        
        # Customer Account
        cursor.execute('''
            INSERT INTO users (email, password_hash, name, role, chest, waist, fit)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', ('customer@hairah.com', hash_password('password'), 'Arthur Pendragon', 'customer', '40', '32', 'Tailored'))
        
        conn.commit()

    # Pre-populate products if empty (re-seed to reflect ready-made brand updates)
    cursor.execute("DELETE FROM products WHERE id IN ('shirt-01', 'shirt-02', 'pants-01', 'pants-02', 'tshirt-01', 'tshirt-02')")
    conn.commit()
    
    cursor.execute('SELECT COUNT(*) FROM products')
    if cursor.fetchone()[0] == 0:
        catalog = [
            {
                "id": "shirt-01",
                "title": "Premium White Dress Shirt",
                "category": "shirts",
                "category_label": "Shirts",
                "price": 220.00,
                "image": "assets/shirt_white.jpg",
                "description": "An elegant dress shirt crafted from two-ply Egyptian cotton, featuring a structured spread collar, double-button French cuffs, and a premium slim fit. A true wardrobe staple for formal settings.",
                "features": ["120s double-ply cotton", "French cuffs for cufflinks", "Removable collar stays", "Signature inner collar piping"],
                "sizes": ["S", "M", "L", "XL"],
                "colors": [
                    {"name": "Classic White", "hex": "#FFFFFF"},
                    {"name": "Powder Blue", "hex": "#E6F0FA"}
                ],
                "in_stock": 1
            },
            {
                "id": "shirt-02",
                "title": "Premium Casual Linen Shirt",
                "category": "shirts",
                "category_label": "Shirts",
                "price": 185.00,
                "image": "assets/shirt_white.jpg",
                "description": "Woven from premium Irish flax linen, this relaxed-fit shirt features a button-down collar and soft barrel cuffs. Garment-washed for exceptional softness and an effortless summer drape.",
                "features": ["100% natural organic flax", "Soft wash processing", "Mother-of-pearl buttons", "Chest patch pocket"],
                "sizes": ["S", "M", "L", "XL"],
                "colors": [
                    {"name": "Powder Blue", "hex": "#E6F0FA"},
                    {"name": "Classic White", "hex": "#FFFFFF"}
                ],
                "in_stock": 1
            },
            {
                "id": "pants-01",
                "title": "Pleated Premium Cotton Chinos",
                "category": "pants",
                "category_label": "Pants",
                "price": 290.00,
                "image": "assets/pants_chinos.jpg",
                "description": "Crafted from medium-weight Italian cotton-gabardine, these double-pleated pants offer a refined drape, side adjusters, and a slightly tapered silhouette. Melds casual comfort with formal posture.",
                "features": ["98% long-staple cotton, 2% elastane", "Classic double pleats", "Side metal buckle adjusters", "Split-back comfort waistband"],
                "sizes": ["S", "M", "L", "XL"],
                "colors": [
                    {"name": "Stone Chino", "hex": "#D2B48C"},
                    {"name": "Midnight Navy", "hex": "#1D2235"}
                ],
                "in_stock": 1
            },
            {
                "id": "pants-02",
                "title": "Pleated Tropical Wool Trousers",
                "category": "pants",
                "category_label": "Pants",
                "price": 350.00,
                "image": "assets/pants_chinos.jpg",
                "description": "Formal suit trousers made from fine tropical wool. Designed for year-round versatility, featuring a flat-front styling, off-seam pockets, and a pre-hemmed finish for immediate ready-made wear.",
                "features": ["Super 120s virgin wool", "Flat front modern drape", "After-dinner split waistband", "Premium satin lining to knee"],
                "sizes": ["S", "M", "L", "XL"],
                "colors": [
                    {"name": "Charcoal Wool", "hex": "#4A4A4A"},
                    {"name": "Raven Black", "hex": "#1A1A1A"}
                ],
                "in_stock": 1
            },
            {
                "id": "tshirt-01",
                "title": "Modern Pima Knit Crewneck",
                "category": "tshirts",
                "category_label": "T-Shirts",
                "price": 110.00,
                "image": "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=600",
                "description": "A premium crewneck T-shirt knitted from silk-infused Pima cotton, offering exceptional softness, shape retention, and a subtle luster. Cut in an athletic ready-made fit.",
                "features": ["95% Pima cotton, 5% silk", "Reinforced rib neckband", "Interlock stitch hemline", "Pre-shrunk fibers"],
                "sizes": ["S", "M", "L", "XL"],
                "colors": [
                    {"name": "Ink Black", "hex": "#121212"},
                    {"name": "Off-White", "hex": "#FAF8F5"},
                    {"name": "Classic Navy", "hex": "#1F2937"}
                ],
                "in_stock": 1
            },
            {
                "id": "tshirt-02",
                "title": "Silk-Blend Luxury V-Neck",
                "category": "tshirts",
                "category_label": "T-Shirts",
                "price": 125.00,
                "image": "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80&w=600",
                "description": "Woven with a rich blend of mulberry silk and organic cotton, this v-neck sweater-tee is designed to be worn under blazers or alone. Features clean ribbing details.",
                "features": ["70% organic cotton, 30% mulberry silk", "Fine 16-gauge knit", "Clean v-neckline overlap", "Ribbed cuffs and hem"],
                "sizes": ["S", "M", "L", "XL"],
                "colors": [
                    {"name": "Heather Grey", "hex": "#8C8C8C"},
                    {"name": "Ink Black", "hex": "#121212"}
                ],
                "in_stock": 1
            }
        ]
        for p in catalog:
            cursor.execute('''
                INSERT INTO products (id, title, category, category_label, price, image, description, features, sizes, colors, in_stock)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                p["id"], p["title"], p["category"], p["category_label"], p["price"], p["image"], 
                p["description"], json.dumps(p["features"]), json.dumps(p["sizes"]), json.dumps(p["colors"]), p["in_stock"]
            ))
        conn.commit()

    # Migration: Delete default pre-populated reviews
    cursor.execute("DELETE FROM reviews WHERE author IN ('Alexander V.', 'Michael K.', 'James L.', 'David S.')")
    conn.commit()

    # Add a default order if empty
    cursor.execute('SELECT COUNT(*) FROM orders')
    if cursor.fetchone()[0] == 0:
        order_id = "HM-893012"
        cursor.execute('''
            INSERT INTO orders (id, customer_email, date, total, status, recipient_name, address, city, phone)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (order_id, 'customer@hairah.com', 'July 28, 2026', 246.00, 'Processing', 'Arthur Pendragon', 'Camelot Keep', 'London', '+1 (555) 777-1212'))
        
        cursor.execute('''
            INSERT INTO order_items (order_id, product_id, title, qty, price, size, color)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (order_id, 'shirt-01', 'Premium White Dress Shirt', 1, 220.00, '16.0', 'Classic White'))
        conn.commit()

    # Seed default coupons if empty
    cursor.execute('SELECT COUNT(*) FROM coupons')
    if cursor.fetchone()[0] == 0:
        default_coupons = [
            ("WELCOME10", "percent", 10.0),
            ("HAIRAH20", "percent", 20.0),
            ("SARTORIAL50", "flat", 50.0),
            ("FESTIVE15", "percent", 15.0)
        ]
        for c in default_coupons:
            cursor.execute('INSERT INTO coupons (code, discount_type, value, is_active) VALUES (?, ?, ?, 1)', c)
        conn.commit()

    conn.close()

# --- Database Helper Queries ---

def register_user(email, password, name):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO users (email, password_hash, name, role)
            VALUES (?, ?, ?, 'customer')
        ''', (email, hash_password(password), name))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def authenticate_user(email, password):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
    user = cursor.fetchone()
    conn.close()
    if user:
        user_dict = dict(user)
        stored_hash = user_dict['password_hash']
        if stored_hash.startswith('pbkdf2:sha256:') or stored_hash.startswith('scrypt:'):
            if check_password_hash(stored_hash, password):
                return user_dict
        else:
            # Fallback check for old simple SHA-256 hashes during database transition
            fallback_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
            if stored_hash == fallback_hash:
                return user_dict
    return None

def get_user_by_email(email):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
    user = cursor.fetchone()
    conn.close()
    if user:
        return dict(user)
    return None

def update_user_sizing(email, chest, waist, fit):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE users 
        SET chest = ?, waist = ?, fit = ?
        WHERE email = ?
    ''', (chest, waist, fit, email))
    conn.commit()
    conn.close()

def get_all_products(include_hidden=False):
    conn = get_db_connection()
    cursor = conn.cursor()
    if include_hidden:
        cursor.execute('SELECT * FROM products')
    else:
        cursor.execute('SELECT * FROM products WHERE is_visible = 1')
    rows = cursor.fetchall()
    
    # Fetch sales totals per product to determine bestsellers based on real purchase velocities
    cursor.execute('SELECT product_id, SUM(qty) as total_sold FROM order_items GROUP BY product_id')
    sales_map = {row['product_id']: row['total_sold'] for row in cursor.fetchall()}
    max_sold = max(sales_map.values()) if sales_map else 0
    
    products = []
    for r in rows:
        p = dict(r)
        p['features'] = json.loads(p['features'])
        p['sizes'] = json.loads(p['sizes'])
        p['colors'] = json.loads(p['colors'])
        p['inStock'] = bool(p['in_stock'])
        p['isVisible'] = bool(p.get('is_visible', 1))
        p['categoryLabel'] = p.get('category_label', '')
        
        # Determine bestseller status (sold >= 1 and is at least 70% of maximum sales velocity)
        sold_qty = sales_map.get(p['id'], 0)
        p['isBestseller'] = bool(sold_qty > 0 and (max_sold > 0 and sold_qty >= max_sold * 0.7))
        
        # Fetch size stock dictionary
        cursor.execute('SELECT size, stock FROM product_sizes_stock WHERE product_id = ?', (p['id'],))
        sizes_stock_rows = cursor.fetchall()
        p['sizes_stock'] = {s_row['size']: s_row['stock'] for s_row in sizes_stock_rows}
        
        # Override global inStock dynamically based on sum of sizes stock
        total_stock = sum(p['sizes_stock'].values())
        p['inStock'] = bool(total_stock > 0 and p['inStock'])
        
        products.append(p)
    conn.close()
    return products

def update_product_price(product_id, price):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE products SET price = ? WHERE id = ?', (price, product_id))
    conn.commit()
    conn.close()

def toggle_product_stock(product_id, in_stock):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE products SET in_stock = ? WHERE id = ?', (1 if in_stock else 0, product_id))
    conn.commit()
    conn.close()

def toggle_product_visibility(product_id, is_visible):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE products SET is_visible = ? WHERE id = ?', (1 if is_visible else 0, product_id))
    conn.commit()
    conn.close()

def get_all_orders():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM orders ORDER BY created_at DESC')
    orders_rows = cursor.fetchall()
    
    orders = []
    for o_row in orders_rows:
        order = dict(o_row)
        cursor.execute('SELECT * FROM order_items WHERE order_id = ?', (order['id'],))
        items_rows = cursor.fetchall()
        order['items'] = [dict(item) for item in items_rows]
        orders.append(order)
        
    conn.close()
    return orders

def get_orders_by_customer(email):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM orders WHERE customer_email = ? ORDER BY created_at DESC', (email,))
    orders_rows = cursor.fetchall()
    
    orders = []
    for o_row in orders_rows:
        order = dict(o_row)
        cursor.execute('SELECT * FROM order_items WHERE order_id = ?', (order['id'],))
        items_rows = cursor.fetchall()
        order['items'] = [dict(item) for item in items_rows]
        orders.append(order)
        
    conn.close()
    return orders

def create_order(customer_email, recipient_name, address, city, phone, total, items, payment_id=None, payment_method='Card', status='Processing'):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    order_id = "HM-" + str(hash(customer_email + str(datetime.now())))[-6:].replace('-', '9')
    if len(order_id) < 9:
        # Pad if short
        import random
        order_id = "HM-" + str(random.randint(100000, 999999))
        
    date_str = datetime.now().strftime("%B %d, %Y")
    
    try:
        # A. Verify and update stock counts for each size
        for item in items:
            p_id = item['id']
            if p_id.startswith('custom-') or p_id.startswith('unlisted-'):
                continue
            size = str(item['size'])
            qty = int(item['qty'])
            
            cursor.execute('SELECT stock FROM product_sizes_stock WHERE product_id = ? AND size = ?', (p_id, size))
            stock_row = cursor.fetchone()
            
            if not stock_row:
                raise Exception(f"Sizing stock record not found for {item['title']} (Size: {size})")
                
            current_stock = stock_row['stock']
            if current_stock < qty:
                raise Exception(f"Insufficient stock for size {size} of '{item['title']}'. Only {current_stock} unit(s) available.")
                
            # Decrement stock
            cursor.execute('UPDATE product_sizes_stock SET stock = stock - ? WHERE product_id = ? AND size = ?', (qty, p_id, size))
            
            # Sync products.in_stock status based on remaining size-stock sum
            cursor.execute('SELECT SUM(stock) FROM product_sizes_stock WHERE product_id = ?', (p_id,))
            total_stock = cursor.fetchone()[0] or 0
            in_stock_val = 1 if total_stock > 0 else 0
            cursor.execute('UPDATE products SET in_stock = ? WHERE id = ?', (in_stock_val, p_id))

        # B. Insert order record
        cursor.execute('''
            INSERT INTO orders (id, customer_email, date, total, status, recipient_name, address, city, phone, payment_id, payment_method)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (order_id, customer_email, date_str, total, status, recipient_name, address, city, phone, payment_id, payment_method))
        
        # C. Insert order items
        for item in items:
            cursor.execute('''
                INSERT INTO order_items (order_id, product_id, title, qty, price, size, color)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (order_id, item['id'], item['title'], item['qty'], item['price'], item['size'], item['color']))
            
        conn.commit()
        return order_id
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def update_order_status(order_id, status):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE orders SET status = ? WHERE id = ?', (status, order_id))
    conn.commit()
    conn.close()

def get_wishlist_by_user(email):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT product_id FROM wishlists WHERE email = ?', (email,))
    rows = cursor.fetchall()
    conn.close()
    return [r['product_id'] for r in rows]

def toggle_wishlist_item(email, product_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT 1 FROM wishlists WHERE email = ? AND product_id = ?', (email, product_id))
    exists = cursor.fetchone()
    
    state = False
    if exists:
        cursor.execute('DELETE FROM wishlists WHERE email = ? AND product_id = ?', (email, product_id))
        state = False
    else:
        cursor.execute('INSERT INTO wishlists (email, product_id) VALUES (?, ?)', (email, product_id))
        state = True
        
    conn.commit()
    conn.close()
    return state

def get_product_reviews(product_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC', (product_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_product_review(product_id, author, rating, content):
    conn = get_db_connection()
    cursor = conn.cursor()
    date_str = datetime.now().strftime("%B %d, %Y")
    cursor.execute('''
        INSERT INTO reviews (product_id, author, rating, date, content)
        VALUES (?, ?, ?, ?, ?)
    ''', (product_id, author, rating, date_str, content))
    conn.commit()
    conn.close()

def add_product(product_id, title, category, price, image, description, features, sizes, colors):
    conn = get_db_connection()
    cursor = conn.cursor()
    category_label = "T-Shirts" if category == "tshirts" else category.capitalize()
    cursor.execute('''
        INSERT INTO products (id, title, category, category_label, price, image, description, features, sizes, colors, in_stock)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ''', (
        product_id, title, category, category_label, price, image, description, 
        json.dumps(features), json.dumps(sizes), json.dumps(colors)
    ))
    conn.commit()
    conn.close()

def update_size_stock(product_id, size, stock):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO product_sizes_stock (product_id, size, stock)
        VALUES (?, ?, ?)
    ''', (product_id, size, stock))
    
    # Sync products.in_stock status based on new size-stock sum
    cursor.execute('SELECT SUM(stock) FROM product_sizes_stock WHERE product_id = ?', (product_id,))
    total_stock = cursor.fetchone()[0] or 0
    in_stock_val = 1 if total_stock > 0 else 0
    cursor.execute('UPDATE products SET in_stock = ? WHERE id = ?', (in_stock_val, product_id))
    
    conn.commit()
    conn.close()

def delete_product(product_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # A. Delete reviews for this product
        cursor.execute('DELETE FROM reviews WHERE product_id = ?', (product_id,))
        # B. Delete sizes stock records
        cursor.execute('DELETE FROM product_sizes_stock WHERE product_id = ?', (product_id,))
        # C. Delete product
        cursor.execute('DELETE FROM products WHERE id = ?', (product_id,))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def get_merchant_settings():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM merchant_payment_settings WHERE id = ?', ('merchant_config',))
    row = cursor.fetchone()
    conn.close()
    if row:
        r_dict = dict(row)
        if 'stripe_publishable_key' not in r_dict:
            r_dict['stripe_publishable_key'] = ''
        if 'stripe_secret_key' not in r_dict:
            r_dict['stripe_secret_key'] = ''
        return r_dict
    return {
        "upi_id": "hairah@upi",
        "account_holder": "HAIRAH MEN'S WORLD",
        "bank_name": "Bespoke Sartorial Bank",
        "account_number": "9876543210",
        "gateway_type": "Simulated",
        "razorpay_key_id": "",
        "razorpay_key_secret": "",
        "stripe_publishable_key": "",
        "stripe_secret_key": ""
    }

def save_merchant_settings(upi_id, account_holder, bank_name, account_number, gateway_type='Simulated', razorpay_key_id='', razorpay_key_secret='', stripe_publishable_key='', stripe_secret_key=''):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO merchant_payment_settings (id, upi_id, account_holder, bank_name, account_number, gateway_type, razorpay_key_id, razorpay_key_secret, stripe_publishable_key, stripe_secret_key, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ''', ('merchant_config', upi_id, account_holder, bank_name, account_number, gateway_type, razorpay_key_id, razorpay_key_secret, stripe_publishable_key, stripe_secret_key))
    conn.commit()
    conn.close()

def get_ai_predictions():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Fetch current stock levels
    cursor.execute('SELECT product_id, size, stock FROM product_sizes_stock')
    stock_rows = cursor.fetchall()
    stocks = {}
    for r in stock_rows:
        stocks[(r['product_id'], r['size'])] = r['stock']
        
    # 2. Fetch order items to calculate sales velocity
    cursor.execute('''
        SELECT oi.product_id, oi.size, oi.title, SUM(oi.qty) as total_sold
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        GROUP BY oi.product_id, oi.size
    ''')
    sales_rows = cursor.fetchall()
    
    predictions = []
    recommendations = []
    
    for s in sales_rows:
        pid = s['product_id']
        size = s['size']
        title = s['title']
        qty_sold = s['total_sold']
        
        current_stock = stocks.get((pid, size), 0)
        
        # Calculate velocity (sales per day over an assumed active 30 day window)
        daily_velocity = max(qty_sold / 30.0, 0.05) # baseline velocity if sold
        
        if current_stock == 0:
            days_left = 0
            status = 'Out of Stock'
            recommendations.append(f"Critical: {title} ({size}) is Out of Stock. Replenish immediately to capture missed orders.")
        else:
            days_left = round(current_stock / daily_velocity, 1)
            if days_left <= 7:
                status = 'Critical Risk'
                recommendations.append(f"High Priority: {title} ({size}) will deplete in {days_left} days. Restock recommended within 48 hours.")
            elif days_left <= 15:
                status = 'Moderate Risk'
                recommendations.append(f"Medium Priority: {title} ({size}) will deplete in {days_left} days. Keep watch.")
            else:
                status = 'Low Risk'
                
        predictions.append({
            'productId': pid,
            'size': size,
            'title': title,
            'stock': current_stock,
            'sold': qty_sold,
            'velocity': round(daily_velocity * 7, 2), # weekly velocity
            'daysLeft': days_left,
            'status': status
        })
        
    # Fallback recommendations if everything is stable
    if not recommendations:
        recommendations.append("All inventory levels are currently stable. Keep active fittings catalog items online.")
        
    # Calculate revenue forecast
    cursor.execute('SELECT total FROM orders')
    totals = [r['total'] for r in cursor.fetchall()]
    total_rev = sum(totals)
    
    # Project next month's sales based on average ticket and order count
    predicted_next_month_revenue = total_rev * 1.15 # Assume a 15% growth rate
    
    conn.close()
    return {
        'inventoryRisk': predictions,
        'recommendations': recommendations[:5], # Limit to top 5 recommendations
        'revenueForecast': round(predicted_next_month_revenue, 2),
        'totalRevenue': round(total_rev, 2)
    }

def validate_coupon(code):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT discount_type, value, is_active FROM coupons WHERE UPPER(code) = ?', (code.strip().upper(),))
    row = cursor.fetchone()
    conn.close()
    if row and row['is_active'] == 1:
        return {
            "valid": True,
            "discountType": row['discount_type'],
            "value": row['value']
        }
    return {"valid": False, "error": "Invalid or inactive coupon code"}

def get_all_coupons():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM coupons')
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_coupon(code, discount_type, value):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('INSERT INTO coupons (code, discount_type, value, is_active) VALUES (?, ?, ?, 1)', 
                       (code.strip().upper(), discount_type, float(value)))
        conn.commit()
        success = True
        err = None
    except Exception as e:
        success = False
        err = str(e)
    conn.close()
    return success, err

def delete_coupon(code):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM coupons WHERE UPPER(code) = ?', (code.strip().upper(),))
    conn.commit()
    conn.close()
    return True
