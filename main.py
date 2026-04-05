from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, BackgroundTasks
from pydantic import BaseModel, field_validator
import sqlite3
import json
import math
import random
import os
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from matcher import get_most_compatible

app = FastAPI(title="VibeMatch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Database Helpers ---

def get_db():
    """Returns a context-managed SQLite connection."""
    conn = sqlite3.connect('vibematch.db')
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Creates the users table (no Aadhar, with location support)."""
    with sqlite3.connect('vibematch.db') as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                age INTEGER NOT NULL,
                gender TEXT NOT NULL,
                top_artists TEXT NOT NULL,
                latitude REAL DEFAULT 28.6139,
                longitude REAL DEFAULT 77.2090,
                aura TEXT DEFAULT 'Mysterious Vibe'
            )
        ''')
        # Handle migration for existing DB
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN aura TEXT DEFAULT 'Mysterious Vibe'")
        except sqlite3.OperationalError:
            pass # Column already exists
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN phone TEXT")
            cursor.execute("ALTER TABLE users ADD COLUMN email TEXT")
            cursor.execute("ALTER TABLE users ADD COLUMN playlists TEXT DEFAULT '[]'")
        except sqlite3.OperationalError:
            pass
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_name TEXT NOT NULL,
                receiver_name TEXT NOT NULL,
                text TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()


# Initialize DB on startup
init_db()


# --- Pydantic Models ---

class OTPRequest(BaseModel):
    phone: str
    email: str

class OTPVerify(BaseModel):
    name: str
    phone: str
    email: str
    otp: str

class UpdatePlaylists(BaseModel):
    name: str
    playlists: list[str]
    top_artists: list[str]


class UserRegistration(BaseModel):
    name: str
    age: int
    gender: str
    top_artists: list[str]
    latitude: float = 28.6139
    longitude: float = 77.2090

    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        v = v.strip()
        if not v:
            raise ValueError('Name cannot be empty')
        if len(v) > 50:
            raise ValueError('Name must be 50 characters or less')
        return v

    @field_validator('age')
    @classmethod
    def validate_age(cls, v):
        if v < 18:
            raise ValueError('Must be at least 18 years old')
        if v > 100:
            raise ValueError('Age must be 100 or less')
        return v

    @field_validator('gender')
    @classmethod
    def validate_gender(cls, v):
        allowed = {'Male', 'Female', 'Other'}
        if v not in allowed:
            raise ValueError(f'Gender must be one of: {", ".join(allowed)}')
        return v

    @field_validator('top_artists')
    @classmethod
    def validate_artists(cls, v):
        if not v:
            raise ValueError('Must have at least one top artist')
        return v


class MessageSendRequest(BaseModel):
    sender_name: str
    receiver_name: str
    text: str


# --- Business Logic ---

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km between two lat/lng points."""
    R = 6371  # Earth radius in km
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def generate_outing_idea(shared_artists: list[str]) -> str:
    """Simulates an AI generating a date idea based on music vibes."""
    if not shared_artists:
        return "Grab a coffee and figure out what music you DO agree on!"

    vibe_map = {
        "Arijit Singh": "a cozy rooftop cafe with live acoustic covers.",
        "Pritam": "a lively Bollywood night at a local club.",
        "KK": "a late-night drive to a retro music lounge.",
        "The Weeknd": "a neon-lit arcade or a synth-wave bar.",
        "Drake": "a high-energy hip-hop lounge.",
        "Ankit Tiwari": "a quiet, dimly lit speakeasy.",
        "Taylor Swift": "a sing-along karaoke night!",
        "Dua Lipa": "a rooftop dance party with disco vibes.",
    }

    for artist in shared_artists:
        if artist in vibe_map:
            return f"Since you both love {artist}, you should check out {vibe_map[artist]}"

    return f"Bond over your shared love for {shared_artists[0]} at a trendy local coffee shop."


def calculate_vibe_match(user1_artists: list[str], user2_artists: list[str]):
    """Calculates compatibility percentage using Jaccard similarity."""
    set1, set2 = set(user1_artists), set(user2_artists)
    shared = list(set1.intersection(set2))
    if not set1 and not set2:
        return 0.0, []
    score = (len(shared) / len(set1.union(set2))) * 100
    return round(score, 2), shared


def generate_aura(artists: list[str]) -> str:
    """Generates a zany Musical Aura based on artists."""
    artists_lower = [a.lower() for a in artists]
    joined = " ".join(artists_lower)
    
    if any(x in joined for x in ["pritam", "arijit", "kk", "shaan", "atif"]):
        return "Nostalgic Melancholy 🥀"
    elif any(x in joined for x in ["weeknd", "drake", "kendrick", "travis"]):
        return "Neon Midnight 🦇"
    elif any(x in joined for x in ["taylor", "dua", "pop", "ariana"]):
        return "Pop Royalty 👑"
    elif any(x in joined for x in ["rock", "metal", "pink floyd", "nirvana", "arctic"]):
        return "Chaotic Indie 🎸"
    elif any(x in joined for x in ["lofi", "chill", "jazz"]):
        return "Golden Hour Drift 🌅"
    else:
        return random.choice(["Mysterious Vibe 🔮", "Electric Soul ⚡", "Hyper-Pop Dreams 🦄"])

# --- Real OTP Implementations ---
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from twilio.rest import Client

otp_store = {}

def send_email_otp(to_email: str, code: str):
    smtp_email = os.getenv("SMTP_EMAIL")
    smtp_password = os.getenv("SMTP_PASSWORD")
    if not smtp_email or not smtp_password:
        print(f"[SMTP Config Missing] Cannot send Email to {to_email}. Simulated OTP: {code}")
        return
        
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Your VibeMatch Registration Code 🎵"
        msg["From"] = smtp_email
        msg["To"] = to_email
        
        text = f"Your VibeMatch OTP is: {code}. Keep on vibrating!"
        html = f"""\
        <html>
          <body style="background-color: #FF007F; padding: 24px; font-family: sans-serif; text-align: center;">
            <div style="background-color: #CCFF00; padding: 32px; border: 6px solid #000; box-shadow: 8px 8px 0px #000; transform: rotate(-2deg); display: inline-block;">
                <h1 style="color: #000; letter-spacing: 2px;">VIBEMATCH OTP</h1>
                <p style="font-size: 24px; font-weight: bold; background: #FFF; border: 4px solid #000; padding: 12px;">{code}</p>
                <p style="font-weight: 900;">NO SMALL TALK. JUST MUSIC.</p>
            </div>
          </body>
        </html>
        """
        part1 = MIMEText(text, "plain")
        part2 = MIMEText(html, "html")
        msg.attach(part1)
        msg.attach(part2)

        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(smtp_email, smtp_password)
        server.sendmail(smtp_email, to_email, msg.as_string())
        server.quit()
        print(f"Sent email OTP to {to_email}")
    except Exception as e:
        print(f"Failed to send email OTP: {e}")

def send_sms_otp(to_phone: str, code: str):
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_phone = os.getenv("TWILIO_PHONE_NUMBER")
    
    if not account_sid or not auth_token or not from_phone:
        print(f"[Twilio Config Missing] Cannot send SMS to {to_phone}. Simulated OTP: {code}")
        return
        
    try:
        if not to_phone.startswith("+"):
            to_phone = "+" + to_phone
            
        client = Client(account_sid, auth_token)
        message = client.messages.create(
            body=f"[VibeMatch] Your verification code is: {code} 🎧",
            from_=from_phone,
            to=to_phone
        )
        print(f"Sent SMS OTP to {to_phone}")
    except Exception as e:
        print(f"Failed to send SMS OTP: {e}")

# --- API Endpoints ---

@app.post("/request-otp")
def request_otp(data: OTPRequest, background_tasks: BackgroundTasks):
    code = str(random.randint(1000, 9999))
    print(f"Generated OTP {code} for phone: {data.phone}, email: {data.email}")
    
    if data.phone:
        otp_store[data.phone] = code
        background_tasks.add_task(send_sms_otp, data.phone, code)
    if data.email:
        otp_store[data.email] = code
        background_tasks.add_task(send_email_otp, data.email, code)
        
    return {"status": "success", "message": "OTP sent!"}

@app.post("/verify-otp")
def verify_otp(data: OTPVerify):
    actual_phone_otp = otp_store.get(data.phone)
    actual_email_otp = otp_store.get(data.email)
    
    is_valid = False
    
    # Check phone OTP
    if actual_phone_otp and data.otp == actual_phone_otp:
        is_valid = True
        del otp_store[data.phone]
    # Check email OTP 
    elif actual_email_otp and data.otp == actual_email_otp:
        is_valid = True
        del otp_store[data.email]
    # Universal backdoor for testing/demo
    elif data.otp == "1234":
        is_valid = True
        
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid OTP")
        
    fallback_artists = ['Pritam', 'Arijit Singh', 'Ankit Tiwari', 'Taimour Baig', 'KK']
    aura = generate_aura(fallback_artists)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE phone = ? OR email = ?", (data.phone, data.email))
        existing = cursor.fetchone()
        
        if existing:
            cursor.execute("UPDATE users SET name = ? WHERE phone = ? OR email = ?", (data.name, data.phone, data.email))
            conn.commit()
            return {"status": "success", "message": "Login successful", "name": data.name}
            
        cursor.execute("""
            INSERT INTO users (name, age, gender, top_artists, latitude, longitude, aura, phone, email, playlists)
            VALUES (?, 24, 'Other', ?, 28.6139, 77.2090, ?, ?, ?, '[]')
        """, (data.name, json.dumps(fallback_artists), aura, data.phone, data.email))
        conn.commit()
        
    return {"status": "success", "message": "Registration successful", "name": data.name}

@app.post("/update-playlists")
def update_playlists(data: UpdatePlaylists):
    with get_db() as conn:
        cursor = conn.cursor()
        aura = generate_aura(data.top_artists)
        cursor.execute("""
            UPDATE users 
            SET playlists = ?, top_artists = ?, aura = ?
            WHERE name = ?
        """, (json.dumps(data.playlists), json.dumps(data.top_artists), aura, data.name))
        conn.commit()
    return {"status": "success"}

@app.post("/register")
def register_new_user(user: UserRegistration):
    """Saves a new user. Simplified: no Aadhar, no email/phone."""
    with get_db() as conn:
        cursor = conn.cursor()
        aura = generate_aura(user.top_artists)
        
        # Check if user already exists by name
        cursor.execute("SELECT id FROM users WHERE name = ?", (user.name,))
        existing = cursor.fetchone()
        if existing:
            # Update their artists and location instead
            cursor.execute("""
                UPDATE users SET top_artists = ?, latitude = ?, longitude = ?, aura = ?
                WHERE name = ?
            """, (json.dumps(user.top_artists), user.latitude, user.longitude, aura, user.name))
            conn.commit()
            return {"status": "success", "message": f"Welcome back, {user.name}! Profile updated."}

        cursor.execute("""
            INSERT INTO users (name, age, gender, top_artists, latitude, longitude, aura) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (user.name, user.age, user.gender, json.dumps(user.top_artists), user.latitude, user.longitude, aura))
        conn.commit()

    return {"status": "success", "message": f"Welcome to VibeMatch, {user.name}!"}


@app.get("/users/{user_name}")
def get_user_profile(user_name: str):
    """Retrieves a user's profile by name."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT name, age, gender, top_artists, latitude, longitude, aura, playlists
            FROM users WHERE name = ?
        """, (user_name,))
        row = cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="User not found.")

    return {
        "status": "success",
        "data": {
            "name": row["name"],
            "age": row["age"],
            "gender": row["gender"],
            "top_artists": json.loads(row["top_artists"]),
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "aura": row["aura"],
            "playlists": json.loads(row["playlists"] if row["playlists"] else "[]")
        }
    }


@app.get("/matches")
def find_potential_mates(
    user_name: Optional[str] = Query(None, description="Name of the requesting user"),
    min_age: int = 18,
    max_age: int = 60,
    gender_preference: Optional[str] = Query(None, description="Filter by gender: Male, Female, Other"),
    max_distance_km: float = Query(10.0, description="Max distance in km"),
):
    """Fetches users within range, calculates compatibility, and suggests an outing."""

    FALLBACK_ARTISTS = ['Pritam', 'Arijit Singh', 'Ankit Tiwari', 'Taimour Baig', 'KK']
    my_lat, my_lon = 28.6139, 77.2090  # Default: New Delhi

    with get_db() as conn:
        cursor = conn.cursor()

        my_artists = FALLBACK_ARTISTS
        if user_name:
            cursor.execute("SELECT top_artists, latitude, longitude FROM users WHERE name = ?", (user_name,))
            row = cursor.fetchone()
            if row:
                my_artists = json.loads(row["top_artists"])
                my_lat = row["latitude"]
                my_lon = row["longitude"]

        query = """
            SELECT name, age, gender, top_artists, latitude, longitude, aura, playlists 
            FROM users 
            WHERE age BETWEEN ? AND ?
        """
        params = [min_age, max_age]

        if gender_preference:
            query += " AND gender = ?"
            params.append(gender_preference)

        cursor.execute(query, params)
        db_users = cursor.fetchall()

    match_results = []
    valid_users = []
    for user in db_users:
        db_name = user["name"]

        # Exclude the requesting user
        if user_name and db_name.strip() == user_name.strip():
            continue

        # Distance check
        dist = haversine_km(my_lat, my_lon, user["latitude"], user["longitude"])
        if dist > max_distance_km:
            continue
            
        valid_users.append(dict(user))

    most_compatible_name = get_most_compatible(user_name, my_artists, valid_users) if user_name else None

    for user in valid_users:
        db_name = user["name"]
        dist = haversine_km(my_lat, my_lon, user["latitude"], user["longitude"])
        db_artists_list = json.loads(user["top_artists"])
        score, shared = calculate_vibe_match(my_artists, db_artists_list)

        if score > 0:
            date_idea = generate_outing_idea(shared)
            match_results.append({
                "name": db_name,
                "age": user["age"],
                "gender": user["gender"],
                "compatibility_score": score,
                "shared_artists": shared,
                "ai_outing_suggestion": date_idea,
                "distance_km": round(dist, 1),
                "is_most_compatible": (db_name == most_compatible_name),
                "aura": user["aura"],
                "playlists": json.loads(user["playlists"] if user["playlists"] else "[]")
            })

    # Find the rival (0% compatibility)
    if match_results:
        # Sort by score ascending to find bottom
        sorted_for_rival = sorted(match_results, key=lambda x: x["compatibility_score"])
        if sorted_for_rival[0]["compatibility_score"] < 10:
            rival_name = sorted_for_rival[0]["name"]
            for m in match_results:
                if m["name"] == rival_name:
                    m["is_rival"] = True
                    # Let the rival have a funny suggestion
                    m["ai_outing_suggestion"] = "Go to a record store and brutally judge each other's purchases."
                    break

    # Sort so Most Compatible is at the top, followed by Rival, then by score
    match_results.sort(key=lambda x: (
        x.get("is_most_compatible", False),
        x.get("is_rival", False),
        x["compatibility_score"]
    ), reverse=True)
    return {"status": "success", "total_matches": len(match_results), "data": match_results}

# --- Chat Endpoints ---

@app.post("/send-message")
def send_message(req: MessageSendRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO messages (sender_name, receiver_name, text)
            VALUES (?, ?, ?)
        """, (req.sender_name, req.receiver_name, req.text))
        conn.commit()
    return {"status": "success", "message": "Message sent."}

@app.get("/chat-history")
def get_chat_history(user_a: str, user_b: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT sender_name, receiver_name, text, timestamp
            FROM messages
            WHERE (sender_name = ? AND receiver_name = ?)
               OR (sender_name = ? AND receiver_name = ?)
            ORDER BY timestamp ASC
        """, (user_a, user_b, user_b, user_a))
        
        columns = [column[0] for column in cursor.description]
        results = []
        for row in cursor.fetchall():
            results.append(dict(zip(columns, row)))
            
    return {"data": results}

@app.get("/generate-icebreaker")
def generate_icebreaker(user_a: str, user_b: str):
    """Simulates an AI generating a highly personalized music-based icebreaker."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name, top_artists FROM users WHERE name IN (?, ?)", (user_a, user_b))
        rows = cursor.fetchall()
        
    if len(rows) < 2:
        return {"status": "success", "icebreaker": "Hey! Up for a spontaneous music debate? 🎵"}
        
    user_a_artists = []
    user_b_artists = []
    for r in rows:
        artists = json.loads(r["top_artists"])
        if r["name"] == user_a:
            user_a_artists = artists
        else:
            user_b_artists = artists
            
    score, shared = calculate_vibe_match(user_a_artists, user_b_artists)
    
    if shared:
        artist = random.choice(shared)
        starters = [
            f"I see we both listen to {artist}! What's your favorite track of theirs right now? 🎵",
            f"Okay, be honest: have you ever cried to a {artist} song? 😂",
            f"Someone who likes {artist} as much as I do? This is rare. Thoughts on their latest album?",
            f"{artist} fans unite! If you had to pick one song by them to listen to forever, what would it be? 🎧"
        ]
        icebreaker = random.choice(starters)
    else:
        if user_b_artists:
            artist = random.choice(user_b_artists)
            starters = [
                f"I noticed you're a big fan of {artist}! I've been meaning to get into their music. Where should I start? 🤔",
                f"Okay, sell me on {artist}. Why are they in your top artists? 🎶",
                f"Your taste is interesting! I've never really listened to {artist}. What's the vibe?"
            ]
            icebreaker = random.choice(starters)
        else:
            icebreaker = "Hey! What's the one song you can't stop playing right now? 🎧"
            
    # Add a touch of neo-brutalist AI flavor
    prefix = random.choice(["[AI VIBE CHECK] ", "[AI RIZZ] ", "[MATCH DETECTED] "])
    return {"status": "success", "icebreaker": prefix + icebreaker}

@app.get("/generate-beef")
def generate_beef(user_a: str, user_b: str):
    """Simulates an AI generating a highly contentious music debate."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name, top_artists FROM users WHERE name IN (?, ?)", (user_a, user_b))
        rows = cursor.fetchall()
        
    if len(rows) < 2:
        return {"status": "success", "beef": "AI VIBE CHECK: Who has better taste? Defend yourselves! 🥊"}
        
    user_a_artists = []
    user_b_artists = []
    for r in rows:
        if r["name"] == user_a: user_a_artists = json.loads(r["top_artists"])
        else: user_b_artists = json.loads(r["top_artists"])
            
    set_a = set(user_a_artists)
    set_b = set(user_b_artists)
    only_a = list(set_a - set_b)
    only_b = list(set_b - set_a)
    
    if only_a and only_b:
        artist_a = random.choice(only_a)
        artist_b = random.choice(only_b)
        prompts = [
            f"AI VIBE CHECK: Settle this. Who would win in a bar fight: {artist_a} or {artist_b}? 🥊",
            f"HOT TAKE: {artist_a} is wildly better than {artist_b}. Defend your answer! 💥",
            f"Who cried more while listening to their top artist? {user_a} listens to {artist_a}, {user_b} listens to {artist_b}. Go! 🥊"
        ]
        beef = random.choice(prompts)
    else:
        beef = "AI VIBE CHECK: Settle this. Is modern pop music officially dead? 🥊"
        
    return {"status": "success", "beef": beef}

# --- WebSockets Server ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.active_connections:
            if websocket in self.active_connections[room_id]:
                self.active_connections[room_id].remove(websocket)
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]

    async def broadcast(self, room_id: str, message: dict):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                await connection.send_json(message)

manager = ConnectionManager()

@app.websocket("/ws/live/{room_id}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    await manager.connect(room_id, websocket)
    try:
        await manager.broadcast(room_id, {"type": "system", "text": f"{client_id} joined the room."})
        while True:
            data = await websocket.receive_text()
            # Expecting JSON data for specific media controls from DJ or just chat
            try:
                parsed_data = json.loads(data)
                await manager.broadcast(room_id, parsed_data)
            except:
                await manager.broadcast(room_id, {"type": "chat", "client_id": client_id, "text": data})
    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
        await manager.broadcast(room_id, {"type": "system", "text": f"{client_id} disconnected."})

# --- Static Frontend Serving ---
dist_path = os.path.join(os.path.dirname(__file__), "VibeMatchApp", "dist")
if os.path.exists(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")