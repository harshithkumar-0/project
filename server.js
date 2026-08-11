const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const LEGACY_DATA_FILE = path.join(__dirname, 'database.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Load local hosting settings without requiring an additional package.
const ENV_FILE = path.join(__dirname, '.env');
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing in .env. Add your PostgreSQL connection URL, then run npm start again. See .env.example.');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
const q = (text, values = []) => pool.query(text, values);
const cleanMobile = value => String(value || '').replace(/\D/g, '');
const normalizedMobile = "regexp_replace(mobile, '[^0-9]', '', 'g')";
const num = value => Number(value) || 0;

async function setup() {
  await q(`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, mobile TEXT NOT NULL, total_price NUMERIC NOT NULL DEFAULT 0, amount_paid NUMERIC NOT NULL DEFAULT 0, delivery_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS order_items (id BIGSERIAL PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE, item_type TEXT NOT NULL, measurements JSONB NOT NULL DEFAULT '{}'::jsonb, price NUMERIC NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS chats (id BIGSERIAL PRIMARY KEY, mobile TEXT NOT NULL, sender TEXT NOT NULL, message TEXT NOT NULL, timestamp TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_orders_mobile ON orders(mobile); CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id); CREATE INDEX IF NOT EXISTS idx_chats_mobile ON chats(mobile);`);
}
async function items(orderId) { const { rows } = await q('SELECT item_type, measurements, price, notes FROM order_items WHERE order_id=$1 ORDER BY id', [orderId]); return rows.map(x => ({ itemType: x.item_type, measurements: x.measurements || {}, price: num(x.price), notes: x.notes })); }
async function order(row) { return row ? { id: row.id, customerName: row.customer_name, mobile: row.mobile, items: await items(row.id), totalPrice: num(row.total_price), amountPaid: num(row.amount_paid), deliveryDate: row.delivery_date, status: row.status, createdAt: row.created_at } : null; }
async function orders(where = '', values = []) { const { rows } = await q(`SELECT * FROM orders ${where} ORDER BY created_at DESC`, values); return Promise.all(rows.map(order)); }
async function chats(mobile) { const { rows } = await q(`SELECT id, mobile, sender, message, timestamp FROM chats WHERE ${normalizedMobile}=$1 ORDER BY id`, [cleanMobile(mobile)]); return rows.map(x => ({ ...x, id: Number(x.id) })); }

async function importLegacyData() {
  const { rows: [count] } = await q('SELECT COUNT(*) AS total FROM orders');
  if (Number(count.total) || !fs.existsSync(LEGACY_DATA_FILE)) return;
  const legacy = JSON.parse(fs.readFileSync(LEGACY_DATA_FILE, 'utf8'));
  const client = await pool.connect();
  try { await client.query('BEGIN');
    for (const x of legacy.orders || []) { await client.query('INSERT INTO orders VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [x.id, x.customerName, x.mobile, num(x.totalPrice), num(x.amountPaid), x.deliveryDate, x.status || 'Pending', x.createdAt]); for (const i of x.items || []) await client.query('INSERT INTO order_items (order_id,item_type,measurements,price,notes) VALUES ($1,$2,$3,$4,$5)', [x.id, i.itemType, JSON.stringify(i.measurements || {}), num(i.price), i.notes || '']); }
    for (const x of legacy.chats || []) await client.query('INSERT INTO chats (id,mobile,sender,message,timestamp) VALUES ($1,$2,$3,$4,$5)', [x.id, x.mobile, x.sender, x.message, x.timestamp]);
    await client.query("SELECT setval(pg_get_serial_sequence('chats','id'), COALESCE((SELECT MAX(id) FROM chats), 1), true)"); await client.query('COMMIT'); console.log('Imported database.json into PostgreSQL.');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

app.use(cors()); app.use(express.json());
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css'))); app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.post('/api/auth/login', async (req, res, next) => { try { const { role, password, mobile } = req.body; if (role === 'admin') return password === ADMIN_PASSWORD ? res.json({ success:true, role:'admin', token:'mock-admin-token' }) : res.status(401).json({ success:false, message:'Invalid Admin password' }); if (role !== 'customer' || !mobile) return res.status(400).json({ success:false, message:'Mobile number is required' }); const x = (await orders(`WHERE ${normalizedMobile}=$1`, [cleanMobile(mobile)]))[0]; return x ? res.json({ success:true, role:'customer', mobile:x.mobile, customerName:x.customerName }) : res.status(404).json({ success:false, message:'Mobile number is not registered. Please contact StitchCraft Admin.' }); } catch (e) { next(e); } });
app.get('/api/orders', async (req,res,next) => { try { res.json(await orders()); } catch(e) { next(e); } });
app.post('/api/orders', async (req,res,next) => { const client = await pool.connect(); try { const { customerName, mobile, items: lineItems, deliveryDate, amountPaid, totalPrice } = req.body; if (!customerName || !mobile || !Array.isArray(lineItems) || !lineItems.length) return res.status(400).json({ error:'Missing required fields: customerName, mobile, and items array are required.' }); const { rows:[last] } = await client.query("SELECT MAX(CAST(SUBSTRING(id FROM 4) AS INTEGER)) AS value FROM orders WHERE id ~ '^ORD[0-9]+$'"); const id=`ORD${String((Number(last.value)||0)+1).padStart(3,'0')}`, total=num(totalPrice ?? lineItems.reduce((s,x)=>s+num(x.price),0)), createdAt=new Date().toISOString(), due=deliveryDate || new Date(Date.now()+604800000).toISOString().slice(0,10); await client.query('BEGIN'); await client.query('INSERT INTO orders VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[id,customerName,mobile,total,num(amountPaid),due,'Pending',createdAt]); for(const x of lineItems) await client.query('INSERT INTO order_items (order_id,item_type,measurements,price,notes) VALUES ($1,$2,$3,$4,$5)',[id,x.itemType,JSON.stringify(x.measurements||{}),num(x.price),x.notes||'']); await client.query('COMMIT'); res.status(201).json(await order((await q('SELECT * FROM orders WHERE id=$1',[id])).rows[0])); } catch(e) { await client.query('ROLLBACK'); next(e); } finally { client.release(); } });
app.put('/api/orders/:id', async (req,res,next) => { const client = await pool.connect(); try { const id=req.params.id, u=req.body, { rows:[old] }=await client.query('SELECT * FROM orders WHERE id=$1',[id]); if(!old) return res.status(404).json({error:'Order not found'}); const map={customer_name:u.customerName,mobile:u.mobile,delivery_date:u.deliveryDate,total_price:u.totalPrice,amount_paid:u.amountPaid,status:u.status}, change=Object.entries(map).filter(([,v])=>v!==undefined); await client.query('BEGIN'); if(change.length) await client.query(`UPDATE orders SET ${change.map(([k],i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${change.length+1}`,[...change.map(([k,v])=>['total_price','amount_paid'].includes(k)?num(v):v),id]); if(Array.isArray(u.items)){await client.query('DELETE FROM order_items WHERE order_id=$1',[id]);for(const x of u.items)await client.query('INSERT INTO order_items (order_id,item_type,measurements,price,notes) VALUES ($1,$2,$3,$4,$5)',[id,x.itemType,JSON.stringify(x.measurements||{}),num(x.price),x.notes||'']);} let smsNotification=null; if(u.status&&u.status!==old.status){const {rows:[now]}=await client.query('SELECT * FROM orders WHERE id=$1',[id]);const message=`Your order ${id} has updated status. New status: ${u.status}`;await client.query('INSERT INTO chats (mobile,sender,message,timestamp) VALUES ($1,$2,$3,$4)',[now.mobile,'bot',`[SMS Alert to ${now.mobile}]: ${message}`,new Date().toISOString()]);smsNotification={recipientMobile:now.mobile,message};} await client.query('COMMIT');res.json({order:await order((await q('SELECT * FROM orders WHERE id=$1',[id])).rows[0]),smsNotification}); } catch(e){await client.query('ROLLBACK');next(e)} finally{client.release()} });
app.get('/api/customer/orders', async(req,res,next)=>{try{const mobile=req.query.mobile||req.headers['x-customer-mobile'];if(!mobile)return res.status(400).json({error:'Mobile number is required'});res.json(await orders(`WHERE ${normalizedMobile}=$1`,[cleanMobile(mobile)]));}catch(e){next(e)}});
app.get('/api/chat/:mobile',async(req,res,next)=>{try{res.json(await chats(req.params.mobile))}catch(e){next(e)}});
app.post('/api/chat',async(req,res,next)=>{try{const{mobile,sender,message}=req.body;if(!mobile||!sender||!message)return res.status(400).json({error:'Missing mobile, sender, or message fields'});await q('INSERT INTO chats (mobile,sender,message,timestamp) VALUES ($1,$2,$3,$4)',[mobile,sender,message,new Date().toISOString()]);res.json(await chats(mobile));}catch(e){next(e)}});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html'))); app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Database operation failed'})});
async function start(){await setup();await importLegacyData();app.listen(PORT,()=>console.log(`Server is running on port ${PORT}`));} start().catch(e=>{console.error('Could not start server:',e);process.exit(1)});
