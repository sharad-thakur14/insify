import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform 
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMatchStore } from '../store/useMatchStore';

export default function ChatScreen() {
  const router = useRouter();
  const { contact, user } = useLocalSearchParams(); 
  const [messages, setMessages] = useState<{sender: string, text: string}[]>([]);
  const [inputText, setInputText] = useState('');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const currentMe = typeof user === 'string' ? user : 'Sharad_Thakur';  
  const currentUsername = currentMe; // Keeps both names valid for your existing code
  // --- START ADDED PART: VIBE DATA PARSING ---
 const { breakdown, common, top_tracks } = useLocalSearchParams();
const selectedMatch = useMatchStore((state) => state.selectedMatch);

// 1. Get the breakdown object (from Store or fallback to URL)
const rawBreakdown = selectedMatch?.vibe_breakdown || (breakdown ? JSON.parse(breakdown as string) : {});

// 2. Extract the numbers (handling multiple possible names)
const artistPercent = rawBreakdown.artists || rawBreakdown.artist_match || rawBreakdown.vibe_score || 0;
const genrePercent = rawBreakdown.genres || rawBreakdown.genre_match || 0;

// 3. Get arrays (from Store or fallback to URL)
const scores: any = selectedMatch?.vibe_breakdown || { artists: 0, genres: 0 };

const shared = selectedMatch?.common_artists || [];
const tracks = selectedMatch?.top_tracks || [];
useEffect(() => {
  // 1. Get the 'user' from the URL (e.g., ?user=Priya)
  // If no user is in URL, it defaults to Sharad_Thakur for safety
  console.log(`🔌 Attempting to connect as: ${currentUsername}`);

  // 2. Use the dynamic name in the URL string
  const socket = new WebSocket(`ws://localhost:8000/api/ws/${currentUsername}`);

  socket.onopen = () => {
    console.log(`✅ Connected to server as: ${currentUsername}`);
  };
socket.onmessage = (e) => {
  try { // Ln 39 approx
    const data = JSON.parse(e.data);
    console.log("📩 Data received:", data);

    // 1. END CALL LOGIC
    // Inside chat.tsx -> socket.onmessage
if (data.message === "END_CALL" || data.message === "LEAVE_CALL") {
  console.log("📞 Kill Switch Received");
  
  // 1. Force the router to move away
  router.replace(`/chat?user=${currentMe}&contact=${contact}`);
  
  // 2. Small delay then refresh the window if the camera is still stuck
  // This is the "Nuclear Option" if the hardware won't release
  setTimeout(() => {
    if (Platform.OS === 'web') {
      window.location.reload(); 
    }
  }, 500);
  return;
}

    // 2. INCOMING CALL LOGIC
    if (data.message && data.message.includes("INCOMING_CALL")) {
      const callMode = data.message.includes("VIDEO") ? "video" : "audio";
      const accept = window.confirm(`VIBE CALL: ${data.sender} is calling! Accept?`);
      if (accept) {
        router.push(`/video-call?channel=${data.channel}&mode=${callMode}&user=${currentMe}`);
      }
      return; 
    }

    // 3. CHAT MESSAGE LOGIC
    const newMessage = {
      sender: data.sender, 
      text: data.message 
    };
    setMessages((prev) => [...prev, newMessage]);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

  } catch (err) { // This is the 'catch' that was missing on Ln 69!
    console.error("❌ Message parsing failed:", err);
  } 
};

  socket.onerror = (err) => console.error("❌ WebSocket Error:", err);
  socket.onclose = () => console.log("🔌 Disconnected from server");

  setWs(socket);
  return () => socket.close();
}, [user]); // 👈 CRITICAL: Re-run this if the 'user' changes

  // 2. ACTIONS
const sendMessage = () => {
  if (inputText.trim()) {
    console.log("📤 Attempting to send:", inputText);

    // 1. Create the message object
const newMessage = { 
  sender: typeof user === 'string' ? user : 'Sharad_Thakur', 
  text: inputText 
};    // 2. FORCE it into the UI immediately (The Pink Box will vanish now!)
    setMessages((prev) => [...prev, newMessage]);

    // 3. Try to send to server
    if (ws && ws.readyState === WebSocket.OPEN) {
      const payload = {
        receiver: contact || "Priya",
        message: inputText
      };
      ws.send(JSON.stringify(payload));
      console.log("✅ Sent to server successfully");
    } else {
      console.log("⚠️ WebSocket not open. State:", ws?.readyState);
    }

    // 4. Reset & Scroll
    setInputText('');
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  }
};


// 3. CALL INITIATION LOGIC
  const initiateCall = (mode: 'video' | 'audio') => {
  const sharedChannel = `chat_${currentMe}_${contact}`.replace(/\s/g, '_');

  if (ws && ws.readyState === WebSocket.OPEN) {
    const signal = {
      receiver: contact,
      message: `INCOMING_CALL_${mode.toUpperCase()}`,
      sender: currentMe, // Fixes the "Who is calling" popup name
      channel: sharedChannel 
    };
    ws.send(JSON.stringify(signal));
  }

  router.push(`/video-call?channel=${sharedChannel}&mode=${mode}&user=${currentMe}`);
};

// 3. CALL INITIATION LOGIC
  
  const startCall = () => {
    router.push({
      pathname: "/video-call",
      params: { channel: `chat_${contact?.toString().replace(/\s/g, '_')}` } 
    });
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      {/* HEADER SECTION */}
<View style={styles.header}>
  <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
    <Text style={styles.backText}>← back</Text>
  </TouchableOpacity>

  <View style={styles.userInfo}>
    <Text style={styles.userName}>{contact || "PRIYA"}</Text>
    <Text style={styles.userStatus}>VIBE MATCH CHAT</Text>
  </View>

  <View style={styles.headerIcons}>
  {/* Video Call Button */}
  <TouchableOpacity 
    style={styles.videoBtn}
    onPress={() => initiateCall('video')} 
  >
    <Text>📹</Text>
  </TouchableOpacity>

  {/* Phone Call Button */}
  <TouchableOpacity 
    style={styles.phoneBtn} 
    onPress={() => initiateCall('audio')}
  >
    <Text style={{fontSize: 20}}>📞</Text>
  </TouchableOpacity>
</View>
</View>

      {/* --- START ADDED PART: VIBE INFO PANEL --- */}
     <View style={styles.vibeInfoPanel}>
  <Text style={styles.vibeTitle}>⚡ VIBE BREAKDOWN</Text>
  <Text style={styles.vibeMetrics}>
      Artists: {scores.artists || scores.artist_match || scores.vibe_score || 0}% | 
     Genres: {scores.genres || scores.genre_match || 0}%
</Text>
  {shared.length > 0 && (
    <Text style={styles.commonText} numberOfLines={1}>
      🤝 SHARED VIBE: {shared.slice(0, 3).join(', ')}
    </Text>
  )}

  {tracks.length > 0 && (
    <Text style={styles.trackText}>🎧 THEIR JAM: {tracks[0]}</Text>
  )}
</View>
      {/* --- END ADDED PART --- */}

      {/* CHAT MESSAGES */}
     <ScrollView 
  ref={scrollViewRef}
  contentContainerStyle={styles.chatArea}
>
  {messages.length === 0 ? (
    <View style={styles.emptyBox}>
      <View style={styles.musicIconCircle}>
          <Text style={{fontSize: 40}}>🎵</Text>
      </View>
      <Text style={styles.emptyText}>NO MESSAGES</Text>
    </View>
  ) : (
    messages.map((msg, index) => {
      // Use the currentMe variable we defined at the top
      const isMe = msg.sender === currentMe; 

      return (
        <View key={index} style={[
          styles.bubble, 
          isMe ? styles.myBubble : styles.theirBubble
        ]}>
          <Text style={styles.bubbleText}>{msg.text}</Text>
        </View>
      );
    })
  )}
</ScrollView>

      {/* INPUT BAR */}
<View style={styles.inputBar}>
  
  {/* MUSIC BUTTON: Shares a song/artist */}
  <TouchableOpacity 
    style={styles.extraIcon} 
    onPress={() => setInputText("🎧 Currently vibing to: ")}
  >
    <Text style={{fontSize: 20}}>🎵</Text>
  </TouchableOpacity>

  {/* STAR BUTTON: Quick Match Compliment */}
  <TouchableOpacity 
    style={styles.extraIcon} 
    onPress={() => setInputText("✨ Our vibe score is insane! ")}
  >
    <Text style={{fontSize: 20}}>✨</Text>
  </TouchableOpacity>

  <TextInput 
    style={styles.input} 
    placeholder="TYPE A MESSAGE..." 
    placeholderTextColor="#999"
    value={inputText}
    onChangeText={setInputText}
  />
  
  <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
    <Text style={styles.sendBtnText}>→</Text>
  </TouchableOpacity>
</View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // --- LAYOUT ---
  container: { flex: 1, backgroundColor: '#FF007F' },
  
  // --- HEADER ---
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 15,
    paddingBottom: 15,
    backgroundColor: '#000',
  },

  // --- START ADDED PART: VIBE PANEL STYLES ---
  vibeInfoPanel: {
    backgroundColor: '#CCFF00', 
    padding: 10,
    borderBottomWidth: 4,
    borderColor: '#000',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
  },
  vibeTitle: { fontWeight: '900', fontSize: 12, color: '#000' },
  vibeMetrics: { fontWeight: '700', fontSize: 10, color: '#333', marginBottom: 5 },
  commonText: { fontWeight: '900', fontSize: 13, color: '#FF007F' },
  trackText: { fontWeight: '600', fontSize: 11, color: '#000', fontStyle: 'italic' },
  // --- END ADDED PART ---

  // --- CHAT AREA & SCROLLING ---
  chatArea: {
    flexGrow: 1, // Changed from flex: 1 to allow scrolling
    paddingHorizontal: 10,
    paddingBottom: 20,
  },

  // --- EMPTY STATE (The Pink Box with the Music Icon) ---
  emptyBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: '20%',
  },
  musicIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#CCFF00', // Lime circle
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#000',
    marginBottom: 20,
  },
  emptyText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  emptySub: {
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 5,
    marginTop: 10,
    fontWeight: '800',
    fontSize: 14,
    borderWidth: 2,
    borderColor: '#000',
  },
  backBtn: { backgroundColor: '#00FFFF', padding: 8, borderWidth: 2, borderColor: '#000' },
  backText: { fontWeight: '900', fontSize: 12 },
  userInfo: { alignItems: 'center' },
  userName: { color: '#CCFF00', fontWeight: '900', fontSize: 18 },
  userStatus: { color: '#fff', fontSize: 10 },
  headerIcons: { flexDirection: 'row', gap: 10 },
  videoBtn: { backgroundColor: '#FFB6C1', padding: 8, borderWidth: 2, borderColor: '#fff' },
  phoneBtn: { backgroundColor: '#90EE90', padding: 8, borderWidth: 2, borderColor: '#fff' },

  // --- CHAT BUBBLES ---
  bubble: {
    padding: 12,
    marginVertical: 5,
    maxWidth: '80%',
    borderWidth: 3,
    borderColor: '#000',
  },
  myBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#CCFF00', // Lime for Sharad
  },
  theirBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff', // White for Priya
  },
  bubbleText: {
    fontWeight: '800',
    color: '#000',
    fontSize: 16,
  },

  // --- INPUT BAR ---
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 4,
    borderColor: '#000',
  },
  extraIcon: { 
    padding: 10,
    borderWidth: 2,
    borderColor: '#000',
    marginRight: 5,
    backgroundColor: '#CCFF00',
  },
  input: {
    flex: 1,
    height: 45,
    borderWidth: 3,
    borderColor: '#000',
    paddingHorizontal: 15,
    fontWeight: '700',
    fontSize: 16,
  },
  sendBtn: {
    backgroundColor: '#FF007F',
    width: 50,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#000',
    marginLeft: 5,
  },
  sendBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 20,
  },
});