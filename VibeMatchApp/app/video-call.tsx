import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function VideoCallScreen() {
  const router = useRouter();
  const { channel, mode, user, contact } = useLocalSearchParams();
  const [isClient, setIsClient] = useState(false);
  const hasStarted = useRef(false);
  const currentMe = typeof user === 'string' ? user : 'Sharad_Thakur';
  const currentContact = typeof contact === 'string' ? contact : 'Priya';

  const APP_ID = '2c93882822514d6e8a8df60266382a48';
  const CHANNEL = (channel as string) || 'test_room';
  // Ensure mode is a string and default to video if missing
  const currentMode = (mode as string) || 'video';

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
  if (isClient && Platform.OS === 'web' && channel) { // 👈 Ensure channel exists
    let localTracks: any[] = [];
    let client: any = null;

  const startAgora = async () => {
  try {
    const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
    client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

    // --- MOVE THIS HERE (Outside user-published) ---
    // Inside startAgora, right after client = AgoraRTC.createClient...
client.on("user-left", async (user: any) => {  console.log("👤 The other user vanished. Shutting down camera...");
  
  if (localTracks) {
    localTracks.forEach(track => {
      track.stop();
      track.close();
    });
  }
  
  alert("The other user has ended the session.");
  router.replace(`/chat?user=${currentMe}&contact=${contact}`);
});

    client.on("user-published", async (user: any, mediaType: "video" | "audio") => {
      await client.subscribe(user, mediaType);
      if (mediaType === "video") {
        const remotePlayerContainer = document.getElementById('video-container');
        if (remotePlayerContainer) {
          const remotePlayer = document.createElement('div');
          remotePlayer.id = user.uid.toString();
          remotePlayer.style.width = '100%';
          remotePlayer.style.height = '100%';
          remotePlayer.style.position = 'absolute';
          remotePlayerContainer.appendChild(remotePlayer);
          user.videoTrack.play(remotePlayer);
        }
      }
      if (mediaType === "audio") user.audioTrack.play();
    });

    // ... your existing localTracks and join logic ...

    if (currentMode === 'video') {
      try {
        localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();
        const playerContainer = document.getElementById('video-container');
        if (playerContainer) {
          playerContainer.innerHTML = ''; 
          const player = document.createElement('div');
          player.id = 'local-player';
          player.style.width = '100%';
          player.style.height = '100%';
          playerContainer.appendChild(player);
          localTracks[1].play('local-player');
        }
      } catch (camErr) {
        console.warn("Camera busy, falling back to audio.");
        localTracks = [await AgoraRTC.createMicrophoneAudioTrack()];
      }
    } else {
      localTracks = [await AgoraRTC.createMicrophoneAudioTrack()];
    }

    await client.join(APP_ID, CHANNEL, null, null);
    await client.publish(localTracks);
    console.log("🚀 Call successfully published!");

  } catch (err) {
    console.error("Agora Error:", err);
  }
};

    startAgora();

  return () => {
  console.log("🧹 Cleaning up tracks and leaving channel...");
  hasStarted.current = false;

  // 1. Always stop tracks if they exist
  if (localTracks && localTracks.length > 0) {
    localTracks.forEach(track => { 
      track.stop(); 
      track.close(); 
    });
  }

  // 2. SAFETY CHECK: Only leave if we actually joined
  if (client) {
    // Check if we are actually in a "connected" state before unpublishing
    if (client.connectionState === "CONNECTED") {
      client.unpublish().then(() => {
        client.leave();
      }).catch(err => console.log("Silent cleanup catch:", err));
    } else {
      // If not fully connected, just leave without unpublishing
      client.leave();
    }
  }
};
}
}, [isClient, channel, currentMode]); // 👈 Added channel as a dependency
    return (
    <View style={styles.container}>
      <Text style={styles.headerText}>
        {currentMode === 'video' ? '📹 VIDEO VIBE' : '🎙️ VOICE VIBE'}: {CHANNEL}
      </Text>
      
      <View nativeID="video-container" id="video-container" style={styles.videoBox}>
        {/* Show this icon only if it's a voice call */}
        {currentMode === 'audio' && (
          <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
            <Text style={{fontSize: 80}}>🎙️</Text>
            <Text style={styles.headerText}>Voice Only Session</Text>
          </View>
        )}
      </View>
      
      <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
        <Text style={styles.closeText}>END VIBE SESSION</Text>
      </TouchableOpacity>
    </View>
  ); // This is Line 97 where your error was!
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FF007F', justifyContent: 'center', padding: 20 },
  headerText: { color: '#CCFF00', fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  videoBox: { width: '100%', height: '70%', backgroundColor: '#000', borderWidth: 4, borderColor: '#CCFF00' },
  closeBtn: { backgroundColor: '#000', padding: 20, marginTop: 20, alignItems: 'center', borderWidth: 3, borderColor: '#CCFF00' },
  closeText: { color: '#CCFF00', fontWeight: '900', fontSize: 18 }
});