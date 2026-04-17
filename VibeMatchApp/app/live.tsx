import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function LiveRoomScreen() {
  const router = useRouter();
  const { roomName, userName } = useLocalSearchParams();
  
  const [trackName, setTrackName] = useState('Waiting to start...');
  const [listenerCount, setListenerCount] = useState(1); // NEW STATE
  const [inputTrack, setInputTrack] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  
  const ws = useRef<WebSocket | null>(null);
  const isHost = userName === roomName; // Or however you define the host logic

  useEffect(() => {
  // 🛑 STOP: If we don't have the names yet, don't try to connect
  if (!roomName || !userName || roomName === "undefined" || userName === "undefined") {
    console.log("⏳ Waiting for room/user data...");
    return;
  }

  const socketUrl = `ws://localhost:8000/ws/live/${roomName}/${userName}`;
  ws.current = new WebSocket(socketUrl);

  ws.current.onopen = () => console.log("✅ Connected to Live Room:", roomName);
  
  ws.current.onmessage = (e) => {
    const response = JSON.parse(e.data);
    if (response.type === 'track') {
      setTrackName(response.value);
    } 
    else if (response.type === 'count') {
      setListenerCount(response.value);
    }
    else if (response.type === 'chat' || response.type === 'system') {
      setMessages(prev => [...prev, response]);
    }
  };

  ws.current.onerror = (e) => console.error("❌ WebSocket Error:", e);

  return () => {
    if (ws.current) {
      ws.current.close();
      console.log("🔌 Connection closed");
    }
  };
}, [roomName, userName]); // 👈 Added userName here

  const sendTrackUpdate = () => {
    if (ws.current && inputTrack.trim()) {
      ws.current.send(JSON.stringify({ type: 'track', value: inputTrack }));
      setInputTrack('');
    }
  };

  const sendChat = () => {
    if (ws.current && chatMessage.trim()) {
      ws.current.send(JSON.stringify({ 
        type: 'chat', 
        user: userName || 'Anonymous', 
        value: chatMessage 
      }));
      setChatMessage('');
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      {/* HEADER SECTION */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.leaveBtn}>
          <Text style={styles.btnText}>LEAVE</Text>
        </TouchableOpacity>
        {/* UPDATED: Added the Listener Count to the UI */}
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.djTitle}>DJ {userName?.toString().toUpperCase()}</Text>
          <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{listenerCount} 🎧 Vibing</Text>
        </View>

        <View style={styles.liveBadge}><Text style={styles.liveText}>● LIVE</Text></View>
      </View>
      

      {/* NOW PLAYING DISPLAY */}
      <View style={styles.nowPlayingBox}>
        <Text style={styles.label}>NOW PLAYING</Text>
        <Text style={styles.trackTitle}>{trackName}</Text>
      </View>

      {/* 🔒 DJ TRACK UPDATE INPUT - Now restricted to Host only */}
      {isHost && (
        <View style={styles.updateRow}>
          <TextInput 
            style={styles.input} 
            placeholder="Update Track Name..." 
            placeholderTextColor="#666"
            value={inputTrack}
            onChangeText={setInputTrack}
          />
          <TouchableOpacity style={styles.updateBtn} onPress={sendTrackUpdate}>
            <Text style={styles.btnText}>UPDATE</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Remove that extra unstyled View you added at the bottom! */}

      

      {/* CHAT LOG AREA */}
      <ScrollView style={styles.chatArea}>
        {messages.map((m, i) => (
          <View key={i} style={styles.msgBubble}>
            <Text style={styles.chatUser}>{m.user ? `${m.user}: ` : ''}</Text>
            <Text style={styles.chatValue}>{m.value || m.message}</Text>
          </View>
        ))}
      </ScrollView>

      {/* MESSAGE INPUT BOX */}
      <View style={styles.chatInputRow}>
        <TextInput 
          style={styles.chatInput} 
          placeholder="Hype up the DJ..." 
          placeholderTextColor="#666"
          value={chatMessage}
          onChangeText={setChatMessage}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={sendChat}>
          <Text style={styles.btnText}>→</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FF007F', padding: 15 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40 },
  djTitle: { color: '#000', fontSize: 18, fontWeight: '900' },
  leaveBtn: { backgroundColor: '#000', padding: 8, borderWidth: 2 },
  liveBadge: { backgroundColor: 'red', paddingHorizontal: 8, paddingVertical: 4 },
  liveText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  nowPlayingBox: { backgroundColor: '#000', padding: 20, marginVertical: 20, borderWidth: 3 },
  label: { color: '#00FFFF', fontSize: 12, fontWeight: 'bold' },
  trackTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginTop: 5 },
  updateRow: { flexDirection: 'row', marginBottom: 10 },
  input: { flex: 1, backgroundColor: '#FFF', padding: 12, borderWidth: 3, fontWeight: 'bold' },
  updateBtn: { backgroundColor: 'red', padding: 12, borderWidth: 3, marginLeft: -3 },
  chatArea: { flex: 1, backgroundColor: '#FF007F', marginVertical: 10 },
  msgBubble: { flexDirection: 'row', marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.1)', padding: 5 },
  chatUser: { fontWeight: 'bold', color: '#000' },
  chatValue: { color: '#000' },
  chatInputRow: { flexDirection: 'row', marginBottom: 20 },
  chatInput: { flex: 1, backgroundColor: '#FFF', padding: 15, borderWidth: 3, borderColor: '#00FFFF' },
  sendBtn: { backgroundColor: 'red', width: 60, justifyContent: 'center', alignItems: 'center', borderWidth: 3, marginLeft: -3 },
  btnText: { color: '#FFF', fontWeight: 'bold' }
});