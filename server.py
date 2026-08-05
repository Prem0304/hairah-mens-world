from flask import Flask, request, jsonify, session, send_from_directory, abort
from flask_cors import CORS
import os
import database
from werkzeug.utils import secure_filename

app = Flask(__name__, static_folder='.')
app.secret_key = 'hairah_mens_world_secret_luxury_key_2026'

# File upload configuration
UPLOAD_FOLDER = 'assets'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Enable CORS for local dev testing
CORS(app, supports_credentials=True)

# Initialize database schemas and seed data on startup
database.init_db()

# --- Static File Serving ---

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/index.js')
def serve_js():
    return send_from_directory('.', 'index.js')

@app.route('/index.css')
def serve_css():
    return send_from_directory('.', 'index.css')

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory('assets', filename)

# --- API Authentication Endpoints ---

@app.route('/api/auth/register', methods=['POST'])
def api_register():
    data = request.json
    if not data or 'email' not in data or 'password' not in data or 'name' not in data:
        return jsonify({"error": "Missing registration details"}), 400
        
    email = data['email'].strip().lower()
    password = data['password']
    name = data['name'].strip()
    
    success = database.register_user(email, password, name)
    if success:
        # Automatically log in the user
        session['user_email'] = email
        session['user_role'] = 'customer'
        session['user_name'] = name
        
        user_info = database.get_user_by_email(email)
        # Format for response
        user_response = {
            "email": user_info['email'],
            "name": user_info['name'],
            "role": user_info['role'],
            "sizing": {
                "chest": user_info['chest'],
                "waist": user_info['waist'],
                "fit": user_info['fit'] or "Tailored"
            }
        }
        return jsonify({"user": user_response, "message": "Account created successfully"}), 201
    else:
        return jsonify({"error": "Email address already registered"}), 400

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.json
    if not data or 'email' not in data or 'password' not in data:
        return jsonify({"error": "Missing login credentials"}), 400
        
    email = data['email'].strip().lower()
    password = data['password']
    
    # Special Admin Credentials Check
    if email == 'admin@hairah.com' and password == 'admin123':
        session['user_email'] = 'admin@hairah.com'
        session['user_role'] = 'admin'
        session['user_name'] = 'Sartorial Director'
        
        admin_response = {
            "email": "admin@hairah.com",
            "name": "Sartorial Director",
            "role": "admin",
            "sizing": None
        }
        return jsonify({"user": admin_response, "message": "Admin session authorized"}), 200
        
    # Authenticate standard customer
    user_info = database.authenticate_user(email, password)
    if user_info:
        session['user_email'] = user_info['email']
        session['user_role'] = user_info['role']
        session['user_name'] = user_info['name']
        
        user_response = {
            "email": user_info['email'],
            "name": user_info['name'],
            "role": user_info['role'],
            "sizing": {
                "chest": user_info['chest'],
                "waist": user_info['waist'],
                "fit": user_info['fit'] or "Tailored"
            }
        }
        return jsonify({"user": user_response, "message": "Authentication successful"}), 200
    else:
        return jsonify({"error": "Invalid email or password credentials"}), 401

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({"message": "Logout successful"}), 200

@app.route('/api/auth/me', methods=['GET'])
def api_me():
    email = session.get('user_email')
    if not email:
        return jsonify({"user": None}), 200
        
    if email == 'admin@hairah.com':
        admin_response = {
            "email": "admin@hairah.com",
            "name": "Sartorial Director",
            "role": "admin",
            "sizing": None
        }
        return jsonify({"user": admin_response}), 200
        
    user_info = database.get_user_by_email(email)
    if user_info:
        user_response = {
            "email": user_info['email'],
            "name": user_info['name'],
            "role": user_info['role'],
            "sizing": {
                "chest": user_info['chest'],
                "waist": user_info['waist'],
                "fit": user_info['fit'] or "Tailored"
            }
        }
        return jsonify({"user": user_response}), 200
    else:
        session.clear()
        return jsonify({"user": None}), 200

# --- Sizing Studio Endpoints ---

@app.route('/api/profile/sizing', methods=['POST'])
def api_update_sizing():
    email = session.get('user_email')
    if not email or session.get('user_role') != 'customer':
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.json
    if not data or 'chest' not in data or 'waist' not in data or 'fit' not in data:
        return jsonify({"error": "Missing measurement details"}), 400
        
    database.update_user_sizing(email, data['chest'], data['waist'], data['fit'])
    return jsonify({"message": "Sizing profile updated successfully"}), 200

# --- Products Catalog Endpoints ---

