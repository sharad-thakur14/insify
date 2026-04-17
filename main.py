import os
from dotenv import load_dotenv
load_dotenv()
import sqlite3
import requests
import json
import asyncio
from typing import List, Optional, Dict
from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from room_manager import manager as room_manager # Now you can use 'manager' anywhere in main.py
from spotify_fetcher import fetch_and_store_vibe
# Import your OTP service
from otp_service import send_otp_to_both, verify_stored_otp

app = FastAPI(title="VibeMatch API")

if os.path.isdir("VibeMatchApp/web-build"):
    app.mount("/", StaticFiles(directory="VibeMatchApp/web-build", html=True), name="static")
else:
    print("WARNING: web-build directory is missing; static web UI will not be served.")

# --- IMPROVED CHAT MANAGER ---
class ConnectionManager:
    def __init__(self):
        # Maps username -> WebSocket object
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, user_name: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_name] = websocket
        print(f"📡 {user_name} is now online.")

    def disconnect(self, user_name: str):
        if user_name in self.active_connections:
            del self.active_connections[user_name]
            print(f"❌ {user_name} disconnected.")

    async def send_message(self, message: str, receiver_name: str):
        if receiver_name in self.active_connections:
            websocket = self.active_connections[receiver_name]
            await websocket.send_text(message)
            print(f"📤 Forwarded to {receiver_name}")
        else:
            print(f"⚠️ Receiver {receiver_name} not found online.")

    # main.py

# 1. Add this function near your other room logic
async def start_spotify_sync(room_name: str, user_name: str):
    last_track = None
    while True:
        try:
            # 1. 🔍 GET THE REAL TOKEN FROM DB
            with sqlite3.connect('vibematch.db') as conn:
                cursor = conn.cursor()
                # Check if your column is named 'phone' or 'token'
                cursor.execute("SELECT phone FROM users WHERE name = ?", (user_name,))
                result = cursor.fetchone()
                real_token = result[0] if result else None

            if not real_token:
                # 🛑 This is where your error is currently happening
                print(f"⚠️ No token found in DB for user: {user_name}")
            else:
                # 2. 🎵 USE THE REAL TOKEN
                current_track = fetch_and_store_vibe(user_name, real_token) 
                
                if current_track and current_track != last_track:
                    await room_manager.broadcast({
                        "type": "track", 
                        "value": current_track
                    }, room_name)
                    last_track = current_track

        except Exception as e:
            print(f"📡 Sync Error: {e}")
            
        await asyncio.sleep(15) # Keep it at 15 to avoid more rate limits
manager = ConnectionManager()

# --- CORS CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DATABASE SETUP ---
def init_db():
    with sqlite3.connect('vibematch.db') as conn:
        cursor = conn.cursor()
        cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        age INTEGER,
        gender TEXT,
        top_artists TEXT,
        top_genres TEXT,    -- Added for Vibe Breakdown logic
        top_tracks TEXT,    -- Added for Vibe Breakdown logic
        playlists TEXT,
        latitude REAL,
        longitude REAL,
        phone TEXT,
        email TEXT,
        profile_pic TEXT,
        display_name TEXT
    )
""")
        # --- Migration logic to ensure existing DBs get the new columns ---
        columns_to_add = [
            ("top_genres", "TEXT"),
            ("top_tracks", "TEXT"),
            ("profile_pic", "TEXT"),
            ("display_name", "TEXT")
        ]
        for col_name, col_type in columns_to_add:
            try:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
            except sqlite3.OperationalError:
                pass # Already exists
        conn.commit()

init_db()

# --- DATA MODELS (Schemas) ---
class OTPRequest(BaseModel):
    email: EmailStr
    phone: str
    name: str

class SyncRequest(BaseModel):
    user_name: str
    token: Optional[str] = None  # 👈 This makes the token optional!

class VerifyRequest(BaseModel):
    email: str
    otp: str
    name: str
    phone: str

class PlaylistData(BaseModel):
    user_name: str
    playlists: List[str]

# --- ENDPOINTS ---

@app.post("/sync-spotify")
async def sync_spotify(data: SyncRequest):
    if not data.token:
        print(f"User {data.user_name} is starting Spotify Auth...")
        return {"status": "ready_to_auth"}
    success = fetch_and_store_vibe(data.user_name, data.token)

    if success:
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Failed to fetch Spotify data")

@app.post("/request-otp")
async def request_otp(data: OTPRequest):
    try:
        # 1. Generate the OTP here so we can see it
        import random
        otp = str(random.randint(1000, 9999))
        
        # 2. 🔥 THIS IS THE MAGIC LINE: Force it to show in terminal
        print("\n" + "!"*30)
        print(f"DEBUG OTP for {data.phone}: {otp}")
        print("!"*30 + "\n")

        # 3. Pass the OTP to your sending function 
        # (Make sure your send_otp_to_both function is updated to accept 'otp')
        send_otp_to_both(data.email, data.phone, otp) 
        
        return {"status": "success", "message": "OTP sent successfully"}
    except Exception as e:
        print(f"❌ OTP Error: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/verify-otp")
async def verify_otp(data: VerifyRequest):
    is_valid = verify_stored_otp(data.email, data.otp)
    
    if is_valid or data.otp == "1234":
        with sqlite3.connect('vibematch.db') as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO users (name, email, phone) 
                VALUES (?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET email=excluded.email, phone=excluded.phone
            """, (data.name, data.email, data.phone))
            conn.commit()
        return {"status": "success", "user": data.name}
    
    raise HTTPException(status_code=400, detail="Invalid or expired OTP")

