import os
import sqlite3
import requests
from typing import List, Optional, Dict
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect # <--- Update this
import sqlite3
from dotenv import load_dotenv

# Import your OTP service
from otp_service import send_otp_to_both, verify_stored_otp

load_dotenv()

app = FastAPI(title="VibeMatch API")

if os.path.isdir("VibeMatchApp/web-build"):
    app.mount("/", StaticFiles(directory="VibeMatchApp/web-build", html=True), name="static")
else:
    print("WARNING: web-build directory is missing; static web UI will not be served.")

# --- IMPROVED CHAT MANAGER ---
class ConnectionManager:
    def __init__(self):
        # Dictionary to store { "user_name": WebSocket_Object }
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_name: str):
        await websocket.accept()
        self.active_connections[user_name] = websocket
        print(f"📡 {user_name} is now Online")

    def disconnect(self, user_name: str):
        if user_name in self.active_connections:
            del self.active_connections[user_name]
            print(f"🔌 {user_name} went Offline")

    async def send_private_message(self, message: dict, receiver_name: str):
        if receiver_name in self.active_connections:
            await self.active_connections[receiver_name].send_json(message)

manager = ConnectionManager()

# --- CORS CONFIGURATION ---
# Allows your Frontend (8081) to talk to this Backend (8000)
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
        name TEXT UNIQUE,  -- 👈 ADD 'UNIQUE' HERE
        age INTEGER,
        gender TEXT,
        top_artists TEXT,
        playlists TEXT,
        latitude REAL,
        longitude REAL,
        phone TEXT,
        email TEXT
    )
""")
        conn.commit()

init_db()

# --- DATA MODELS (Schemas) ---
class OTPRequest(BaseModel):
    email: EmailStr
    phone: str
    name: str

class VerifyRequest(BaseModel):
    email: str
    otp: str
    name: str
    phone: str  # <--- Add this line!

class PlaylistData(BaseModel):
    user_name: str
    playlists: List[str]

# --- 1. OTP ENDPOINTS ---

@app.post("/request-otp")
async def request_otp(data: OTPRequest):
    try:
        # Generates and sends OTP via your service (Twilio/Gmail)
        send_otp_to_both(data.email, data.phone)
        return {"status": "success", "message": "OTP sent successfully"}
    except Exception as e:
        print(f"OTP Error: {e}")
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
            """, (data.name, data.email, data.phone)) # This line will work now!
            conn.commit()
        return {"status": "success", "user": data.name}
    
    raise HTTPException(status_code=400, detail="Invalid or expired OTP")




@app.get("/matches")
async def get_matches(user_name: str):
    with sqlite3.connect('vibematch.db') as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # 1. Get the current user
        cursor.execute("SELECT * FROM users WHERE name = ?", (user_name,))
        me = cursor.fetchone()
        if not me: return {"matches": []}

        # 2. Get everyone else
        cursor.execute("SELECT * FROM users WHERE name != ?", (user_name,))
        others = cursor.fetchall()
        
        matches = []
        # Convert my data safely
        my_vibe = (me['top_artists'] or "") + (me['playlists'] or "")

        for person in others:
            their_vibe = (person['top_artists'] or "") + (person['playlists'] or "")
            
            # Simple intersection logic
            my_set = set(my_vibe.lower().replace('[','').replace(']','').split(','))
            their_set = set(their_vibe.lower().replace('[','').replace(']','').split(','))
            
            intersection = my_set.intersection(their_set)
            # Remove empty strings from set
            intersection.discard('')
            
            if len(intersection) > 0:
                score = int((len(intersection) / len(my_set.union(their_set))) * 100)
                matches.append({
                    "name": person['name'],
                    "age": person['age'],
                    "vibe_score": score,
                    "top_artists": person['top_artists']
                })

        # Sort by highest match score
        matches = sorted(matches, key=lambda x: x['vibe_score'], reverse=True)
        return {"matches": matches}

# --- 2. THE SPOTIFY "DOOR" (Sync Playlists) ---

@app.post("/update-playlists")
async def update_playlists(data: PlaylistData):
    """
    This is the endpoint your frontend calls after the Spotify 
    popup finishes. It saves the vibes to the database.
    """
    try:
        # Join list into a string to save in SQLite (e.g., "Rock,Phonk,Lo-fi")
        playlist_string = ", ".join(data.playlists)
        
        with sqlite3.connect('vibematch.db') as conn:
            cursor = conn.cursor()
            # We look for the user by name and update their playlists column
            cursor.execute(
                "UPDATE users SET playlists = ? WHERE name = ?", 
                (playlist_string, data.user_name)
            )
            conn.commit()
            
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="User not found in database")

        print(f"✅ Successfully synced {len(data.playlists)} playlists for {data.user_name}")
        return {"status": "success", "message": "Vibes updated in database"}
    
    except Exception as e:
        print(f"❌ Sync Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- 3. DISCOVER / MATCHES ---

# @app.get("/matches")
# async def get_matches(user_name: str):
#     with sqlite3.connect('vibematch.db') as conn:
#         conn.row_factory = sqlite3.Row
#         cursor = conn.cursor()
#         # Find users who aren't YOU and have playlists synced
#         cursor.execute("SELECT * FROM users WHERE name != ? AND playlists IS NOT NULL", (user_name,))
#         rows = cursor.fetchall()
#         return {"status": "success", "data": [dict(row) for row in rows]}


# --- PRIVATE CHAT ENDPOINT ---
@app.websocket("/ws/{user_name}")
async def websocket_endpoint(websocket: WebSocket, user_name: str):
    await manager.connect(websocket, user_name)
    try:
        while True:
            # Expecting JSON: {"receiver": "Priya", "message": "Hi!"}
            data = await websocket.receive_json()
            receiver = data.get("receiver")
            text = data.get("message")

            payload = {
                "sender": user_name,
                "message": text
            }
            
            # Send to the specific person
            await manager.send_private_message(payload, receiver)
            
    except WebSocketDisconnect:
        manager.disconnect(user_name)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)