@app.route('/api/products', methods=['GET'])
def api_products():
    role = session.get('user_role')
    include_hidden = (role == 'admin')
    products = database.get_all_products(include_hidden=include_hidden)
    return jsonify(products), 200

@app.route('/api/products/price', methods=['POST'])
def api_update_price():
    if session.get('user_role') != 'admin':
        return jsonify({"error": "Forbidden"}), 403
        
    data = request.json
    if not data or 'id' not in data or 'price' not in data:
        return jsonify({"error": "Missing required price data"}), 400
        
    database.update_product_price(data['id'], float(data['price']))
    return jsonify({"message": "Product price updated successfully"}), 200

@app.route('/api/products/stock', methods=['POST'])
def api_toggle_stock():
    if session.get('user_role') != 'admin':
        return jsonify({"error": "Forbidden"}), 403
        
    data = request.json
    if not data or 'id' not in data or 'inStock' not in data:
        return jsonify({"error": "Missing required stock details"}), 400
        
    database.toggle_product_stock(data['id'], bool(data['inStock']))
    return jsonify({"message": "Product stock status updated"}), 200

@app.route('/api/products/visibility', methods=['POST'])
def api_toggle_visibility():
    if session.get('user_role') != 'admin':
        return jsonify({"error": "Forbidden"}), 403
        
    data = request.json
    if not data or 'id' not in data or 'isVisible' not in data:
        return jsonify({"error": "Missing required visibility details"}), 400
        
    database.toggle_product_visibility(data['id'], bool(data['isVisible']))
    return jsonify({"message": "Product visibility status updated"}), 200

@app.route('/api/products/upload', methods=['POST'])
def api_upload_product_image():
    if session.get('user_role') != 'admin':
        return jsonify({"error": "Forbidden"}), 403
        
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Ensure upload folder exists
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        return jsonify({"imagePath": f"assets/{filename}", "message": "Image uploaded successfully"}), 200
        
    return jsonify({"error": "File extension not allowed"}), 400