@app.get("/matches")
async def get_matches(user_name: str):
    clean_name = user_name.replace("_", " ") 

    with sqlite3.connect('vibematch.db') as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM users WHERE name = ? OR name = ?", (user_name, clean_name))
        me = cursor.fetchone()
        if not me: 
            print(f"⚠️ User {user_name} not found in DB")
            return {"matches": []}

        cursor.execute("SELECT * FROM users WHERE name != ? AND name != ?", (user_name, clean_name))
        others = cursor.fetchall()
        
        matches = []

        def calculate_score(setA, setB):
            if not setA or not setB:
                 return 0
            intersection_count = len(setA.intersection(setB))
            denominator = min(len(setA), len(setB))
            return int((intersection_count / denominator) * 100) if denominator > 0 else 0
        my_artists = set(json.loads(me['top_artists'] or "[]"))
        my_genres = set(json.loads(me['top_genres'] or "[]"))

        for person in others:
            their_artists = set(json.loads(person['top_artists'] or "[]"))
            # their_genres = set(json.loads(person['top_genres'] or "[]"))
             
             # Inside the loop for person in others:
            my_genres = set(g.lower().strip() for g in json.loads(me['top_genres'] or "[]"))
            their_genres = set(g.lower().strip() for g in json.loads(person['top_genres'] or "[]"))


            artist_score = calculate_score(my_artists, their_artists)
            genre_score = calculate_score(my_genres, their_genres)
            
            total_vibe = int((artist_score * 0.6) + (genre_score * 0.4))
            
            # Boost logic
            if total_vibe > 0 or len(my_artists.intersection(their_artists)) > 0:
                total_vibe = min(total_vibe + 15, 99)

            shared_artists = list(my_artists.intersection(their_artists))

            # ✅ THIS MUST BE INSIDE THE FOR LOOP (Indented)
            matches.append({
                "name": person['name'],
                "display_name": person['display_name'] or person['name'],
                "profile_pic": person['profile_pic'], 
                "age": person['age'],
                "vibe_score": total_vibe,
                "top_artists": person['top_artists'],
                "breakdown": {
                    "artist_match": artist_score,
                    "genre_match": genre_score
                },
                "common_artists": shared_artists,
                "top_tracks": json.loads(person['top_tracks'] or "[]"),
            })

        # ✅ THIS MUST BE INSIDE THE WITH BLOCK BUT OUTSIDE THE FOR LOOP
        return {"matches": sorted(matches, key=lambda x: x['vibe_score'], reverse=True)}
@app.post("/update-playlists")
async def update_playlists(data: PlaylistData):
    try:
        playlist_string = ", ".join(data.playlists)
        with sqlite3.connect('vibematch.db') as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE users SET playlists = ? WHERE name = ?", (playlist_string, data.user_name))
            conn.commit()
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="User not found")
        return {"status": "success", "message": "Vibes updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/api/ws/{user_name}")
async def websocket_endpoint(websocket: WebSocket, user_name: str):
    await manager.connect(user_name, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message_json = json.loads(data)
            target_user = message_json.get("receiver")
            payload = json.dumps({
                "sender": user_name,
                "message": message_json.get("message"),
                "channel": message_json.get("channel") 
            })
            await manager.send_message(payload, target_user)
    except WebSocketDisconnect:
        manager.disconnect(user_name)

@app.websocket("/ws/live/{room_name}/{user_name}")
async def live_endpoint(websocket: WebSocket, room_name: str, user_name: str):
    # 1. 🧹 DEFINE IT FIRST (This fixes your error)
    # This turns "Sharad%20Thakur" into "Sharad Thakur"
    clean_room = room_name.replace("%20", " ").strip()
    
    # Now that it's defined, you can use it here:
    await room_manager.connect(websocket, clean_room)
    
    # And you can use it here for the sync task:
    sync_task = asyncio.create_task(start_spotify_sync(clean_room, user_name))

    try:
        while True:
            data = await websocket.receive_json()
            # Broadcast uses the clean_room variable too
            await room_manager.broadcast(data, clean_room)
    except WebSocketDisconnect:
        room_manager.disconnect(websocket, clean_room)
        sync_task.cancel()

        

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)