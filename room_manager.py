from fastapi import WebSocket
from typing import Dict, List

# room_manager.py

class RoomManager:
    def __init__(self):
        self.active_rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_name: str):
        await websocket.accept()
        if room_name not in self.active_rooms:
            self.active_rooms[room_name] = []
        self.active_rooms[room_name].append(websocket)
        # NEW: Broadcast the new count to the room
        await self.broadcast_count(room_name)

    def disconnect(self, websocket: WebSocket, room_name: str):
        if room_name in self.active_rooms:
            self.active_rooms[room_name].remove(websocket)
            if not self.active_rooms[room_name]:
                del self.active_rooms[room_name]
            else:
                # NEW: Broadcast the updated count to remaining listeners
                import asyncio
                asyncio.create_task(self.broadcast_count(room_name))

    async def broadcast(self, message: dict, room_name: str):
        if room_name in self.active_rooms:
            for connection in self.active_rooms[room_name]:
                await connection.send_json(message)

    # NEW METHOD: Sends the number of people in the room to everyone
    async def broadcast_count(self, room_name: str):
        if room_name in self.active_rooms:
            count = len(self.active_rooms[room_name])
            await self.broadcast({"type": "count", "value": count}, room_name)

manager = RoomManager()