@app.route('/api/products/add', methods=['POST'])
def api_add_product():
    if session.get('user_role') != 'admin':
        return jsonify({"error": "Forbidden"}), 403
        
    data = request.json
    if not data or 'title' not in data or 'category' not in data or 'price' not in data or 'image' not in data:
        return jsonify({"error": "Missing product information"}), 400
        
    title = data['title'].strip()
    category = data['category'].strip().lower()
    price = float(data['price'])
    image = data['image'].strip()
    description = data.get('description', '').strip()
    features = data.get('features', [])
    sizes = data.get('sizes', [])
    colors = data.get('colors', [])
    
    # Generate unique product ID
    import random
    product_id = f"{category}-{random.randint(100, 999)}-{str(hash(title))[-4:].replace('-', '9')}"
    
    try:
        database.add_product(
            product_id=product_id,
            title=title,
            category=category,
            price=price,
            image=image,
            description=description,
            features=features,
            sizes=sizes,
            colors=colors
        )
        
        # Seed default stock for each size
        for s in sizes:
            database.update_size_stock(product_id, s, 10)
            
        return jsonify({"id": product_id, "message": f"Product '{title}' added successfully"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/products/size-stock', methods=['POST'])
def api_update_size_stock():
    if session.get('user_role') != 'admin':
        return jsonify({"error": "Forbidden"}), 403
        
    data = request.json
    if not data or 'id' not in data or 'size' not in data or 'stock' not in data:
        return jsonify({"error": "Missing required size-stock data"}), 400
        
    database.update_size_stock(data['id'], str(data['size']), int(data['stock']))
    return jsonify({"message": f"Size '{data['size']}' stock updated to {data['stock']}"}), 200

# --- Orders Endpoints ---

@app.route('/api/orders', methods=['GET'])
def api_orders():
    email = session.get('user_email')
    role = session.get('user_role')
    
    if not email:
        return jsonify({"error": "Unauthorized"}), 401
        
    if role == 'admin':
        orders = database.get_all_orders()
        # Fetch client registry for customer page
        users = []
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT name, email, chest, waist, fit, created_at FROM users WHERE role = 'customer'")
        users_rows = cursor.fetchall()
        conn.close()
        for u in users_rows:
            users.append({
                "name": u["name"],
                "email": u["email"],
                "sizing": {"chest": u["chest"], "waist": u["waist"], "fit": u["fit"]} if u["chest"] else None
            })
        return jsonify({"orders": orders, "users": users}), 200
    else:
        orders = database.get_orders_by_customer(email)
        return jsonify({"orders": orders}), 200

@app.route('/api/orders', methods=['POST'])
def api_place_order():
    data = request.json
    if not data or 'recipientName' not in data or 'recipientEmail' not in data or 'address' not in data or 'city' not in data or 'phone' not in data or 'items' not in data or 'total' not in data:
        return jsonify({"error": "Missing checkout details"}), 400
        
    try:
        order_id = database.create_order(
            customer_email=data['recipientEmail'].strip().lower(),
            recipient_name=data['recipientName'].strip(),
            address=data['address'].strip(),
            city=data['city'].strip(),
            phone=data['phone'].strip(),
            total=float(data['total']),
            items=data['items'],
            payment_id=data.get('paymentId'),
            payment_method=data.get('paymentMethod', 'Card')
        )
        return jsonify({"orderId": order_id, "message": "Order registered successfully"}), 201
    except Exception as e:
        error_msg = str(e)
        if "Insufficient stock" in error_msg or "Sizing stock record" in error_msg:
            return jsonify({"error": error_msg}), 400
        return jsonify({"error": error_msg}), 500

@app.route('/api/orders/<order_id>/status', methods=['PUT'])
def api_update_order_status(order_id):
    if session.get('user_role') != 'admin':
        return jsonify({"error": "Forbidden"}), 403
        
    data = request.json
    if not data or 'status' not in data:
        return jsonify({"error": "Missing order status"}), 400
        
    database.update_order_status(order_id, data['status'])
    return jsonify({"message": f"Order status updated to {data['status']}"}), 200

# --- Wishlist Endpoints ---

@app.route('/api/wishlist', methods=['GET'])
def api_wishlist():
    email = session.get('user_email')
    if not email:
        return jsonify([]), 200
    wishlist = database.get_wishlist_by_user(email)
    return jsonify(wishlist), 200

@app.route('/api/wishlist/toggle', methods=['POST'])
def api_toggle_wishlist():
    email = session.get('user_email')
    if not email:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.json
    if not data or 'productId' not in data:
        return jsonify({"error": "Missing product ID"}), 400
        
    is_saved = database.toggle_wishlist_item(email, data['productId'])
    return jsonify({"isSaved": is_saved, "message": "Wishlist state synced"}), 200

# --- Reviews Endpoints ---

@app.route('/api/reviews/<product_id>', methods=['GET'])
def api_reviews(product_id):
    reviews = database.get_product_reviews(product_id)
    return jsonify(reviews), 200

@app.route('/api/reviews', methods=['POST'])
def api_add_review():
    email = session.get('user_email')
    name = session.get('user_name')
    if not email:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.json
    if not data or 'productId' not in data or 'rating' not in data or 'content' not in data:
        return jsonify({"error": "Missing review data"}), 400
        
    database.add_product_review(data['productId'], name or email.split('@')[0], int(data['rating']), data['content'])
    return jsonify({"message": "Review submitted successfully"}), 201

# --- Payments Gateway Endpoints ---

@app.route('/api/payments/create-intent', methods=['POST'])
def api_create_payment_intent():
    data = request.json
    if not data or 'total' not in data:
        return jsonify({"error": "Missing total amount"}), 400
        
    import uuid
    intent_secret = f"pi_{uuid.uuid4().hex[:16]}_secret_{uuid.uuid4().hex[:16]}"
    return jsonify({
        "clientSecret": intent_secret,
        "amount": float(data['total'])
    }), 200

@app.route('/api/payments/confirm', methods=['POST'])
def api_confirm_payment():
    data = request.json
    if not data or 'clientSecret' not in data or 'paymentMethod' not in data:
        return jsonify({"error": "Missing confirmation data"}), 400
        
    method = data['paymentMethod']
    
    # 1. Card Payment validation checks
    if method == 'Card':
        card_num = data.get('cardNumber', '').replace(' ', '')
        expiry = data.get('expiry', '')
        cvv = data.get('cvv', '')
        
        if not card_num or len(card_num) < 13:
            return jsonify({"error": "Invalid credit card number"}), 400
        if not cvv or len(cvv) < 3 or len(cvv) > 4:
            return jsonify({"error": "Invalid CVV code"}), 400
        if not expiry or '/' not in expiry:
            return jsonify({"error": "Invalid expiration date"}), 400
            
    # 2. UPI Payment validation checks
    elif method == 'UPI':
        upi_type = data.get('upiType') # 'id' or 'qr'
        if upi_type == 'id':
            vpa = data.get('upiId', '')
            if not vpa or '@' not in vpa:
                return jsonify({"error": "Invalid Virtual Payment Address (UPI ID)"}), 400
        elif upi_type != 'qr':
            return jsonify({"error": "Invalid UPI confirmation mode"}), 400
    else:
        return jsonify({"error": "Unsupported payment method"}), 400
        
    # Generate mock charge transaction ID
    import uuid
    charge_id = f"ch_{uuid.uuid4().hex[:16]}"
    return jsonify({
        "status": "succeeded",
        "paymentId": charge_id,
        "message": "Payment authorized by Stripe simulation gateway"
    }), 200

@app.route('/api/payments/merchant-config', methods=['GET'])
def api_get_merchant_config():
    config = database.get_merchant_settings()
    return jsonify(config), 200

@app.route('/api/payments/merchant-config', methods=['POST'])
def api_save_merchant_config():
    if session.get('user_role') != 'admin':
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.json
    if not data or 'upiId' not in data or 'accountHolder' not in data or 'bankName' not in data or 'accountNumber' not in data:
        return jsonify({"error": "Missing config parameters"}), 400
        
    database.save_merchant_settings(
        upi_id=data['upiId'].strip(),
        account_holder=data['accountHolder'].strip(),
        bank_name=data['bankName'].strip(),
        account_number=data['accountNumber'].strip(),
        gateway_type=data.get('gatewayType', 'Simulated').strip(),
        razorpay_key_id=data.get('razorpayKeyId', '').strip(),
        razorpay_key_secret=data.get('razorpayKeySecret', '').strip()
    )
    return jsonify({"message": "Merchant payment settings saved successfully"}), 200

@app.route('/api/payments/razorpay-order', methods=['POST'])
def api_create_razorpay_order():
    data = request.json
    if not data or 'total' not in data:
        return jsonify({"error": "Missing total amount"}), 400
        
    total = float(data['total'])
    config = database.get_merchant_settings()
    
    # Check if real Razorpay gateway is selected and keys are present
    if config.get('gateway_type') == 'Razorpay' and config.get('razorpay_key_id') and config.get('razorpay_key_secret'):
        try:
            import requests
            import uuid
            url = "https://api.razorpay.com/v1/orders"
            auth = (config['razorpay_key_id'], config['razorpay_key_secret'])
            payload = {
                "amount": int(total * 100), # Amount in paise
                "currency": "INR",
                "receipt": "receipt_sartorial_" + str(uuid.uuid4().hex[:8])
            }
            res = requests.post(url, json=payload, auth=auth, timeout=10)
            res_data = res.json()
            if res.status_code == 200 and 'id' in res_data:
                return jsonify({
                    "gatewayType": "Razorpay",
                    "orderId": res_data['id'],
                    "amount": total,
                    "keyId": config['razorpay_key_id']
                }), 200
            else:
                return jsonify({"error": res_data.get('error', {}).get('description', 'Razorpay Order generation failed')}), 400
        except Exception as e:
            return jsonify({"error": f"Failed to contact Razorpay: {str(e)}"}), 500
            
    # Simulated Mode
    import uuid
    mock_order_id = f"order_mock_rzp_{uuid.uuid4().hex[:12]}"
    return jsonify({
        "gatewayType": "Simulated",
        "orderId": mock_order_id,
        "amount": total,
        "keyId": "rzp_test_mock_keys_xxxx"
    }), 200

@app.route('/api/payments/razorpay-verify', methods=['POST'])
def api_verify_razorpay_signature():
    data = request.json
    if not data or 'razorpayOrderId' not in data or 'razorpayPaymentId' not in data:
        return jsonify({"error": "Missing verification parameters"}), 400
        
    config = database.get_merchant_settings()
    
    # Check if we are running in real Razorpay mode
    if config.get('gateway_type') == 'Razorpay' and config.get('razorpay_key_id') and config.get('razorpay_key_secret'):
        sig = data.get('razorpaySignature')
        if not sig:
            return jsonify({"error": "Missing signature"}), 400
            
        import hmac
        import hashlib
        
        msg = f"{data['razorpayOrderId']}|{data['razorpayPaymentId']}".encode()
        key = config['razorpay_key_secret'].encode()
        computed_sig = hmac.new(key, msg, hashlib.sha256).hexdigest()
        
        if hmac.compare_digest(computed_sig, sig):
            return jsonify({"status": "succeeded", "message": "Razorpay signature verified successfully"}), 200
        else:
            return jsonify({"error": "Invalid signature. Payment verification failed."}), 400
            
    # Simulated Mode
    return jsonify({"status": "succeeded", "message": "Simulated Razorpay transaction verified"}), 200

if __name__ == '__main__':
    # Running on local port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
